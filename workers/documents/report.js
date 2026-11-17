// The document IR adapters for the report vertical (HAG over the one
// graph): markdown ↔ `text.flow-document@1`, `document.report@1`
// composition, and the report's export representations. Pure value
// code — the IR contracts live in this worker's README.
import { requireReport, composeReport, extractTable, renderReportHtml, exportMarkdown, blockMarkdown } from './report-ir.mjs';
import { renderPdfFromMarkdown } from './fill.js';
import { parseMarkdown } from './markdown-ir.mjs';
export { composeReport, extractTable, renderReportHtml, exportMarkdown, parseMarkdown };

function badInput(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

// One report over the composed inputs: the flow document renders as the
// section's content, the row records as its table. Inputs keep their
// kinds — an implicit parse or extraction at compose time would hide the
// graph's own operations.
// The report as markdown text: sections assemble as headings, flow
// content, and tables — the assembly the PDF writer lays out and a
// plain-text representation in its own right.
export function reportMarkdown(report) {
  requireReport(report);
  const parts = [];
  if (report.title) parts.push(`# ${report.title}`);
  for (const section of report.sections) {
    if (section.title) parts.push(`## ${section.title}`);
    for (const block of section.blocks) {
      if (block.type === 'flow') parts.push(exportMarkdown(block.document).trimEnd());
      else if (block.type === 'table' && Array.isArray(block.rows)) {
        parts.push(blockMarkdown({ type: 'table', rows: block.rows }));
      }
    }
  }
  return parts.join('\n\n');
}

export async function renderReportPdf(report) {
  return await renderPdfFromMarkdown(reportMarkdown(report));
}

export async function renderDocumentPdf(document) {
  return await renderPdfFromMarkdown(exportMarkdown(document));
}
