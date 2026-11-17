import listing from '../listing.json' with { type: 'json' };
import * as XLSX from '../assets/vendor/xlsx.mjs';
import { parseMarkdown } from '../markdown-ir.mjs';
import { fillMarkdown } from '../template-ir.mjs';
import { fillWorkbook } from '../workbook-template.mjs';
import { composeReport, extractTable, renderReportHtml, renderDocumentHtml, exportMarkdown, composeDocument, appendDocumentBlock, createDocumentBlock, createInlineValue } from '../report-ir.mjs';

export function createRuntime() {
  const executeOperation = (operationId, input = {}) => {
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
    if (![...blockOperations, ...inlineOperations, 'compose-document', 'append-document-block', 'extract-table', 'compose-report', 'render-html', 'render-document-html', 'export-markdown', 'export-markdown-file', 'export-html-file', 'parse-markdown', 'fill-markdown-template', 'fill-workbook-template'].includes(operationId)) {
      throw new Error(`Unsupported Documents shared operation: ${operationId}`);
    }
    if (blockOperations.includes(operationId)) return createDocumentBlock(operationId, input);
    if (inlineOperations.includes(operationId)) return createInlineValue(operationId, input);
    if (operationId === 'parse-markdown') return parseMarkdown(input.text);
    if (operationId === 'fill-markdown-template') return filePayload(fillMarkdown(input.templateText, input.values || {}), 'text/markdown', input.name || 'document');
    if (operationId === 'fill-workbook-template') return fillWorkbookFile(input);
    if (operationId === 'compose-document') return composeDocument(input);
    if (operationId === 'append-document-block') return appendDocumentBlock(input.document, input.block);
    if (operationId === 'extract-table') return extractTable(input.document);
    if (operationId === 'compose-report') return composeReport(input);
    if (operationId === 'render-html') return renderReportHtml(input.report);
    if (operationId === 'render-document-html') return renderDocumentHtml(input.document);
    if (operationId === 'export-markdown-file') return filePayload(exportMarkdown(input.document), 'text/markdown', input.name || input.document?.title || 'document');
    if (operationId === 'export-html-file') return filePayload(renderDocumentHtml(input.document), 'text/html', input.name || input.document?.title || 'document');
    return exportMarkdown(input.document);
  };
  return {
    execute(operationId, input = {}, options = {}) {
      const graphInvocation = input?.mode === 'preview' && input?.inputs && typeof input.inputs === 'object';
      const args = graphInvocation ? input.inputs : input;
      const value = ['read-file', 'read-text-file', 'read-table-rows', 'read-table-cells'].includes(operationId)
        ? executeFileRead(operationId, args, options.capabilities || {})
        : executeOperation(operationId, args);
      return graphInvocation ? Promise.resolve(value).then(result => ({ value: result })) : value;
    },
    providers: [{
      provider: 'plugin.documents',
      definitions: documentsNodeDefinitions(listing, 'documents-shared')
    }]
  };
}

function documentsNodeDefinitions(source, runtimeId) {
  const runtime = source.declarations.runtimes?.find(item => item.id === runtimeId);
  if (!runtime) throw new Error(`Documents runtime declaration is missing: ${runtimeId}`);
  return source.declarations.services
    .filter(service => service.execution?.runtime === runtimeId
      && service.execution.targets?.includes('browser')
      && service.palette?.visible !== false
      && service.palette?.group)
    .map(service => ({
      provider: 'plugin.documents',
      id: service.id,
      version: String(service.nodeVersion || '1'),
      label: service.label || service.id,
      ...(service.description ? { description: service.description } : {}),
      palette: {
        group: service.palette.group,
        ...(service.palette.label ? { label: service.palette.label } : {}),
        keywords: service.palette.keywords || []
      },
      inputs: Object.entries(service.signature?.input?.fields || {}).map(([id, field]) => ({
        id,
        label: field.label || id,
        ...nodePortContract(field),
        required: field.nullable !== true,
        ...(Object.hasOwn(field, 'default') ? { default: field.default } : {}),
        ...(field.description ? { description: field.description } : {})
      })),
      outputs: [{
        id: 'value',
        label: service.signature?.output?.label || 'Value',
        ...nodePortContract(service.signature?.output || {}),
        required: true
      }],
      execution: {
        runtime: runtimeId,
        kind: service.execution.kind,
        targets: service.execution.targets,
        capabilities: service.execution.capabilities || [],
        deterministic: service.execution.deterministic === true,
        idempotent: service.execution.idempotent === true
      }
    }));
}

function nodePortContract(schema = {}) {
  const shape = ['list', 'tree', 'map', 'tuple', 'stream'].includes(schema.base)
    ? schema.base
    : 'item';
  const semanticSource = shape === 'item' ? schema : (schema.itemType || { base: 'json' });
  const semantic = {
    base: semanticSource.base || 'json',
    ...(semanticSource.kind ? { kind: semanticSource.kind } : {}),
    ...(schema.nullable === true ? { nullable: true } : {})
  };
  return { shape, semantic };
}

async function executeFileRead(operationId, input = {}, capabilities = {}) {
  const payload = input.payload?.payloadBase64 || input.payload?.base64 ? input.payload : input;
  let file = payload;
  if (typeof (file.payloadBase64 || file.base64) !== 'string') {
    const fileId = String(input.fileId || input.payload?.fileId || '');
    if (!fileId) throw new Error(`${operationId} requires a fileId or hydrated payload`);
    if (typeof capabilities['files.read'] !== 'function') {
      throw new Error('The authorized files.read capability is unavailable');
    }
    file = await capabilities['files.read']({ fileId });
  }
  const encoded = file.payloadBase64 || file.base64;
  if (typeof encoded !== 'string') throw new Error('The file read capability returned no base64 payload');
  let binary;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error('The file payload is not valid base64');
  }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (operationId === 'read-file') return binaryFilePayload(bytes, file.mime || 'application/octet-stream', file.name || 'file');
  if (operationId === 'read-text-file') return new TextDecoder().decode(bytes);

  const csv = input.typeId === 'csv-table'
    || String(file.mime || '').startsWith('text/csv')
    || /\.csv$/i.test(String(file.name || ''));
  let workbook;
  try {
    workbook = csv
      ? XLSX.read(new TextDecoder().decode(bytes), { type: 'string' })
      : XLSX.read(bytes, { type: 'array' });
  } catch {
    throw new Error('The file payload is not a readable CSV or XLSX workbook');
  }
  const sheetName = workbook.SheetNames?.[0];
  const sheet = sheetName ? workbook.Sheets?.[sheetName] : null;
  if (!sheet) throw new Error('The file payload carries no worksheet');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
  if (!matrix.length) throw new Error('The file payload carries no rows');
  return operationId === 'read-table-rows'
    ? recordsByHeader(matrix)
    : recordsByPosition(matrix);
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

function columnLetter(index) {
  let n = index;
  let letter = '';
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function fillWorkbookFile(input = {}) {
  const template = input.template?.payload || input.template || {};
  if (typeof template.base64 !== 'string') throw new Error('fill-workbook-template requires a file payload');
  if (template.mime !== XLSX_MIME && !/\.xlsx$/i.test(String(template.name || ''))) {
    throw new Error('fill-workbook-template accepts XLSX workbook templates only');
  }
  let binary;
  try { binary = atob(template.base64); } catch { throw new Error('The workbook template is not valid base64'); }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const filled = fillWorkbook(bytes, input.values || {});
  const requestedName = String(input.name || template.name || 'document').replace(/\.xlsx$/i, '');
  return binaryFilePayload(filled, XLSX_MIME, `${requestedName}.xlsx`);
}

function binaryFilePayload(bytes, mime, name) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let index = 0; index < data.length; index += 0x8000) {
    binary += String.fromCharCode(...data.subarray(index, index + 0x8000));
  }
  return { payload: { base64: btoa(binary), mime, name } };
}

function filePayload(content, mime, name) {
  const bytes = new TextEncoder().encode(String(content));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  const base = String(name || 'document').replace(/\.[^.]+$/, '');
  return { payload: { base64: btoa(binary), mime, name: `${base}.${mime === 'text/markdown' ? 'md' : 'html'}` } };
}
