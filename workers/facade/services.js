import {
  extractNestingPolygons,
  extractPolygonsFromDXF,
  extractCurvesFromDXFLayer,
  listDxfLayers
} from './vendor/dxf-extractor.js';
import { OCCS_LAYER_CUT_OUTER } from './occs/layers.js';
import { occsLayerStandard } from './occs/layerStandards.js';
import { nestingPartsProjection } from './nesting-projections.js';

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function bufferOf(base64, what) {
  if (!base64 || typeof base64 !== 'string') badRequest(`${what} requires payloadBase64`);
  return Buffer.from(base64, 'base64');
}

function uploadedDesignName(payloadMeta = {}) {
  return String(payloadMeta.name || '').trim().replace(/\.[a-z0-9]+$/i, '') || 'Cassette design';
}

export async function extractGeometry({ mode, payloadBase64, mapping, payloadMeta = {}, draft = {} } = {}) {
  if (!['upload', 'convertDxf'].includes(mode)) {
    badRequest(`DXF geometry extraction does not support construction mode ${String(mode || '')}`);
  }
  const buffer = bufferOf(payloadBase64, `Construction ${mode}`);
  const authored = mapping && typeof mapping === 'object' ? mapping : draft?.data?.mapping;
  const layerMapping = Object.fromEntries(
    Object.entries(authored && typeof authored === 'object' && !Array.isArray(authored) ? authored : {})
      .map(([source, target]) => [String(source).trim(), String(target || '').trim()])
      .filter(([source, target]) => source && target)
  );
  const invalidTargets = [...new Set(Object.values(layerMapping).filter(target => {
    const standard = occsLayerStandard(target);
    return !standard || standard.kind === 'group';
  }))];
  if (invalidTargets.length) {
    badRequest(`DXF layer mapping contains undeclared or non-drawable OCCS layer codes: ${invalidTargets.join(', ')}`);
  }
  if (!Object.values(layerMapping).includes(OCCS_LAYER_CUT_OUTER)
    && !Object.hasOwn(layerMapping, OCCS_LAYER_CUT_OUTER)) {
    layerMapping[OCCS_LAYER_CUT_OUTER] = OCCS_LAYER_CUT_OUTER;
  }
  const sourcesByTarget = new Map();
  for (const [sourceLayer, target] of Object.entries(layerMapping)) {
    const sources = sourcesByTarget.get(target) || [];
    sources.push(sourceLayer);
    sourcesByTarget.set(target, sources);
  }
  const cutSources = sourcesByTarget.get(OCCS_LAYER_CUT_OUTER) || [];
  const polygonParts = [
    ...extractNestingPolygons(buffer, layerMapping, OCCS_LAYER_CUT_OUTER),
    ...cutSources.slice(1).flatMap(sourceLayer => extractPolygonsFromDXF(buffer, sourceLayer))
  ];
  if (!polygonParts.length) {
    const layers = listDxfLayers(buffer);
    badRequest(`DXF requires at least one closed polygon on a layer mapped to ${OCCS_LAYER_CUT_OUTER}${layers.length ? `; available layers: ${layers.join(', ')}` : ''}`);
  }
  const layerData = [...sourcesByTarget].flatMap(([target, sources]) => sources.flatMap(sourceLayer =>
    extractCurvesFromDXFLayer(buffer, sourceLayer).map((part, index) => ({
      layer: target,
      sourceLayer,
      coordinates: part.coordinates,
      handles: part.handles || [],
      typeId: part.typeId,
      sourceId: `${target}:${part.handles?.[0] || index}`
    }))
  ));
  return {
    data: {
      name: uploadedDesignName(payloadMeta),
      geometry: { polygons: polygonParts, nestingPolygons: polygonParts, layerData },
      mapping: layerMapping
    }
  };
}

export async function nestingParts({ instanceId, fields = {} } = {}) {
  const designId = String(instanceId || '').trim();
  if (!designId) badRequest('Nesting parts projection requires an instance id');
  const geometry = fields.geometry || null;
  if (!geometry || !Array.isArray(geometry.nestingPolygons) || !geometry.nestingPolygons.length) {
    badRequest('Cassette design has no baked geometry — bake the template or import the DXF before nesting');
  }
  const polygonParts = nestingPartsProjection(geometry)
    .map(part => ({ ...part, designId }));
  return { designId, polygonParts };
}

export const endpointServices = {
  'extract-geometry': extractGeometry,
  'nesting-parts': nestingParts
};
