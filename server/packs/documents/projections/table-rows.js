// The table types' projection handlers (SPEC §8 p extract): a
// `csv-table`/`xlsx-workbook` instance → its first sheet as row records.
// `documents.tableRows` keys rows by the header (the first non-empty row);
// `documents.tableCells` is the positional twin for sheets without column
// names — every row is data, keys are spreadsheet column letters (`A`,
// `B`, …). Column semantics live in the graph that reads the rows; the
// projections carry none. Imports the xlsx ESM build — the CJS main
// cannot be externalized by nitro (root README Development notes).
import { createError } from 'h3';
import * as XLSX from 'xlsx/xlsx.mjs';
import { instanceServiceResolver } from '../../../features/instances/service.js';
import * as filesService from '../../../features/files/service.js';

const TABLE_TYPES = new Set(['xlsx-workbook', 'csv-table']);

function instanceId(target) {
  if (typeof target === 'string') return target;
  if (target && typeof target === 'object') {
    const id = target._id ?? target.id ?? target.refId;
    return id != null ? String(id) : null;
  }
  return null;
}

function cellValue(cell) {
  return cell == null ? '' : cell;
}

// Spreadsheet column letter: 0 → A, 25 → Z, 26 → AA.
export function columnLetter(index) {
  let n = index;
  let letter = '';
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

// Header-keyed conversion: the first matrix row is the header, the rest
// are data. Cells under an empty header are dropped.
export function recordsByHeader(matrix) {
  const headers = matrix[0].map(header => String(header ?? '').trim());
  return matrix.slice(1).map(row => Object.fromEntries(
    headers.map((header, index) => [header, cellValue(row[index])]).filter(([header]) => header)
  ));
}

// Positional conversion: every matrix row is data, keyed by column letter.
export function recordsByPosition(matrix) {
  return matrix.map(row => Object.fromEntries(
    row.map((cell, index) => [columnLetter(index), cellValue(cell)])
  ));
}

async function sheetMatrix(projection, target) {
  const typeId = String(target?.type || '');
  if (!TABLE_TYPES.has(typeId)) {
    throw createError({ statusCode: 400, message: `${projection} projection requires an xlsx-workbook or csv-table instance (received ${typeId || '(none)'})` });
  }
  const id = instanceId(target);
  if (!id) throw createError({ statusCode: 400, message: `${projection} projection requires an instance reference` });

  const service = instanceServiceResolver(typeId);
  const table = await service.getById(id);
  if (!table) throw createError({ statusCode: 400, message: `Table ${id} not found` });
  const payloadRef = table.attachments?.primary || null;
  if (!payloadRef?.fileId && !payloadRef?.id) {
    throw createError({ statusCode: 400, message: `Table ${id} carries no payload` });
  }
  const buffer = await filesService.getFileBuffer(payloadRef.fileId || payloadRef.id, 'files');

  let workbook;
  try {
    workbook = typeId === 'csv-table'
      ? XLSX.read(new TextDecoder().decode(buffer), { type: 'string' })
      : XLSX.read(buffer, { type: 'array' });
  } catch {
    throw createError({ statusCode: 400, message: `Table ${id} payload is not a readable spreadsheet` });
  }
  const sheetName = workbook.SheetNames?.[0];
  const sheet = sheetName ? workbook.Sheets?.[sheetName] : null;
  if (!sheet) throw createError({ statusCode: 400, message: `Table ${id} carries no sheet` });
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
  if (!matrix.length) throw createError({ statusCode: 400, message: `Table ${id} carries no rows` });
  return matrix;
}

export async function tableRows(target) {
  return recordsByHeader(await sheetMatrix('rows', target));
}

export async function tableCells(target) {
  return recordsByPosition(await sheetMatrix('cells', target));
}
