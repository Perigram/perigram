import { describe, expect, it } from 'vitest';
import { endpointServices, extractGeometry, nestingParts } from './services.js';
import listing from './listing.json';
import { generateLayeredDxf } from './vendor/dxf-writer.js';

const SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

describe('Facade endpoint inventory', () => {
  it('serves exactly the declared endpoint-mode operations', () => {
    expect(Object.keys(endpointServices).sort()).toEqual(
      listing.declarations.services
        .filter(service => service.mode === 'endpoint')
        .map(service => service.id)
        .sort()
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

describe('Facade endpoint service behavior', () => {
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
    await expect(nestingParts({ instanceId: 'design-1', fields: {} }))
      .rejects.toThrow(/bake the template or import the DXF/);
  });
});
