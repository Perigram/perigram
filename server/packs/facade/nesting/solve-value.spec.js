// The nesting service's V -> V boundary (SPEC §8/§21): pure value in, pure
// value out — the worker HTTP is mocked; the projections run for real. The
// handler reads the command-envelope parameters (`items`, `material`,
// `space`, `sheetCount`) exactly as commandEffectPayload delivers the
// declared signature sockets; sheet width/height resolve from the
// material instance.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const workerCalls = [];

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

vi.mock('../../../features/instances/service.js', () => ({
  instanceServiceResolver: vi.fn(type => (type === 'sheet-material'
    ? {
        getById: async id => (id === 'mat-1'
          ? { _id: id, data: { width: 600, height: 400 } }
          : id === 'mat-flat'
            ? { _id: id, data: { width: 0, height: 400 } }
            : null)
      }
    : null))
}));

import { solveNestingValue } from './solve-value.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const items = () => [{ cassetteId: 'design-1', polygonParts: [{ coordinates: square }], count: 1 }];

beforeEach(() => {
  workerCalls.length = 0;
});

describe('nesting V->V service', () => {
  it('resolves sheet params from the material instance and the solver knobs', async () => {
    const result = await solveNestingValue({
      parameters: {
        items: [{ cassetteId: 'design-1', polygonParts: [{ coordinates: square }], count: 3, dimensions: { width: 10 } }],
        material: { type: 'sheet-material', id: 'mat-1' },
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

  it('accepts a material DTO and defaults the solver knobs', async () => {
    await solveNestingValue({
      parameters: { items: items(), material: { _id: 'mat-1', type: 'sheet-material' } }
    });
    expect(workerCalls[0].body.params).toMatchObject({ width: 600, height: 400, space: 3, sheetCount: 1 });
  });

  it('rejects value-shaped errors before any worker call', async () => {
    await expect(solveNestingValue({ parameters: { items: [], material: { type: 'sheet-material', id: 'mat-1' } } }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(solveNestingValue({
      parameters: { items: [{ polygonParts: [], count: 1 }], material: { type: 'sheet-material', id: 'mat-1' } }
    })).rejects.toMatchObject({ statusCode: 400, message: /polygonParts/ });
    await expect(solveNestingValue({ parameters: { items: items() } }))
      .rejects.toMatchObject({ statusCode: 400, message: /sheet-material/ });
    await expect(solveNestingValue({
      parameters: { items: items(), material: { type: 'sheet-material', id: 'ghost' } }
    })).rejects.toMatchObject({ statusCode: 400, message: /ghost/ });
    await expect(solveNestingValue({
      parameters: { items: items(), material: { type: 'sheet-material', id: 'mat-flat' } }
    })).rejects.toMatchObject({ statusCode: 400, message: /width/ });
    expect(workerCalls).toHaveLength(0);
  });

  it('surfaces worker HTTP failures as a 502 with the worker body', async () => {
    global.fetch.mockImplementationOnce(async () => ({ ok: false, statusText: 'solver down', text: async () => 'boom' }));
    await expect(solveNestingValue({
      parameters: { items: items(), material: { type: 'sheet-material', id: 'mat-1' } }
    })).rejects.toMatchObject({ statusCode: 502, message: /boom/ });
  });
});
