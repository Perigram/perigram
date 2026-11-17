import {
  buildValueWorkerRequest,
  enrichNestingResult,
  groupNestingLayouts,
  nestingPartsProjection,
  summarizeNestingResult,
  normalizeNestingItems,
  nestingSheetCount
} from '../nesting-projections.js';

function nestingParts({ typeId, instanceId, fields = {} } = {}) {
  const geometry = fields.geometry || null;
  if (!geometry || !Array.isArray(geometry.nestingPolygons) || !geometry.nestingPolygons.length) {
    badRequest('Cassette design has no baked geometry — bake the template or import the DXF before nesting');
  }
  const polygonParts = nestingPartsProjection(geometry)
    .map(part => ({ ...part, designId: String(instanceId || '') }));
  return { designId: String(instanceId || ''), polygonParts };
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
      if (operationId === 'nesting-parts') return nestingParts(input);
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
