import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => {
  let stored = null;
  return {
    reset() { stored = null; },
    create: vi.fn(async data => {
      stored = { _id: 'artifact-created', ...data };
      return stored;
    }),
    findById: vi.fn(async () => stored),
    updateById: vi.fn(async (_id, updates) => {
      stored = { ...stored, ...updates };
      return stored;
    })
  };
});

const initialStatusForOrganization = vi.hoisted(() => vi.fn(async () => ({ state: 'NEW' })));

vi.mock('./repository.js', () => repository);
vi.mock('../../core/machines/service.js', () => ({
  statusService: {
    initialStatusForOrganization,
    applyIntent: vi.fn()
  },
  createTransitionAuth: vi.fn()
}));

import { create } from './service.js';

describe('artifact service', () => {
  beforeEach(() => {
    repository.reset();
    vi.clearAllMocks();
  });

  it('authorizes creation against the process-resolved initial status', async () => {
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        artifacts: [{
          level: 'write',
          rule: { fact: 'primaryStatus', equals: 'NEW' }
        }]
      },
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    };

    const artifact = await create({ name: 'Source DXF', type: 'DXF_SOURCE' }, 'user-1', 'org-1', null, auth);

    expect(initialStatusForOrganization).toHaveBeenCalledWith(
      'artifact',
      'org-1',
      'user-1',
      { note: 'Artifact record created' }
    );
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      lineage: { organizationId: 'org-1' },
      status: { state: 'NEW' }
    }));
    expect(artifact).toMatchObject({
      lineage: { organizationId: 'org-1' },
      status: { state: { primary: 'NEW' } }
    });
  });

  it('still rejects a status-scoped grant for a different initial state', async () => {
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        artifacts: [{
          level: 'write',
          rule: { fact: 'primaryStatus', equals: 'READY' }
        }]
      },
      memberships: [{ organizationId: 'org-1', permissions: {} }]
    };

    await expect(create({ name: 'Source DXF', type: 'DXF_SOURCE' }, 'user-1', 'org-1', null, auth))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
