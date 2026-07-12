import { describe, expect, it } from 'vitest';
import { cassetteDesignCountsForSheetDesign } from './sheetDesigns.js';

describe('sheet design cassette design summaries', () => {
  it('derives counts from placed source items when ids resolve', () => {
    expect(cassetteDesignCountsForSheetDesign({
      data: {
        geometry: {
          data: {
            items: [
              { id: 0, cassette_id: 'design-a' },
              { id: 1, cassette_id: 'design-b' }
            ],
            solution: {
              layouts: [{
                placed_items: [{ item_id: 0 }, { item_id: 1 }, { item_id: 1 }]
              }]
            }
          }
        }
      }
    })).toEqual([
      { cassetteDesignId: 'design-a', count: 1 },
      { cassetteDesignId: 'design-b', count: 2 }
    ]);
  });

  it('falls back to demand counts when worker placement ids are unresolved', () => {
    expect(cassetteDesignCountsForSheetDesign({
      data: {
        geometry: {
          data: {
            items: [
              { id: 0, cassette_id: 'design-a', demand: 2 },
              { id: 1, cassette_id: 'design-b', demand: 10 }
            ],
            solution: {
              layouts: [{
                placed_items: [{ item_id: 226 }]
              }]
            }
          }
        }
      }
    })).toEqual([
      { cassetteDesignId: 'design-a', count: 2 },
      { cassetteDesignId: 'design-b', count: 10 }
    ]);
  });
});
