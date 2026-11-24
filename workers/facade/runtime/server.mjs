import { nestingResultToPreview, sheetDesignParts } from '../surfaces/lib/sheetLayout.js';
import { generateLayeredDxf } from '../vendor/dxf-writer.js';
import { occsLayerExportName, occsLayerStandard } from '../occs/layerStandards.js';
import { evaluateOccsCassetteTemplate } from '../occs/evaluate.js';
import { isOccsDocument } from '../occs/parameters.js';
import { stableSheetName } from '../nesting-projections.js';

function designIdOfPlacement(items = [], placed = {}) {
  const source = items.find(item => String(item.id) === String(placed.item_id ?? placed.itemId ?? placed.id));
  return String(source?.design_id ?? source?.sourceId ?? placed.design_id ?? placed.sourceId ?? '') || null;
}

function sheetPolygonBounds(polygon) {
  const outer = polygon?.outer || [];
  if (outer.length < 2) return { width: 1220, height: 2440 };
  const xs = outer.map(point => Number(point?.[0]) || 0);
  const ys = outer.map(point => Number(point?.[1]) || 0);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function utf8FromBase64(value) {
  const binary = atob(String(value || ''));
  return new TextDecoder().decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
}

async function bake({ refs = {}, draft = {} } = {}) {
  const template = refs.template;
  if (!template) badRequest('bake requires a template reference');
  const parameters = draft?.data?.parameters || {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    badRequest('Cassette design bake parameters must be an object');
  }
  let definition;
  try {
    definition = JSON.parse(utf8FromBase64(template.payloadBase64));
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
  const signature = Object.entries(parameters)
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key} ${value}`)
    .join(' · ');
  const base = String(template.name || '').trim() || 'Cassette design';
  return { data: { name: signature ? `${base} · ${signature}` : base, geometry: evaluation } };
}

function base64OfUtf8(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function generateSheetDxf({ fields, refs = {}, draft = {} } = {}) {
  const sheetFields = refs?.sheet?.fields || fields || {};
  const sheetName = refs?.sheet?.name || sheetFields.name || draft?.data?.name || null;
  const toExportLayer = layer => (layer && occsLayerStandard(layer) ? occsLayerExportName(layer) : layer);
  const dxf = generateLayeredDxf({
    layers: (sheetFields.geometry?.preview?.layers || []).map(layer => {
      const code = layer?.standardCode || layer?.name;
      return occsLayerStandard(code) ? { ...layer, name: occsLayerExportName(code) } : layer;
    }),
    layerData: (sheetFields.geometry?.data?.layerData || []).map(item => ({
      ...item,
      layer: toExportLayer(item.layer || item.standardCode || item.name)
    })),
    polygonParts: sheetFields.geometry?.data?.polygonParts || []
  });
  if (!dxf) {
    const error = new Error('Sheet design has no exportable geometry');
    error.status = 404;
    error.statusCode = 404;
    throw error;
  }
  return {
    payload: {
      base64: base64OfUtf8(dxf),
      mime: 'application/dxf',
      ...(sheetName ? { name: `${sheetName}.dxf` } : {})
    }
  };
}

function constructSheet({ refs = {}, draft = {} } = {}) {
  const layout = draft?.data?.layout;
  const resolvedDesigns = Array.isArray(refs.designs) ? refs.designs : [];
  const designPin = new Map();
  for (const design of resolvedDesigns) {
    const id = String(design?.id || '').trim();
    const revision = String(design?.revision || '').trim();
    if (!id || !revision) {
      badRequest('Sheet construction requires revision-pinned cassette-design references');
    }
    if (designPin.has(id)) badRequest(`Sheet construction received duplicate cassette-design reference ${id}`);
    designPin.set(id, { type: 'cassette-design', id, revision });
  }
  if (layout != null && (typeof layout !== 'object' || Array.isArray(layout))) {
    badRequest('Sheet construction requires a layout value');
  }
  const placements = layout ? (layout.placed_items || layout.items || []) : [];
  if (layout && !Array.isArray(placements)) badRequest('Sheet construction requires a layout with placed items');
  const items = layout && Array.isArray(layout.sourceItems) ? layout.sourceItems : [];
  if (layout && placements.length && !items.length) {
    badRequest('Sheet construction requires a layout with item sources — re-run the nesting solve');
  }
  for (const placed of placements) {
    const designId = designIdOfPlacement(items, placed);
    if (!designId) {
      badRequest('Sheet construction needs the cassette-design behind every placement — re-run the nesting solve with the designs connected');
    }
    if (!designPin.has(designId)) {
      badRequest(`Sheet construction placement names cassette-design ${designId}, which the declared designs do not include`);
    }
  }
  const { sourceItems, sheetPolygon: solvedPolygon, ...storedLayout } = layout || {};
  const sheetPolygon = solvedPolygon && Array.isArray(solvedPolygon.outer)
    ? { outer: solvedPolygon.outer, inner: Array.isArray(solvedPolygon.inner) ? solvedPolygon.inner : [] }
    : null;
  const { width, height } = sheetPolygonBounds(sheetPolygon);
  const result = {
    items: items.map(item => ({ ...item, design_id: item.design_id || item.sourceId })),
    solution: { layouts: [storedLayout] }
  };
  return {
    data: {
      name: stableSheetName(layout, draft),
      ...(layout?.compositionKey ? { compositionKey: String(layout.compositionKey) } : {}),
      geometry: {
        data: { ...result, ...(sheetPolygon ? { sheetPolygon } : {}), solveParams: { width, height } },
        preview: nestingResultToPreview(result, { width, height }, { layoutIndex: 0 })
      }
    },
    relations: { parts: sheetDesignParts(result, designPin) }
  };
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  error.statusCode = 400;
  throw error;
}

export function createRuntime() {
  return {
    async execute(operationId, input = {}) {
      if (operationId === 'construct-sheet') return constructSheet(input);
      if (operationId === 'generate-sheet-dxf') return generateSheetDxf(input);
      if (operationId === 'bake') return await bake(input);
      throw new Error(`Unsupported Facade managed operation: ${operationId}`);
    }
  };
}
