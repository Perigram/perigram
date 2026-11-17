import { describe, expect, it, vi } from 'vitest';
import { createRuntime } from './server.mjs';

const SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

describe('Facade managed server runtime', () => {
  it('executes nesting through the host capability and returns graph values', async () => {
    const call = vi.fn().mockResolvedValue({ items: [], layouts: [] });
    const runtime = createRuntime();
    const result = await runtime.execute('nesting-solve', {
      items: [{
        id: 'design-1',
        designId: 'design-1',
        count: '2',
        polygonParts: [{ coordinates: SQUARE }]
      }],
      sheetWidth: 100,
      sheetHeight: 100,
      space: 3
    }, { capabilities: { call } });
    expect(call).toHaveBeenCalledOnce();
    expect(call.mock.calls[0][0]).toBe('facade.nesting.solve');
    expect(call.mock.calls[0][1].params).toMatchObject({
      width: 100, height: 100, space: 3, sheetCount: 2
    });
    expect(result).toMatchObject({
      layouts: [],
      summary: { sheetCount: 0, placedCount: 0 }
    });
  });

  it('executes exact composition matching inside the managed runtime', async () => {
    const runtime = createRuntime();
    const sheet = { _id: 'sheet-1', fields: { compositionKey: 'composition-a' } };
    await expect(runtime.execute('match-sheet', {
      layoutKey: 'composition-a',
      sheets: [sheet]
    })).resolves.toEqual({ found: true, design: sheet });
    await expect(runtime.execute('match-sheet', {
      layoutKey: 'composition-b',
      sheets: [sheet]
    })).resolves.toEqual({ found: false, design: null });
  });

  it('refuses operations outside the managed runtime declaration', async () => {
    const runtime = createRuntime();
    await expect(runtime.execute('bake', {}, { capabilities: { call: vi.fn() } }))
      .rejects.toThrow(/Unsupported Facade managed operation/);
  });
});
