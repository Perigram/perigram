import { describe, expect, it } from 'vitest';
import { BaseEntity, inheritLineage } from './index.js';

describe('entity relation and revision lineage blocks', () => {
  it('normalizes typed non-owning relations into the canonical root block', () => {
    const entity = new BaseEntity({
      _id: 'artifact-1',
      identity: { uid: 'artifact-1', name: 'Source DXF' },
      relations: {
        source: { entityType: 'cassette', entityId: 'cassette-1', revisionId: 'revision-1' }
      }
    }).toJSON();

    expect(entity.relations).toEqual({
      source: [{ entityType: 'cassette', entityId: 'cassette-1', revisionId: 'revision-1' }]
    });
  });

  it('pairs owning lineage with an optional source revision', () => {
    const lineage = inheritLineage({
      _id: 'design-1',
      identity: { uid: 'design-1' },
      lineage: {
        organization: { entityType: 'organization', entityId: 'org-1' },
        queue: { entityType: 'queue', entityId: 'queue-1' }
      }
    }, 'sheetDesign', value => value, 'revision-2').toJSON();

    expect(lineage).toEqual({
      organization: { entityType: 'organization', entityId: 'org-1' },
      queue: { entityType: 'queue', entityId: 'queue-1' },
      sheetDesign: { entityType: 'sheet_design', entityId: 'design-1', revisionId: 'revision-2' }
    });
  });

  it('rejects legacy paired lineage keys instead of dual-reading them', () => {
    expect(() => new BaseEntity({
      _id: 'queue-1',
      identity: { uid: 'queue-1' },
      lineage: { projectId: 'project-1' }
    })).toThrow(/must be migrated/);
  });
});
