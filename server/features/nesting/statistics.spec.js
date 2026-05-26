import { describe, expect, it } from 'vitest';
import { getNestingStatisticsDelta } from './statistics.js';

describe('nesting statistics compatibility', () => {
  it('derives sheet totals from current worker result layouts', () => {
    expect(getNestingStatisticsDelta({
      result: {
        solution: {
          layouts: [{ area: 12 }, { sheetArea: 8 }, {}]
        }
      }
    })).toEqual({
      sheetsUsed: 3,
      totalAreaUsed: 20
    });
  });

  it('keeps legacy sheet totals supported', () => {
    expect(getNestingStatisticsDelta({
      sheets: [{ area: 5 }, { area: 7 }]
    })).toEqual({
      sheetsUsed: 2,
      totalAreaUsed: 12
    });
  });
});
