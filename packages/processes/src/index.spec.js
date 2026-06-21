import { describe, expect, it } from 'vitest';
import {
  compileProcessDefinition,
  createDefaultCreatedWorkflow,
  validateProcessDefinition
} from './index.js';

const domain = {
  entities: [
    { type: 'project' },
    { type: 'queue' }
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
});
