import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowState } from '../../../packages/workflows/src/index.js';
import { cncWorkflows } from '../../../packages/domain-cnc/src/workflows.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  updateById: vi.fn(),
  getNextQueueNumber: vi.fn(),
  deleteById: vi.fn(),
  projectGetById: vi.fn(),
  revisionGetById: vi.fn(),
  initialStatus: vi.fn(),
  applyIntent: vi.fn(),
  transition: vi.fn(),
  syncParentSummary: vi.fn()
}));

vi.mock('./repository.js', () => ({
  create: mocks.create,
  findById: mocks.findById,
  find: mocks.find,
  updateById: mocks.updateById,
  getNextQueueNumber: mocks.getNextQueueNumber,
  deleteById: mocks.deleteById
}));

vi.mock('../projects/service.js', () => ({ getById: mocks.projectGetById }));
vi.mock('../entity-revisions/service.js', () => ({ getById: mocks.revisionGetById }));
vi.mock('../../utils/permissions.js', () => ({
  hasLineagePermission: vi.fn(() => true),
  getLineageFilter: vi.fn(() => ({}))
}));
vi.mock('../../core/machines/service.js', () => ({
  createTransitionAuth: vi.fn((userId, auth) => ({ userId, ...(auth || {}) })),
  statusService: {
    initialStatusForOrganization: mocks.initialStatus,
    applyIntent: mocks.applyIntent,
    transition: mocks.transition
  }
}));
vi.mock('../../core/machines/aggregator.js', () => ({
  aggregator: { syncParentSummary: mocks.syncParentSummary }
}));
vi.mock('h3', () => ({
  createError: vi.fn((input) => Object.assign(new Error(input.message), { statusCode: input.statusCode }))
}));

import {
  appendGeneratedCassetteDesignOutputs,
  buildNestingCommandParameters,
  create,
  listPreviewByProjects,
  normalizeQueueJobItems,
  normalizeQueueNestingSettings,
  selectNestingRevision
} from './service.js';

const auth = {
  userId: 'user-1',
  organizationId: 'org-1',
  role: 'member',
  memberships: [{ organizationId: 'org-1', permissions: { queues: 'admin', projects: 'admin' } }]
};

function initialQueueStatus() {
  return {
    state: createWorkflowState(cncWorkflows.queue),
    userId: 'user-1',
    metadata: {},
    lifecycle: { actors: [], attachments: {}, data: {} }
  };
}

function queueFixture(overrides = {}) {
  return {
    _id: 'queue-1',
    identity: { uid: 'queue-1', name: 'Queue 1', slug: 'queue-1', serial: '', reference: '' },
    lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
    relations: {},
    origin: initialQueueStatus(),
    status: initialQueueStatus(),
    attachments: {},
    data: { job: { items: [], materialPool: [] }, nestingSettings: normalizeQueueNestingSettings(), queueNumber: 1 },
    summary: {},
    ...overrides
  };
}

describe('queue revision architecture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNextQueueNumber.mockResolvedValue(1);
    mocks.initialStatus.mockResolvedValue(initialQueueStatus());
    mocks.create.mockImplementation(async queue => queue.toJSON());
    mocks.updateById.mockImplementation(async (_id, queue) => queue.toJSON?.() || queue);
    mocks.syncParentSummary.mockResolvedValue(undefined);
  });

  it('initializes both business and nesting regions through Status', async () => {
    const result = await create({ name: 'Queue 1', job: { items: [] } }, auth.userId, auth.organizationId, auth.role, auth);

    expect(mocks.initialStatus).toHaveBeenCalledWith('queue', 'org-1', 'user-1', expect.any(Object));
    expect(result.status.state.active).toEqual({ main: 'DRAFT', nesting: 'IDLE' });
  });

  it('inherits structured project containment', async () => {
    mocks.projectGetById.mockResolvedValue({
      _id: 'project-1',
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } }
    });

    const result = await create({ projectId: 'project-1', job: { items: [] } }, auth.userId, auth.organizationId, auth.role, auth);
    expect(result.lineage.project).toEqual({ entityType: 'project', entityId: 'project-1' });
  });

  it('normalizes only typed queue sources', () => {
    expect(normalizeQueueJobItems([
      { id: 'design-1', entityType: 'cassette_design', quantity: 2 },
      { id: 'template-1', entityType: 'cassette', dimensions: { A: 100 } },
      { id: 'ambiguous', quantity: 1 }
    ])).toEqual([
      expect.objectContaining({ id: 'design-1', entityType: 'cassette_design', quantity: 2 }),
      expect.objectContaining({ id: 'template-1', entityType: 'cassette', quantity: 1, parameters: { A: 100 } })
    ]);
  });

  it('serializes machine, material, thickness, and tool settings into command parameters', () => {
    const result = buildNestingCommandParameters({
      data: {
        nestingSettings: {
          virtualWidth: 2500,
          virtualLength: 1250,
          spacing: 4,
          machineId: 'machine-1',
          materialId: 'material-1',
          sheetThickness: 3,
          toolProfileId: 'tool-1'
        },
        job: { materialPool: [] }
      }
    });
    expect(result).toMatchObject({
      virtualWidth: 2500,
      virtualLength: 1250,
      spacing: 4,
      machineId: 'machine-1',
      materialId: 'material-1',
      sheetThickness: 3,
      toolProfileId: 'tool-1'
    });
  });

  it('adds declared cassette design outputs without a queue heuristic', async () => {
    const queue = queueFixture();
    mocks.findById.mockResolvedValue(queue);

    const result = await appendGeneratedCassetteDesignOutputs('queue-1', [
      { entityType: 'cassette_design', id: 'design-1' },
      { entityType: 'sheet_design', id: 'sheet-1' }
    ], auth);

    expect(result.data.job.items).toEqual([
      expect.objectContaining({ id: 'design-1', entityType: 'cassette_design', quantity: 1 })
    ]);
  });

  it('selects only a successful nesting revision through the nesting Status region', async () => {
    mocks.findById.mockResolvedValue(queueFixture());
    mocks.revisionGetById.mockResolvedValue({
      _id: 'revision-1',
      data: { entityType: 'queue', entityId: 'queue-1', scope: 'nesting', outcome: 'SUCCESS' }
    });

    await selectNestingRevision('queue-1', 'revision-1', auth);

    expect(mocks.applyIntent).toHaveBeenCalledWith(
      'queue',
      'queue-1',
      'selectNestingRevision',
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        region: 'nesting',
        lifecycle: { data: { selectedRevisionId: 'revision-1' } }
      })
    );
  });

  it('rejects failed revisions', async () => {
    mocks.findById.mockResolvedValue(queueFixture());
    mocks.revisionGetById.mockResolvedValue({
      _id: 'revision-1',
      data: { entityType: 'queue', entityId: 'queue-1', scope: 'nesting', outcome: 'FAILURE' }
    });

    await expect(selectNestingRevision('queue-1', 'revision-1', auth)).rejects.toThrow(/successful nesting revision/);
  });

  it('keeps project previews revision-scoped instead of publishing stale sheet totals', async () => {
    mocks.find.mockResolvedValue([queueFixture({
      lineage: {
        organization: { entityType: 'organization', entityId: 'org-1' },
        project: { entityType: 'project', entityId: 'project-1' }
      },
      summary: { revisionCount: 2, sheetCount: 9, totalArea: 42 }
    })]);

    const previews = await listPreviewByProjects(['project-1'], auth.userId, auth.organizationId, auth.role, auth);

    expect(previews['project-1'][0].summary).toMatchObject({ revisionCount: 2 });
    expect(previews['project-1'][0].summary).not.toHaveProperty('sheetCount');
    expect(previews['project-1'][0]).not.toHaveProperty('totalArea');
  });
});
