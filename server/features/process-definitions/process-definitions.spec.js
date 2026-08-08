import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, assignUserToActiveProcessInternal, authFromRun, executeActiveProcessAction, hasProcessDefinitionMembershipAccess, orchestrationActor, resolveProcessGraphEntity, update } from './service.js';
import * as processRepository from './repository.js';
import * as organizationsRepository from '~/server/features/organizations/repository.js';
import * as cassetteService from '~/server/features/cassettes/service.js';
import * as queuesService from '~/server/features/queues/service.js';
import * as entityRevisionsService from '~/server/features/entity-revisions/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { connectDB } from '~/server/db/mongo.js';
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
  findDefaultConstructableTemplate: vi.fn()
}));

vi.mock('~/server/features/queues/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getById: vi.fn(),
  processGetById: vi.fn(),
  processUpdate: vi.fn()
}));

vi.mock('~/server/features/entity-revisions/service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getCurrentForEntity: vi.fn()
}));

vi.mock('~/server/db/mongo.js', () => ({
  connectDB: vi.fn()
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
    connectDB.mockResolvedValue({
      collection: vi.fn(() => ({
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 })
      }))
    });
  });

  it('retains compiled permissions across durable orchestration resumes', () => {
    const effectivePermissions = {
      libraries: [{ level: 'read', rule: { fact: 'primaryStatus', equals: 'NEW' } }]
    };
    const actor = orchestrationActor({
      userId: 'user-1',
      role: 'member',
      effectivePermissions,
      roleAssignments: { roleIds: ['role-designer'] }
    }, 'org-1');

    expect(authFromRun({ organizationId: 'org-1', context: { actor } })).toMatchObject({
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions,
      roleAssignments: { roleIds: ['role-designer'] }
    });
  });

  it('reads a library through its explicit process adapter with the complete auth context', async () => {
    const processGetById = vi.fn().mockResolvedValue({
      _id: 'library-1',
      lineage: { organizationId: 'org-1' }
    });
    getAppRegistry.mockReturnValueOnce({
      getEntityService: entityType => entityType === 'library' ? { processGetById } : null
    });
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      effectivePermissions: { libraries: [{ level: 'read' }] }
    };

    await expect(resolveProcessGraphEntity('library', 'library-1', { auth })).resolves.toMatchObject({
      _id: 'library-1'
    });
    expect(processGetById).toHaveBeenCalledWith('library-1', auth);
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

  it('rejects activation when the authored graph is not the current dataflow version', async () => {
    processRepository.findById.mockResolvedValueOnce({
      _id: 'process-old',
      identity: { uid: 'process-old', name: 'Old process', slug: 'old-process' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT' },
      data: {
        schemaVersion: 1,
        dataflowVersion: 2,
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
      }
    });

    await expect(activate('process-old', {
      userId: 'admin',
      organizationId: 'org-1',
      effectivePermissions: { organizations: { level: 'admin' } }
    })).rejects.toThrow('Process dataflow version 3 is required');

    expect(processRepository.updateById).not.toHaveBeenCalled();
    expect(processRepository.archiveActiveByOrganization).not.toHaveBeenCalled();
  });

  it('stores the authored graph unchanged when saving a draft', async () => {
    const authored = {
      schemaVersion: 1,
      dataflowVersion: 3,
      graph: {
        nodes: [{ id: 'literal', type: 'processNode', position: { x: 17, y: 29 }, data: { refId: 'literal' } }],
        edges: [],
        viewport: { x: 4, y: 8, zoom: 1.25 }
      },
      roles: {},
      servicePrincipals: {},
      entityProfiles: {},
      actions: {},
      services: {},
      sockets: {},
      statusDefinitions: {},
      valueInputs: {},
      processNodes: {
        literal: {
          id: 'literal',
          kind: 'source.literalItem',
          label: 'Authored literal',
          value: 'unchanged',
          type: { base: 'string', shape: 'item' }
        }
      },
      screens: {},
      assignments: {},
      compiled: { stale: true }
    };
    processRepository.findById.mockResolvedValueOnce({
      _id: 'process-draft',
      identity: { uid: 'process-draft', name: 'Draft', slug: 'draft' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT' },
      data: authored
    });
    processRepository.updateById.mockImplementationOnce(async (id, process) => ({
      ...process.toJSON(),
      _id: id
    }));

    const result = await update('process-draft', { data: authored }, {
      userId: 'admin',
      organizationId: 'org-1',
      effectivePermissions: { organizations: { level: 'admin' } }
    });

    expect(processRepository.updateById.mock.calls[0][1].data).toEqual({ ...authored, compiled: null });
    expect(result.data.graph).toEqual(authored.graph);
    expect(result.data.processNodes).toEqual(authored.processNodes);
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

  it('normalizes legacy status actions when assigning active process roles', async () => {
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
        entityProfiles: {
          queue_profile: {
            id: 'queue_profile',
            entityType: 'queue',
            feature: 'queues',
            access: { level: 'write', roleIds: ['role_operator'] }
          }
        },
        actions: {
          send_queue: {
            id: 'send_queue',
            actionKind: 'changeStatus',
            entityType: 'queue',
            status: { from: 'DRAFT', to: 'SENT' },
            access: { level: 'write', roleIds: ['role_operator'] }
          }
        },
        services: {},
        sockets: {},
        screens: {},
        compiled: {
          actions: {
            send_queue: {
              actionKind: 'changeStatus',
              entityType: 'queue'
            }
          }
        }
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

    expect(result.data.actions.send_queue.actionKind).toBe('updateEntity');
    expect(result.data.compiled.actions.send_queue).toMatchObject({
      actionKind: 'updateEntity',
      entityType: 'queue',
      contracts: {
        inputs: [expect.objectContaining({ entityType: 'queue' })],
        outputs: [expect.objectContaining({ entityType: 'queue' })]
      }
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
        dataflowVersion: 3,
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

  it('rejects nesting exposure without profiles for every produced hierarchy level', async () => {
    processRepository.findById.mockResolvedValueOnce({
      _id: 'process-incomplete-nesting',
      identity: { uid: 'process-incomplete-nesting', name: 'Incomplete nesting', slug: 'incomplete-nesting' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'DRAFT' },
      data: {
        schemaVersion: 1,
        dataflowVersion: 3,
        graph: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
        roles: {},
        assignments: {},
        entityProfiles: {},
        actions: {},
        services: {
          nesting: { id: 'nesting', commandId: 'solveNesting', inputs: [], outputs: [] }
        },
        sockets: {},
        screens: {},
        compiled: null
      }
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce(null);

    await expect(activate('process-incomplete-nesting', {
      userId: 'admin',
      organizationId: 'org-1',
      effectivePermissions: { organizations: { level: 'admin' } }
    })).rejects.toThrow(/nesting_run, sheet_design, sheet/);

    expect(processRepository.archiveActiveByOrganization).not.toHaveBeenCalled();
    expect(processRepository.updateById).not.toHaveBeenCalled();
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
        lineage: { organizationId: 'org-1' },
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
        lineage: { organizationId: 'org-1' },
        data: { metadata: { priority: 'high' } },
        name: 'Created project',
        organizationId: 'org-1',
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

  it('passes process status display metadata to status-bearing entity updates', async () => {
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
      lineage: { organizationId: 'org-1' },
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
              actionKind: 'updateEntity',
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

  it('persists non-status process updates through the owning feature process-update handler', async () => {
    const processUpdate = vi.fn().mockResolvedValue({
      _id: 'project-1',
      identity: { uid: 'project-1', name: 'Project' },
      lineage: { organizationId: 'org-1' },
      data: { metadata: { note: 'Updated by process' } }
    });
    getAppRegistry.mockReturnValue({
      getDomain: () => ({
        entities: [{ type: 'project', collection: 'projects' }],
        fieldAccess: {
          project: { feature: 'projects', write: ['data.metadata.*'] }
        }
      }),
      getEntityService: () => ({
        processGetById: vi.fn().mockResolvedValue({
          _id: 'project-1',
          identity: { uid: 'project-1', name: 'Project' },
          lineage: { organizationId: 'org-1' },
          data: { metadata: {} }
        }),
        processUpdate
      })
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE' },
      data: {
        compiled: {
          actions: {
            update_project_note: {
              id: 'update_project_note',
              actionKind: 'updateEntity',
              entityType: 'project',
              mutation: { fields: ['data.metadata'] },
              access: { level: 'write', roleIds: ['role_admin'] }
            }
          }
        }
      }
    });

    const updated = await executeActiveProcessAction({
      actionId: 'update_project_note',
      entityId: 'project-1',
      data: { data: { metadata: { note: 'Updated by process' } } }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: { actions: [{ actionId: 'update_project_note' }] }
    });

    expect(processUpdate).toHaveBeenCalledWith('project-1', {
      'data.metadata.note': 'Updated by process'
    }, expect.objectContaining({ userId: 'user-1' }));
    expect(updated.data.metadata.note).toBe('Updated by process');
  });

  it('executes synchronous run-command actions with action-scoped command access and output status projection', async () => {
    executeCommand.mockResolvedValueOnce({
      entities: [{ type: 'nesting_run', id: 'nesting-run-1' }],
      data: { runId: 'nesting-run-1' }
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
      lineage: { organizationId: 'org-1' },
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
            actionKind: 'updateEntity',
            inputs: [{ id: 'entity', entityType: 'nesting_run' }],
            status: { to: 'CUT' }
          }
        },
        graph: {
          nodes: [],
          edges: [
            { source: 'run_nesting', target: 'mark_cut', sourceHandle: 'output:nesting_run', targetHandle: 'input:entity' }
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
      'nesting_run',
      'nesting-run-1',
      'CUT',
      'org-1',
      'user-1',
      expect.any(Object)
    );
  });

  it('evaluates connected process programming nodes before executing an action', async () => {
    executeCommand.mockResolvedValueOnce({ data: { ok: true } });
    getAppRegistry.mockReturnValueOnce({
      getCommandDefinition: () => ({ access: {} })
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE' },
      data: {
        actions: {
          run: {
            id: 'run',
            actionKind: 'runCommand',
            commandId: 'calculate',
            inputs: [{ id: 'label', kind: 'string' }]
          }
        },
        valueInputs: {
          prefix: { id: 'prefix', valueType: 'string', value: 'Part ' },
          serial: { id: 'serial', valueType: 'string', value: '17' }
        },
        processNodes: {
          label: { id: 'label', kind: 'stringOp', operation: 'concat' }
        },
        graph: {
          nodes: [
            { id: 'prefix', type: 'valueInput' },
            { id: 'serial', type: 'valueInput' },
            { id: 'label', type: 'processNode' },
            { id: 'run', type: 'action' }
          ],
          edges: [
            { source: 'prefix', sourceHandle: 'output', target: 'label', targetHandle: 'input:value' },
            { source: 'serial', sourceHandle: 'output', target: 'label', targetHandle: 'input:right' },
            { source: 'label', sourceHandle: 'output', target: 'run', targetHandle: 'input' }
          ]
        },
        compiled: {
          actions: {
            run: {
              id: 'run',
              actionKind: 'runCommand',
              commandId: 'calculate',
              access: { level: 'write', roleIds: ['role_operator'] }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({ actionId: 'run' }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: { actions: [{ actionId: 'run' }] }
    });

    expect(executeCommand).toHaveBeenCalledWith(
      'calculate',
      { entities: {}, parameters: { label: 'Part 17' } },
      expect.any(Object)
    );
  });

  it('queries entity lists through the authorized service before process filtering and selection', async () => {
    const processList = vi.fn().mockResolvedValue([
      { identity: { uid: 'queue-1' }, status: { state: { primary: 'DRAFT' } } },
      { identity: { uid: 'queue-2' }, status: { state: { primary: 'READY' } } }
    ]);
    executeCommand.mockResolvedValueOnce({ data: { ok: true } });
    const registry = {
      getCommandDefinition: () => ({ access: {} }),
      getEntityService: entityType => entityType === 'queue' ? { processList } : null
    };
    getAppRegistry.mockReturnValueOnce(registry).mockReturnValueOnce(registry);
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE' },
      data: {
        actions: {
          run: {
            id: 'run',
            actionKind: 'runCommand',
            commandId: 'calculate',
            inputs: [{ id: 'queue', kind: 'entity', entityType: 'queue' }]
          }
        },
        valueInputs: {
          ready: { id: 'ready', valueType: 'string', structure: 'item', value: 'READY' }
        },
        processNodes: {
          query: { id: 'query', kind: 'entityQuery', entityType: 'queue' },
          readyCondition: { id: 'readyCondition', kind: 'entityCondition', entityType: 'queue', path: 'status.state.primary', operation: 'eq', valueType: 'string' },
          filter: { id: 'filter', kind: 'entityFilter', entityType: 'queue' },
          first: { id: 'first', kind: 'entitySelect', operation: 'first', entityType: 'queue' }
        },
        graph: {
          nodes: [
            { id: 'ready', type: 'valueInput' },
            ...['query', 'readyCondition', 'filter', 'first'].map(id => ({ id, type: 'processNode' })),
            { id: 'run', type: 'action' }
          ],
          edges: [
            { source: 'ready', target: 'readyCondition', targetHandle: 'input:value' },
            { source: 'query', target: 'filter', targetHandle: 'input:entities' },
            { source: 'readyCondition', target: 'filter', targetHandle: 'input:predicate' },
            { source: 'filter', target: 'first' },
            { source: 'first', target: 'run' }
          ]
        },
        compiled: {
          actions: {
            run: {
              id: 'run',
              actionKind: 'runCommand',
              commandId: 'calculate',
              access: { level: 'write', roleIds: ['role_operator'] }
            }
          }
        }
      }
    });
    const auth = {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: { actions: [{ actionId: 'run' }] }
    };

    await executeActiveProcessAction({ actionId: 'run' }, auth);

    expect(processList).toHaveBeenCalledWith({}, auth);
    expect(executeCommand).toHaveBeenCalledWith(
      'calculate',
      { entities: { queue: { type: 'queue', id: 'queue-2' } }, parameters: {} },
      expect.any(Object)
    );
  });

  it('does not project process output status before async command tasks finish', async () => {
    executeCommand.mockResolvedValueOnce({
      entities: [{ type: 'nesting_run', id: 'nesting-run-1' }],
      jobs: [{ type: 'task_run', id: 'task-1' }],
      data: { runId: 'nesting-run-1', taskRunId: 'task-1' }
    });
    getAppRegistry.mockReturnValueOnce({
      getCommandDefinition: () => ({ access: { executionGrants: [] } })
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      identity: { uid: 'process-active', name: 'Active process', slug: 'active-process' },
      lineage: { organizationId: 'org-1' },
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
            actionKind: 'updateEntity',
            inputs: [{ id: 'entity', entityType: 'nesting_run' }],
            status: { to: 'CUT' }
          }
        },
        graph: {
          nodes: [],
          edges: [
            { source: 'run_nesting', target: 'mark_cut', sourceHandle: 'output:nesting_run', targetHandle: 'input:entity' }
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
      lineage: { organizationId: 'org-1' },
      provenance: { derivedFrom: { source: { type: 'cassette', id: 'cassette-template-1' } } },
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
      expect.any(Object)
    );
    expect(cassetteService.createDesignFromTemplate.mock.calls[0][5]).toEqual(expect.objectContaining({
      effectivePermissions: expect.objectContaining({
        cassette_designs: expect.arrayContaining([
          expect.objectContaining({ level: 'admin', actions: { create: true } })
        ]),
        cassettes: expect.arrayContaining([
          expect.objectContaining({ level: 'read', actions: { view: true } })
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

  it('appends process-produced cassette designs to the queue through queue processUpdate', async () => {
    queuesService.processGetById.mockResolvedValueOnce({
      _id: 'queue-1',
      lineage: { organizationId: 'org-1' },
      relations: { cassettes: [] }
    });
    queuesService.processUpdate.mockResolvedValueOnce({
      _id: 'queue-1',
      lineage: { organizationId: 'org-1' },
      relations: { cassettes: [{ type: 'cassette_design', id: 'design-created' }] }
    });
    getAppRegistry.mockReturnValue({
      getDomain: () => ({
        entities: [
          { type: 'queue', collection: 'queues' },
          { type: 'cassette_design', collection: 'cassette_designs' }
        ],
        fieldAccess: {
          queue: { feature: 'queues', write: ['data.job.*'] },
          cassette_design: { feature: 'cassette_designs', write: ['data.*'] }
        }
      }),
      getEntityService: type => type === 'queue' ? queuesService : null
    });
    cassetteService.createDesignFromTemplate.mockResolvedValueOnce({
      _id: 'design-created',
      identity: { uid: 'design-created', name: 'Facade A' },
      lineage: { organizationId: 'org-1' },
      status: { state: { primary: 'DRAFT' } },
      data: { parameters: { A: 1200, T: 18 }, geometry: { dxfId: 'dxf-1' } }
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
              status: {},
              access: { level: 'write', roleIds: ['role_designer'] }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({
      actionId: 'create_design',
      entities: { queue: 'queue-1' },
      data: {
        templateId: 'cassette-template-1',
        parameters: { A: 1200, T: 18 },
        linkCreatedTo: { ownerType: 'queue', relationKey: 'cassettes' }
      }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: {
        actions: [{ actionId: 'create_design' }]
      }
    });

    expect(queuesService.processUpdate).toHaveBeenCalledWith('queue-1', {
      'relations.cassettes': [{ type: 'cassette_design', id: 'design-created' }]
    }, expect.objectContaining({
      effectivePermissions: expect.objectContaining({
        queues: expect.arrayContaining([
          expect.objectContaining({ level: 'write', actions: { update: true, edit: true } })
        ])
      })
    }));
  });

  it('executes cassette design construction from the selected parent cassette', async () => {
    cassetteService.createDesignFromTemplate.mockResolvedValueOnce({
      _id: 'design-from-parent',
      identity: { uid: 'design-from-parent', name: 'Parent based' },
      lineage: { organizationId: 'org-1' },
      provenance: { derivedFrom: { source: { type: 'cassette', id: 'cassette-parent-1' } } },
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
      expect.any(Object)
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
      lineage: { organizationId: 'org-1' },
      provenance: { derivedFrom: { source: { type: 'cassette', id: 'default-template' } } },
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
          expect.objectContaining({ level: 'read', actions: { view: true } })
        ])
      })
    }));
    expect(cassetteService.createDesignFromTemplate).toHaveBeenCalledWith(
      'default-template',
      {},
      'user-1',
      'org-1',
      undefined,
      expect.any(Object)
    );
  });

  it('creates cassettes through the ordinary entity service contract', async () => {
    const create = vi.fn().mockResolvedValueOnce({
      _id: 'template-created',
      identity: { uid: 'template-created', name: 'Facade Template' },
      lineage: { organizationId: 'org-1', libraryId: 'library-1' },
      status: { state: { primary: 'DRAFT' } },
      data: { type: 'PARAMETRIC', definition: { occs: '0.4-draft', extensions: { cutkit: { graphTree: {} } } } }
    });
    statusService.setInitialStateForOrganization.mockResolvedValueOnce({
      state: { primary: 'ACTIVE', active: { main: 'ACTIVE' } }
    });
    getAppRegistry.mockReturnValue({
      getDomain: () => ({
        entities: [
          { type: 'library', collection: 'libraries' },
          { type: 'cassette', collection: 'cassettes' }
        ],
        containment: [{ parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' }],
        fieldAccess: {
          library: { feature: 'libraries' },
          cassette: { feature: 'cassettes' }
        }
      }),
      getEntityService: type => ({
        library: { processGetById: vi.fn().mockResolvedValue({ _id: 'library-1', lineage: { organizationId: 'org-1' } }) },
        cassette: { create }
      })[type] || null
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
              parentEntityType: 'library',
              construction: { mode: 'genericCreate' },
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

    expect(create).toHaveBeenCalledWith(
      {
        name: 'Facade Template',
        libraryId: 'library-1',
        lineage: { organizationId: 'org-1', libraryId: 'library-1' }
      },
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
              parentEntityType: 'library',
              construction: { mode: 'genericCreate' },
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
    getAppRegistry.mockReturnValue({
      getDomain: () => ({
        fieldAccess: {
          project: { feature: 'projects' },
          queue: { feature: 'queues' }
        },
        entities: [
          { type: 'project', collection: 'projects' },
          { type: 'queue', collection: 'queues' }
        ],
        containment: [{ parentType: 'project', childType: 'queue', lineageKey: 'projectId' }]
      }),
      getEntityService: type => type === 'project'
        ? { processGetById: vi.fn().mockResolvedValue({ _id: 'project-1', lineage: { organizationId: 'org-1' } }) }
        : { create }
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
      {
        name: 'Queue A',
        projectId: 'project-1',
        lineage: { organizationId: 'org-1', projectId: 'project-1' }
      },
      'user-1',
      'org-1',
      undefined,
      expect.any(Object)
    );
  });

  it('inherits complete ancestry and pins the configured current parent revision', async () => {
    const create = vi.fn().mockResolvedValue({
      _id: 'sheet-created',
      identity: { uid: 'sheet-created', name: 'Produced sheet' },
      lineage: {
        organizationId: 'org-1',
        projectId: 'project-1',
        queueId: 'queue-1',
        runId: 'run-1',
        sheetDesignId: 'design-1'
      },
      provenance: {
        parent: {
          source: { type: 'sheet_design', id: 'design-1', revisionId: 'revision-7' },
          scope: 'geometry',
          revisionNumber: 7,
          contentHash: 'sha256:geometry'
        }
      },
      status: { state: { primary: 'INITIAL' } }
    });
    entityRevisionsService.getCurrentForEntity.mockResolvedValueOnce({
      _id: 'revision-7',
      data: { number: 7, contentHash: 'sha256:geometry' }
    });
    getAppRegistry.mockReturnValue({
      getDomain: () => ({
        entities: [
          { type: 'sheet_design', collection: 'sheet_designs' },
          { type: 'sheet', collection: 'sheets' }
        ],
        containment: [{ parentType: 'sheet_design', childType: 'sheet', lineageKey: 'sheetDesignId' }],
        revisions: { sheet_design: { scopes: ['geometry'], defaultScope: 'geometry' } },
        fieldAccess: {
          sheetDesign: { feature: 'sheet_designs' },
          sheet: { feature: 'materials' }
        }
      }),
      getEntityService: type => type === 'sheet_design'
        ? {
            processGetById: vi.fn().mockResolvedValue({
              _id: 'design-1',
              lineage: {
                organizationId: 'org-1',
                projectId: 'project-1',
                queueId: 'queue-1',
                runId: 'run-1'
              }
            })
          }
        : { create }
    });
    statusService.setInitialStateForOrganization.mockResolvedValueOnce({
      state: { primary: 'PRODUCED', active: { main: 'PRODUCED' } }
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
            create_sheet: {
              id: 'create_sheet',
              actionKind: 'createEntity',
              entityType: 'sheet',
              parentEntityType: 'sheet_design',
              parentRevision: { enabled: true, scope: 'geometry' },
              status: { to: 'PRODUCED' },
              access: { level: 'write', roleIds: ['role_operator'] }
            }
          }
        }
      }
    });

    const result = await executeActiveProcessAction({
      actionId: 'create_sheet',
      entities: { sheet_design: { type: 'sheet_design', id: 'design-1' } },
      data: { name: 'Produced sheet' }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: { actions: [{ actionId: 'create_sheet' }] }
    });

    expect(create).toHaveBeenCalledWith(
      {
        name: 'Produced sheet',
        sheetDesignId: 'design-1',
        lineage: {
          organizationId: 'org-1',
          projectId: 'project-1',
          queueId: 'queue-1',
          runId: 'run-1',
          sheetDesignId: 'design-1'
        },
        provenance: {
          parent: {
            source: { type: 'sheet_design', id: 'design-1', revisionId: 'revision-7' },
            scope: 'geometry',
            revisionNumber: 7,
            contentHash: 'sha256:geometry'
          }
        }
      },
      'user-1',
      'org-1',
      undefined,
      expect.any(Object)
    );
    expect(entityRevisionsService.getCurrentForEntity).toHaveBeenCalledWith('sheet_design', 'design-1', 'geometry');
    expect(result).toMatchObject({
      lineage: {
        organizationId: 'org-1',
        projectId: 'project-1',
        queueId: 'queue-1',
        runId: 'run-1',
        sheetDesignId: 'design-1'
      },
      provenance: {
        parent: {
          source: { type: 'sheet_design', id: 'design-1', revisionId: 'revision-7' }
        }
      },
      status: { state: { primary: 'PRODUCED' } }
    });
  });

  it('executes compiled relation actions directly for v3 processes', async () => {
    const projectUpdate = vi.fn().mockResolvedValue({
      _id: 'project-1',
      identity: { name: 'Project' },
      relations: { library: { type: 'library', id: 'library-1' } }
    });
    getAppRegistry.mockReturnValue({
      getDomain: () => ({
        entities: [
          { type: 'project', collection: 'projects' },
          { type: 'library', collection: 'libraries' }
        ],
        fieldAccess: {
          project: { feature: 'projects' },
          library: { feature: 'libraries' }
        }
      }),
      getEntityService: type => ({
        project: {
          processGetById: vi.fn().mockResolvedValue({ _id: 'project-1', identity: { name: 'Project' }, relations: {} }),
          processUpdate: projectUpdate
        },
        library: {
          processGetById: vi.fn().mockResolvedValue({ _id: 'library-1', identity: { name: 'Library' } })
        }
      })[type] || null
    });
    processRepository.findActiveByOrganization.mockResolvedValueOnce({
      _id: 'process-active',
      lineage: { organizationId: 'org-1' },
      status: { state: 'ACTIVE' },
      data: {
        dataflowVersion: 3,
        compiled: {
          actions: {
            'create:link:library': {
              id: 'create:link:library',
              actionKind: 'updateEntity',
              entityType: 'project',
              relationMutation: { key: 'library', targetType: 'library', cardinality: 'one', operation: 'link' },
              mutation: { fields: ['relations.library'] },
              inputs: [
                { id: 'entity', entityType: 'project' },
                { id: 'relation:library', relationKey: 'library', entityType: 'library' }
              ],
              access: { level: 'admin', roleIds: ['role_admin'] }
            }
          }
        }
      }
    });

    await executeActiveProcessAction({
      actionId: 'create:link:library',
      entityId: 'project-1',
      data: { relations: { library: 'library-1' } }
    }, {
      userId: 'user-1',
      organizationId: 'org-1',
      roleAssignments: { actions: [{ actionId: 'create:link:library' }] },
      effectivePermissions: {
        projects: [{ level: 'admin' }],
        libraries: [{ level: 'read' }]
      }
    });

    expect(projectUpdate).toHaveBeenCalledWith(
      'project-1',
      { 'relations.library': { type: 'library', id: 'library-1' } },
      expect.any(Object)
    );
  });
});
