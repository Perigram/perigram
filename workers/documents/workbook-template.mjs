// Browser/server-safe XLSX template fill engine.
import * as XLSX from './assets/vendor/xlsx.mjs';
import { templateTokenKeys } from './template-ir.mjs';
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

function applyToCell(cell, scope, rowDelta = 0) {
  if (cell.f) {
    if (rowDelta) {
      cell.f = shiftFormulaRows(cell.f, rowDelta);
      // The old cached result belongs to the old references. Omitting it
      // lets spreadsheet applications recalculate instead of showing stale data.
      delete cell.v;
    }
    delete cell.w;
    return;
  }
  if (typeof cell.v !== 'string' || !TOKEN.test(cell.v)) return;
  TOKEN.lastIndex = 0;
  cell.v = substitute(cell.v, scope);
  delete cell.w;
  delete cell.h;
}

// Translate relative row references when a template row moves. Quoted
// formula strings and structured-reference brackets are copied verbatim;
// absolute row references ($A$3) remain fixed.
function shiftFormulaRows(formula, rowDelta) {
  const source = String(formula || '');
  if (!rowDelta || !source) return source;
  let output = '';
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'") {
      const quote = character;
      output += character;
      index += 1;
      while (index < source.length) {
        output += source[index];
        if (source[index] === quote) {
          if (source[index + 1] === quote) {
            output += source[index + 1];
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (character === '[') {
      const end = source.indexOf(']', index);
      if (end < 0) {
        output += source.slice(index);
        break;
      }
      output += source.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    const previous = source[index - 1] || '';
    const boundaryBefore = !/[A-Za-z0-9_.]/.test(previous);
    if (boundaryBefore) {
      const match = source.slice(index).match(/^(\$?)([A-Z]{1,3})(\$?)(\d+)/i);
      if (match) {
        const end = index + match[0].length;
        const next = source[end] || '';
        const column = match[2].toUpperCase().split('').reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
        if (!/[A-Za-z0-9_.!(]/.test(next) && column <= 16384) {
          const row = Number(match[4]);
          const shifted = match[3] || rowDelta === 0 ? row : Math.max(1, row + rowDelta);
          output += `${match[1]}${match[2]}${match[3]}${shifted}`;
          index = end;
          continue;
        }
      }
    }
    output += character;
    index += 1;
  }
  return output;
}

function fillWorksheet(sheet, values) {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const originalRowMetadata = Array.isArray(sheet['!rows']) ? sheet['!rows'] : null;
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
      const cellObject = entry.scope || cell.f ? structuredClone(cell) : cell;
      applyToCell(cellObject, entry.scope || values, targetRow - entry.row.r);
      sheet[XLSX.utils.encode_cell({ r: targetRow, c })] = cellObject;
    }
  });

  if (Array.isArray(sheet['!merges'])) {
    const kept = [];
    for (const merge of sheet['!merges']) {
      const mappings = [];
      for (let row = merge.s.r; row <= merge.e.r; row += 1) {
        const targets = newRowsByOld.get(row) || [];
        if (!targets.length) {
          mappings.length = 0;
          break;
        }
        mappings.push(targets);
      }
      if (!mappings.length) continue;
      const copyCounts = new Set(mappings.map(targets => targets.length));
      // A merge crossing a repeated-section boundary has no unambiguous
      // one-to-one row mapping; omit it rather than create overlapping cells.
      if (copyCounts.size > 1) continue;
      const copies = Math.max(...mappings.map(targets => targets.length));
      for (let copy = 0; copy < copies; copy += 1) {
        const targetRows = mappings.map(targets => targets[copy] ?? (targets.length === 1 ? targets[0] : null));
        if (targetRows.some(row => row == null)) continue;
        const sorted = [...new Set(targetRows)].sort((a, b) => a - b);
        if (sorted.length !== targetRows.length || sorted.some((row, index) => index && row - sorted[index - 1] !== 1)) continue;
        kept.push({ s: { ...merge.s, r: sorted[0] }, e: { ...merge.e, r: sorted[sorted.length - 1] } });
      }
    }
    sheet['!merges'] = kept;
  }

  if (originalRowMetadata) {
    const rows = [];
    outRows.forEach((entry, position) => {
      const metadata = originalRowMetadata[entry.row.r];
      if (metadata) rows[range.s.r + position] = structuredClone(metadata);
    });
    sheet['!rows'] = rows;
  }

  sheet['!ref'] = XLSX.utils.encode_range({
    s: range.s,
    e: { r: range.s.r + Math.max(outRows.length - 1, 0), c: range.e.c }
  });
}

export function workbookTemplateMetadata(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const workbook = XLSX.read(bytes, { type: 'array' });
  const values = [];
  const sections = new Set();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    for (const row of XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })) {
      for (const cell of row) {
        values.push(cell);
        if (typeof cell === 'string') {
          const open = cell.match(SECTION_OPEN);
          if (open) sections.add(open[1]);
        }
      }
    }
  }
  return { tokens: templateTokenKeys(...values), sections: [...sections] };
}

export function workbookTemplateTokens(buffer) {
  return workbookTemplateMetadata(buffer).tokens;
}

export function workbookTemplateSections(buffer) {
  return workbookTemplateMetadata(buffer).sections;
}
