import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx/xlsx.mjs';
import { csvText } from './csv-text.js';

// Serialization correctness + the round-trip law: csvText output parses
// back through a real CSV reader into the same header-keyed records the
// `rows` projection produces.
describe('documents.csvText', () => {
  it('serializes first-seen headers with CRLF rows', () => {
    expect(csvText([{ a: 1, b: 2 }, { a: 3, b: 4 }])).toBe('a,b\r\n1,2\r\n3,4');
  });

  it('unions headers across ragged rows and leaves missing cells empty', () => {
    expect(csvText([{ a: 1 }, { b: 2 }])).toBe('a,b\r\n1,\r\n,2');
  });

  it('quotes cells containing commas, quotes, and newlines (RFC 4180)', () => {
    expect(csvText([{ 'say "hi"': 'a,b' }, { 'say "hi"': 'line\nbreak' }]))
      .toBe('"say ""hi"""\r\n"a,b"\r\n"line\nbreak"');
  });

  it('round-trips through a real CSV parse', () => {
    const rows = [{ name: 'Tray A', note: 'has, comma' }, { name: 'Tray B', note: '' }];
    // The same SheetJS read the `rows` projection runs on csv payloads.
    const workbook = XLSX.read(csvText(rows), { type: 'string' });
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
    const [headerRow, ...dataRows] = matrix;
    const parsed = dataRows.map(row => Object.fromEntries(headerRow.map((header, index) => [String(header).trim(), String(row[index] ?? '')])));
    expect(parsed).toEqual(rows);
  });
});
