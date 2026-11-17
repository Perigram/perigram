import * as XLSX from '../assets/vendor/xlsx.mjs';

export function createRuntime() {
  return {
    execute(operationId, input = {}) {
      if (operationId !== 'csv-text') {
        throw new Error(`Unsupported Documents browser operation: ${operationId}`);
      }
      const rows = input.rows ?? [];
      if (!Array.isArray(rows)) {
        const error = new Error('csv-text requires a rows array');
        error.status = 400;
        throw error;
      }
      return XLSX.utils.sheet_to_csv(
        XLSX.utils.json_to_sheet(rows.map(row => (row && typeof row === 'object') ? row : {}))
      );
    }
  };
}
