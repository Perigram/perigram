import { describe, expect, it } from 'vitest';
import { buildNestingWorkerRequest, summarizeNestingResult } from './operations.js';

describe('nesting operation worker payloads', () => {
  it('builds FastAPI nesting input from cassette polygon parts', () => {
    const request = buildNestingWorkerRequest([
      {
        cassetteId: 'cassette-1',
        count: 2,
        polygonParts: [{
          coordinates: [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0], [0, 0, 0]],
          handles: ['100']
        }]
      }
    ], { width: 1220, height: 2440, spacing: 7 });

    expect(request).toMatchObject({
      params: { width: 1220, height: 2440, space: 7, sheetCount: 1000 },
      items: [{
        id: 0,
        cassette_id: 'cassette-1',
        count: 2,
        handles: ['100']
      }]
    });
    expect(request.items[0].coords).toEqual([[0, 0], [100, 0], [100, 50], [0, 50], [0, 0]]);
  });

  it('falls back to a rectangle when polygon parts are absent', () => {
    const request = buildNestingWorkerRequest([
      { cassetteId: 'cassette-2', count: 1, dimensions: { width: 300, height: 200 } }
    ]);

    expect(request.items[0].coords).toEqual([[0, 0], [300, 0], [300, 200], [0, 200], [0, 0]]);
  });

  it('summarizes worker layouts for nesting run result data', () => {
    expect(summarizeNestingResult({
      solution: {
        layouts: [
          { placed_items: [{}, {}] },
          { placed_items: [{}] }
        ]
      }
    })).toMatchObject({ sheetCount: 2, placedCount: 3 });
  });
});
