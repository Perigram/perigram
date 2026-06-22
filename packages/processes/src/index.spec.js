import { describe, expect, it } from 'vitest';
import {
  canvasToDefinition,
  compileProcessDefinition,
  createProcessFromTemplate,
  createDefaultCreatedWorkflow,
  definitionToCanvas,
  legacyTypeToTemplateId,
  resolveScreens,
  validateProcessDefinition,
  validateRoundTrip
} from './index.js';

const domain = {
  entities: [
    { type: 'project' },
    { type: 'queue' },
    { type: 'catalog' }
  ],
  commands: {
    solveNesting: { id: 'solveNesting' }
  },
  workflows: {
    project: {
      schemaVersion: 2,
      primaryRegion: 'main',
      regions: {
        main: {
          initial: 'DRAFT',
          states: { DRAFT: {}, ACTIVE: {} },
          transitions: [{ from: 'DRAFT', to: 'ACTIVE' }]
        }
      }
    }
  },
  fieldAccess: {
    project: {
      feature: 'projects',
      read: ['identity.*', 'status.*', 'lineage.*', 'data.name'],
      write: ['data.metadata'],
      admin: ['data.*']
    },
    queue: {
      feature: 'queues',
      read: ['identity.*', 'status.*', 'lineage.*'],
      write: ['data.*'],
      admin: ['attachments.*']
    },
    catalog: {
      feature: 'catalogs',
      read: ['identity.*', 'status.*', 'lineage.*', 'data.material', 'data.options'],
      write: ['data.*'],
      admin: ['attachments.*']
    }
  }
};

describe('@cutkit/processes compiler', () => {
  it('compiles custom entity lifecycle directly to a v2 workflow', () => {
    const compiled = compileProcessDefinition({
      entityProfiles: {
        projectMain: {
          entityType: 'project',
          lifecycle: {
            mode: 'custom',
            workflow: {
              schemaVersion: 2,
              primaryRegion: 'main',
              regions: {
                main: {
                  initial: 'CREATED',
                  states: { CREATED: {}, REVIEW: {} },
                  transitions: [{ from: 'CREATED', to: 'REVIEW' }]
                }
              }
            }
          },
          fields: { read: ['identity.*'], write: [], private: [] }
        }
      }
    }, domain);

    expect(compiled.workflows.project.regions.main.initial).toBe('CREATED');
    expect(compiled.workflows.project.regions.main.transitions[0]).toMatchObject({ from: 'CREATED', to: 'REVIEW' });
  });

  it('creates a CREATED-only workflow for defaultCreated lifecycle mode', () => {
    const workflow = createDefaultCreatedWorkflow();
    expect(workflow.regions.main.initial).toBe('CREATED');
    expect(workflow.regions.main.transitions).toEqual([]);
  });

  it('rejects graph refs that do not exist', () => {
    const validation = validateProcessDefinition({
      graph: {
        nodes: [{ id: 'entity_1', type: 'entity', position: {}, data: { refId: 'missing' } }],
        edges: []
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('missing entity profile');
  });

  it('rejects fields outside the domain field policy', () => {
    const validation = validateProcessDefinition({
      entityProfiles: {
        projectMain: {
          entityType: 'project',
          lifecycle: { mode: 'defaultCreated' },
          fields: { read: ['billing.secret'], write: [], private: [] }
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('billing.secret');
  });

  it('compiles screen requirements into user-specific grants', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project_viewer: { id: 'role_project_viewer' }
      },
      screens: {
        assigned_project: {
          id: 'assigned_project',
          route: '/project/$assignment.projectSlug/details',
          roleIds: ['role_project_viewer'],
          bindings: { projectId: '$assignment.projectId' },
          required: {
            feature: 'projects',
            level: 'read',
            scope: { entityId: '$assignment.projectId' }
          }
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_project_viewer'],
          bindings: { projectId: 'project-123', projectSlug: 'p-123' },
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.userAccess.user_a.permissions.projects[0].scope.entityId).toBe('project-123');
  });

  it('skips screen-derived grants with incomplete assignment bindings', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project_viewer: { id: 'role_project_viewer' }
      },
      screens: {
        assigned_project: {
          id: 'assigned_project',
          route: '/project/$assignment.projectSlug/details',
          roleIds: ['role_project_viewer'],
          required: {
            feature: 'projects',
            level: 'read',
            scope: { entityId: '$assignment.projectId' }
          }
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_project_viewer'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.userAccess.user_a.permissions.projects).toBeUndefined();
    expect(compiled.userAccess.user_a.incompleteBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ binding: 'projectId' }),
        expect.objectContaining({ binding: 'projectSlug' })
      ])
    );
  });

  it('compiles role screens with assignment overload bindings', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' },
        role_supervisor: { id: 'role_supervisor' }
      },
      screens: {
        assigned_project: {
          id: 'assigned_project',
          label: 'Assigned project',
          kind: 'entityDetail',
          route: '/project/$assignment.projectSlug/details',
          placement: 'hub',
          entityType: 'project',
          required: { feature: 'projects', level: 'read', scope: { entityId: '$assignment.projectId' } },
          roleIds: ['role_operator', 'role_supervisor'],
          bindings: { projectId: '$assignment.projectId' },
          actions: ['viewProject']
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_operator', 'role_supervisor'],
          bindings: { projectId: 'project-123', projectSlug: 'p-123' },
          status: 'active'
        }
      }
    }, domain);

    const screens = resolveScreens({ compiled, userId: 'user_a' });
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatchObject({
      screenKey: 'assigned_project:project-123',
      route: '/project/p-123/details',
      scope: { projectId: 'project-123' },
      sourceRoleIds: ['role_operator', 'role_supervisor']
    });
    expect(compiled.userAccess.user_a.permissions.projects[0].scope.entityId).toBe('project-123');
  });

  it('skips screens with incomplete assignment bindings', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      screens: {
        assigned_project: {
          id: 'assigned_project',
          label: 'Assigned project',
          route: '/project/$assignment.projectSlug/details',
          roleIds: ['role_operator'],
          bindings: { projectId: '$assignment.projectId' }
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_operator'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    expect(resolveScreens({ compiled, userId: 'user_a' })).toEqual([]);
    expect(compiled.userAccess.user_a.incompleteBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ screenId: 'assigned_project', binding: 'projectId' }),
        expect.objectContaining({ screenId: 'assigned_project', binding: 'projectSlug' })
      ])
    );
  });

  it('ignores role navigation and derives screens only from screen records', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: {
          id: 'role_operator',
          navigation: [{
            id: 'projects',
            route: '/projects',
            requires: { feature: 'projects', level: 'read' }
          }]
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_operator'],
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.userAccess.user_a.screens).toEqual([]);
    expect(resolveScreens({ compiled, userId: 'user_a' })).toEqual([]);
  });

  it('compiles user-triggered action contracts', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          label: 'Create project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'CREATED' },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [],
          outputs: [{ id: 'created', entityType: 'project', status: 'CREATED' }]
        }
      }
    }, domain);

    expect(compiled.actions.create_project).toMatchObject({
      actionKind: 'createEntity',
      entityType: 'project',
      trigger: { mode: 'manual' },
      access: { level: 'write', roleIds: ['role_admin'] }
    });
  });

  it('compiles input-driven status actions with event outputs', () => {
    const compiled = compileProcessDefinition({
      actions: {
        activate_incoming: {
          id: 'activate_incoming',
          label: 'Activate incoming',
          actionKind: 'changeStatus',
          status: { to: 'ACTIVE' },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: [] },
          inputs: [{ id: 'entity', label: 'Incoming entity', status: 'Current status' }],
          outputs: [{ id: 'entity', label: 'Same entity', status: 'ACTIVE' }],
          events: [{ id: 'completed', label: 'Activate incoming completed', kind: 'event' }]
        }
      }
    }, domain);

    expect(compiled.actions.activate_incoming).toMatchObject({
      actionKind: 'changeStatus',
      entityType: null,
      status: { to: 'ACTIVE' },
      trigger: { mode: 'manual' },
      events: [{ id: 'completed', kind: 'event' }]
    });
  });

  it('compiles create actions with explicit parent inputs', () => {
    const compiled = compileProcessDefinition({
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          parentEntityType: 'project',
          status: { to: 'CREATED' },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: [] },
          inputs: [{ id: 'parent', entityType: 'project' }],
          outputs: [{ id: 'created', entityType: 'queue', status: 'CREATED' }]
        }
      }
    }, domain);

    expect(compiled.actions.create_queue.parentEntityType).toBe('project');
    expect(compiled.actions.create_queue.inputs[0]).toMatchObject({ id: 'parent', entityType: 'project' });
  });

  it('compiles send-to-organization projection actions', () => {
    const compiled = compileProcessDefinition({
      actions: {
        send_project: {
          id: 'send_project',
          actionKind: 'sendToOrganization',
          entityType: 'project',
          projection: { fields: ['identity.*'], excludeFields: [] },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: [] },
          inputs: [{ id: 'entity', entityType: 'project' }],
          outputs: [{ id: 'projection', entityType: 'project', projection: true }]
        }
      }
    }, domain);

    expect(compiled.actions.send_project).toMatchObject({
      actionKind: 'sendToOrganization',
      projection: { fields: ['identity.*'] }
    });
  });

  it('compiles service access through service principals instead of roles', () => {
    const compiled = compileProcessDefinition({
      servicePrincipals: {
        principal_nesting: { id: 'principal_nesting', label: 'Nesting service' }
      },
      services: {
        service_nesting: {
          id: 'service_nesting',
          commandId: 'solveNesting',
          access: {
            runPrincipals: ['principal_nesting'],
            viewPrincipals: ['principal_nesting']
          }
        }
      }
    }, domain);

    expect(compiled.servicePrincipals.principal_nesting.label).toBe('Nesting service');
    expect(compiled.services.service_nesting.principals.run).toEqual(['principal_nesting']);
    expect(compiled.services.service_nesting.roles).toBeUndefined();
  });

  it('projects semantic process records to canvas nodes and round-trips them', () => {
    const definition = {
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      servicePrincipals: {
        principal_nesting: { id: 'principal_nesting', label: 'Nesting service' }
      },
      entityProfiles: {
        project_profile: {
          id: 'project_profile',
          entityType: 'project',
          lifecycle: { mode: 'defaultCreated' },
          fields: { read: ['identity.*'], write: [], private: [] }
        }
      },
      actions: {
        create_project: {
          id: 'create_project',
          label: 'Create project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'CREATED' },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [],
          outputs: [{ id: 'created', entityType: 'project', status: 'CREATED' }]
        }
      }
    };

    const canvas = definitionToCanvas(definition);
    const roundTrip = validateRoundTrip(definition);

    expect(canvas.nodes.map(node => node.id)).toEqual(['project_profile', 'create_project']);
    expect(canvas.nodes[0].data.semanticId).toBe('entity:project_profile');
    expect(roundTrip.ok).toBe(true);
  });

  it('converts canvas deletion back into semantic record deletion', () => {
    const definition = {
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'CREATED' },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: [] }
        },
        send_project: {
          id: 'send_project',
          actionKind: 'sendToOrganization',
          entityType: 'project',
          projection: { fields: ['identity.*'], excludeFields: [] },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: [] }
        }
      }
    };

    const canvas = definitionToCanvas(definition);
    const next = canvasToDefinition({ ...canvas, nodes: canvas.nodes.filter(node => node.id !== 'send_project') }, definition);

    expect(Object.keys(next.actions)).toEqual(['create_project']);
  });

  it('rejects compiled-only process definitions as editable sources', () => {
    const roundTrip = validateRoundTrip({
      compiled: { schemaVersion: 1, actions: {}, workflows: {} }
    });

    expect(roundTrip.ok).toBe(false);
    expect(roundTrip.errors.join('\n')).toContain('canonical semantic records');
  });

  it('rejects user-triggered actions with missing roles', () => {
    const validation = validateProcessDefinition({
      actions: {
        activate_project: {
          actionKind: 'changeStatus',
          entityType: 'project',
          status: { from: 'DRAFT', to: 'ACTIVE' },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['missing_role'] }
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('missing access role');
  });

  it('derives role grants from action access', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_creator: { id: 'role_creator' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'CREATED' },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_creator'] },
          inputs: [],
          outputs: [{ id: 'created', entityType: 'project', status: 'CREATED' }]
        }
      },
      assignments: {
        user_creator: {
          userId: 'user_creator',
          roleIds: ['role_creator'],
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.userAccess.user_creator.permissions.projects[0]).toMatchObject({ level: 'write' });
    expect(compiled.roles.role_creator.actions[0]).toMatchObject({ actionId: 'create_project', level: 'run' });
  });

  it('creates compilable starter process definitions from legacy organization types', () => {
    const process = createProcessFromTemplate({
      templateId: legacyTypeToTemplateId('Manufacturer'),
      organizationId: 'org-1',
      userId: 'user-1'
    });
    const compiled = compileProcessDefinition(process.data, domain);

    expect(process.data.sourceTemplateId).toBe('manufacturer');
    expect(compiled.userAccess['user-1'].permissions.organizations[0].level).toBe('admin');
    expect(compiled.userAccess['user-1'].screens.length).toBeGreaterThan(0);
  });
});
