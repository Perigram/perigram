import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';

const repository = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  updateById: vi.fn(),
  deleteById: vi.fn(),
  upsertSystemDefault: vi.fn()
}));

vi.mock('./repository.js', () => repository);
vi.mock('h3', () => ({
  createError: ({ statusCode, message }) => Object.assign(new Error(message), { statusCode })
}));

import {
  SYSTEM_DEFAULT_MACHINE_ID,
  create,
  getById,
  list,
  remove,
  update
} from './service.js';

function authFor(organizationId, level = 'admin') {
  return {
    userId: 'user-1',
    organizationId,
    role: 'member',
    memberships: [{ organizationId, permissions: { machines: level } }]
  };
}

function organizationMachine(organizationId, overrides = {}) {
  return {
    _id: 'machine-org-1',
    identity: { uid: 'machine-org-1', name: 'Router' },
    lineage: { organizationId },
    data: {
      workingArea: { width: 2500, length: 1300 },
      boundaryOffset: 10,
      description: '',
      ...(overrides.data || {})
    },
    ...overrides
  };
}

describe('machine service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.upsertSystemDefault.mockImplementation(async document => document);
    repository.find.mockResolvedValue([]);
    repository.create.mockImplementation(async document => ({
      ...document,
      _id: document.identity.uid
    }));
    repository.updateById.mockImplementation(async (id, patch) => ({
      _id: id,
      lineage: { organizationId: new ObjectId() },
      ...patch
    }));
    repository.deleteById.mockResolvedValue({ deletedCount: 1 });
  });

  it('seeds and exposes the immutable public 3000 x 1500 default', async () => {
    const orgId = new ObjectId();
    repository.find.mockImplementation(async () => [await repository.upsertSystemDefault.mock.results[0].value]);

    const machines = await list('user-1', orgId, 'member', authFor(orgId, 'none'));

    expect(repository.upsertSystemDefault).toHaveBeenCalledOnce();
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ $or: expect.any(Array) }));
    expect(machines).toHaveLength(1);
    expect(machines[0]).toMatchObject({
      _id: SYSTEM_DEFAULT_MACHINE_ID,
      lineage: { scope: 'system', public: true },
      data: {
        workingArea: { width: 3000, length: 1500 },
        boundaryOffset: 0
      }
    });
  });

  it('creates a validated organization-owned machine for a writer', async () => {
    const orgId = new ObjectId();
    const auth = authFor(orgId, 'write');

    const machine = await create({
      name: 'Mill A',
      workingArea: { width: 2400, length: 1200 },
      boundaryOffset: 12
    }, auth.userId, orgId, auth.role, auth);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      identity: expect.objectContaining({ name: 'Mill A' }),
      lineage: { organizationId: orgId },
      data: expect.objectContaining({
        workingArea: { width: 2400, length: 1200 },
        boundaryOffset: 12
      })
    }));
    expect(machine.data.workingArea).toEqual({ width: 2400, length: 1200 });
  });

  it('rejects invalid working areas and boundary offsets before persistence', async () => {
    const orgId = new ObjectId();
    const auth = authFor(orgId, 'write');

    await expect(create({
      name: 'Invalid',
      workingArea: { width: 100, length: 80 },
      boundaryOffset: 40
    }, auth.userId, orgId, auth.role, auth)).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('denies organization machines outside the caller membership', async () => {
    const owningOrgId = new ObjectId();
    const otherOrgId = new ObjectId();
    repository.findById.mockResolvedValue(organizationMachine(owningOrgId));

    await expect(getById('machine-org-1', 'user-1', otherOrgId, 'member', authFor(otherOrgId)))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('updates only validated identity and data fields', async () => {
    const orgId = new ObjectId();
    const current = organizationMachine(orgId);
    repository.findById.mockResolvedValue(current);
    repository.updateById.mockImplementation(async (id, patch) => ({ ...current, _id: id, ...patch }));
    const auth = authFor(orgId, 'write');

    const machine = await update('machine-org-1', {
      name: 'Router B',
      data: { boundaryOffset: 15 }
    }, auth.userId, orgId, auth.role, auth);

    expect(repository.updateById).toHaveBeenCalledWith('machine-org-1', {
      identity: { uid: 'machine-org-1', name: 'Router B' },
      data: {
        workingArea: { width: 2500, length: 1300 },
        boundaryOffset: 15,
        description: ''
      }
    });
    expect(machine.data.boundaryOffset).toBe(15);
  });

  it('never permits modification or deletion of the system default', async () => {
    repository.findById.mockResolvedValue({
      _id: SYSTEM_DEFAULT_MACHINE_ID,
      identity: { uid: SYSTEM_DEFAULT_MACHINE_ID, name: 'Default' },
      lineage: { scope: 'system', public: true },
      data: { workingArea: { width: 3000, length: 1500 }, boundaryOffset: 0 }
    });
    const orgId = new ObjectId();
    const auth = authFor(orgId);

    await expect(update(SYSTEM_DEFAULT_MACHINE_ID, { boundaryOffset: 1 }, auth.userId, orgId, auth.role, auth))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(remove(SYSTEM_DEFAULT_MACHINE_ID, auth.userId, orgId, auth.role, auth))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(repository.updateById).not.toHaveBeenCalled();
    expect(repository.deleteById).not.toHaveBeenCalled();
  });
});
