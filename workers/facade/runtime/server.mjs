import { nestingResultToPreview, sheetDesignParts } from '../surfaces/lib/sheetLayout.js';
import { generateLayeredDxf } from '../vendor/dxf-writer.js';
import { occsLayerExportName, occsLayerStandard } from '../occs/layerStandards.js';
import {
  buildValueWorkerRequest,
  enrichNestingResult,
  groupNestingLayouts,
  summarizeNestingResult,
  normalizeNestingItems,
  nestingSheetCount,
  stableSheetName
} from '../nesting-projections.js';

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
  const designPin = new Map(resolvedDesigns.map(design => [
    String(design.id),
    design.revision ? { type: 'cassette-design', id: String(design.id), revision: String(design.revision) } : null
  ]));
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

function matchSheet({ layoutKey, sheets } = {}) {
  const key = String(layoutKey || '');
  const design = key && Array.isArray(sheets)
    ? sheets.find(sheet => String(sheet?.fields?.compositionKey || '') === key) || null
    : null;
  return { found: Boolean(design), design };
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  error.statusCode = 400;
  throw error;
}

export function createRuntime() {
  return {
    async execute(operationId, input = {}, { capabilities } = {}) {
      if (operationId === 'match-sheet') return matchSheet(input);
      if (operationId === 'construct-sheet') return constructSheet(input);
      if (operationId === 'generate-sheet-dxf') return generateSheetDxf(input);
      if (operationId !== 'nesting-solve') {
        throw new Error(`Unsupported Facade managed operation: ${operationId}`);
      }
      if (!capabilities || typeof capabilities.call !== 'function') {
        throw new Error('Facade nesting requires the platform nesting capability');
      }
      const items = normalizeNestingItems(input.items);
      const params = {
        width: Number(input.sheetWidth),
        height: Number(input.sheetHeight),
        space: Number(input.space ?? 3),
        sheetCount: nestingSheetCount(items)
      };
      for (const key of ['width', 'height', 'space', 'sheetCount']) {
        if (!Number.isFinite(params[key]) || params[key] <= 0) {
          badRequest(`Nesting params require a finite positive ${key}`);
        }
      }
      const request = buildValueWorkerRequest(items, params);
      const result = enrichNestingResult(
        await capabilities.call('facade.nesting.solve', request),
        request
      );
      if (result.status === 'error') {
        const error = new Error(result.message || 'Nesting worker failed');
        error.status = 502;
        error.statusCode = 502;
        throw error;
      }
      return {
        layouts: groupNestingLayouts(result),
        summary: summarizeNestingResult(result, request.params)
      };
    }
  };
}
