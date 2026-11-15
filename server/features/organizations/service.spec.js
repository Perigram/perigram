import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findById, create, addMembership, hasPermission, createActiveEmptyProcess, ownerMembership } = vi.hoisted(() => ({
  findById: vi.fn(),
  create: vi.fn(),
  addMembership: vi.fn(),
  hasPermission: vi.fn(),
  createActiveEmptyProcess: vi.fn(),
  ownerMembership: vi.fn(() => ({ owner: true, status: 'active' }))
}));

vi.mock('./repository.js', () => ({ findById, create }));
vi.mock('../users/repository.js', () => ({ addMembership }));
vi.mock('../../utils/auth-helpers.js', () => ({
  hasPermission,
  resolveAuthPermissions: vi.fn(auth => auth.effectivePermissions || auth.permissions || {})
}));
vi.mock('../_template/process-update-handler.js', () => ({
  createProcessUpdateHandler: vi.fn(() => vi.fn())
}));
vi.mock('../process-definitions/service.js', () => ({ createActiveEmptyProcess }));
vi.mock('../invitations/service.js', () => ({}));
vi.mock('../users/organization-owner.js', () => ({ ownerMembership }));
vi.mock('h3', () => ({
  createError: vi.fn(details => Object.assign(new Error(details.message), details))
}));

import { create as createOrganization, getManagedById } from './service.js';

describe('organization detail access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findById.mockResolvedValue({
      _id: 'org-1',
      identity: { uid: 'org-one', name: 'Organization One' },
      data: {}
    });
    hasPermission.mockReturnValue(true);
  });

  it('writes the new owner membership through the users persistence owner', async () => {
    create.mockResolvedValue({
      _id: 'org-1',
      identity: { uid: 'org-one', name: 'Organization One' },
      data: {}
    });

    await createOrganization({ name: 'Organization One' }, {
      userId: 'user-1',
      memberships: []
    });

    expect(addMembership).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ owner: true, status: 'active' }),
      { activeOrganizationId: 'org-1' }
    );
    expect(createActiveEmptyProcess).toHaveBeenCalledWith({
      organizationId: 'org-1',
      actorId: 'user-1'
    });
  });

  it('rejects a detail read outside the active organization before repository access', async () => {
    await expect(getManagedById('org-2', {
      userId: 'user-1',
      organizationId: 'org-1',
      permissions: { organizations: 'admin' }
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(findById).not.toHaveBeenCalled();
  });

  it('requires the organization read grant', async () => {
    hasPermission.mockReturnValue(false);

    await expect(getManagedById('org-1', {
      userId: 'user-1',
      organizationId: 'org-1',
      permissions: { organizations: 'none' }
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(findById).not.toHaveBeenCalled();
  });

  it('loads the organization only after the active-tenant read gate passes', async () => {
    const organization = await getManagedById('org-1', {
      userId: 'user-1',
      organizationId: 'org-1',
      permissions: { organizations: 'read' }
    });

    expect(findById).toHaveBeenCalledWith('org-1');
    expect(organization.identity.name).toBe('Organization One');
    expect(hasPermission).toHaveBeenCalledWith(
      { permissions: { organizations: 'read' } },
      'organizations',
      'read'
    );
  });
});
