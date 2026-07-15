import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findDesign: vi.fn(),
  findQueue: vi.fn(),
  findSheet: vi.fn(),
  syncParentSummary: vi.fn(() => Promise.resolve())
}));

vi.mock('./repository.js', () => ({
  create: mocks.create,
  findById: vi.fn(),
  find: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn()
}));
vi.mock('../cassette-designs/repository.js', () => ({ findById: mocks.findDesign }));
vi.mock('../queues/repository.js', () => ({ findById: mocks.findQueue }));
vi.mock('../sheets/repository.js', () => ({ findById: mocks.findSheet }));
vi.mock('../../core/machines/aggregator.js', () => ({
  aggregator: { syncParentSummary: mocks.syncParentSummary }
}));

import { create } from './service.js';

const ref = (entityType, entityId, revisionId = undefined) => ({
  entityType,
  entityId,
  ...(revisionId ? { revisionId } : {})
});

describe('cassette instance creation', () => {
  const auth = {
    memberships: [{
      organizationId: 'org-1',
      permissions: { projects: 'write' }
    }]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDesign.mockResolvedValue({
      _id: 'design-1',
      identity: { uid: 'design-1', name: 'Facade panel' },
      lineage: { organization: ref('organization', 'org-1') }
    });
    mocks.findQueue.mockResolvedValue({
      _id: 'queue-1',
      identity: { uid: 'queue-1', name: 'Queue' },
      lineage: {
        organization: ref('organization', 'org-1'),
        project: ref('project', 'project-1')
      }
    });
    mocks.create.mockImplementation(async value => value);
  });

  it('persists the queue parent and cassette design as structured lineage references', async () => {
    const instance = await create({
      cassetteDesignId: 'design-1',
      queueId: 'queue-1',
      queueRevisionId: 'revision-2'
    }, 'user-1', 'org-1', null, auth);

    expect(instance.lineage).toEqual(expect.objectContaining({
      organization: ref('organization', 'org-1'),
      project: ref('project', 'project-1'),
      queue: ref('queue', 'queue-1', 'revision-2'),
      cassetteDesign: ref('cassette_design', 'design-1')
    }));
    expect(instance.data).toEqual({ source: 'PROCESS' });
    expect(instance.data).not.toHaveProperty('cassetteDesignId');
    expect(mocks.syncParentSummary).toHaveBeenCalledWith('cassette_instance', expect.anything());
  });

  it('rejects creation when the cassette design does not exist', async () => {
    mocks.findDesign.mockResolvedValueOnce(null);
    await expect(create({ cassetteDesignId: 'missing' }, 'user-1', 'org-1', null, auth))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
