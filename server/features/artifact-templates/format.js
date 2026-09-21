import DxfParser from 'dxf-parser';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createError } from 'h3';

const DXF_MIME_TYPES = new Set(['application/dxf', 'application/x-dxf', 'image/vnd.dxf']);
const PDF_MIME_TYPES = new Set(['application/pdf']);

export function templateFormatFor(filename = '', mimeType = '') {
  const lowerName = String(filename).toLowerCase();
  const normalizedMime = String(mimeType).toLowerCase().split(';')[0].trim();
  if (lowerName.endsWith('.dxf') || DXF_MIME_TYPES.has(normalizedMime)) return 'DXF';
  if (lowerName.endsWith('.pdf') || PDF_MIME_TYPES.has(normalizedMime)) return 'PDF';
  throw createError({ statusCode: 400, message: 'Artifact templates must be DXF or PDF files' });
}

export async function parseTemplate(buffer, { filename = '', mimeType = '' } = {}) {
  const format = templateFormatFor(filename, mimeType);
  return format === 'DXF' ? parseDxfTemplate(buffer) : await parsePdfTemplate(buffer);
}

export async function renderTemplate(buffer, format, layout, values = {}) {
  const normalizedFormat = String(format || '').toUpperCase();
  assertTemplateValues(layout, values);
  if (normalizedFormat === 'DXF') return renderDxfTemplate(buffer, layout, values);
  if (normalizedFormat === 'PDF') return await renderPdfTemplate(buffer, layout, values);
  throw createError({ statusCode: 400, message: `Unsupported artifact template format: ${format}` });
}

export function normalizeTemplateLayout(layout = {}, expectedFormat = '') {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    throw createError({ statusCode: 400, message: 'Template layout must be an object' });
  }
  const format = String(layout.format || expectedFormat || '').toUpperCase();
  if (!['DXF', 'PDF'].includes(format) || (expectedFormat && format !== String(expectedFormat).toUpperCase())) {
    throw createError({ statusCode: 400, message: 'Template layout format does not match the source file' });
  }
  const pages = (Array.isArray(layout.pages) ? layout.pages : []).map((page, pageIndex) => ({
    number: Number(page.number || pageIndex + 1),
    x: finiteNumber(page.x, 0),
    y: finiteNumber(page.y, 0),
    width: finiteNumber(page.width, 0),
    height: finiteNumber(page.height, 0),
    items: (Array.isArray(page.items) ? page.items : []).map(normalizeLayoutItem)
  }));
  const ids = new Set();
  for (const item of pages.flatMap(page => page.items)) {
    if (ids.has(item.id)) throw createError({ statusCode: 400, message: `Duplicate template layout item: ${item.id}` });
    ids.add(item.id);
  }
  return { format, unit: format === 'PDF' ? 'pt' : 'mm', pages };
}

export function templateVariables(layout = {}) {
  return (layout.pages || []).flatMap(page => page.items || [])
    .filter(item => item.variable?.name)
    .map(item => ({
      name: item.variable.name,
      type: item.variable.type || 'string',
      required: Boolean(item.variable.required),
      default: item.variable.default ?? item.text ?? ''
    }));
}

export function assertTemplateValues(layout = {}, values = {}) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw createError({ statusCode: 400, message: 'Template values must be an object' });
  }
  const seen = new Set();
  for (const variable of templateVariables(layout)) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(variable.name)) {
      throw createError({ statusCode: 400, message: `Invalid template variable name: ${variable.name}` });
    }
    if (seen.has(variable.name)) throw createError({ statusCode: 400, message: `Duplicate template variable: ${variable.name}` });
    seen.add(variable.name);
    const value = values[variable.name] ?? variable.default;
    if (variable.required && (value === undefined || value === null || value === '')) {
      throw createError({ statusCode: 400, message: `Template variable ${variable.name} is required` });
    }
    if (value === undefined || value === null || value === '') continue;
    if (variable.type === 'number' && !Number.isFinite(Number(value))) {
      throw createError({ statusCode: 400, message: `Template variable ${variable.name} must be a number` });
    }
    if (variable.type === 'boolean' && ![true, false, 'true', 'false'].includes(value)) {
      throw createError({ statusCode: 400, message: `Template variable ${variable.name} must be a boolean` });
    }
  }
}

export function parseDxfTemplate(buffer) {
  const source = Buffer.from(buffer).toString('utf8');
  let drawing;
  try {
    drawing = new DxfParser().parseSync(source);
  } catch (error) {
    throw createError({ statusCode: 400, message: `Invalid DXF template: ${error.message}` });
  }
  const records = dxfEntityRecords(source);
  const items = records.map(record => dxfRecordToItem(record));
  const extents = drawing?.header?.$EXTMAX && drawing?.header?.$EXTMIN
    ? {
        x: Number(drawing.header.$EXTMIN.x),
        y: Number(drawing.header.$EXTMIN.y),
        width: Math.max(0, Number(drawing.header.$EXTMAX.x) - Number(drawing.header.$EXTMIN.x)),
        height: Math.max(0, Number(drawing.header.$EXTMAX.y) - Number(drawing.header.$EXTMIN.y))
      }
    : layoutExtents(items);
  return normalizeTemplateLayout({
    format: 'DXF',
    pages: [{ number: 1, x: extents.x, y: extents.y, width: extents.width, height: extents.height, items }]
  }, 'DXF');
}

export function renderDxfTemplate(buffer, layout, values = {}) {
  const source = Buffer.from(buffer).toString('utf8');
  const pairs = dxfPairs(source);
  const itemMap = new Map((layout.pages || []).flatMap(page => page.items || []).map(item => [item.id, item]));
  const records = dxfEntityRecords(source, pairs);
  const removed = new Set();
  for (const record of records) {
    const item = itemMap.get(record.id);
    if (!item) continue;
    if (item.deleted) {
      for (let index = record.start; index < record.end; index += 1) removed.add(index);
      continue;
    }
    const dx = finiteNumber(item.offset?.x, 0);
    const dy = finiteNumber(item.offset?.y, 0);
    for (let index = record.start; index < record.end; index += 1) {
      const pair = pairs[index];
      if (isDxfXCode(pair.code)) pair.value = String(finiteNumber(pair.value, 0) + dx);
      if (isDxfYCode(pair.code)) pair.value = String(finiteNumber(pair.value, 0) + dy);
    }
    if (item.kind === 'text') {
      const text = resolvedItemText(item, values);
      const textPair = pairs.slice(record.start, record.end).find(pair => pair.code === 1);
      if (textPair) textPair.value = text;
    }
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return Buffer.from(pairs.filter((_, index) => !removed.has(index)).flatMap(pair => [String(pair.code), pair.value]).join(newline) + newline, 'utf8');
}

export async function parsePdfTemplate(buffer) {
  try {
    const loadingTask = getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true });
    const document = await loadingTask.promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter(item => typeof item.str === 'string' && item.str.length)
        .map((item, index) => ({
          id: `page-${pageNumber}-text-${index + 1}`,
          kind: 'text',
          typeId: 'TEXT',
          text: item.str,
          x: finiteNumber(item.transform?.[4], 0),
          y: finiteNumber(item.transform?.[5], 0),
          width: Math.max(1, finiteNumber(item.width, 1)),
          height: Math.max(1, finiteNumber(item.height, Math.abs(item.transform?.[3]) || 10)),
          fontSize: Math.max(1, Math.abs(finiteNumber(item.transform?.[3], 10))),
          offset: { x: 0, y: 0 },
          deleted: false,
          variable: null
        }));
      pages.push({ number: pageNumber, width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }
    await document.destroy();
    return normalizeTemplateLayout({ format: 'PDF', pages }, 'PDF');
  } catch (error) {
    throw createError({ statusCode: 400, message: `Invalid PDF template: ${error.message}` });
  }
}

export async function renderPdfTemplate(buffer, layout, values = {}) {
  let document;
  try {
    document = await PDFDocument.load(buffer, { updateMetadata: false });
  } catch (error) {
    throw createError({ statusCode: 400, message: `Invalid PDF template: ${error.message}` });
  }
  const font = await document.embedFont(StandardFonts.Helvetica);
  const pages = document.getPages();
  for (const pageLayout of layout.pages || []) {
    const page = pages[Number(pageLayout.number || 1) - 1];
    if (!page) throw createError({ statusCode: 400, message: `Template PDF page ${pageLayout.number} does not exist` });
    for (const item of pageLayout.items || []) {
      if (item.kind !== 'text' || !itemChanged(item)) continue;
      const padding = 1;
      page.drawRectangle({
        x: finiteNumber(item.x, 0) - padding,
        y: finiteNumber(item.y, 0) - padding,
        width: Math.max(1, finiteNumber(item.width, 1)) + padding * 2,
        height: Math.max(1, finiteNumber(item.height, 1)) + padding * 2,
        color: rgb(1, 1, 1)
      });
      if (item.deleted) continue;
      page.drawText(resolvedItemText(item, values), {
        x: finiteNumber(item.x, 0) + finiteNumber(item.offset?.x, 0),
        y: finiteNumber(item.y, 0) + finiteNumber(item.offset?.y, 0),
        size: Math.max(1, finiteNumber(item.fontSize, item.height || 10)),
        font,
        color: rgb(0, 0, 0)
      });
    }
  }
  return Buffer.from(await document.save());
}

function normalizeLayoutItem(item = {}) {
  const id = String(item.id || '').trim();
  if (!id) throw createError({ statusCode: 400, message: 'Template layout items require stable ids' });
  const kind = item.kind === 'text' ? 'text' : 'geometry';
  const variable = item.variable?.name ? {
    name: String(item.variable.name).trim(),
    type: ['string', 'number', 'boolean'].includes(item.variable.type) ? item.variable.type : 'string',
    required: Boolean(item.variable.required),
    default: item.variable.default ?? item.text ?? ''
  } : null;
  return {
    id,
    kind,
    typeId: String(item.typeId || (kind === 'text' ? 'TEXT' : 'ENTITY')),
    layer: String(item.layer || ''),
    x: finiteNumber(item.x, 0),
    y: finiteNumber(item.y, 0),
    width: Math.max(0, finiteNumber(item.width, 0)),
    height: Math.max(0, finiteNumber(item.height, 0)),
    ...(kind === 'text' ? { text: String(item.text ?? ''), fontSize: Math.max(1, finiteNumber(item.fontSize, item.height || 10)) } : {}),
    ...(item.geometry && typeof item.geometry === 'object' ? { geometry: item.geometry } : {}),
    offset: { x: finiteNumber(item.offset?.x, 0), y: finiteNumber(item.offset?.y, 0) },
    deleted: Boolean(item.deleted),
    variable
  };
}

function dxfPairs(source) {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const pairs = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[index + 1] });
  }
  return pairs;
}

function dxfEntityRecords(source, suppliedPairs = null) {
  const pairs = suppliedPairs || dxfPairs(source);
  let inEntities = false;
  let pendingSection = false;
  const records = [];
  let start = -1;
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (pair.code === 0 && pair.value.trim() === 'SECTION') pendingSection = true;
    else if (pendingSection && pair.code === 2) {
      inEntities = pair.value.trim() === 'ENTITIES';
      pendingSection = false;
    }
    if (!inEntities) continue;
    if (pair.code === 0) {
      if (start >= 0) records.push(dxfRecord(pairs, start, index, records.length));
      if (pair.value.trim() === 'ENDSEC') {
        start = -1;
        inEntities = false;
      } else {
        start = index;
      }
    }
  }
  return records;
}

function dxfRecord(pairs, start, end, index) {
  const slice = pairs.slice(start, end);
  const handle = slice.find(pair => pair.code === 5)?.value?.trim();
  return {
    id: handle ? `handle-${handle}` : `entity-${index + 1}`,
    type: pairs[start].value.trim(),
    start,
    end,
    pairs: slice
  };
}

function dxfRecordToItem(record) {
  const xValues = record.pairs.filter(pair => isDxfXCode(pair.code)).map(pair => finiteNumber(pair.value, 0));
  const yValues = record.pairs.filter(pair => isDxfYCode(pair.code)).map(pair => finiteNumber(pair.value, 0));
  const text = record.pairs.filter(pair => pair.code === 3 || pair.code === 1).map(pair => pair.value).join('');
  const kind = ['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(record.type) ? 'text' : 'geometry';
  const minX = xValues.length ? Math.min(...xValues) : 0;
  const maxX = xValues.length ? Math.max(...xValues) : minX;
  const minY = yValues.length ? Math.min(...yValues) : 0;
  const maxY = yValues.length ? Math.max(...yValues) : minY;
  return {
    id: record.id,
    kind,
    typeId: record.type,
    layer: record.pairs.find(pair => pair.code === 8)?.value?.trim() || '0',
    x: minX,
    y: minY,
    width: maxX - minX,
    height: kind === 'text' ? finiteNumber(record.pairs.find(pair => pair.code === 40)?.value, 10) : maxY - minY,
    ...(kind === 'text' ? { text, fontSize: finiteNumber(record.pairs.find(pair => pair.code === 40)?.value, 10) } : {}),
    geometry: dxfPreviewGeometry(record),
    offset: { x: 0, y: 0 },
    deleted: false,
    variable: null
  };
}

function dxfPreviewGeometry(record) {
  const points = [];
  let pendingX = null;
  for (const pair of record.pairs) {
    if (isDxfXCode(pair.code)) pendingX = finiteNumber(pair.value, 0);
    if (isDxfYCode(pair.code) && pendingX !== null) {
      points.push([pendingX, finiteNumber(pair.value, 0)]);
      pendingX = null;
    }
  }
  return { kind: record.type.toLowerCase(), points };
}

function layoutExtents(items = []) {
  if (!items.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...items.map(item => item.x));
  const minY = Math.min(...items.map(item => item.y));
  const maxX = Math.max(...items.map(item => item.x + item.width));
  const maxY = Math.max(...items.map(item => item.y + item.height));
  return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function itemChanged(item = {}) {
  return Boolean(item.deleted || item.variable?.name || finiteNumber(item.offset?.x, 0) || finiteNumber(item.offset?.y, 0));
}

function resolvedItemText(item = {}, values = {}) {
  const variable = item.variable;
  if (!variable?.name) return String(item.text ?? '');
  const value = values[variable.name] ?? variable.default ?? item.text ?? '';
  if (variable.type === 'boolean') return value === true || value === 'true' ? 'true' : 'false';
  return String(value);
}

function isDxfXCode(code) {
  return code >= 10 && code <= 18;
}

function isDxfYCode(code) {
  return code >= 20 && code <= 28;
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
