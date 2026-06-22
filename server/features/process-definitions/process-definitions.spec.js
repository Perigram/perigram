import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, assignUserToActiveProcessInternal, executeActiveProcessAction, hasProcessDefinitionMembershipAccess } from './service.js';
import * as processRepository from './repository.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { statusService } from '~/server/core/machines/service.js';

vi.mock('./repository.js', () => ({
  find: vi.fn(),
  findById: vi.fn(),
  findActiveByOrganization: vi.fn(),
  create: vi.fn(),
  updateById: vi.fn(),
  archiveActiveByOrganization: vi.fn()
}));

vi.mock('~/server/features/organizations/repository.js', () => ({
  findById: vi.fn(),
  updateById: vi.fn()
}));

vi.mock('~/server/runtime/app-registry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getAppRegistry: vi.fn()
}));

vi.mock('~/server/core/machines/service.js', () => ({
  statusService: {
    setInitialStateForOrganization: vi.fn(),
    transitionWithResult: vi.fn()
  }
}));

describe('process definitions access fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not treat membership role labels as process-definition grants', async () => {
    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'creator',
      memberships: [{
        organizationId: 'org-1',
        role: 'role_admin',
        permissions: {},
        status: 'active'
      }]
    }, 'org-1', 'admin')).toBe(false);
  });

  it('allows stored membership organization grants to recover process reads when process grants are missing', async () => {
    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'creator',
      effectivePermissions: {},
      memberships: [{
        organizationId: 'org-1',
        role: 'ContractorAdmin',
        permissions: { organizations: { level: 'write' } },
        status: 'active'
      }]
    }, 'org-1', 'read')).toBe(true);
  });

  it('does not treat sole active membership as process-definition access', async () => {
    expect(await hasProcessDefinitionMembershipAccess({
      userId: 'solo-user',
      memberships: [{ organizationId: 'org-1', role: 'IndividualUser', status: 'active' }]
    }, 'org-1', 'admin')).toBe(false);
  });

  it('does not allow ordinary members or other organizations through the fallback', async () => {
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

  it('keeps active team assignments when activating an edited process draft', async () => {
    const draft = {
      _id: 'process-draft',
      identity: { uid: 'process-draft', name: 'Draft process', slug: 'draft-process' },
      lineage: { organizationId: 'org-1' },
      status: {
        state: 'DRAFT',
        userId: 'creator',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        metadata: { note: 'Draft created' }
      },
      data: {
        schemaVersion: 1,
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        roles: { role_operator: { id: 'role_operator', label: 'Operator' } },
        assignments: {},
        entityProfiles: {},
        services: {},
        sockets: {},
        screens: {},
        compiled: null
      }
    };
    const active = {
      ...draft,
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      status: {
        state: 'ACTIVE',
        userId: 'creator',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        metadata: { note: 'Process activated' }
      },
      data: {
        ...draft.data,
        assignments: {
          'user-1': {
            userId: 'user-1',
            roleIds: ['role_operator'],
            status: 'active'
          }
        }
      }
    };

    processRepository.findById.mockResolvedValueOnce(draft);
    processRepository.findActiveByOrganization.mockResolvedValueOnce(active);
    processRepository.archiveActiveByOrganization.mockResolvedValueOnce({ modifiedCount: 1 });
    processRepository.updateById.mockImplementationOnce(async (id, process) => ({
      ...process.toJSON(),
      _id: id
    }));
    organizationsRepository.findById.mockResolvedValueOnce({ _id: 'org-1', data: {} });
    organizationsRepository.updateById.mockResolvedValueOnce({ _id: 'org-1' });

    const result = await activate('process-draft', {
      userId: 'admin',
      organizationId: 'org-1',
      effectivePermissions: { organizations: { level: 'admin' } }
    });

    expect(result.data.assignments['user-1']).toMatchObject({
      userId: 'user-1',
      roleIds: ['role_operator'],
      status: 'active'
    });
    expect(processRepository.updateById).toHaveBeenCalledWith('process-draft', expect.objectContaining({
      data: expect.objectContaining({
        assignments: expect.objectContaining({
          'user-1': expect.objectContaining({ roleIds: ['role_operator'] })
        })
      })
    }));
  });

  it('authorizes create actions as create operations before status-scoped entity access exists', async () => {
    const create = vi.fn(async () => ({
      toJSON: () => ({
        _id: 'project-created',
        identity: { uid: 'project-created', name: 'Created project' },
        lineage: { organizationId: 'org-1' },
        status: { state: { primary: 'DRAFT' } }
      })
    }));
    getAppRegistry.mockReturnValueOnce({
      getEntityService: () => ({ create })
    });
    statusService.setInitialStateForOrganization.mockResolvedValueOnce({
      state: { primary: 'NEW', active: { main: 'NEW' } }
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE' },
      data: {
        actions: {},
        compiled: {
          actions: {
            create_project: {
              id: 'create_project',
              actionKind: 'createEntity',
              entityType: 'project',
              status: { to: 'NEW' },
              access: { level: 'admin', roleIds: ['role_creator'] }
            }
          }
        }
      }
    });

    const result = await executeActiveProcessAction({ actionId: 'create_project', data: { name: 'Created project' } }, {
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        projects: [{ level: 'admin', rule: { fact: 'primaryStatus', equals: 'NEW' } }]
      },
      roleAssignments: {
        actions: [{ actionId: 'create_project' }]
      }
    });

    expect(create).toHaveBeenCalledWith(
      { name: 'Created project' },
      'user-1',
      'org-1',
      undefined,
      expect.objectContaining({
        effectivePermissions: expect.objectContaining({
          projects: expect.arrayContaining([
            expect.objectContaining({ level: 'admin', actions: { create: true } })
          ])
        })
      })
    );
    expect(statusService.setInitialStateForOrganization).toHaveBeenCalledWith(
      'project',
      'project-created',
      'NEW',
      'org-1',
      'user-1',
      expect.any(Object)
    );
    expect(result.status.state.primary).toBe('NEW');
  });
});
