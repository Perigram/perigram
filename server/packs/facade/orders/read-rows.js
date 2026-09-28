// The `orders.readRows` service handler (SPEC §8/§21): one uploaded order
// table (xlsx-workbook or csv-table instance) → typed order-line values.
// Payload parsing is the same SheetJS read the table-import surface uses;
// the difference is the contract — rows leave as declared values instead
// of a client-mapped batch post. Column detection: an authored exact
// column name wins, else the case-insensitive convention (`name`,
// `cassette`); every other column becomes a parameter cell.
import { createError } from 'h3';
import * as XLSX from 'xlsx';
import * as filesService from '../../../features/files/service.js';
import { instanceServiceResolver } from '../../../features/instances/service.js';
import { toInstanceRef } from '../refs.js';

const TABLE_TYPES = ['xlsx-workbook', 'csv-table'];
const DEFAULT_NAME_COLUMN = 'name';
const DEFAULT_TEMPLATE_COLUMN = 'cassette';

function parameterValue(cell) {
  const text = String(cell ?? '').trim();
  if (!text) return null;
  const numeric = Number(text);
  return text !== '' && Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/i.test(text) ? numeric : text;
}

function columnAt(headers, authored, fallback) {
  const wanted = String(authored || '').trim();
  if (wanted) {
    const index = headers.findIndex(header => String(header ?? '').trim() === wanted);
    return { index, label: wanted };
  }
  const index = headers.findIndex(header => String(header ?? '').trim().toLowerCase() === fallback);
  return { index, label: fallback };
}

export async function readOrderRows({ parameters = {} } = {}) {
  const { nameColumn, templateColumn } = parameters || {};
  const sourceRef = toInstanceRef(parameters.source, TABLE_TYPES);
  if (!sourceRef?.id || !TABLE_TYPES.includes(sourceRef.type)) {
    throw createError({ statusCode: 400, message: 'Order rows require an xlsx-workbook or csv-table source reference' });
  }

  const service = instanceServiceResolver(sourceRef.type);
  const table = await service.getById(sourceRef.id);
  if (!table) {
    throw createError({ statusCode: 400, message: `Order table ${sourceRef.id} not found` });
  }
  const payloadRef = table.attachments?.primary || null;
  if (!payloadRef?.fileId && !payloadRef?.id) {
    throw createError({ statusCode: 400, message: `Order table ${sourceRef.id} carries no payload` });
  }
  const buffer = await filesService.getFileBuffer(payloadRef.fileId || payloadRef.id, 'files');

  let workbook;
  try {
    workbook = sourceRef.type === 'csv-table'
      ? XLSX.read(new TextDecoder().decode(buffer), { type: 'string' })
      : XLSX.read(buffer, { type: 'array' });
  } catch {
    throw createError({ statusCode: 400, message: `Order table ${sourceRef.id} payload is not a readable spreadsheet` });
  }
  const sheetName = workbook.SheetNames?.[0];
  const sheet = sheetName ? workbook.Sheets?.[sheetName] : null;
  if (!sheet) {
    throw createError({ statusCode: 400, message: `Order table ${sourceRef.id} carries no sheet` });
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    .filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
  if (!rows.length) {
    throw createError({ statusCode: 400, message: `Order table ${sourceRef.id} carries no rows` });
  }

  const headers = rows[0];
  const name = columnAt(headers, nameColumn, DEFAULT_NAME_COLUMN);
  const template = columnAt(headers, templateColumn, DEFAULT_TEMPLATE_COLUMN);
  if (name.index < 0) {
    throw createError({ statusCode: 400, message: `Order table ${sourceRef.id} has no ${name.label} column` });
  }
  if (template.index < 0) {
    throw createError({ statusCode: 400, message: `Order table ${sourceRef.id} has no ${template.label} column` });
  }
  const parameterColumns = headers
    .map((header, index) => ({ label: String(header ?? '').trim(), index }))
    .filter(column => column.label
      && column.index !== name.index
      && column.index !== template.index);

  return rows.slice(1).map((row, index) => {
    const templateName = String(row[template.index] ?? '').trim();
    const parameters = {};
    for (const column of parameterColumns) {
      const value = parameterValue(row[column.index]);
      if (value !== null) parameters[column.label] = value;
    }
    if (!templateName) {
      throw createError({ statusCode: 400, message: `Order row ${index + 2} names no template (${template.label} column)` });
    }
    return {
      name: String(row[name.index] ?? '').trim() || `${templateName} ${index + 1}`,
      templateName,
      parameters
    };
  });
}
