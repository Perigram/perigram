import { composeReport, extractTable, renderReportHtml, exportMarkdown } from '../report-ir.mjs';

export function createRuntime() {
  return {
    execute(operationId, input = {}) {
      if (!['extract-table', 'compose-report', 'render-html', 'export-markdown'].includes(operationId)) {
        throw new Error(`Unsupported Documents server operation: ${operationId}`);
      }
      if (operationId === 'extract-table') return extractTable(input.document);
      if (operationId === 'compose-report') return composeReport(input);
      if (operationId === 'render-html') return renderReportHtml(input.report);
      return exportMarkdown(input.document);
    }
  };
}
