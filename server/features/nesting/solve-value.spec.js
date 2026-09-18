// The nesting service's V -> V boundary (SPEC §8/§21): pure value in, pure
// value out — the worker HTTP is mocked; the projections run for real.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const workerCalls = [];

vi.mock('~/server/db/mongo', () => ({ connectDB: vi.fn() }));

global.fetch = vi.fn(async (url, options = {}) => {
  workerCalls.push({ url, body: JSON.parse(options.body) });
  return {
    ok: true,
    json: async () => ({
      status: 'ok',
      layouts: [{ index: 0, placed: [{ id: 'a', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }] }],
      used_sheets: 1
    })
  };
});

import { solveNestingValue } from './solve-value.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

beforeEach(() => {
  workerCalls.length = 0;
});

describe('nesting V->V service', () => {
  it('maps the declared input to the worker request and returns values', async () => {
    const result = await solveNestingValue({
      items: [{ cassetteId: 'design-1', polygonParts: [{ coordinates: square }], count: 3, dimensions: { width: 10 } }],
      params: { width: 600, height: 400, space: 3, sheetCount: 2 }
    });
    expect(workerCalls).toHaveLength(1);
    const request = workerCalls[0].body;
    expect(request.params).toMatchObject({ width: 600, height: 400, space: 3, sheetCount: 2 });
    expect(request.items[0]).toMatchObject({ count: 3 });
    expect(result.layouts).toHaveLength(1);
    expect(result.summary).toBeTruthy();
  });

  it('rejects value-shaped errors before any worker call', async () => {
    await expect(solveNestingValue({ items: [], params: {} })).rejects.toMatchObject({ statusCode: 400 });
    await expect(solveNestingValue({
      items: [{ polygonParts: [], count: 1 }],
      params: { width: 600, height: 400, space: 3, sheetCount: 1 }
    })).rejects.toMatchObject({ statusCode: 400, message: /polygonParts/ });
    await expect(solveNestingValue({
      items: [{ cassetteId: 'design-1', polygonParts: [{ coordinates: square }], count: 1 }],
      params: { width: 600, height: 0, space: 3, sheetCount: 1 }
    })).rejects.toMatchObject({ statusCode: 400, message: /height/ });
    expect(workerCalls).toHaveLength(0);
  });
});
