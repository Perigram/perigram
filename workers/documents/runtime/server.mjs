import { composeReport, extractTable, renderReportHtml, renderDocumentHtml, exportMarkdown, composeDocument, appendDocumentBlock, createDocumentBlock, createInlineValue } from '../report-ir.mjs';

export function createRuntime() {
  return {
    execute(operationId, input = {}) {
      const blockOperations = ['document-paragraph', 'document-heading', 'document-list', 'document-table', 'document-quote', 'document-code-block', 'document-divider'];
      const inlineOperations = ['inline-text', 'inline-mark', 'inline-link'];
      if (![...blockOperations, ...inlineOperations, 'compose-document', 'append-document-block', 'extract-table', 'compose-report', 'render-html', 'render-document-html', 'export-markdown', 'export-markdown-file', 'export-html-file'].includes(operationId)) {
        throw new Error(`Unsupported Documents server operation: ${operationId}`);
      }
      if (blockOperations.includes(operationId)) return createDocumentBlock(operationId, input);
      if (inlineOperations.includes(operationId)) return createInlineValue(operationId, input);
      if (operationId === 'compose-document') return composeDocument(input);
      if (operationId === 'append-document-block') return appendDocumentBlock(input.document, input.block);
      if (operationId === 'extract-table') return extractTable(input.document);
      if (operationId === 'compose-report') return composeReport(input);
      if (operationId === 'render-html') return renderReportHtml(input.report);
      if (operationId === 'render-document-html') return renderDocumentHtml(input.document);
      if (operationId === 'export-markdown-file') return filePayload(exportMarkdown(input.document), 'text/markdown', input.name || input.document?.title || 'document');
      if (operationId === 'export-html-file') return filePayload(renderDocumentHtml(input.document), 'text/html', input.name || input.document?.title || 'document');
      return exportMarkdown(input.document);
    }
  };
}

function filePayload(content, mime, name) {
  const bytes = new TextEncoder().encode(String(content));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  const base = String(name || 'document').replace(/\.[^.]+$/, '');
  return { payload: { base64: btoa(binary), mime, name: `${base}.${mime === 'text/markdown' ? 'md' : 'html'}` } };
}
