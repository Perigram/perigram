import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createRuntime } from './server.mjs';
import listing from '../listing.json';

const SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

describe('Facade managed server runtime', () => {
  it('declares pure managed operations with explicit execution targets and no endpoint mode', () => {
    expect(listing.declarations.runtimes.find(runtime => runtime.id === 'facade-server').targets)
      .toEqual(['browser', 'server']);
    for (const id of ['bake', 'construct-sheet', 'generate-sheet-dxf', 'match-sheet']) {
      const service = listing.declarations.services.find(item => item.id === id);
      expect(service.mode).toBeUndefined();
      expect(service.execution).toMatchObject({
        runtime: 'facade-server',
        kind: 'pure',
        targets: ['browser', 'server'],
        capabilities: []
      });
    }
  });

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

  it('constructs pinned sheet geometry and parts in the managed runtime', async () => {
    const runtime = createRuntime();
    const result = await runtime.execute('construct-sheet', {
      refs: { designs: [{ id: 'design-1', revision: '7' }] },
      draft: { data: { layout: {
        compositionKey: 'composition-a',
        sourceItems: [{ id: 'item-1', design_id: 'design-1' }],
        placed_items: [{ item_id: 'item-1', x: 10, y: 20 }],
        sheetPolygon: { outer: [[0, 0], [100, 0], [100, 200], [0, 200]] }
      } } }
    });
    expect(result.data.compositionKey).toBe('composition-a');
    expect(result.data.geometry.data.sheetPolygon.outer).toHaveLength(4);
    expect(result.relations.parts).toEqual([{ type: 'cassette-design', id: 'design-1', revision: '7' }]);
  });

  it('requires revision-pinned design references for every sheet placement', async () => {
    const runtime = createRuntime();
    const layout = {
      sourceItems: [{ id: 'item-1', design_id: 'design-1' }],
      placed_items: [{ item_id: 'item-1', x: 10, y: 20 }]
    };
    await expect(runtime.execute('construct-sheet', {
      draft: { data: { layout } }
    })).rejects.toThrow(/declared designs do not include/);
    await expect(runtime.execute('construct-sheet', {
      refs: { designs: [{ id: 'design-2', revision: '7' }] },
      draft: { data: { layout } }
    })).rejects.toThrow(/declared designs do not include/);
    await expect(runtime.execute('construct-sheet', {
      refs: { designs: [{ id: 'design-1' }] },
      draft: { data: { layout } }
    })).rejects.toThrow(/revision-pinned cassette-design references/);
  });

  it('exports the sheet drawing as a base64 DXF payload in the managed runtime', async () => {
    const runtime = createRuntime();
    const result = await runtime.execute('generate-sheet-dxf', {
      fields: { name: 'Panel', geometry: { data: {
        polygonParts: [{ layer: 'cut.outer', coordinates: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]] }]
      } } }
    });
    expect(result.payload.mime).toBe('application/dxf');
    expect(result.payload.name).toBe('Panel.dxf');
    expect(atob(result.payload.base64)).toContain('SECTION');
  });

  it('names a sheet deterministically from its layout or authored draft name', async () => {
    const runtime = createRuntime();
    const input = {
      draft: { data: { layout: {
        compositionKey: 'composition-a',
        sourceItems: [],
        placed_items: [],
        sheetPolygon: { outer: [[0, 0], [100, 0], [100, 100], [0, 100]] }
      } } }
    };
    const first = await runtime.execute('construct-sheet', input);
    const second = await runtime.execute('construct-sheet', input);
    expect(first.data.name).toBe(second.data.name);
    const named = await runtime.execute('construct-sheet', {
      ...input,
      draft: { ...input.draft, data: { ...input.draft.data, name: 'Panel A' } }
    });
    expect(named.data.name).toBe('Panel A');
  });

  it('bakes an OCCS template in the browser-capable managed runtime', async () => {
    const { createDefaultOccsCassetteTemplateDefinition } = await import('../occs/templates.js');
    const definition = createDefaultOccsCassetteTemplateDefinition();
    const runtime = createRuntime();
    const result = await runtime.execute('bake', {
      refs: { template: {
        id: 'template-1',
        name: 'Tray 600',
        payloadBase64: btoa(unescape(encodeURIComponent(JSON.stringify(definition))))
      } },
      draft: { data: { parameters: { A: '600', B: '450' } } }
    });
    expect(result.data.name).toBe('Tray 600 · A 600 · B 450');
    expect(result.data.geometry.nestingPolygons.length).toBeGreaterThan(0);
  });

  it('passes package-relative WASM bytes explicitly when the host provides Deno.readFile', async () => {
    const readFileMock = vi.fn(url => readFile(url));
    vi.stubGlobal('Deno', { readFile: readFileMock });
    try {
      const clipper = await import('../surfaces/lib/cassetteV2Clipper.js?deno-runtime-test');
      await expect(clipper.getCassetteV2Clipper()).resolves.toBeTruthy();
      expect(readFileMock).toHaveBeenCalledOnce();
      expect(typeof clipper.unionCassetteV2FacePolygons).toBe('function');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses operations outside the managed runtime declaration', async () => {
    const runtime = createRuntime();
    await expect(runtime.execute('unknown-operation', {}, { capabilities: { call: vi.fn() } }))
      .rejects.toThrow(/Unsupported Facade managed operation/);
  });
});
