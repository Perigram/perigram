import { describe, expect, it } from 'vitest';
import { columnLetter, recordsByHeader, recordsByPosition } from './table-rows.js';

// The two table decompositions: header-keyed (`rows`) and positional
// (`cells`) — a headerless sheet's first row is data, keyed by column
// letters.
describe('table decomposition converters', () => {
  const headered = [['name', 'width'], ['Tray A', 600], ['Tray B', 300]];
  const headerless = [['Tray A', 600], ['Tray B', 300]];

  it('keys rows by the first non-empty row (the header)', () => {
    expect(recordsByHeader(headered)).toEqual([
      { name: 'Tray A', width: 600 },
      { name: 'Tray B', width: 300 }
    ]);
  });

  it('keeps every row as data with column-letter keys (no header assumed)', () => {
    expect(recordsByPosition(headerless)).toEqual([
      { A: 'Tray A', B: 600 },
      { A: 'Tray B', B: 300 }
    ]);
    expect(recordsByPosition(headered)).toEqual([
      { A: 'name', B: 'width' },
      { A: 'Tray A', B: 600 },
      { A: 'Tray B', B: 300 }
    ]);
  });

  it('letters columns past Z like a spreadsheet', () => {
    expect(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'].map((_, index) => columnLetter([0, 25, 26, 27, 51, 52][index])))
      .toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});
