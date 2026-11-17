import * as XLSX from '../assets/vendor/xlsx.mjs';
import { composeReport, extractTable, renderReportHtml, renderDocumentHtml, exportMarkdown, composeDocument, appendDocumentBlock, createDocumentBlock, createInlineValue } from '../report-ir.mjs';

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function payloadSource(input = {}) {
  return input?.payload?.payloadBase64 ? input.payload : input;
}

function payloadBytes(input = {}, operationId) {
  const source = payloadSource(input);
  if (typeof source?.payloadBase64 !== 'string' || !source.payloadBase64) {
    badRequest(operationId + ' requires a payload with payloadBase64');
  }
  const binary = atob(source.payloadBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return { source, bytes };
}

function columnLetter(index) {
  let n = index;
  let letter = '';
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

function recordsByHeader(matrix) {
  const headers = matrix[0].map(header => String(header ?? '').trim());
  return matrix.slice(1).map(row => Object.fromEntries(
    headers.map((header, index) => [header, row[index] ?? '']).filter(([header]) => header)
  ));
}

function recordsByPosition(matrix) {
  return matrix.map(row => Object.fromEntries(
    row.map((cell, index) => [columnLetter(index), cell ?? ''])
  ));
}

function sheetMatrix(input = {}, operationId) {
  const { source, bytes } = payloadBytes(input, operationId);
  const csv = input.typeId === 'csv-table' || source.typeId === 'csv-table'
    || String(source.mime || source.payloadMime || '').startsWith('text/csv');
  let workbook;
  try {
    workbook = csv
      ? XLSX.read(new TextDecoder().decode(bytes), { type: 'string' })
      : XLSX.read(bytes, { type: 'array' });
  } catch {
    badRequest('payload is not a readable spreadsheet');
  }
  const sheetName = workbook.SheetNames?.[0];
  const sheet = sheetName ? workbook.Sheets?.[sheetName] : null;
  if (!sheet) badRequest('the payload carries no sheet');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
  if (!matrix.length) badRequest('the payload carries no rows');
  return matrix;
}


export function createRuntime() {
  return {
    execute(operationId, input = {}) {
      if (operationId === 'text') {
        const { bytes } = payloadBytes(input, operationId);
        return new TextDecoder().decode(bytes);
      }
      if (operationId === 'table-rows') return recordsByHeader(sheetMatrix(input, operationId));
      if (operationId === 'table-cells') return recordsByPosition(sheetMatrix(input, operationId));
      if (operationId === 'csv-text') {
        const rows = input.rows ?? [];
        if (!Array.isArray(rows)) {
          const error = new Error('csv-text requires a rows array');
          error.status = 400;
          throw error;
        }
        return XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.map(row => (row && typeof row === 'object') ? row : {})));
      }
      const blockOperations = ['document-paragraph', 'document-heading', 'document-list', 'document-table', 'document-quote', 'document-code-block', 'document-divider'];
      const inlineOperations = ['inline-text', 'inline-mark', 'inline-link'];
      if (![...blockOperations, ...inlineOperations, 'compose-document', 'append-document-block', 'extract-table', 'compose-report', 'render-html', 'render-document-html', 'export-markdown', 'export-markdown-file', 'export-html-file'].includes(operationId)) {
        throw new Error(`Unsupported Documents shared operation: ${operationId}`);
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
