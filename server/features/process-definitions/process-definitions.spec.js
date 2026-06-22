import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignUserToActiveProcessInternal, hasProcessDefinitionMembershipAccess } from './service.js';
import * as processRepository from './repository.js';
import * as usersRepository from '~/server/features/users/repository.js';

vi.mock('./repository.js', () => ({
  find: vi.fn(),
  findById: vi.fn(),
  findActiveByOrganization: vi.fn(),
  create: vi.fn(),
  updateById: vi.fn(),
  archiveActiveByOrganization: vi.fn()
}));

vi.mock('~/server/features/users/repository.js', () => ({
  find: vi.fn()
}));

describe('process definitions access fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows organization admin membership to manage process definitions when process grants are missing', async () => {
    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'creator',
      memberships: [{
        organizationId: 'org-1',
        role: 'role_admin',
        permissions: {},
        status: 'active'
      }]
    }, 'org-1', 'admin')).toBe(true);
  });

  it('allows the sole active organization member to recover process management', async () => {
    usersRepository.find.mockResolvedValueOnce([{
      _id: 'solo-user',
      data: {
        memberships: [{ organizationId: 'org-1', role: 'IndividualUser', status: 'active' }]
      }
    }]);

    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'solo-user',
      memberships: [{ organizationId: 'org-1', role: 'IndividualUser', status: 'active' }]
    }, 'org-1', 'admin')).toBe(true);
  });

  it('does not allow ordinary members or other organizations through the fallback', async () => {
    usersRepository.find.mockResolvedValue([{
      _id: 'member',
      data: {
        memberships: [{ organizationId: 'org-1', role: 'role_viewer', status: 'active' }]
      }
    }, {
      _id: 'other',
      data: {
        memberships: [{ organizationId: 'org-1', role: 'role_viewer', status: 'active' }]
      }
    }]);
    const auth = {
      userId: 'member',
      memberships: [{
        organizationId: 'org-1',
        role: 'role_viewer',
        permissions: {},
        status: 'active'
      }]
    };

    expect(await hasProcessDefinitionMembershipAccess(auth, 'org-1', 'admin')).toBe(false);
    expect(await hasProcessDefinitionMembershipAccess(auth, 'org-2', 'admin')).toBe(false);
  });

  it('preserves process status serialization when assigning active process roles', async () => {
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-1',
      identity: { uid: 'process-1', name: 'Active process', slug: 'active-process' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: 'ACTIVE',
        userId: 'creator',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        metadata: { note: 'Process activated' }
      },
      data: {
        schemaVersion: 1,
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        roles: {
          role_operator: { id: 'role_operator', label: 'Operator' }
        },
        assignments: {},
        entityProfiles: {},
        services: {},
        sockets: {},
        screens: {},
        compiled: null
      }
    });
    processRepository.updateById.mockImplementationOnce(async (id, process) => ({
      ...process.toJSON(),
      _id: id
    }));

    const result = await assignUserToActiveProcessInternal({
      organizationId: 'org-1',
      userId: 'user-1',
      roleIds: ['role_operator'],
      actorId: 'admin'
    });

    expect(processRepository.updateById).toHaveBeenCalledWith('process-1', expect.any(Object));
    expect(result.status.state.primary).toBe('ACTIVE');
    expect(result.status.userId).toBe('admin');
    expect(result.status.metadata.note).toBe('Assigned process roles to user-1');
    expect(result.data.assignments['user-1']).toMatchObject({
      userId: 'user-1',
      roleIds: ['role_operator'],
      status: 'active'
    });
  });
});
