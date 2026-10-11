// The facade plugin's executor services: pure compute over values (the
// plugin contract — the platform sends referenced instances and payloads
// as base64 values, the executor returns computed fields and files; it
// never calls back into the platform). Geometry extraction, OCCS bake
// evaluation, the nesting solve (delegated to the nesting solver worker
// over HTTP), the STANDARD cassette import, and the sheet-design DXF
// export live here.
import { extractNestingPolygons, extractCurvesFromDXFLayer } from './vendor/dxf-extractor.js';
import { generateLayeredDxf } from './vendor/dxf-writer.js';
import { OCCS_LAYER_CUT_OUTER } from './occs/layers.js';
import { isOccsDocument } from './occs/parameters.js';
import { evaluateOccsCassetteTemplate } from './occs/evaluate.js';
import {
  buildValueWorkerRequest,
  enrichNestingResult,
  summarizeNestingResult
} from './nesting-projections.js';

const IDENTITY_LAYERS = [OCCS_LAYER_CUT_OUTER];

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function bufferOf(base64, what) {
  if (!base64 || typeof base64 !== 'string') badRequest(`${what} requires payloadBase64`);
  return Buffer.from(base64, 'base64');
}

// cassette-design construction (upload and convertDxf share it): extract
// the nesting polygons and identity-layer curves from a canonical-layered
// DXF payload. Input: { mode, payloadBase64 }. Output: { data: { geometry } }.
export async function extractGeometry({ mode, payloadBase64 } = {}) {
  const buffer = bufferOf(payloadBase64, `Construction ${mode || 'upload'}`);
  const polygonParts = extractNestingPolygons(buffer, Object.fromEntries(IDENTITY_LAYERS.map(layer => [layer, layer])), OCCS_LAYER_CUT_OUTER);
  if (!polygonParts.length) {
    badRequest(`DXF requires at least one closed polygon on the ${OCCS_LAYER_CUT_OUTER} layer`);
  }
  const layerData = IDENTITY_LAYERS.flatMap(layer => extractCurvesFromDXFLayer(buffer, layer).map((part, index) => ({
    layer,
    sourceLayer: layer,
    coordinates: part.coordinates,
    handles: part.handles || [],
    typeId: part.typeId,
    sourceId: `${layer}:${part.handles?.[0] || index}`
  })));
  return { data: { geometry: { polygons: polygonParts, nestingPolygons: polygonParts, layerData } } };
}

// cassette-design bake: evaluate an OCCS parametric template once at the
// authored parameter values. Input: { refs: { template: { id, name,
// payloadBase64 } }, draft: { data: { parameters } } }. Output:
// { data: { geometry } } — the template/parameters provenance rides the
// platform's draft, evaluation is construction-time only.
export async function bake({ refs = {}, draft = {} } = {}) {
  const template = refs.template || badRequest('bake requires a template reference');
  const parameters = draft?.data?.parameters || {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    badRequest('Cassette design bake parameters must be an object');
  }
  let definition = null;
  try {
    definition = JSON.parse(bufferOf(template.payloadBase64, 'bake template').toString('utf8'));
  } catch {
    badRequest('Cassette template payload is not a readable OCCS document');
  }
  if (!isOccsDocument(definition)) {
    badRequest('Cassette template is not an OCCS parametric template — only OCCS templates bake');
  }
  const evaluation = await evaluateOccsCassetteTemplate(definition, parameters, {
    templateId: template.id,
    templateName: template.name || 'Cassette template'
  });
  return { data: { geometry: evaluation } };
}

// The nesting solve (SPEC §8 V→V): job items and the sheet as values in,
// layouts and a summary out. The solver itself runs in the external
// nesting worker (NESTING_WORKER_URL) — this executor validates, maps,
// and summarizes.
export async function nestingSolve({ items, sheetWidth, sheetHeight, space, sheetCount } = {}) {
  if (!Array.isArray(items) || !items.length) badRequest('Nesting input requires items (job geometry)');
  for (const [index, item] of items.entries()) {
    if (!item || !Array.isArray(item.polygonParts) || !item.polygonParts.length) {
      badRequest(`Item ${index} requires polygonParts geometry`);
    }
    item.count = Math.max(1, Math.trunc(Number(item.count) || 1));
  }
  const params = {
    width: Number(sheetWidth),
    height: Number(sheetHeight),
    space: Number(space ?? 3),
    sheetCount: Math.max(1, Math.trunc(Number(sheetCount ?? 1) || 1))
  };
  for (const key of ['width', 'height', 'space', 'sheetCount']) {
    if (!(Number(params[key]) > 0)) badRequest(`Nesting params require a positive ${key}`);
  }
  const request = buildValueWorkerRequest(items, params);
  const result = enrichNestingResult(await callNestingWorker(request), request);
  if (result.status === 'error') {
    const error = new Error(result.message || 'Nesting worker failed');
    error.status = 502;
    throw error;
  }
  return {
    layouts: result.layouts || result.data?.layouts || [],
    summary: summarizeNestingResult(result, request.params)
  };
}

// The STANDARD cassette import (the dxfSourceToCassette conversion): the
// artifact's DXF extracted once — the cut contour and mapped semantic
// layers become the template's stored geometry fields; the same DXF rides
// back as the created cassette's payload. Input: { artifact: {
// bufferBase64, name }, name, layerMapping, parameters }. Output:
// { payloadBase64, payloadMime, filename, fields }.
export async function importCassette({ artifact = {}, name, layerMapping = {}, parameters = [] } = {}) {
  const buffer = bufferOf(artifact.bufferBase64, 'Cassette import');
  const layerMap = layerMapping || {};
  const polygonParts = extractNestingPolygons(buffer, layerMap, OCCS_LAYER_CUT_OUTER);
  if (!polygonParts.length) {
    badRequest(`DXF upload requires at least one closed polygon mapped to ${OCCS_LAYER_CUT_OUTER}`);
  }
  const layerData = Object.entries(layerMap).flatMap(([sourceLayer, layer]) => {
    if (!layer) return [];
    return extractCurvesFromDXFLayer(buffer, sourceLayer).map((part, index) => ({
      layer,
      sourceLayer,
      coordinates: part.coordinates,
      handles: part.handles || [],
      typeId: part.typeId,
      sourceId: `${sourceLayer}:${part.handles?.[0] || index}`
    }));
  });
  const filename = artifact.name || `${name || 'cassette'}.dxf`;
  return {
    payloadBase64: buffer.toString('base64'),
    payloadMime: 'application/dxf',
    filename,
    fields: {
      templateType: 'STANDARD',
      mapping: layerMap,
      parameters: parameters || [],
      polygonParts,
      layerData
    }
  };
}

// The sheet-design DXF export: the stored geometry preview and layer data
// as a layered DXF. Input: { data: { geometry }, specs? }. Output: { dxf }.
export async function generateSheetDxf({ data = {} } = {}) {
  const dxf = generateLayeredDxf({
    layers: data.geometry?.preview?.layers || [],
    layerData: data.geometry?.data?.layerData || [],
    polygonParts: data.geometry?.data?.polygonParts || []
  });
  if (!dxf) {
    const error = new Error('Sheet design has no exportable geometry');
    error.status = 404;
    throw error;
  }
  return { dxf };
}

async function callNestingWorker(request) {
  const url = process.env.NESTING_WORKER_URL || 'http://nesting-worker:8000/nest';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    const error = new Error(`Nesting worker failed: ${await response.text() || response.statusText}`);
    error.status = 502;
    throw error;
  }
  return await response.json();
}

export const services = {
  'nesting-solve': nestingSolve,
  'extract-geometry': extractGeometry,
  bake,
  'import-cassette': importCassette,
  'generate-sheet-dxf': generateSheetDxf
};
