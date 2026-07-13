import { describe, expect, it } from 'vitest';
import { BaseEntity, inheritLineage } from './index.js';

describe('entity relation and revision lineage blocks', () => {
  it('normalizes typed non-owning relations into the canonical root block', () => {
    const entity = new BaseEntity({
      _id: 'artifact-1',
      identity: { uid: 'artifact-1', name: 'Source DXF' },
      relations: {
        source: { type: 'cassette', id: 'cassette-1', revisionId: 'revision-1' }
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
      lineage: { organizationId: 'org-1', runId: 'run-1' }
    }, 'sheetDesign', value => value, 'revision-2').toJSON();

    expect(lineage).toEqual({
      organizationId: 'org-1',
      runId: 'run-1',
      sheetDesignId: 'design-1',
      sheetDesignRevisionId: 'revision-2'
    });
  });
});
