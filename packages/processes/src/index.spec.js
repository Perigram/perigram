import { describe, expect, it } from 'vitest';
import {
  compileProcessDefinition,
  createProcessFromTemplate,
  createDefaultCreatedWorkflow,
  legacyTypeToTemplateId,
  validateProcessDefinition
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
      read: ['identity.*', 'status.*', 'lineage.*', 'data.name'],
      write: ['data.metadata'],
      admin: ['data.*']
    },
    queue: {
      read: ['identity.*', 'status.*', 'lineage.*'],
      write: ['data.*'],
      admin: ['attachments.*']
    },
    catalog: {
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

  it('compiles assignment placeholders into user-specific grants', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project_viewer: {
          id: 'role_project_viewer',
          grants: [{
            feature: 'projects',
            level: 'read',
            scope: { entityId: '$assignment.projectId' }
          }]
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_project_viewer'],
          bindings: { projectId: 'project-123' },
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.userAccess.user_a.permissions.projects[0].scope.entityId).toBe('project-123');
  });

  it('skips grants with incomplete assignment bindings', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project_viewer: {
          id: 'role_project_viewer',
          grants: [{
            feature: 'projects',
            level: 'read',
            scope: { entityId: '$assignment.projectId' }
          }]
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
    expect(compiled.userAccess.user_a.incompleteBindings[0]).toMatchObject({ binding: 'projectId' });
  });

  it('compiles user-triggered action contracts', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', grants: [] }
      },
      actions: {
        create_project: {
          id: 'create_project',
          label: 'Create project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'CREATED' },
          trigger: { mode: 'user', roleIds: ['role_admin'] },
          inputs: [],
          outputs: [{ id: 'created', entityType: 'project', status: 'CREATED' }]
        }
      }
    }, domain);

    expect(compiled.actions.create_project).toMatchObject({
      actionKind: 'createEntity',
      entityType: 'project',
      trigger: { mode: 'user', roleIds: ['role_admin'] }
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
          trigger: { mode: 'system', roleIds: [] },
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
          trigger: { mode: 'event', roleIds: [] },
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

  it('rejects user-triggered actions with missing roles', () => {
    const validation = validateProcessDefinition({
      actions: {
        activate_project: {
          actionKind: 'changeStatus',
          entityType: 'project',
          status: { from: 'DRAFT', to: 'ACTIVE' },
          trigger: { mode: 'user', roleIds: ['missing_role'] }
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('missing trigger role');
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
  });
});
