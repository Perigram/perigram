import listing from '../listing.json' with { type: 'json' };
import * as XLSX from '../assets/vendor/xlsx.mjs';
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
  };
  return {
    execute(operationId, input = {}) {
      const graphInvocation = input?.mode === 'preview' && input?.inputs && typeof input.inputs === 'object';
      const value = executeOperation(operationId, graphInvocation ? input.inputs : input);
      return graphInvocation ? { value } : value;
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

function filePayload(content, mime, name) {
  const bytes = new TextEncoder().encode(String(content));
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  const base = String(name || 'document').replace(/\.[^.]+$/, '');
  return { payload: { base64: btoa(binary), mime, name: `${base}.${mime === 'text/markdown' ? 'md' : 'html'}` } };
}
