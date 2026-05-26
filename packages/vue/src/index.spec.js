import { describe, expect, it } from 'vitest';
import {
  collectionToEntityType,
  createEndpointMap,
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
});
