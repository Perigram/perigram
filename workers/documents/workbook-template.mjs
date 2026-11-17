// Browser/server-safe XLSX template fill engine.
import * as XLSX from './assets/vendor/xlsx.mjs';
import { substitute } from './template-ir.mjs';

const TOKEN = /\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g;
const SECTION_OPEN = /^\{#([A-Za-z_][A-Za-z0-9_.-]*)\}$/;
const SECTION_CLOSE = /^\{\/([A-Za-z_][A-Za-z0-9_.-]*)\}$/;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

export function fillWorkbook(buffer, values = {}) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true, cellDates: false });
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet && sheet['!ref']) fillWorksheet(sheet, values);
  }
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  return output instanceof Uint8Array ? output : new Uint8Array(output);
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
        if (openByRow.size) badRequest(`nested section {#${open[1]}} — one level only`);
        openByRow.set(index, open[1]);
      }
      const close = cellText(cell).match(SECTION_CLOSE);
      if (close) {
        const openRow = [...openByRow.entries()].find(([, key]) => key === close[1]);
        if (!openRow) badRequest(`section close {/${close[1]}} has no matching open`);
        sections.push({ key: close[1], open: openRow[0], close: index });
        openByRow.delete(openRow[0]);
      }
    }
  }
  if (openByRow.size) badRequest(`section {#${[...openByRow.values()][0]}} has no matching close`);

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
  for (const key of Object.keys(sheet)) {
    if (!key.startsWith('!')) delete sheet[key];
  }
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
