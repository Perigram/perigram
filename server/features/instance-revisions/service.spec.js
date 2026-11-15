import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureIndexes: vi.fn(),
  findByHash: vi.fn(),
  findLatest: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  deleteForSource: vi.fn(),
  resolveActiveWorkflow: vi.fn(),
  initialStatusForOrganization: vi.fn()
}));

vi.mock('./repository.js', () => ({
  ensureIndexes: mocks.ensureIndexes,
  findByHash: mocks.findByHash,
  findLatest: mocks.findLatest,
  create: mocks.create,
  findById: mocks.findById,
  find: mocks.find,
  deleteForSource: mocks.deleteForSource
}));
vi.mock('../workflow-overrides/service.js', () => ({
  resolveActiveWorkflow: mocks.resolveActiveWorkflow
}));
vi.mock('../../core/machines/service.js', () => ({
  stateService: {
    initialStatusForOrganization: mocks.initialStatusForOrganization
  }
}));
vi.mock('h3', () => ({
  createError: vi.fn(details => Object.assign(new Error(details.message), details))
}));

import { ensureForEntitySnapshot, getById, list } from './service.js';

describe('entity revision organization scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureIndexes.mockResolvedValue(undefined);
    mocks.findByHash.mockResolvedValue(null);
    mocks.findLatest.mockResolvedValue(null);
    mocks.create.mockResolvedValue(null);
    mocks.findById.mockResolvedValue(null);
    mocks.find.mockResolvedValue([]);
    mocks.resolveActiveWorkflow.mockResolvedValue(null);
  });

  it('copies top-level source organization ownership into revision lineage', async () => {
    const organizationId = '507f1f77bcf86cd799439012';
    const instanceId = '507f1f77bcf86cd799439011';

    await ensureForEntitySnapshot({
      typeId: 'project',
      entity: {
        _id: instanceId,
        organizationId,
        lineage: {},
        name: 'Project'
      },
      content: { fields: { name: 'Project' } }
    });

    const [revision] = mocks.create.mock.calls[0];
    expect(revision.lineage.organizationId.toString()).toBe(organizationId);
    expect(revision.lineage.projectId.toString()).toBe(instanceId);
  });

  it('denies direct reads when top-level or origin ownership belongs to another org', async () => {
    for (const revision of [
      { _id: 'rev-1', organizationId: 'org-2', lineage: {} },
      { _id: 'rev-2', origin: { organizationId: 'org-2' }, lineage: {} }
    ]) {
      mocks.findById.mockResolvedValueOnce(revision);
      await expect(getById(revision._id, 'user-1', null, { organizationId: 'org-1' }))
        .rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it('lists active-org, legacy owner-slot, and genuinely unowned system revisions', async () => {
    await list('user-1', 'org-1', null, { organizationId: 'org-1' });

    const filter = mocks.find.mock.calls[0][0];
    expect(filter.$or).toEqual(expect.arrayContaining([
      { 'lineage.organizationId': expect.objectContaining({ $in: expect.any(Array) }) },
      { organizationId: expect.objectContaining({ $in: expect.any(Array) }) },
      { 'origin.organizationId': expect.objectContaining({ $in: expect.any(Array) }) },
      {
        $and: [
          { 'lineage.organizationId': null },
          { organizationId: null },
          { 'origin.organizationId': null }
        ]
      }
    ]));
  });
});
