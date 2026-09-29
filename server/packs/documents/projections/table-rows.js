// The `rows` projection handler (`documents.tableRows`, SPEC §8 p
// extract): a `csv-table`/`xlsx-workbook` instance → its first sheet as
// header-keyed row records. The first non-empty row is the header; every
// following non-empty row becomes one record mapping each trimmed header
// to its raw cell. Column semantics live in the graph that reads the
// rows; the projection carries none. Imports the xlsx ESM build — the
// CJS main cannot be externalized by nitro (root README Development
// notes).
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

export async function tableRows(target, { auth } = {}) {
  const typeId = String(target?.type || '');
  if (!TABLE_TYPES.has(typeId)) {
    throw createError({ statusCode: 400, message: `rows projection requires an xlsx-workbook or csv-table instance (received ${typeId || '(none)'})` });
  }
  const id = instanceId(target);
  if (!id) throw createError({ statusCode: 400, message: 'rows projection requires an instance reference' });

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
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
  if (!rows.length) throw createError({ statusCode: 400, message: `Table ${id} carries no rows` });

  const headers = rows[0].map(header => String(header ?? '').trim());
  return rows.slice(1).map(row => Object.fromEntries(
    headers.map((header, index) => [header, cellValue(row[index])]).filter(([header]) => header)
  ));
}
