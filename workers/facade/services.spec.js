import { describe, expect, it } from 'vitest';
import { bake, extractGeometry, nestingParts, nestingSheetCount, services } from './services.js';
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
  it('uses the item count as the worst-case sheet stock', () => {
    expect(nestingSheetCount([{ count: 2 }, { count: 1 }, {}, { count: '3' }])).toBe(7);
  });
});
