import { describe, expect, it } from 'vitest';
import {
  migrateLegacyDerivedFrom,
  migrateLegacyParentRevision,
  migrateLegacyRevisionData
} from './migrate-entity-reference-contracts.js';

describe('entity reference contract migration', () => {
  it('moves revision source metadata to one canonical EntityRef', () => {
    const result = migrateLegacyRevisionData({ entityType: 'cassette', entityId: 42, scope: 'geometry' });
    expect(result.data).toEqual({ source: { type: 'cassette', id: '42' }, scope: 'geometry' });
  });

  it('moves design derivation to provenance and removes the old data shape', () => {
    const result = migrateLegacyDerivedFrom({
      data: { derivedFrom: { entityType: 'cassette', entityId: 'c1', revisionId: 'r1', contentHash: 'hash' } }
    });
    expect(result.design.data).not.toHaveProperty('derivedFrom');
    expect(result.design.provenance.derivedFrom).toEqual({
      source: { type: 'cassette', id: 'c1', revisionId: 'r1' },
      contentHash: 'hash'
    });
  });

  it('removes a matching derivation key from lineage when provenance already exists', () => {
    const result = migrateLegacyDerivedFrom({
      lineage: { organizationId: 'org-1', templateId: 'template-1' },
      provenance: {
        derivedFrom: { source: { type: 'cassette', id: 'template-1', revisionId: 'revision-2' } }
      },
      data: {}
    });

    expect(result.changed).toBe(true);
    expect(result.invalid).toBe(false);
    expect(result.design.lineage).toEqual({ organizationId: 'org-1' });
  });

  it('rejects a lineage template that disagrees with recorded provenance', () => {
    const result = migrateLegacyDerivedFrom({
      lineage: { templateId: 'template-2' },
      provenance: { derivedFrom: { source: { type: 'cassette', id: 'template-1' } } },
      data: {}
    });

    expect(result.changed).toBe(false);
    expect(result.invalid).toBe(true);
  });

  it('moves an exact immediate-parent revision out of lineage', () => {
    const result = migrateLegacyParentRevision(
      { lineage: { organizationId: 'o1', projectId: 'p1', projectRevisionId: 'r1' } },
      { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
      { data: { source: { type: 'project', id: 'p1' }, scope: 'content', number: 3, contentHash: 'hash' } }
    );
    expect(result.entity.lineage).toEqual({ organizationId: 'o1', projectId: 'p1' });
    expect(result.entity.provenance.parent.source).toEqual({ type: 'project', id: 'p1', revisionId: 'r1' });
  });

  it('refuses to pin a revision belonging to another parent', () => {
    const result = migrateLegacyParentRevision(
      { lineage: { projectId: 'p1', projectRevisionId: 'r1' } },
      { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
      { data: { source: { type: 'project', id: 'p2' } } }
    );
    expect(result.changed).toBe(false);
  });
});
