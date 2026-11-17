import * as XLSX from '../assets/vendor/xlsx.mjs';
import { composeReport, extractTable, renderReportHtml, renderDocumentHtml, exportMarkdown, composeDocument, appendDocumentBlock, createDocumentBlock, createInlineValue } from '../report-ir.mjs';

const TOKEN = /\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g;
const SECTION_OPEN = /^\{#([A-Za-z_][A-Za-z0-9_.-]*)\}$/;
const SECTION_CLOSE = /^\{\/([A-Za-z_][A-Za-z0-9_.-]*)\}$/;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function bytesFromBase64(value) {
  if (typeof value !== 'string' || !value) badRequest('fill requires a template ref with payloadBase64');
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64FromBytes(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function tokenKeysOf(...texts) {
  const keys = new Set();
  for (const text of texts) {
    TOKEN.lastIndex = 0;
    for (const match of String(text ?? '').matchAll(TOKEN)) keys.add(match[1]);
  }
  return [...keys];
}

function substitute(text, scope = {}) {
  return String(text ?? '').replace(TOKEN, (raw, key) => (
    scope[key] === undefined || scope[key] === null ? raw : String(scope[key])
  ));
}

function cellText(cell) {
  return String(cell?.w ?? cell?.v ?? '').trim();
}

function applyToCell(cell, scope) {
  if (cell.f) return;
  if (typeof cell.v !== 'string' || !TOKEN.test(cell.v)) return;
  TOKEN.lastIndex = 0;
  cell.v = substitute(cell.v, scope);
  delete cell.w;
  delete cell.h;
}

function fillWorksheet(sheet, values) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rowEntries = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const cells = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) cells.push({ c, cell });
    }
    if (cells.length) rowEntries.push({ r, cells });
  }

  const sections = [];
  const openByRow = new Map();
  for (let index = 0; index < rowEntries.length; index += 1) {
    for (const { cell } of rowEntries[index].cells) {
      const open = cellText(cell).match(SECTION_OPEN);
      if (open) {
        if (openByRow.size) badRequest('nested section {' + '#' + open[1] + '} — one level only');
        openByRow.set(index, open[1]);
      }
      const close = cellText(cell).match(SECTION_CLOSE);
      if (close) {
        const openRow = [...openByRow.entries()].find(([, key]) => key === close[1]);
        if (!openRow) badRequest('section {/' + close[1] + '} has no matching open');
        sections.push({ key: close[1], open: openRow[0], close: index });
        openByRow.delete(openRow[0]);
      }
    }
  }
  if (openByRow.size) badRequest('section {#' + [...openByRow.values()][0] + '} has no matching close');

  const elementScope = key => {
    const raw = values[key];
    const elements = Array.isArray(raw) ? raw : (raw === undefined || raw === null ? [null] : [raw]);
    return elements.map(element => (
      element && typeof element === 'object' ? { ...values, ...element } : { ...values, item: element }
    ));
  };

  const outRows = [];
  const sectionAtOpen = new Map(sections.map(section => [section.open, section]));
  let index = 0;
  while (index < rowEntries.length) {
    const section = sectionAtOpen.get(index);
    if (!section) {
      outRows.push({ row: rowEntries[index], scope: null });
      index += 1;
      continue;
    }
    for (const scope of elementScope(section.key)) {
      for (let body = section.open + 1; body < section.close; body += 1) {
        outRows.push({ row: rowEntries[body], scope });
      }
    }
    index = section.close + 1;
  }

  const newRowsByOld = new Map(rowEntries.map(row => [row.r, []]));
  for (const key of Object.keys(sheet)) if (!key.startsWith('!')) delete sheet[key];
  outRows.forEach((entry, position) => {
    const targetRow = range.s.r + position;
    newRowsByOld.get(entry.row.r).push(targetRow);
    for (const { c, cell } of entry.row.cells) {
      const cellObject = entry.scope ? structuredClone(cell) : cell;
      applyToCell(cellObject, entry.scope || values);
      sheet[XLSX.utils.encode_cell({ r: targetRow, c })] = cellObject;
    }
  });

  if (Array.isArray(sheet['!merges'])) {
    const kept = [];
    for (const merge of sheet['!merges']) {
      const targetRows = [];
      for (let r = merge.s.r; r <= merge.e.r; r += 1) targetRows.push(...(newRowsByOld.get(r) || []));
      if (!targetRows.length || new Set(targetRows).size !== targetRows.length) continue;
      const sorted = [...new Set(targetRows)].sort((a, b) => a - b);
      if (sorted.some((row, i) => i && row - sorted[i - 1] !== 1)) continue;
      kept.push({ s: { ...merge.s, r: sorted[0] }, e: { ...merge.e, r: sorted[sorted.length - 1] } });
    }
    sheet['!merges'] = kept;
  }

  if (Array.isArray(sheet['!rows'])) {
    const heights = new Map();
    outRows.forEach((entry, position) => {
      const height = sheet['!rows'][entry.row.r];
      if (height && height.hpx !== undefined) heights.set(position, { hpx: height.hpx });
    });
    sheet['!rows'] = [];
    for (const [position, height] of heights) sheet['!rows'][range.s.r + position] = height;
  }

  sheet['!ref'] = XLSX.utils.encode_range({
    s: range.s,
    e: { r: range.s.r + Math.max(outRows.length - 1, 0), c: range.e.c }
  });
}

function workbookTemplateTokens(bytes) {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const cells = [];
  for (const sheetName of workbook.SheetNames) {
    for (const row of XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' })) {
      cells.push(...row);
    }
  }
  return tokenKeysOf(...cells);
}

function fillWorkbook(bytes, values = {}) {
  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true, cellDates: false });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet && sheet['!ref']) fillWorksheet(sheet, values);
  }
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
}

function fillTemplate(input = {}) {
  const template = input.refs?.template;
  if (!template?.payloadBase64) badRequest('fill requires a template ref with a payload');
  const bytes = bytesFromBase64(template.payloadBase64);
  const values = input.draft?.data?.values ?? {};
  const rawName = input.draft?.data?.name || input.draft?.name || input.draft?.identity?.name || template.name || 'document';
  const name = String(rawName).replace(/\.[^.]+$/, '');
  const mime = template.payloadMime || '';
  const isMarkdown = mime === 'text/markdown' || /\.md$/i.test(template.name || '');
  const isWorkbook = mime === XLSX_MIME || /\.xlsx$/i.test(template.name || '');
  if (isMarkdown) {
    const text = new TextDecoder().decode(bytes);
    const result = substitute(text, values);
    return {
      payload: { base64: base64FromBytes(new TextEncoder().encode(result)), mime: 'text/markdown', name: name + '.md' },
      meta: { tokens: tokenKeysOf(text) }
    };
  }
  if (isWorkbook) {
    const result = fillWorkbook(bytes, values);
    return {
      payload: { base64: base64FromBytes(result), mime: XLSX_MIME, name: name + '.xlsx' },
      meta: { tokens: workbookTemplateTokens(bytes) }
    };
  }
  badRequest('fill accepts Markdown or XLSX templates');
}


export function createRuntime() {
  return {
    execute(operationId, input = {}) {
      if (operationId === 'csv-text') {
        const rows = input.rows ?? [];
        if (!Array.isArray(rows)) {
          const error = new Error('csv-text requires a rows array');
          error.status = 400;
          throw error;
        }
        return XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows.map(row => (row && typeof row === 'object') ? row : {})));
      }
      if (operationId === 'fill') return fillTemplate(input);
      const blockOperations = ['document-paragraph', 'document-heading', 'document-list', 'document-table', 'document-quote', 'document-code-block', 'document-divider'];
      const inlineOperations = ['inline-text', 'inline-mark', 'inline-link'];
      if (![...blockOperations, ...inlineOperations, 'compose-document', 'append-document-block', 'extract-table', 'compose-report', 'render-html', 'render-document-html', 'export-markdown', 'export-markdown-file', 'export-html-file', 'fill'].includes(operationId)) {
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
