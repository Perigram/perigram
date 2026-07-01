import { describe, expect, it } from 'vitest';
import {
  collectionToEntityType,
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

  it('registers list aliases for hyphenated master-data collections', () => {
    const endpointMap = createEndpointMap([
      {
        type: 'layerStandard',
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
        type: 'cassetteTemplate',
        collection: 'cassettes',
        routes: {
          single: '/api/cassettes/:id',
          list: '/api/cassettes'
        }
      },
      {
        type: 'cassetteDesign',
        collection: 'cassette-designs',
        routes: {
          single: '/api/cassette-designs/:id',
          list: '/api/cassette-designs'
        }
      }
    ]);

    expect(getSingleEndpoint(endpointMap, 'cassetteTemplate', 'ct-1')).toBe('/api/cassettes/ct-1');
    expect(getSingleEndpoint(endpointMap, 'cassetteDesign', 'cd-1')).toBe('/api/cassette-designs/cd-1');
    expect(getSingleEndpoint(endpointMap, 'cassette_design', 'cd-1')).toBe('/api/cassette-designs/cd-1');
  });

  it('derives singular snake_case keys from collection names', () => {
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

    expect(collectionToEntityType('material-piles')).toBe('material_pile');
    expect(getSingleEndpoint(endpointMap, 'material_pile', 'pile-1')).toBe('/api/material-piles/pile-1');
  });

  it('registers surface aliases for UI keys and backend entity types', () => {
    const adapter = createDomainUiAdapter({
      ui: {
        surfaces: [
          {
            key: 'materialPile',
            entityType: 'material_pile',
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
