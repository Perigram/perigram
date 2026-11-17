import { describe, expect, it, vi } from 'vitest';
import { bake, constructSheet, extractGeometry, generateSheetDxf, matchSheet, nestingParts, nestingSheetCount, nestingSolve, normalizeNestingItems, services } from './services.js';
import listing from './listing.json';
import { createDefaultOccsCassetteTemplateDefinition } from './occs/templates.js';
import { generateLayeredDxf } from './vendor/dxf-writer.js';

const SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

describe('facade listing/runtime inventory', () => {
  it('implements every declared service exactly once', () => {
    expect(Object.keys(services).sort()).toEqual(
      listing.declarations.services.map(service => service.id).sort()
    );
  });

  it('resolves every construction and projection binding to a declared service', () => {
    const serviceIds = new Set(listing.declarations.services.map(service => service.id));
    for (const type of listing.declarations.types) {
      for (const projection of type.projections || []) {
        expect(serviceIds.has(projection.resolve?.service?.replace('plugin.facade.', ''))).toBe(true);
      }
    }
    for (const [typeId, modes] of Object.entries(listing.declarations.constructions || {})) {
      expect(listing.declarations.types.some(type => type.id === typeId)).toBe(true);
      for (const serviceId of Object.values(modes)) {
        expect(serviceIds.has(String(serviceId).replace('plugin.facade.', ''))).toBe(true);
      }
    }
  });
});

describe('facade graph service behavior', () => {
  it('matches a sheet only by its exact composition key', () => {
    const sheet = { _id: 'sheet-1', fields: { compositionKey: 'composition-a' } };
    expect(matchSheet({ layoutKey: 'composition-a', sheets: [sheet] })).toEqual({ found: true, design: sheet });
    expect(matchSheet({ layoutKey: 'composition-b', sheets: [sheet] })).toEqual({ found: false, design: null });
    expect(matchSheet({ layoutKey: '', sheets: [sheet] })).toEqual({ found: false, design: null });
  });

  it('constructs a sheet with pinned design relations from a solved layout', async () => {
    const result = await constructSheet({
      refs: { designs: [{ id: 'design-1', revision: '7' }] },
      draft: { data: { layout: {
        compositionKey: 'composition-a',
        sourceItems: [{ id: 'item-1', design_id: 'design-1' }],
        placed_items: [{ item_id: 'item-1', x: 10, y: 20 }],
        sheetPolygon: { outer: [[0, 0], [100, 0], [100, 200], [0, 200]] }
      } } }
    });
    expect(result.data.compositionKey).toBe('composition-a');
    expect(result.data.geometry.data.items).toHaveLength(1);
    expect(result.data.geometry.data.sheetPolygon.outer).toHaveLength(4);
    expect(result.relations.parts).toHaveLength(1);
    expect(result.relations.parts[0]).toMatchObject({ type: 'cassette-design', id: 'design-1', revision: '7' });
  });

  it('refuses to construct placements without their source design references', async () => {
    await expect(constructSheet({
      draft: { data: { layout: {
        sourceItems: [{ id: 'item-1' }],
        placed_items: [{ item_id: 'item-1' }]
      } } }
    })).rejects.toThrow(/cassette-design behind every placement/);
  });

  it('exports a sheet drawing as an application/dxf payload', async () => {
    const result = await generateSheetDxf({
      fields: { name: 'Panel', geometry: { data: {
        polygonParts: [{ layer: 'cut.outer', coordinates: SQUARE }]
      } } }
    });
    expect(result.payload.mime).toBe('application/dxf');
    expect(result.payload.name).toBe('Panel.dxf');
    expect(Buffer.from(result.payload.base64, 'base64').toString('utf8')).toContain('SECTION');
  });

  it('rejects non-finite nesting counts', () => {
    expect(() => normalizeNestingItems([{ id: 'part-1', count: Infinity }]))
      .toThrow(/count must be a positive safe integer/);
    expect(() => normalizeNestingItems([{ id: 'part-1', count: Number.MAX_SAFE_INTEGER + 1 }]))
      .toThrow(/count must be a positive safe integer/);
  });

  it('dispatches normalized copies of authored nesting items to the solver', async () => {
    const authored = Object.freeze({
      id: 'design-1',
      designId: 'design-1',
      count: '2',
      dimensions: Object.freeze({ width: 20, height: 10 })
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], layouts: [] })
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await nestingSolve({ items: [authored], sheetWidth: 100, sheetHeight: 100 });
      const request = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(request.params.sheetCount).toBe(2);
      expect(request.items[0].count).toBe(2);
      expect(authored.count).toBe('2');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects invalid nesting inputs before contacting the external solver', async () => {
    await expect(nestingSolve({ items: [], sheetWidth: 100, sheetHeight: 100 })).rejects.toThrow(/no parts to place/);
    await expect(nestingSolve({ items: [{ id: 'part-1' }], sheetWidth: 0, sheetHeight: 100 })).rejects.toThrow(/finite positive width/);
    await expect(nestingSolve({ items: [{ id: 'part-1' }], sheetWidth: Infinity, sheetHeight: 100 })).rejects.toThrow(/finite positive width/);
  });
});

describe('cassette-design construction names', () => {
  it('names a parametric bake from its template and parameter values', async () => {
    const template = {
      id: 'template-1',
      name: 'Tray 600',
      payloadBase64: Buffer.from(JSON.stringify(createDefaultOccsCassetteTemplateDefinition())).toString('base64')
    };
    const result = await bake({
      refs: { template },
      draft: { data: { parameters: { A: '600', B: '450' } } }
    });
    expect(result.data.name).toBe('Tray 600 · A 600 · B 450');
    expect(result.data.geometry.nestingPolygons.length).toBeGreaterThan(0);
  });

  it('names a DXF import from the uploaded file', async () => {
    const dxf = generateLayeredDxf({
      polygonParts: [{ layer: 'cut.outer', coordinates: SQUARE }]
    });
    const result = await extractGeometry({
      mode: 'upload',
      payloadBase64: Buffer.from(dxf).toString('base64'),
      payloadMeta: { name: 'tray-left.dxf' }
    });
    expect(result.data.name).toBe('tray-left');
    expect(result.data.geometry.nestingPolygons).toHaveLength(1);
  });
});

describe('nesting parts projection', () => {
  it('ships one design item with all of its workpiece parts', async () => {
    const result = await nestingParts({
      typeId: 'cassette-design',
      instanceId: 'design-1',
      fields: {
        geometry: {
          nestingPolygons: [
            { coordinates: SQUARE, workpieceId: 'wp_1' },
            { coordinates: SQUARE, workpieceId: 'wp_2' }
          ],
          layerData: []
        }
      }
    });
    expect(result.designId).toBe('design-1');
    expect(result.polygonParts).toHaveLength(2);
    expect(result.polygonParts.every(part => part.designId === 'design-1')).toBe(true);
  });

  it('refuses a design without baked geometry', async () => {
    await expect(nestingParts({ typeId: 'cassette-design', instanceId: 'design-1', fields: {} }))
      .rejects.toThrow(/bake the template or import the DXF/);
  });
});

describe('nesting sheet stock', () => {
  it('normalizes nesting item counts without mutating graph input values', () => {
    const item = Object.freeze({ id: 'part-1', count: '3', geometry: Object.freeze({ area: 12 }) });
    const items = Object.freeze([item]);
    const normalized = normalizeNestingItems(items);
    expect(normalized).toEqual([{ id: 'part-1', count: 3, geometry: { area: 12 } }]);
    expect(nestingSheetCount(items)).toBe(3);
    expect(item.count).toBe('3');
    expect(item.geometry).toEqual({ area: 12 });
  });

  it('rejects a total sheet count beyond the safe integer range', () => {
    expect(() => nestingSheetCount([
      { count: Number.MAX_SAFE_INTEGER },
      { count: 1 }
    ])).toThrow(/safe integer limit/);
  });

  it('uses the item count as the worst-case sheet stock', () => {
    expect(nestingSheetCount([{ count: 2 }, { count: 1 }, {}, { count: '3' }])).toBe(7);
  });
});
