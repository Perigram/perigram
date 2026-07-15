import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, assignUserToActiveProcessInternal, executeActiveProcessAction, hasProcessDefinitionMembershipAccess } from './service.js';
import * as processRepository from './repository.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import * as cassetteService from '~/server/features/cassettes/service.js';
import * as queuesService from '~/server/features/queues/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { statusService } from '~/server/core/machines/service.js';
import { executeCommand } from '~/server/core/commands/service.js';

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

vi.mock('~/server/features/queues/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  appendGeneratedCassetteDesignOutputs: vi.fn()
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

vi.mock('~/server/core/commands/service.js', () => ({
  executeCommand: vi.fn()
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
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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
        lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
      status: { state: 'ACTIVE' },
      data: {
        actions: {},
        compiled: {
          actions: {
            create_project: {
              id: 'create_project',
              actionKind: 'createEntity',
              entityType: 'project',
              status: { to: 'NEW', label: 'New', severity: 'success', color: 'success', icon: 'pi pi-check-circle' },
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
      expect.objectContaining({
        note: 'Created by process action create_project',
        display: {
          label: 'New',
          color: 'success',
          severity: 'success',
          icon: 'pi pi-check-circle'
        }
      })
    );
    expect(result.status.state.primary).toBe('NEW');
  });

  it('passes process status display metadata to status-change transitions', async () => {
    statusService.transitionWithResult.mockResolvedValueOnce({
      status: {
        state: { primary: 'DELETED', active: { main: 'DELETED' } },
        metadata: {
          display: { label: 'Deleted', severity: 'danger', color: 'danger', icon: 'pi pi-trash' }
        }
      }
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
      status: { state: 'ACTIVE' },
      data: {
        statusDefinitions: {
          status_deleted: {
            id: 'status_deleted',
            statusId: 'DELETED',
            label: 'Deleted',
            severity: 'danger',
            color: 'danger',
            icon: 'pi pi-trash'
          }
        },
        compiled: {
          actions: {
            delete_project: {
              id: 'delete_project',
              actionKind: 'mutateEntity',
              entityType: 'project',
              statusRef: 'status_deleted',
              status: { to: 'DELETED' },
              access: { level: 'admin', roleIds: ['role_creator'], statusTo: 'DELETED' }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({
      actionId: 'delete_project',
      entityId: 'project-1'
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'delete_project' }]
      }
    });

    expect(statusService.transitionWithResult).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'project',
      targetId: 'project-1',
      targetState: 'DELETED',
      context: {
        display: {
          label: 'Deleted',
          color: 'danger',
          severity: 'danger',
          icon: 'pi pi-trash'
        }
      }
    }));
  });

  it('executes synchronous run-command actions with action-scoped command access and output status projection', async () => {
    executeCommand.mockResolvedValueOnce({
      entities: [{ type: 'sheet_design', id: 'sheet-design-1' }],
      data: { sheetDesignId: 'sheet-design-1' }
    });
    getAppRegistry.mockReturnValueOnce({
      getCommandDefinition: () => ({
        access: {
          executionGrants: [
            { feature: 'cassettes', level: 'read', actions: { view: true } },
            { feature: 'cassette_designs', level: 'read', actions: { view: true } }
          ]
        }
      })
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
      status: { state: 'ACTIVE' },
      data: {
        actions: {
          run_nesting: {
            id: 'run_nesting',
            actionKind: 'runCommand',
            commandId: 'solveNesting'
          },
          mark_cut: {
            id: 'mark_cut',
            actionKind: 'mutateEntity',
            inputs: [{ id: 'entity', entityType: 'sheet_design' }],
            status: { to: 'CUT' }
          }
        },
        graph: {
          nodes: [],
          edges: [
            { source: 'run_nesting', target: 'mark_cut', sourceHandle: 'output:sheet_design', targetHandle: 'input:entity' }
          ]
        },
        compiled: {
          actions: {
            run_nesting: {
              id: 'run_nesting',
              actionKind: 'runCommand',
              commandId: 'solveNesting',
              entityType: 'queue',
              access: { level: 'write', roleIds: ['role_operator'] }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({
      actionId: 'run_nesting',
      entities: { queue: 'queue-1' },
      parameters: { materialMode: 'VIRTUAL', virtualWidth: 3000 }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: {
        queues: [{
          level: 'read',
          rule: { fact: 'primaryStatus', equals: 'SENT' }
        }]
      },
      roleAssignments: {
        actions: [{ actionId: 'run_nesting' }]
      }
    });

    expect(executeCommand).toHaveBeenCalledWith(
      'solveNesting',
      {
        entities: { queue: 'queue-1' },
        parameters: { materialMode: 'VIRTUAL', virtualWidth: 3000 }
      },
      expect.objectContaining({
        effectivePermissions: expect.objectContaining({
          queues: expect.arrayContaining([
            expect.objectContaining({ level: 'write', actions: { run: true } })
          ]),
          cassettes: expect.arrayContaining([
            expect.objectContaining({ level: 'read', actions: { view: true } })
          ]),
          cassette_designs: expect.arrayContaining([
            expect.objectContaining({ level: 'read', actions: { view: true } })
          ])
        })
      })
    );
    expect(statusService.setInitialStateForOrganization).toHaveBeenCalledWith(
      'sheet_design',
      'sheet-design-1',
      'CUT',
      'org-1',
      'user-1',
      expect.any(Object)
    );
  });

  it('does not project process output status before async command tasks finish', async () => {
    executeCommand.mockResolvedValueOnce({
      entities: [{ type: 'sheet_design', id: 'sheet-design-1' }],
      jobs: [{ type: 'task_run', id: 'task-1' }],
      data: { sheetDesignId: 'sheet-design-1', taskRunId: 'task-1' }
    });
    getAppRegistry.mockReturnValueOnce({
      getCommandDefinition: () => ({ access: { executionGrants: [] } })
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
      status: { state: 'ACTIVE' },
      data: {
        actions: {
          run_nesting: {
            id: 'run_nesting',
            actionKind: 'runCommand',
            commandId: 'solveNesting'
          },
          mark_cut: {
            id: 'mark_cut',
            actionKind: 'mutateEntity',
            inputs: [{ id: 'entity', entityType: 'sheet_design' }],
            status: { to: 'CUT' }
          }
        },
        graph: {
          nodes: [],
          edges: [
            { source: 'run_nesting', target: 'mark_cut', sourceHandle: 'output:sheet_design', targetHandle: 'input:entity' }
          ]
        },
        compiled: {
          actions: {
            run_nesting: {
              id: 'run_nesting',
              actionKind: 'runCommand',
              commandId: 'solveNesting',
              entityType: 'queue',
              access: { level: 'write', roleIds: ['role_operator'] }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({
      actionId: 'run_nesting',
      entities: { queue: 'queue-1' }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'run_nesting' }]
      }
    });

    expect(statusService.setInitialStateForOrganization).not.toHaveBeenCalled();
  });

  it('executes typed cassette design construction with canonical identity payloads', async () => {
    cassetteService.createDesignFromTemplate.mockResolvedValueOnce({
      _id: 'design-created',
      identity: { uid: 'design-created', name: 'Facade A' },
      lineage: {
        organization: { entityType: 'organization', entityId: 'org-1' },
        cassette: { entityType: 'cassette', entityId: 'cassette-template-1' }
      },
      status: { state: { primary: 'DRAFT' } },
      data: { geometry: { dxfId: 'dxf-1' } }
    });
    statusService.setInitialStateForOrganization.mockResolvedValueOnce({
      state: { primary: 'REVIEW', active: { main: 'REVIEW' } }
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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

  it('executes cassette design construction from the selected parent cassette', async () => {
    cassetteService.createDesignFromTemplate.mockResolvedValueOnce({
      _id: 'design-from-parent',
      identity: { uid: 'design-from-parent', name: 'Parent based' },
      lineage: {
        organization: { entityType: 'organization', entityId: 'org-1' },
        cassette: { entityType: 'cassette', entityId: 'cassette-parent-1' }
      },
      status: { state: { primary: 'DRAFT' } },
      data: { geometry: { dxfId: 'dxf-1' } }
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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
              status: {},
              access: { level: 'admin', roleIds: ['role_designer'] }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({
      actionId: 'create_design',
      entities: { cassette: 'cassette-parent-1' },
      data: {
        name: 'Parent based',
        parameters: { A: 500 }
      }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'create_design' }]
      }
    });

    expect(cassetteService.createDesignFromTemplate).toHaveBeenCalledWith(
      'cassette-parent-1',
      { A: 500 },
      'user-1',
      'org-1',
      undefined,
      expect.any(Object),
      { name: 'Parent based' }
    );
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
      lineage: {
        organization: { entityType: 'organization', entityId: 'org-1' },
        cassette: { entityType: 'cassette', entityId: 'default-template' }
      },
      status: { state: { primary: 'DRAFT' } },
      data: { geometry: { dxfId: 'dxf-1' } }
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
      status: { state: { primary: 'DRAFT' } },
      data: { type: 'PARAMETRIC', definition: { occs: '0.4-draft', extensions: { cutkit: { graphTree: {} } } } }
    });
    statusService.setInitialStateForOrganization.mockResolvedValueOnce({
      state: { primary: 'ACTIVE', active: { main: 'ACTIVE' } }
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
      status: { state: 'ACTIVE' },
      data: {
        actions: {},
        compiled: {
          actions: {
            create_template: {
              id: 'create_template',
              actionKind: 'createEntity',
              entityType: 'cassette',
              parentEntityType: 'library',
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
      data: { name: 'Facade Template' },
      entities: { library: 'library-1' }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'create_template' }]
      }
    });

    expect(cassetteService.createDefaultOccsTemplate).toHaveBeenCalledWith(
      { name: 'Facade Template', libraryId: 'library-1' },
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

  it('rejects parent-bound create actions without the required parent entity', async () => {
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
      status: { state: 'ACTIVE' },
      data: {
        actions: {},
        compiled: {
          actions: {
            create_template: {
              id: 'create_template',
              actionKind: 'createEntity',
              entityType: 'cassette',
              parentEntityType: 'library',
              construction: { mode: 'createDefaultOccsTemplate' },
              access: { level: 'admin', roleIds: ['role_designer'] }
            }
          }
        }
      }
    });

    await expect(executeActiveProcessAction({
      actionId: 'create_template',
      data: { name: 'Facade Template' }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'create_template' }]
      }
    })).rejects.toThrow(/library parent is required/);

    expect(cassetteService.createDefaultOccsTemplate).not.toHaveBeenCalled();
  });

  it('derives create parent ids from graph entity inputs', async () => {
    const create = vi.fn(async () => ({
      toJSON: () => ({
        _id: 'queue-created',
        identity: { uid: 'queue-created', name: 'Queue A' },
        lineage: {
          organization: { entityType: 'organization', entityId: 'org-1' },
          project: { entityType: 'project', entityId: 'project-1' }
        },
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
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
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

  it('binds declared cassette-design outputs only from their compiled queue region', async () => {
    const process = {
      _id: 'process-queue-producer',
      identity: { uid: 'process-queue-producer', name: 'Queue producers' },
      lineage: { organization: { entityType: 'organization', entityId: 'org-1' } },
      status: { state: 'ACTIVE' },
      data: {
        actions: {},
        compiled: {
          actions: {
            add_from_library: {
              id: 'add_from_library',
              actionKind: 'runCommand',
              commandId: 'copyCassetteFromLibrary',
              entityType: 'queue',
              outputs: [{ id: 'design', entityType: 'cassette_design' }],
              access: { level: 'write', roleIds: ['role_designer'] }
            }
          },
          userAccess: {
            'user-1': {
              screens: [{
                screenKey: 'queue-detail',
                template: 'entityDetail',
                sources: [{ id: 'queue', entityType: 'queue', mode: 'single' }],
                regions: [{ id: 'queue-producers', sourceId: 'queue', actions: ['add_from_library'] }]
              }]
            }
          }
        }
      }
    };
    processRepository.findActiveByOrganization.mockResolvedValue(process);
    getAppRegistry.mockReturnValue({ getCommandDefinition: () => ({ access: {} }) });
    executeCommand.mockResolvedValue({ entities: [{ entityType: 'cassette_design', id: 'design-1' }] });
    queuesService.appendGeneratedCassetteDesignOutputs.mockResolvedValue({ _id: 'queue-1' });
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: { actions: [{ actionId: 'add_from_library' }] }
    };

    await executeActiveProcessAction({
      actionId: 'add_from_library',
      entityId: 'queue-1',
      context: { screenKey: 'queue-detail', regionId: 'queue-producers' }
    }, auth);

    expect(queuesService.appendGeneratedCassetteDesignOutputs).toHaveBeenCalledWith(
      'queue-1',
      [{ entityType: 'cassette_design', id: 'design-1' }],
      auth
    );

    await expect(executeActiveProcessAction({
      actionId: 'add_from_library',
      entityId: 'queue-1',
      context: { screenKey: 'queue-detail', regionId: 'unplaced-region' }
    }, auth)).rejects.toMatchObject({ statusCode: 403 });
    expect(queuesService.appendGeneratedCassetteDesignOutputs).toHaveBeenCalledTimes(1);
  });
});
