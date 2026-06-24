import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, assignUserToActiveProcessInternal, executeActiveProcessAction, hasProcessDefinitionMembershipAccess } from './service.js';
import * as processRepository from './repository.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import * as cassetteService from '~/server/features/cassettes/service.js';
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

vi.mock('~/server/features/cassettes/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createDesignFromTemplate: vi.fn(),
  createDefaultOccsTemplate: vi.fn(),
  findDefaultConstructableTemplate: vi.fn()
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

    const result = await executeActiveProcessAction({
      actionId: 'create_project',
      data: {
        identity: { name: 'Created project' },
        data: { metadata: { priority: 'high' } }
      }
    }, {
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
      {
        identity: { name: 'Created project' },
        data: { metadata: { priority: 'high' } },
        name: 'Created project',
        metadata: { priority: 'high' }
      },
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

  it('executes typed cassette design construction with canonical identity payloads', async () => {
    cassetteService.createDesignFromTemplate.mockResolvedValueOnce({
      _id: 'design-created',
      identity: { uid: 'design-created', name: 'Facade A' },
      lineage: { organizationId: 'org-1', templateId: 'cassette-template-1' },
      status: { state: { primary: 'DRAFT' } },
      data: { geometry: { dxfId: 'dxf-1' } }
    });
    statusService.setInitialStateForOrganization.mockResolvedValueOnce({
      state: { primary: 'REVIEW', active: { main: 'REVIEW' } }
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
            create_design: {
              id: 'create_design',
              actionKind: 'createEntity',
              entityType: 'cassette_design',
              construction: { mode: 'bakeCassetteDesignFromTemplate' },
              status: { to: 'REVIEW' },
              access: { level: 'admin', roleIds: ['role_designer'] }
            }
          }
        }
      }
    });

    const result = await executeActiveProcessAction({
      actionId: 'create_design',
      data: {
        identity: { name: 'Facade A' },
        templateId: 'cassette-template-1',
        parameters: { width: 1200 }
      }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'create_design' }]
      }
    });

    expect(cassetteService.createDesignFromTemplate).toHaveBeenCalledWith(
      'cassette-template-1',
      { width: 1200 },
      'user-1',
      'org-1',
      undefined,
      expect.any(Object),
      { name: 'Facade A' }
    );
    expect(cassetteService.createDesignFromTemplate.mock.calls[0][5]).toEqual(expect.objectContaining({
      effectivePermissions: expect.objectContaining({
        cassette_designs: expect.arrayContaining([
          expect.objectContaining({ level: 'admin', actions: { create: true } })
        ]),
        cassettes: expect.arrayContaining([
          expect.objectContaining({ level: 'write', actions: { view: true, update: true } })
        ])
      })
    }));
    expect(statusService.setInitialStateForOrganization).toHaveBeenCalledWith(
      'cassette_design',
      'design-created',
      'REVIEW',
      'org-1',
      'user-1',
      expect.any(Object)
    );
    expect(result.status.state.primary).toBe('REVIEW');
  });

  it('uses the default constructable cassette template when process input omits template id', async () => {
    cassetteService.findDefaultConstructableTemplate.mockResolvedValueOnce({
      _id: 'default-template',
      identity: { uid: 'default-template', name: 'Default OCCS' },
      data: { type: 'PARAMETRIC' }
    });
    cassetteService.createDesignFromTemplate.mockResolvedValueOnce({
      _id: 'design-created',
      identity: { uid: 'design-created', name: 'Facade B' },
      lineage: { organizationId: 'org-1', templateId: 'default-template' },
      status: { state: { primary: 'DRAFT' } },
      data: { geometry: { dxfId: 'dxf-1' } }
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
            create_design: {
              id: 'create_design',
              actionKind: 'createEntity',
              entityType: 'cassette_design',
              construction: { mode: 'bakeCassetteDesignFromTemplate' },
              access: { level: 'admin', roleIds: ['role_designer'] }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({
      actionId: 'create_design',
      data: { identity: { name: 'Facade B' } }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'create_design' }]
      }
    });

    expect(cassetteService.findDefaultConstructableTemplate).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      undefined,
      expect.any(Object)
    );
    expect(cassetteService.findDefaultConstructableTemplate.mock.calls[0][3]).toEqual(expect.objectContaining({
      effectivePermissions: expect.objectContaining({
        cassettes: expect.arrayContaining([
          expect.objectContaining({ level: 'write', actions: { view: true, update: true } })
        ])
      })
    }));
    expect(cassetteService.createDesignFromTemplate).toHaveBeenCalledWith(
      'default-template',
      {},
      'user-1',
      'org-1',
      undefined,
      expect.any(Object),
      { name: 'Facade B' }
    );
  });

  it('creates cassette templates through the typed OCCS template constructor', async () => {
    cassetteService.createDefaultOccsTemplate.mockResolvedValueOnce({
      _id: 'template-created',
      identity: { uid: 'template-created', name: 'Facade Template' },
      lineage: { organizationId: 'org-1' },
      status: { state: { primary: 'DRAFT' } },
      data: { type: 'PARAMETRIC', definition: { occs: '0.4-draft', extensions: { cutkit: { graphTree: {} } } } }
    });
    statusService.setInitialStateForOrganization.mockResolvedValueOnce({
      state: { primary: 'ACTIVE', active: { main: 'ACTIVE' } }
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
            create_template: {
              id: 'create_template',
              actionKind: 'createEntity',
              entityType: 'cassette',
              construction: { mode: 'createDefaultOccsTemplate' },
              status: { to: 'ACTIVE' },
              access: { level: 'admin', roleIds: ['role_designer'] }
            }
          }
        }
      }
    });

    const result = await executeActiveProcessAction({
      actionId: 'create_template',
      data: { name: 'Facade Template' }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'create_template' }]
      }
    });

    expect(cassetteService.createDefaultOccsTemplate).toHaveBeenCalledWith(
      { name: 'Facade Template' },
      'user-1',
      'org-1',
      undefined,
      expect.any(Object)
    );
    expect(statusService.setInitialStateForOrganization).toHaveBeenCalledWith(
      'cassette',
      'template-created',
      'ACTIVE',
      'org-1',
      'user-1',
      expect.any(Object)
    );
    expect(result.status.state.primary).toBe('ACTIVE');
  });

  it('derives create parent ids from graph entity inputs', async () => {
    const create = vi.fn(async () => ({
      toJSON: () => ({
        _id: 'queue-created',
        identity: { uid: 'queue-created', name: 'Queue A' },
        lineage: { organizationId: 'org-1', projectId: 'project-1' },
        status: { state: { primary: 'DRAFT' } }
      })
    }));
    getAppRegistry.mockReturnValueOnce({
      getDomain: () => ({ fieldAccess: { queue: { feature: 'queues' } }, entities: [{ type: 'queue', collection: 'queues' }] }),
      getEntityService: () => ({ create })
    });
    statusService.setInitialStateForOrganization.mockResolvedValueOnce({
      state: { primary: 'READY', active: { main: 'READY' } }
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
            create_queue: {
              id: 'create_queue',
              actionKind: 'createEntity',
              entityType: 'queue',
              parentEntityType: 'project',
              status: { to: 'READY' },
              access: { level: 'write', roleIds: ['role_planner'] }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({
      actionId: 'create_queue',
      entities: { project: 'project-1' },
      data: { name: 'Queue A' }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'create_queue' }]
      }
    });

    expect(create).toHaveBeenCalledWith(
      { name: 'Queue A', projectId: 'project-1' },
      'user-1',
      'org-1',
      undefined,
      expect.any(Object)
    );
  });
});
