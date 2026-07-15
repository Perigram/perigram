import { describe, expect, it } from 'vitest';
import {
  derivedFromRevision,
  hashRevisionContent
} from './service.js';

describe('entity revision helpers', () => {
  it('hashes canonical content independent of object key order', () => {
    const first = hashRevisionContent({
      type: 'PARAMETRIC',
      definition: { params: { A: 500, C: 40 } },
      parameters: ['A', 'C']
    });
    const second = hashRevisionContent({
      parameters: ['A', 'C'],
      definition: { params: { C: 40, A: 500 } },
      type: 'PARAMETRIC'
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:/);
  });

  it('builds derivedFrom provenance from a revision DTO', () => {
    const revision = {
      _id: 'rev-1',
      data: {
        source: { type: 'cassette', id: 'cassette-1' },
        scope: 'geometry',
        number: 3,
        contentHash: 'sha256:abc',
        sourceStatus: { state: 'ACTIVE' }
      }
    };

    expect(derivedFromRevision(revision, { A: 500 })).toEqual({
      source: { type: 'cassette', id: 'cassette-1', revisionId: 'rev-1' },
      scope: 'geometry',
      revisionNumber: 3,
      contentHash: 'sha256:abc',
      sourceStatus: { state: 'ACTIVE' },
      parameters: { A: 500 }
    });
  });
});
