import { describe, expect, it } from 'vitest';
import {
  createLegacyNestingRevision,
  legacyNestingRevisionId,
  migrateLineage,
  migrateQueueData,
  migrateQueueNestingStatus,
  migrateRelations,
  migrateWorkflowLineageRoles
} from './migrate-structured-entity-references.js';

describe('structured entity reference migration', () => {
  it('converts flat ids and revision ids to canonical references', () => {
    expect(migrateLineage({
      organizationId: 'org-1',
      projectId: 'project-1',
      projectRevisionId: 'revision-1'
    })).toEqual({
      organization: { entityType: 'organization', entityId: 'org-1' },
      project: { entityType: 'project', entityId: 'project-1', revisionId: 'revision-1' }
    });
  });

  it('qualifies the queue lineage with the migrated nesting revision', () => {
    const runRevisionById = new Map([['run-1', 'revision-run-1']]);
    expect(migrateLineage({ queueId: 'queue-1', runId: 'run-1' }, { runRevisionById })).toEqual({
      queue: { entityType: 'queue', entityId: 'queue-1', revisionId: 'revision-run-1' }
    });
  });

  it('converts known non-owning relation ids and rejects ambiguous ones', () => {
    expect(migrateRelations({ libraries: ['library-1'] })).toEqual({
      libraries: [{ entityType: 'library', entityId: 'library-1' }]
    });
    expect(() => migrateRelations({ source: 'unknown-1' })).toThrow(/no declared target/);
  });

  it('replaces legacy queue nesting parameters with the canonical settings block', () => {
    expect(migrateQueueData({ nestingParams: { spacing: 3 }, job: { items: [] } })).toEqual({
      nestingSettings: { spacing: 3 },
      job: { items: [] }
    });
  });

  it('rewrites status snapshot configuration to structured lineage roles', () => {
    expect(migrateWorkflowLineageRoles({
      lifecycle: {
        snapshots: {
          designs: { entityType: 'cassette_design', lineageKey: 'queueId' }
        }
      }
    })).toEqual({
      lifecycle: {
        snapshots: {
          designs: { entityType: 'cassette_design', lineageRole: 'queue' }
        }
      }
    });
  });

  it('creates terminal queue revisions and selects only the chosen revision', () => {
    const queue = {
      _id: 'queue-1',
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT', lifecycle: {} }
    };
    const complete = { _id: 'run-1', status: { state: 'COMPLETE' }, lineage: { queueId: 'queue-1' }, createdAt: new Date('2026-01-01') };
    const chosen = { _id: 'run-2', status: { state: 'CHOSEN' }, lineage: { queueId: 'queue-1' }, createdAt: new Date('2026-01-02') };
    const revision = createLegacyNestingRevision(chosen, queue, 2);
    const status = migrateQueueNestingStatus(queue, [complete, chosen]);

    expect(revision._id).toBe(legacyNestingRevisionId('run-2'));
    expect(revision.data).toMatchObject({ entityType: 'queue', entityId: 'queue-1', scope: 'nesting', outcome: 'SUCCESS' });
    expect(status.state.active.nesting).toBe('SELECTED');
    expect(status.lifecycle.data.selectedRevisionId).toBe(legacyNestingRevisionId('run-2'));
  });
});
