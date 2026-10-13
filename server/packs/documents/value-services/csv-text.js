// The `documents.csvText` value service (SPEC §8 s species): the
// composition twin of the `rows` decomposition — header-keyed row records
// back into CSV text. Pure V→V; the contract lives in
// [packages/documents](../../../../packages/documents/README.md).
const NEEDS_QUOTING = /[",\r\n]/;

function cell(value) {
  const text = value == null ? '' : String(value);
  return NEEDS_QUOTING.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvText(rows = []) {
  const headers = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return [
    headers.map(cell).join(','),
    ...(Array.isArray(rows) ? rows : []).map(row => headers.map(header => cell(row?.[header])).join(','))
  ].join('\r\n');
}
