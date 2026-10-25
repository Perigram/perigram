import { describe, expect, it } from 'vitest';
import {
  derivedFromRevision,
  hashRevisionContent,
  revisionIdentity
} from './service.js';
import { EntityRevision } from './model.js';

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

  it('creates revision identities unique to the source entity', () => {
    const first = revisionIdentity('cassette', 'cassette-1', 'geometry', 1);
    const second = revisionIdentity('cassette', 'cassette-2', 'geometry', 1);

    expect(first.uid).toBe('revision:cassette:cassette-1:geometry:1');
    expect(second.uid).toBe('revision:cassette:cassette-2:geometry:1');
    expect(first.uid).not.toBe(second.uid);
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

  it('builds derivedFrom provenance from the revision source ref', () => {
    const revision = {
      _id: 'rev-2',
      data: {
        source: { type: 'cassette', id: 'cassette-2' },
        scope: 'geometry',
        number: 2,
        contentHash: 'sha256:def'
      }
    };

    expect(derivedFromRevision(revision)).toMatchObject({
      source: { type: 'cassette', id: 'cassette-2', revisionId: 'rev-2' },
      scope: 'geometry',
      revisionNumber: 2,
      contentHash: 'sha256:def'
    });
  });

  it('serializes the stored source ref in DTOs', () => {
    const revision = new EntityRevision({
      _id: 'rev-2',
      data: {
        source: { type: 'cassette', id: 'cassette-2' },
        scope: 'geometry'
      }
    }).toJSON();

    expect(revision.data.source).toMatchObject({
      type: 'cassette',
      id: 'cassette-2'
    });
  });
});
