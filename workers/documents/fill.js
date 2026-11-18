// The documents plugin's fill engines (SPEC §24); the token law and the
// per-format behavior traps live in the plugin README.
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx/xlsx.mjs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { marked } from 'marked';
import { substitute, fillMarkdown, templateTokenKeys } from './template-ir.mjs';
import { fillWorkbook as fillWorkbookPortable, workbookTemplateTokens as workbookTemplateTokensPortable, workbookTemplateSections as workbookTemplateSectionsPortable, workbookTemplateMetadata as workbookTemplateMetadataPortable } from './workbook-template.mjs';
export { substitute, fillMarkdown };

const TOKEN = /\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DXF_MIME_TYPES = new Set(['application/dxf', 'application/x-dxf', 'image/vnd.dxf']);
const WORKBOOK_ROW_LIMIT = 2000;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

// Legacy construction and graph fills share the same token extractors.
export const tokenKeysOf = templateTokenKeys;
export const markdownTemplateTokens = text => templateTokenKeys(text);
export const workbookTemplateTokens = workbookTemplateTokensPortable;
export const workbookTemplateSections = workbookTemplateSectionsPortable;
export const workbookTemplateMetadata = workbookTemplateMetadataPortable;

export async function pdfTemplateTokens(buffer) {
  const pages = await pdfTextRuns(buffer);
  return tokenKeysOf(...pages.flatMap(runs => runs.map(run => run.text)));
}

// ---------------------------------------------------------------------------
// XLSX fill

export function fillWorkbook(buffer, values = {}) {
  return Buffer.from(fillWorkbookPortable(buffer, values));
}

// ---------------------------------------------------------------------------
// PDF rendering

const A4 = [595.28, 841.89];
const PAGE_MARGIN = 56;
const INK = rgb(0.12, 0.12, 0.12);
const GRID = rgb(0.72, 0.72, 0.72);
const SHADE = rgb(0.93, 0.93, 0.95);
const CODE_SHADE = rgb(0.95, 0.95, 0.95);

function fontBytes(name) {
  return readFileSync(new URL(`./assets/fonts/${name}`, import.meta.url));
}

async function createPdfDocument() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fontBytes('pt-sans-regular.ttf'), { subset: true });
  const bold = await doc.embedFont(fontBytes('pt-sans-bold.ttf'), { subset: true });
  return { doc, fonts: { regular, bold } };
}

function createWriter({ doc, fonts, landscape = false }) {
  const [pageWidth, pageHeight] = landscape ? [A4[1], A4[0]] : A4;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - PAGE_MARGIN;
  const atTop = () => y >= pageHeight - PAGE_MARGIN - 0.1;
  const contentWidth = () => pageWidth - PAGE_MARGIN * 2;
  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - PAGE_MARGIN;
  };

  const wrap = (text, font, size, maxWidth) => {
    const lines = [];
    for (const rawLine of String(text ?? '').split('\n')) {
      const words = rawLine.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        if (font.widthOfTextAtSize(word, size) <= maxWidth) {
          line = word;
          continue;
        }
        let chunk = '';
        for (const character of word) {
          if (font.widthOfTextAtSize(chunk + character, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = character;
          } else {
            chunk += character;
          }
        }
        line = chunk;
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [''];
  };

  const write = (text, {
    size = 11, font = fonts.regular, indent = 0, before = 0, after = 6, color = INK, lineFactor = 1.32
  } = {}) => {
    if (before && !atTop()) y -= before;
    const lineHeight = size * lineFactor;
    for (const line of wrap(text, font, size, contentWidth() - indent)) {
      if (y - lineHeight < PAGE_MARGIN) newPage();
      y -= lineHeight;
      if (line) page.drawText(line, { x: PAGE_MARGIN + indent, y, size, font, color });
    }
    y -= after;
  };

  const table = (header, rows) => {
    const size = 9;
    const lineHeight = size * 1.3;
    const padding = 4;
    const columns = Math.max(header.length, ...rows.map(row => row.length));
    const natural = Array.from({ length: columns }, () => 0);
    const measure = (cells) => cells.forEach((cell, column) => {
      natural[column] = Math.max(natural[column], fonts.regular.widthOfTextAtSize(String(cell ?? ''), size) + padding * 2);
    });
    measure(header);
    rows.forEach(measure);
    const total = natural.reduce((sum, width) => sum + width, 0) || 1;
    const widths = natural.map(width => Math.max((width / total) * contentWidth(), 34));
    const scale = contentWidth() / widths.reduce((sum, width) => sum + width, 0);
    const columnWidths = widths.map(width => width * scale);

    const wrappedCell = (cell, column) => wrap(String(cell ?? ''), fonts.regular, size, columnWidths[column] - padding * 2);

    const drawRow = (cells, { isHeader = false } = {}) => {
      const wrapped = cells.map((cell, column) => wrappedCell(cell, column));
      while (wrapped.length < columns) wrapped.push(['']);
      const rowHeight = Math.max(...wrapped.map(lines => lines.length)) * lineHeight + padding * 2;
      if (y - rowHeight < PAGE_MARGIN) {
        newPage();
        drawRow(header, { isHeader: true });
      }
      const top = y;
      if (isHeader) page.drawRectangle({ x: PAGE_MARGIN, y: top - rowHeight, width: contentWidth(), height: rowHeight, color: SHADE });
      let x = PAGE_MARGIN;
      wrapped.forEach((lines, column) => {
        lines.forEach((line, lineIndex) => {
          page.drawText(line, {
            x: x + padding,
            y: top - padding - lineHeight * (lineIndex + 1) + size * 0.25,
            size,
            font: isHeader ? fonts.bold : fonts.regular,
            color: INK
          });
        });
        page.drawRectangle({
          x, y: top - rowHeight, width: columnWidths[column], height: rowHeight,
          borderColor: GRID, borderWidth: 0.5
        });
        x += columnWidths[column];
      });
      y = top - rowHeight;
    };

    drawRow(header, { isHeader: true });
    rows.forEach(row => drawRow(row));
    y -= 8;
  };

  return {
    doc, write, table, newPage,
    page: () => page,
    pageWidth: () => pageWidth,
    pageHeight: () => pageHeight,
    contentWidth,
    atTop,
    position: () => y
  };
}

const HEADLINE_SIZES = [20, 16, 13.5, 11.5, 11.5, 11.5];
const INLINE_MARKDOWN = /[*_`~]{1,3}/g;
const plainInline = (text) => String(text ?? '').replace(INLINE_MARKDOWN, '');

export async function renderPdfFromMarkdown(text, values = {}) {
  const substituted = substitute(String(text ?? ''), values);
  const { doc, fonts } = await createPdfDocument();
  const writer = createWriter({ doc, fonts });
  for (const token of marked.lexer(substituted)) {
    if (token.type === 'heading') {
      writer.write(plainInline(token.text), {
        size: HEADLINE_SIZES[Math.min(token.depth - 1, HEADLINE_SIZES.length - 1)],
        font: fonts.bold,
        before: writer.atTop() ? 0 : 12,
        after: 5
      });
    } else if (token.type === 'paragraph') {
      writer.write(plainInline(token.text));
    } else if (token.type === 'list') {
      token.items.forEach((item, index) => {
        const marker = token.ordered ? `${(token.start || 1) + index}.` : '•';
        writer.write(`${marker}  ${plainInline(item.text)}`, { indent: 10, after: 2 });
      });
      writer.write('', { size: 4, after: 4 });
    } else if (token.type === 'code') {
      for (const line of String(token.text ?? '').split('\n')) {
        writer.write(line || ' ', { size: 9.5, indent: 10, after: 0, color: rgb(0.2, 0.2, 0.2) });
      }
      writer.write('', { size: 6, after: 6 });
    } else if (token.type === 'table') {
      writer.table(token.header.map(cell => plainInline(cell.text)), token.rows.map(row => row.map(cell => plainInline(cell.text))));
    } else if (token.type === 'blockquote') {
      writer.write(plainInline(token.text), { indent: 14, color: rgb(0.35, 0.35, 0.35) });
    } else if (token.type === 'hr') {
      writer.write('', { size: 2, after: 4 });
      writer.page().drawLine({
        start: { x: PAGE_MARGIN, y: writer.position() }, end: { x: writer.pageWidth() - PAGE_MARGIN, y: writer.position() },
        thickness: 0.7, color: GRID
      });
      writer.write('', { size: 6, after: 6 });
    }
  }
  return Buffer.from(await doc.save());
}

export async function renderPdfFromWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames?.[0];
  const sheet = sheetName && workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) badRequest('the workbook carries no sheet');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
  if (!matrix.length) badRequest('the workbook carries no rows');
  const rows = matrix.slice(0, WORKBOOK_ROW_LIMIT).map(row => row.map(cell => {
    if (cell instanceof Date) return cell.toISOString().slice(0, 10);
    return typeof cell === 'number' ? String(cell) : String(cell ?? '');
  }));
  const { doc, fonts } = await createPdfDocument();
  const writer = createWriter({ doc, fonts });
  writer.table(rows[0], rows.slice(1));
  return Buffer.from(await doc.save());
}

export async function renderPdfFromCsv(text) {
  const workbook = XLSX.read(String(text ?? ''), { type: 'string' });
  const sheetName = workbook.SheetNames?.[0];
  const sheet = sheetName && workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) badRequest('the CSV carries no rows');
  return renderPdfFromRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }));
}

async function renderPdfFromRows(rows) {
  const cleaned = rows
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''))
    .slice(0, WORKBOOK_ROW_LIMIT)
    .map(row => row.map(cell => String(cell ?? '')));
  const { doc, fonts } = await createPdfDocument();
  const writer = createWriter({ doc, fonts });
  writer.table(cleaned[0], cleaned.slice(1));
  return Buffer.from(await doc.save());
}

export async function renderPdfFromImage(buffer, mime) {
  const { doc } = await createPdfDocument();
  const image = /png/i.test(mime || '') ? await doc.embedPng(buffer) : await doc.embedJpg(buffer);
  const page = doc.addPage([A4[0], A4[1]]);
  const scale = Math.min(
    (A4[0] - PAGE_MARGIN * 2) / image.width,
    (A4[1] - PAGE_MARGIN * 2) / image.height
  );
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (A4[0] - width) / 2, y: (A4[1] - height) / 2, width, height });
  return Buffer.from(await doc.save());
}

export async function renderPdfFromDxf(buffer) {
  const { polylines, labels } = dxfGeometry(buffer);
  if (!polylines.length && !labels.length) badRequest('the DXF carries no drawable entities');
  const xs = polylines.flatMap(shape => shape.points.map(([x]) => x)).concat(labels.map(label => label.x));
  const ys = polylines.flatMap(shape => shape.points.map(([, y]) => y)).concat(labels.map(label => label.y));
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  const { doc, fonts } = await createPdfDocument();
  const writer = createWriter({ doc, fonts, landscape: true });
  const page = doc.getPage(doc.getPageCount() - 1);
  const availableWidth = writer.pageWidth() - PAGE_MARGIN * 2;
  const availableHeight = writer.pageHeight() - PAGE_MARGIN * 2;
  const scale = Math.min(availableWidth / width, availableHeight / height);
  const tx = x => PAGE_MARGIN + (x - minX) * scale;
  const ty = y => writer.pageHeight() - PAGE_MARGIN - (y - minY) * scale;
  for (const { points, closed } of polylines) {
    if (points.length === 1) continue;
    for (let i = 1; i < points.length; i += 1) {
      page.drawLine({
        start: { x: tx(points[i - 1][0]), y: ty(points[i - 1][1]) },
        end: { x: tx(points[i][0]), y: ty(points[i][1]) },
        thickness: 0.5, color: INK
      });
    }
    if (closed && points.length > 2) {
      page.drawLine({
        start: { x: tx(points[points.length - 1][0]), y: ty(points[points.length - 1][1]) },
        end: { x: tx(points[0][0]), y: ty(points[0][1]) },
        thickness: 0.5, color: INK
      });
    }
  }
  for (const label of labels) {
    page.drawText(String(label.text ?? ''), {
      x: tx(label.x), y: ty(label.y) + 2,
      size: Math.min(Math.max(label.height * scale, 4), 16),
      font: fonts.regular, color: INK
    });
  }
  return Buffer.from(await doc.save());
}

function dxfPairs(source) {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const pairs = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (Number.isFinite(code)) pairs.push({ code, value: lines[index + 1] });
  }
  return pairs;
}

function dxfEntityRecords(pairs) {
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
      if (start >= 0) records.push({ type: pairs[start].value.trim(), pairs: pairs.slice(start, index) });
      if (pair.value.trim() === 'ENDSEC') { start = -1; inEntities = false; }
      else start = index;
    }
  }
  return records;
}

function recordPoints(record) {
  const points = [];
  let pendingX = null;
  for (const pair of record.pairs) {
    const value = Number(pair.value);
    if (pair.code >= 10 && pair.code <= 18) pendingX = value;
    if (pair.code >= 20 && pair.code <= 28 && pendingX !== null) {
      points.push([pendingX, value]);
      pendingX = null;
    }
  }
  return points;
}

const arcPoints = (cx, cy, radius, startAngle, endAngle) => {
  const points = [];
  const sweep = endAngle >= startAngle ? endAngle - startAngle : endAngle + 360 - startAngle;
  const steps = Math.max(8, Math.ceil(sweep / 6));
  for (let step = 0; step <= steps; step += 1) {
    const angle = ((startAngle + (sweep * step) / steps) * Math.PI) / 180;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
};

function dxfGeometry(buffer) {
  const records = dxfEntityRecords(dxfPairs(Buffer.from(buffer).toString('utf8')));
  const polylines = [];
  const labels = [];
  const number = (record, code) => Number(record.pairs.find(pair => pair.code === code)?.value);
  for (const record of records) {
    const points = recordPoints(record);
    const closed = Boolean(number(record, 70) & 1);
    if (record.type === 'CIRCLE') {
      const [center] = points;
      const radius = number(record, 40);
      if (center && radius > 0) polylines.push({ points: arcPoints(center[0], center[1], radius, 0, 360), closed: true });
    } else if (record.type === 'ARC') {
      const [center] = points;
      const radius = number(record, 40);
      if (center && radius > 0) polylines.push({ points: arcPoints(center[0], center[1], radius, number(record, 50), number(record, 51)), closed: false });
    } else if (['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(record.type)) {
      const [anchor] = points;
      const text = record.pairs.find(pair => pair.code === 1)?.value;
      if (anchor && text) labels.push({ x: anchor[0], y: anchor[1], height: number(record, 40) || 10, text });
    } else if (points.length) {
      polylines.push({ points, closed });
    }
  }
  return { polylines, labels };
}

// ---------------------------------------------------------------------------
// PDF template fill

async function pdfTextRuns(buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true });
  const pdf = await task.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const runs = [];
    let current = null;
    for (const item of content.items) {
      if (typeof item.str !== 'string' || !item.str.length) continue;
      const x = Number(item.transform?.[4]);
      const y = Number(item.transform?.[5]);
      const height = Math.max(1, Math.abs(Number(item.transform?.[3])) || 10);
      if (!current || Math.abs(current.y - y) > 0.6) {
        if (current) runs.push(current);
        current = { x, y, height, text: '', items: [] };
      }
      current.text += item.str;
      current.items.push({ x, y, width: Math.max(1, Number(item.width) || 1), height });
    }
    if (current) runs.push(current);
    pages.push(runs);
    page.cleanup();
  }
  await pdf.destroy();
  return pages;
}

export async function fillPdfTemplate(buffer, values = {}) {
  const pages = await pdfTextRuns(buffer);
  const doc = await PDFDocument.load(buffer, { updateMetadata: false });
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes('pt-sans-regular.ttf'), { subset: true });
  const targetPages = doc.getPages();
  pages.forEach((runs, pageIndex) => {
    const page = targetPages[pageIndex];
    if (!page) return;
    for (const run of runs) {
      if (!TOKEN.test(run.text)) continue;
      TOKEN.lastIndex = 0;
      for (const item of run.items) {
        page.drawRectangle({
          x: item.x - 1, y: item.y - 1, width: item.width + 2, height: item.height + 2,
          color: rgb(1, 1, 1)
        });
      }
      page.drawText(substitute(run.text, values), {
        x: run.x, y: run.y, size: run.height, font, color: INK
      });
    }
  });
  return Buffer.from(await doc.save());
}

export { XLSX_MIME, DXF_MIME_TYPES, badRequest };
