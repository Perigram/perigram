import { describe, expect, it } from 'vitest';
import {
  buildLegacyNestingAttempts,
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
      projectRevisionId: 'revision-1',
      templateId: 'cassette-1',
      designId: 'design-1',
      pileId: 'pile-1',
      sheet_designId: 'sheet-design-1'
    })).toEqual({
      organization: { entityType: 'organization', entityId: 'org-1' },
      project: { entityType: 'project', entityId: 'project-1', revisionId: 'revision-1' },
      cassette: { entityType: 'cassette', entityId: 'cassette-1' },
      cassetteDesign: { entityType: 'cassette_design', entityId: 'design-1' },
      materialPile: { entityType: 'material_pile', entityId: 'pile-1' },
      sheetDesign: { entityType: 'sheet_design', entityId: 'sheet-design-1' }
    });
  });

  it('coalesces equivalent lineage aliases and rejects conflicting targets', () => {
    expect(migrateLineage({
      cassette: { entityType: 'cassette', entityId: 'cassette-1' },
      originalCassetteId: 'cassette-1'
    })).toEqual({
      cassette: { entityType: 'cassette', entityId: 'cassette-1' }
    });
    expect(() => migrateLineage({
      cassetteId: 'cassette-1',
      templateId: 'cassette-2'
    })).toThrow(/Conflicting lineage references for canonical role cassette/);
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
    expect(migrateWorkflowLineageRoles({ lineageKey: 'templateId' })).toEqual({ lineageRole: 'cassette' });
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

  it('recovers job-only and dangling-reference attempts as queue revisions', () => {
    const attempts = buildLegacyNestingAttempts({
      jobs: [{
        _id: 'job-doc-1',
        runId: 'job-run-1',
        queueId: 'queue-1',
        taskRunId: 'task-run-1',
        status: 'done',
        params: { width: 3000 },
        result: { solution: { density: 0.8, layouts: [{ placed_items: [{ item_id: 1 }] }] } }
      }],
      references: [{
        runId: 'missing-run-1',
        queueId: 'queue-1',
        legacyReferences: ['artifacts/artifact-1']
      }]
    });
    const queue = { _id: 'queue-1', lineage: { organizationId: 'org-1' }, status: { state: 'DRAFT' } };
    const jobRevision = createLegacyNestingRevision(attempts.find(attempt => attempt._id === 'job-run-1'), queue, 1);
    const missingRevision = createLegacyNestingRevision(attempts.find(attempt => attempt._id === 'missing-run-1'), queue, 2);

    expect(jobRevision.data).toMatchObject({
      outcome: 'SUCCESS',
      taskRunId: 'task-run-1',
      reason: 'legacy-nesting-job-migration'
    });
    expect(jobRevision.data.snapshot).toMatchObject({
      settings: { width: 3000 },
      results: { efficiency: 0.8, sheetCount: 1, placedCount: 1 }
    });
    expect(missingRevision.data).toMatchObject({
      outcome: 'FAILURE',
      reason: 'legacy-nesting-reference-migration'
    });
    expect(missingRevision.data.snapshot.legacyReferences).toEqual(['artifacts/artifact-1']);
  });

  it('merges a legacy job with its matching nesting run instead of duplicating the revision', () => {
    const attempts = buildLegacyNestingAttempts({
      runs: [{
        _id: 'run-1',
        lineage: { queueId: 'queue-1' },
        status: { state: 'CUSTOM_PROCESS_STATE' },
        data: { results: { placedCount: 2 } }
      }],
      jobs: [{
        _id: 'job-1',
        runId: 'run-1',
        queueId: 'queue-1',
        taskRunId: 'task-run-1',
        status: 'done'
      }]
    });

    expect(attempts).toHaveLength(1);
    expect(attempts[0].data).toMatchObject({
      results: { placedCount: 2 },
      taskRunId: 'task-run-1',
      legacyJobId: 'job-1'
    });
    expect(createLegacyNestingRevision(attempts[0], { _id: 'queue-1' }, 1).data.outcome).toBe('SUCCESS');
  });
});
