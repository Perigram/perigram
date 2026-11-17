// The documents plugin's executor services (endpoint mode): pure compute
// over values — the platform sends the record's own payload as base64 and
// the service returns the computed value; the CSV composition twin takes
// rows in and returns the CSV text. The table decomposition and text
// extraction moved here from the retired pack's projection handlers
// (owner decision 2026-10-17); column semantics stay in the reading
// graph. Imports the xlsx ESM build.
import { readFileSync } from 'node:fs';
import {
  DXF_MIME_TYPES,
  XLSX_MIME,
  fillMarkdown,
  fillPdfTemplate,
  fillWorkbook,
  markdownTemplateTokens,
  pdfTemplateTokens,
  renderPdfFromCsv,
  renderPdfFromDxf,
  renderPdfFromImage,
  renderPdfFromMarkdown,
  renderPdfFromWorkbook,
  workbookTemplateTokens
} from './fill.js';
import { parseMarkdown, renderReportPdf, renderDocumentPdf } from './report.js';

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

const FILE_KINDS = [
  { kind: 'markdown', match: ({ mime, name }) => mime === 'text/markdown' || /\.md$/i.test(name || '') },
  { kind: 'workbook', match: ({ mime, name }) => mime === XLSX_MIME || /\.xlsx$/i.test(name || '') },
  { kind: 'csv', match: ({ mime, name }) => mime === 'text/csv' || /\.csv$/i.test(name || '') },
  { kind: 'pdf', match: ({ mime, name }) => mime === 'application/pdf' || /\.pdf$/i.test(name || '') },
  { kind: 'image', match: ({ mime }) => /^image\//i.test(mime || '') },
  { kind: 'dxf', match: ({ mime, name }) => DXF_MIME_TYPES.has(mime) || /\.dxf$/i.test(name || '') }
];

function fileKindOf(reference) {
  const context = { mime: reference?.payloadMime || '', name: reference?.name || '' };
  return FILE_KINDS.find(entry => entry.match(context))?.kind || null;
}

function baseName(value) {
  return String(value || 'document').replace(/\.[^.]+$/, '');
}

// The composed file's name: the operator's typed create name (the declared
// `name` input, data-qualified on the construction wire) over the source
// file's name.
function draftName(input, fallbackName) {
  return baseName(input.draft?.data?.name || input.draft?.name || input.draft?.identity?.name || fallbackName);
}

function toPayload(buffer, mime, name) {
  return { payload: { base64: Buffer.from(buffer).toString('base64'), mime, name } };
}

function requireRef(input, field, serviceId) {
  const reference = input?.refs?.[field];
  if (!reference?.payloadBase64) {
    badRequest(`${serviceId} requires a ${field} ref with a payload`);
  }
  return {
    buffer: Buffer.from(reference.payloadBase64, 'base64'),
    mime: reference.payloadMime || '',
    name: reference.name || '',
    text: () => Buffer.from(reference.payloadBase64, 'base64').toString('utf8')
  };
}

export const services = {
  'parse-markdown': async ({ text } = {}) => parseMarkdown(text),
  'render-report-pdf': async ({ report, name } = {}) => toPayload(
    await renderReportPdf(report),
    'application/pdf',
    `${baseName(name || report?.title || 'report')}.pdf`
  ),
  'render-document-pdf': async ({ document, name } = {}) => toPayload(
    await renderDocumentPdf(document),
    'application/pdf',
    `${baseName(name || document?.title || 'document')}.pdf`
  ),
  // Template fill (SPEC §24): the template ref's payload plus the wired
  // values in, the filled file out as the created record's payload. The
  // operator's typed name (a declared input, data-qualified on the wire)
  // names the composed file; the template's name is the fallback. The
  // template's token keys ride the ephemeral meta channel — the fill
  // dialog's per-token form reads them, records never store them.
  fill: async (input = {}) => {
    const template = requireRef(input, 'template', 'fill');
    const values = input.draft?.data?.values ?? {};
    const name = draftName(input, template.name);
    const kind = fileKindOf(input?.refs?.template);
    if (kind === 'markdown') {
      return { ...toPayload(fillMarkdown(template.text(), values), 'text/markdown', `${name}.md`), meta: { tokens: markdownTemplateTokens(template.text()) } };
    }
    if (kind === 'workbook') {
      return { ...toPayload(fillWorkbook(template.buffer, values), XLSX_MIME, `${name}.xlsx`), meta: { tokens: workbookTemplateTokens(template.buffer) } };
    }
    if (kind === 'pdf') {
      return { ...toPayload(await fillPdfTemplate(template.buffer, values), 'application/pdf', `${name}.pdf`), meta: { tokens: await pdfTemplateTokens(template.buffer) } };
    }
    badRequest('fill accepts markdown, xlsx, or pdf templates');
  },
  // PDF rendering from other file types (SPEC §24): the source ref in,
  // a rendered PDF payload out.
  'render-pdf': async (input = {}) => {
    const source = requireRef(input, 'source', 'render-pdf');
    const name = draftName(input, source.name);
    const kind = fileKindOf(input?.refs?.source);
    if (kind === 'markdown') {
      const values = input.draft?.data?.values ?? {};
      return toPayload(await renderPdfFromMarkdown(source.text(), values), 'application/pdf', `${name}.pdf`);
    }
    if (kind === 'workbook') return toPayload(await renderPdfFromWorkbook(source.buffer), 'application/pdf', `${name}.pdf`);
    if (kind === 'csv') return toPayload(await renderPdfFromCsv(source.text()), 'application/pdf', `${name}.pdf`);
    if (kind === 'image') return toPayload(await renderPdfFromImage(source.buffer, source.mime), 'application/pdf', `${name}.pdf`);
    if (kind === 'dxf') return toPayload(await renderPdfFromDxf(source.buffer), 'application/pdf', `${name}.pdf`);
    badRequest('render-pdf accepts markdown, xlsx, csv, image, or dxf sources');
  }
};


const listing = JSON.parse(readFileSync(new URL('./listing.json', import.meta.url), 'utf8'));
export const endpointServices = Object.fromEntries(
  listing.declarations.services
    .filter(service => service.mode === 'endpoint')
    .map(service => [service.id, services[service.id]])
);
