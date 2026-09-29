// The nesting service's V -> V boundary (SPEC §8/§21): pure value in, pure
// value out — the worker HTTP is mocked; the projections run for real. The
// handler reads the command-envelope parameters (`items`, `sheetWidth`,
// `sheetHeight`, `space`, `sheetCount`) exactly as commandEffectPayload
// delivers the declared signature sockets; the sheet arrives as values and
// the handler resolves no entities.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const workerCalls = [];

global.fetch = vi.fn(async (_url, options = {}) => {
  workerCalls.push({ body: JSON.parse(options.body) });
  return {
    ok: true,
    json: async () => ({
      status: 'ok',
      layouts: [{ index: 0, placed: [{ id: 'a', polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] }] }],
      used_sheets: 1
    })
  };
});

import { solveNestingValue } from '../value-services/solve-nesting.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];

beforeEach(() => {
  workerCalls.length = 0;
});

describe('nesting V->V service', () => {
  it('forwards the sheet values and the solver knobs to the worker', async () => {
    const result = await solveNestingValue({
      parameters: {
        items: [{ cassetteId: 'design-1', polygonParts: [{ coordinates: square }], count: 3 }],
        sheetWidth: 600,
        sheetHeight: 400,
        space: 5,
        sheetCount: 2
      }
    });
    expect(workerCalls).toHaveLength(1);
    const request = workerCalls[0].body;
    expect(request.params).toMatchObject({ width: 600, height: 400, space: 5, sheetCount: 2 });
    expect(request.items[0]).toMatchObject({ count: 3 });
    expect(result.layouts).toHaveLength(1);
    expect(result.summary).toBeTruthy();
  });

  it('refuses non-positive sheet values before any worker call', async () => {
    await expect(solveNestingValue({
      parameters: { items: [{ polygonParts: [{ coordinates: square }], count: 1 }], sheetWidth: 0, sheetHeight: 400 }
    })).rejects.toThrow(/positive width/);
    expect(workerCalls).toHaveLength(0);
  });

  it('refuses items without polygon geometry', async () => {
    await expect(solveNestingValue({
      parameters: { items: [{ cassetteId: 'x' }], sheetWidth: 600, sheetHeight: 400 }
    })).rejects.toThrow(/polygonParts/);
    expect(workerCalls).toHaveLength(0);
  });
});
