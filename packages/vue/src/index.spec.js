import { describe, expect, it } from 'vitest';
import {
  createDomainUiAdapter,
  createEndpointMap,
  getListEndpoint,
  getSingleEndpoint
} from './index.js';

describe('@cutkit/vue endpoint map', () => {
  it('registers canonical endpoint keys from route metadata', () => {
    const endpointMap = createEndpointMap([
      {
        type: 'cassetteInstance',
        typeId: 'cassette_instance',
        surfaceKey: 'cassetteInstance',
        collection: 'cassette-instances',
        routes: {
          single: '/api/cassette-instances/:id',
          list: '/api/cassette-instances'
        }
      }
    ]);

    expect(getSingleEndpoint(endpointMap, 'cassetteInstance', 'ci-1')).toBe('/api/cassette-instances/ci-1');
    expect(getSingleEndpoint(endpointMap, 'cassette_instance', 'ci-1')).toBe('/api/cassette-instances/ci-1');
  });

  it('registers canonical and generated surface endpoint keys', () => {
    const endpointMap = createEndpointMap([
      {
        type: 'layerStandard',
        typeId: 'layer_standard',
        surfaceKey: 'layerStandard',
        collection: 'layer-standards',
        routes: {
          single: '/api/layer-standards/:id',
          list: '/api/layer-standards'
        }
      }
    ]);

    expect(getListEndpoint(endpointMap, 'layerStandard')).toBe('/api/layer-standards');
    expect(getListEndpoint(endpointMap, 'layer_standard')).toBe('/api/layer-standards');
  });

  it('keeps cassette design endpoints separate from cassette templates', () => {
    const endpointMap = createEndpointMap([
      {
        type: 'cassette',
        typeId: 'cassette',
        surfaceKey: 'cassette',
        collection: 'cassettes',
        routes: {
          single: '/api/cassettes/:id',
          list: '/api/cassettes'
        }
      },
      {
        type: 'cassetteDesign',
        typeId: 'cassette_design',
        surfaceKey: 'cassetteDesign',
        collection: 'cassette-designs',
        routes: {
          single: '/api/cassette-designs/:id',
          list: '/api/cassette-designs'
        }
      }
    ]);

    expect(getSingleEndpoint(endpointMap, 'cassette', 'ct-1')).toBe('/api/cassettes/ct-1');
    expect(getSingleEndpoint(endpointMap, 'cassetteDesign', 'cd-1')).toBe('/api/cassette-designs/cd-1');
    expect(getSingleEndpoint(endpointMap, 'cassette_design', 'cd-1')).toBe('/api/cassette-designs/cd-1');
  });

  it('does not infer entity identity from collection names', () => {
    const endpointMap = createEndpointMap([
      {
        type: 'batch',
        collection: 'material-piles',
        routes: {
          single: '/api/material-piles/:id',
          list: '/api/material-piles'
        }
      }
    ]);

    expect(endpointMap.material_pile).toBeUndefined();
  });

  it('registers surface aliases for UI keys and backend entity types', () => {
    const adapter = createDomainUiAdapter({
      ui: {
        surfaces: [
          {
            key: 'materialPile',
            typeId: 'material_pile',
            icon: 'pi pi-database'
          }
        ]
      }
    });

    expect(adapter.getIcon('materialPile')).toBe('pi pi-database');
    expect(adapter.getIcon('material_pile')).toBe('pi pi-database');
    expect(adapter.getSurface('material_pile')?.key).toBe('materialPile');
  });
});
