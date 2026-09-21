import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyStatusMigrations,
  buildStatusMigrationPlan,
  normalizeStatusMappings,
  strandedAsAffected,
  validateStatusMappings
} from './migration-plan.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { statusService } from '~/server/core/machines/service.js';
import * as entityEventService from '../entity-events/service.js';

vi.mock('~/server/runtime/app-registry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getAppRegistry: vi.fn()
}));

vi.mock('~/server/core/machines/service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    statusService: { ...actual.statusService, setInitialStateForOrganization: vi.fn() }
  };
});

vi.mock('../entity-events/service.js', () => ({
  publishEntityChanged: vi.fn(async () => null)
}));

const compiled = {
  producerOutputs: {
    'project_source:result': {
      typeId: 'project',
      workflow: {
        primaryRegion: 'main',
        regions: { main: { states: { draft: {}, done: {} } } }
      }
    },
    'facade_source:result': {
      typeId: 'facade',
      workflow: {
        primaryRegion: 'main',
        regions: { main: { states: { draft: {} } } }
      }
    }
  }
};

const stranded = [
  { typeId: 'project', statuses: [{ state: 'LEGACY_RETIRED', count: 2 }, { state: 'OLD_DRAFT', count: 1 }] },
  { typeId: 'facade', statuses: [{ state: 'GONE', count: 3 }] }
];

describe('apply migration plan builders', () => {
  it('builds plan rows with retained targets from the next contract', () => {
    const plan = buildStatusMigrationPlan(stranded, compiled);
    expect(plan.statuses).toHaveLength(2);
    const project = plan.statuses.find(row => row.typeId === 'project');
    expect(project.removed).toEqual([{ state: 'LEGACY_RETIRED', count: 2 }, { state: 'OLD_DRAFT', count: 1 }]);
    expect(project.targets).toEqual(['done', 'draft']);
    expect(plan.statuses.find(row => row.typeId === 'facade').targets).toEqual(['draft']);
  });

  it('projects the historical affected shape', () => {
    expect(strandedAsAffected(stranded)).toEqual([
      { typeId: 'project', statuses: ['LEGACY_RETIRED', 'OLD_DRAFT'], count: 3 },
      { typeId: 'facade', statuses: ['GONE'], count: 3 }
    ]);
  });

  it('normalizes mappings and drops duplicates or malformed rows', () => {
    expect(normalizeStatusMappings([
      { typeId: 'project', from: 'LEGACY_RETIRED', to: 'draft' },
      { typeId: 'project', from: 'LEGACY_RETIRED', to: 'done' },
      { typeId: '', from: 'x', to: 'y' },
      null
    ])).toEqual([{ typeId: 'project', from: 'LEGACY_RETIRED', to: 'draft' }]);
  });

  it('rejects missing, unknown, and off-target mappings', () => {
    const plan = buildStatusMigrationPlan(stranded, compiled);
    expect(validateStatusMappings(plan, [
      { typeId: 'project', from: 'LEGACY_RETIRED', to: 'draft' },
      { typeId: 'project', from: 'OLD_DRAFT', to: 'done' },
      { typeId: 'facade', from: 'GONE', to: 'draft' },
      { typeId: 'facade', from: 'NOT_REMOVED', to: 'draft' }
    ])).toEqual(['No removed state NOT_REMOVED on facade requires a mapping']);
    expect(validateStatusMappings(plan, [
      { typeId: 'project', from: 'LEGACY_RETIRED', to: 'draft' },
      { typeId: 'project', from: 'OLD_DRAFT', to: 'done' }
    ])).toEqual(['facade state GONE has no migration target']);
    expect(validateStatusMappings(plan, [
      { typeId: 'project', from: 'LEGACY_RETIRED', to: 'draft' },
      { typeId: 'project', from: 'OLD_DRAFT', to: 'done' },
      { typeId: 'facade', from: 'GONE', to: 'NOT_A_TARGET' }
    ])).toEqual(['NOT_A_TARGET is not a retained state of facade']);
  });
});

describe('apply migration executor', () => {
  const auth = { userId: 'user-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    statusService.setInitialStateForOrganization.mockResolvedValue({});
  });

  it('re-targets only instances holding a mapped state and publishes invalidations', async () => {
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'project'
        ? {
            processList: vi.fn().mockResolvedValue([
              { _id: 'p-1', status: { state: { primary: 'LEGACY_RETIRED' } } },
              { _id: 'p-2', status: { state: { primary: 'draft' } } },
              { _id: 'p-3', status: { state: { primary: 'OLD_DRAFT' } } }
            ])
          }
        : null
    });

    const result = await applyStatusMigrations({
      mappings: [
        { typeId: 'project', from: 'LEGACY_RETIRED', to: 'done' },
        { typeId: 'project', from: 'OLD_DRAFT', to: 'draft' }
      ],
      auth,
      organizationId: 'org-1',
      compiled
    });

    expect(result.failures).toEqual([]);
    expect(result.applied).toEqual({ project: { 'LEGACY_RETIRED->done': 1, 'OLD_DRAFT->draft': 1 } });
    expect(statusService.setInitialStateForOrganization).toHaveBeenCalledTimes(2);
    expect(statusService.setInitialStateForOrganization).toHaveBeenCalledWith(
      'project', 'p-1', 'done', 'org-1', 'user-1',
      expect.objectContaining({ producerOutputId: 'project_source:result' })
    );
    expect(entityEventService.publishEntityChanged).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ type: 'project', id: 'p-1', change: 'updated', reason: 'process-apply-migration' })
    );
  });

  it('is idempotent: instances already migrated are skipped on resume', async () => {
    getAppRegistry.mockReturnValue({
      getEntityService: () => ({
        processList: vi.fn().mockResolvedValue([
          { _id: 'p-1', status: { state: { primary: 'done' } } }
        ])
      })
    });

    const result = await applyStatusMigrations({
      mappings: [{ typeId: 'project', from: 'LEGACY_RETIRED', to: 'done' }],
      auth,
      organizationId: 'org-1',
      compiled
    });

    expect(result.applied).toEqual({});
    expect(statusService.setInitialStateForOrganization).not.toHaveBeenCalled();
  });

  it('records per-entity failures without aborting the remaining mappings', async () => {
    getAppRegistry.mockReturnValue({
      getEntityService: type => type === 'project'
        ? { processList: vi.fn().mockResolvedValue([{ _id: 'p-1', status: { state: { primary: 'LEGACY_RETIRED' } } }]) }
        : null
    });
    statusService.setInitialStateForOrganization.mockRejectedValue(new Error('machine missing'));

    const result = await applyStatusMigrations({
      mappings: [
        { typeId: 'project', from: 'LEGACY_RETIRED', to: 'done' },
        { typeId: 'facade', from: 'GONE', to: 'draft' }
      ],
      auth,
      organizationId: 'org-1',
      compiled
    });

    expect(result.applied).toEqual({});
    expect(result.failures).toEqual([
      expect.objectContaining({ typeId: 'project', id: 'p-1', from: 'LEGACY_RETIRED', to: 'done' }),
      expect.objectContaining({ typeId: 'facade', id: null, from: 'GONE', to: 'draft' })
    ]);
  });
});

describe('construct provenance stamp', () => {
  it('names the op, collects typed entity sources, and records effective parameters', async () => {
    const { constructProvenance } = await import('./service.js');
    const record = {
      id: 'bake-1',
      kind: 'cts.conversion',
      construction: {
        mode: 'bakeFromTemplate',
        inputs: [
          { id: 'templateId', path: 'templateId', type: 'entity', typeId: 'cassette' },
          { id: 'qty', path: 'qty', type: 'number' }
        ]
      }
    };
    const provenance = constructProvenance(
      record,
      { templateId: 'tpl-9', qty: 4 },
      'READY',
      { templateId: { type: 'cassette', id: 'tpl-9' }, qty: 4, entity: { type: 'queue', id: 'q-1' } }
    );
    expect(provenance.op).toBe('cts.conversion:bake-1:bakeFromTemplate');
    expect(provenance.sources).toEqual([
      { type: 'cassette', id: 'tpl-9' },
      { type: 'queue', id: 'q-1' }
    ]);
    expect(provenance.effective).toEqual({
      via: 'bakeFromTemplate',
      targetState: 'READY',
      parameters: { templateId: 'tpl-9', qty: 4 }
    });
  });

  it('falls back to the generic construct op with no sources', async () => {
    const { constructProvenance } = await import('./service.js');
    const provenance = constructProvenance({ id: 'n2' }, {}, null, {});
    expect(provenance).toEqual({ op: 'effect.createEntity:n2', sources: [], effective: { via: 'genericCreate' } });
  });
});
