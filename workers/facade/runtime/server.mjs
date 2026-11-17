import {
  buildValueWorkerRequest,
  enrichNestingResult,
  groupNestingLayouts,
  summarizeNestingResult,
  normalizeNestingItems,
  nestingSheetCount
} from '../nesting-projections.js';

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
