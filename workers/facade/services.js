// The facade plugin's executor services — contract in ./README.md (Services).
import { extractNestingPolygons, extractCurvesFromDXFLayer } from './vendor/dxf-extractor.js';
import { generateLayeredDxf } from './vendor/dxf-writer.js';
import { OCCS_LAYER_CUT_OUTER } from './occs/layers.js';
import { occsLayerExportName, occsLayerStandard } from './occs/layerStandards.js';
import { isOccsDocument } from './occs/parameters.js';
import { evaluateOccsCassetteTemplate } from './occs/evaluate.js';
import {
  buildValueWorkerRequest,
  enrichNestingResult,
  groupNestingLayouts,
  nestingPartsProjection,
  summarizeNestingResult
} from './nesting-projections.js';
import { nestingResultToPreview, sheetDesignParts } from './surfaces/lib/sheetLayout.js';

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

// cassette-design render (the bake engine): evaluate an OCCS parametric
// template once at the authored parameter values. Input:
// { refs: { template: { id, name, payloadBase64 } }, draft: { data:
// { parameters } } }. Output: { data: { geometry } } — the
// template/parameters provenance rides the platform's draft, evaluation
// is construction-time only.
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
  if (!Array.isArray(items) || !items.length) badRequest('The nesting run has no parts to place');
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object') badRequest(`Item ${index} is not a part`);
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
    layouts: groupNestingLayouts(result),
    summary: summarizeNestingResult(result, request.params)
  };
}

// The cassette-design nesting-parts projection (SPEC §8 p): the instance's
// stored geometry in → nesting polygon parts, each with its workpiece's
// layers and the design's own identity, out. Input: { typeId, instanceId,
// fields }. Output: the parts list.
export async function nestingParts({ typeId, instanceId, fields = {} } = {}) {
  const geometry = fields.geometry || null;
  if (!geometry || !Array.isArray(geometry.nestingPolygons)) {
    badRequest('Nesting parts projection requires stored cassette-design geometry');
  }
  const parts = nestingPartsProjection(geometry);
  return String(instanceId || '')
    ? parts.map(part => ({ ...part, designId: String(instanceId) }))
    : parts;
}

// The sheet-design DXF export: the stored geometry preview and layer data
// as a layered DXF — layers carry their production names from the layer
// standards (never bare codes). Input: the record's values ({ fields:
// { geometry } }) in → the DXF file through the executor payload
// contract (SPEC §24) out.
export async function generateSheetDxf({ fields = {} } = {}) {
  const toExportLayer = (layer) => (layer && occsLayerStandard(layer) ? occsLayerExportName(layer) : layer);
  const dxf = generateLayeredDxf({
    layers: (fields.geometry?.preview?.layers || []).map(layer => {
      const code = layer?.standardCode || layer?.name;
      return occsLayerStandard(code) ? { ...layer, name: occsLayerExportName(code) } : layer;
    }),
    layerData: (fields.geometry?.data?.layerData || []).map(item => ({
      ...item,
      layer: toExportLayer(item.layer || item.standardCode || item.name)
    })),
    polygonParts: fields.geometry?.data?.polygonParts || []
  });
  if (!dxf) {
    const error = new Error('Sheet design has no exportable geometry');
    error.status = 404;
    throw error;
  }
  return {
    payload: {
      base64: Buffer.from(dxf, 'utf8').toString('base64'),
      mime: 'application/dxf'
    }
  };
}

// The sheet-design fromLayout construction: a solved layout value (or a
// blank) in → the stored geometry record and its design parts relation
// out. The layout is the solve's self-contained output (sourceItems +
// sheetPolygon); `refs.designs` are the resolved cassette-design values
// (revision-pinned by the construct boundary) — every placement's
// design_id must resolve to one, so the stored relation carries real,
// pinned refs. A missing layout constructs a blank sheet.
// Input: { mode, refs: { designs: [...] }, draft: { data: { layout } } }.
// Output: { data: { geometry }, relations: { parts } }.
export async function constructSheet({ refs = {}, draft = {} } = {}) {
  const layout = draft?.data?.layout;
  const resolvedDesigns = Array.isArray(refs.designs) ? refs.designs : [];
  const designPin = new Map(resolvedDesigns.map(design => [
    String(design.id),
    design.revision ? { type: 'cassette-design', id: String(design.id), revision: String(design.revision) } : null
  ]));

  if (layout != null && (typeof layout !== 'object' || Array.isArray(layout))) {
    badRequest('Sheet construction requires a layout value');
  }
  const placements = layout ? (layout.placed_items || layout.items || []) : [];
  if (layout && (!Array.isArray(placements))) {
    badRequest('Sheet construction requires a layout with placed items');
  }
  const items = layout && Array.isArray(layout.sourceItems) ? layout.sourceItems : [];
  if (layout && placements.length && !items.length) {
    badRequest('Sheet construction requires a layout with item sources — re-run the nesting solve');
  }
  for (const placed of placements) {
    const designId = designIdOfPlacement(items, placed);
    if (!designId) {
      badRequest('Sheet construction needs the cassette-design behind every placement — re-run the nesting solve with the designs connected');
    }
    if (resolvedDesigns.length && !designPin.has(designId)) {
      badRequest(`Sheet construction placement names cassette-design ${designId}, which the declared designs do not include`);
    }
  }

  const { sourceItems, sheetPolygon: solvedPolygon, ...storedLayout } = layout || {};
  const sheetPolygon = solvedPolygon && Array.isArray(solvedPolygon.outer)
    ? { outer: solvedPolygon.outer, inner: Array.isArray(solvedPolygon.inner) ? solvedPolygon.inner : [] }
    : null;
  const { width, height } = sheetPolygonBounds(sheetPolygon);
  const result = { items, solution: { layouts: [storedLayout] } };
  const created = new Date();
  const pad = value => String(value).padStart(2, '0');
  return {
    data: {
      name: `Sheet ${created.getFullYear()}-${pad(created.getMonth() + 1)}-${pad(created.getDate())} ${pad(created.getHours())}:${pad(created.getMinutes())}`,
      ...(layout?.compositionKey ? { compositionKey: String(layout.compositionKey) } : {}),
      geometry: {
        data: { ...result, ...(sheetPolygon ? { sheetPolygon } : {}), solveParams: { width, height } },
        preview: nestingResultToPreview(result, { width, height }, { layoutIndex: 0 })
      }
    },
    relations: { parts: sheetDesignParts(result, designPin) }
  };
}

function designIdOfPlacement(items = [], placed = {}) {
  const source = items.find(item => String(item.id) === String(placed.item_id ?? placed.itemId ?? placed.id));
  return String(source?.design_id ?? placed.design_id ?? '') || null;
}

function sheetPolygonBounds(polygon) {
  const outer = polygon?.outer || [];
  if (outer.length < 2) return { width: 1220, height: 2440 };
  const xs = outer.map(point => Number(point?.[0]) || 0);
  const ys = outer.map(point => Number(point?.[1]) || 0);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
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
  'nesting-parts': nestingParts,
  'extract-geometry': extractGeometry,
  bake,
  'generate-sheet-dxf': generateSheetDxf,
  'construct-sheet': constructSheet
};
