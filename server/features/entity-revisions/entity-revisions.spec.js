import { describe, expect, it } from 'vitest';
import {
  derivedFromRevision,
  hashRevisionContent
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

  it('builds derivedFrom provenance from legacy revision source fields', () => {
    const revision = {
      _id: 'rev-legacy',
      data: {
        entityType: 'cassette',
        entityId: 'cassette-legacy',
        scope: 'geometry',
        number: 2,
        contentHash: 'sha256:legacy'
      }
    };

    expect(derivedFromRevision(revision)).toMatchObject({
      source: { type: 'cassette', id: 'cassette-legacy', revisionId: 'rev-legacy' },
      scope: 'geometry',
      revisionNumber: 2,
      contentHash: 'sha256:legacy'
    });
  });

  it('normalizes legacy revision source fields in DTOs', () => {
    const revision = new EntityRevision({
      _id: 'rev-legacy',
      data: {
        entityType: 'cassette',
        entityId: 'cassette-legacy',
        scope: 'geometry'
      }
    }).toJSON();

    expect(revision.data.source).toMatchObject({
      type: 'cassette',
      id: 'cassette-legacy'
    });
  });
});
