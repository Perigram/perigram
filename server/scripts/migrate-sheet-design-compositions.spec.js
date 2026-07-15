import { describe, expect, it } from 'vitest';
import { canonicalComposition, planSheetDesignCollapse } from './migrate-sheet-design-compositions.js';

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

  it('collapses equal cassette multisets regardless of geometry', () => {
    const groups = planSheetDesignCollapse([
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
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ representativeId: 'first', duplicateIds: ['second'], sheetCount: 2 });
  });

  it('keeps different counts as different designs', () => {
    const groups = planSheetDesignCollapse([
      { _id: 'one', data: { cassetteDesigns: [{ cassetteDesignId: 'a', count: 1 }] } },
      { _id: 'two', data: { cassetteDesigns: [{ cassetteDesignId: 'a', count: 2 }] } }
    ]);
    expect(groups).toHaveLength(2);
  });

  it('marks missing design ids and non-integer counts invalid instead of collapsing them', () => {
    const groups = planSheetDesignCollapse([
      { _id: 'missing-id', data: { cassetteDesigns: [{ count: 1 }] } },
      { _id: 'fractional', data: { cassetteDesigns: [{ cassetteDesignId: 'a', count: 1.5 }] } }
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every(group => group.invalidReason)).toBe(true);
  });
});
