import { describe, expect, it } from 'vitest';
import { canonicalComposition, planSheetDesignBackfill } from './migrate-sheet-design-compositions.js';

describe('sheet design composition migration', () => {
  it('normalizes duplicate cassette ids into a sorted multiset', () => {
    expect(canonicalComposition([
      { cassetteDesignId: 'b', count: 1 },
      { cassetteDesignId: 'a', count: 2 },
      { cassetteDesignId: 'b', count: 3 }
    ])).toEqual([
      { cassetteDesignId: 'a', count: 2 },
      { cassetteDesignId: 'b', count: 4 }
    ]);
  });

  it('marks equal historical cassette multisets without collapsing designs', () => {
    const records = planSheetDesignBackfill([
      {
        _id: 'first',
        data: {
          layoutIndex: 0,
          cassetteDesigns: [{ cassetteDesignId: 'a', count: 2 }],
          geometry: { data: { solution: { layouts: [{ x: 10 }] } } }
        }
      },
      {
        _id: 'second',
        data: {
          layoutIndex: 1,
          cassetteDesigns: [{ cassetteDesignId: 'a', count: 2 }],
          geometry: { data: { solution: { layouts: [{ x: 900 }] } } }
        }
      }
    ]);
    expect(records).toHaveLength(2);
    expect(records.map(record => record.designId)).toEqual(['first', 'second']);
    expect(records.every(record => record.duplicateComposition)).toBe(true);
    expect(records.every(record => record.sheetCount === 1)).toBe(true);
  });

  it('keeps different counts as different designs', () => {
    const records = planSheetDesignBackfill([
      { _id: 'one', data: { cassetteDesigns: [{ cassetteDesignId: 'a', count: 1 }] } },
      { _id: 'two', data: { cassetteDesigns: [{ cassetteDesignId: 'a', count: 2 }] } }
    ]);
    expect(records).toHaveLength(2);
    expect(records.every(record => !record.duplicateComposition)).toBe(true);
  });

  it('marks missing design ids and non-integer counts invalid instead of collapsing them', () => {
    const records = planSheetDesignBackfill([
      { _id: 'missing-id', data: { cassetteDesigns: [{ count: 1 }] } },
      { _id: 'fractional', data: { cassetteDesigns: [{ cassetteDesignId: 'a', count: 1.5 }] } }
    ]);

    expect(records).toHaveLength(2);
    expect(records.every(record => record.invalidReason)).toBe(true);
  });
});
