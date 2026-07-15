import { describe, expect, it } from 'vitest';
import {
  canvasToDefinition,
  compileProcessDefinition,
  createProcessFromTemplate,
  createDefaultCreatedWorkflow,
  definitionToCanvas,
  legacyTypeToTemplateId,
  portSpecsCompatible,
  resolveScreens,
  validateProcessDefinition,
  validateRoundTrip
} from './index.js';

const SOURCE_STATE = 'SOURCE_STATE';
const TARGET_STATE = 'TARGET_STATE';
const INITIAL_STATE = 'INITIAL_STATE';
const NEXT_STATE = 'NEXT_STATE';

const domain = {
  entities: [
    { type: 'project' },
    { type: 'queue' },
    { type: 'entity_revision', collection: 'entity_revisions' },
    { type: 'sheet_design', collection: 'sheet_designs' },
    { type: 'cassette' },
    { type: 'cassette_design', collection: 'cassette_designs' },
    { type: 'library', feature: 'libraries', collection: 'libraries' },
    { type: 'catalog' },
    { type: 'warehouse' },
    { type: 'requisition' },
    { type: 'organization' },
    { type: 'user' }
  ],
  commands: {
    solveNesting: {
      id: 'solveNesting',
      output: { entities: ['entity_revision', 'sheet_design'] }
    }
  },
  relations: [
    { kind: 'containment', childType: 'queue', parentType: 'project', lineageRole: 'project', filterKey: 'projectId' },
    { kind: 'containment', childType: 'entity_revision', parentType: 'queue', lineageRole: 'queue', filterKey: 'queueId', display: { parentDetail: false } },
    { kind: 'containment', childType: 'sheet_design', parentType: 'queue', lineageRole: 'queue', filterKey: 'queueId', display: { parentDetail: false } },
    { kind: 'containment', childType: 'cassette', parentType: 'library', lineageRole: 'library', filterKey: 'libraryId' }
  ],
  workflows: {
    project: {
      schemaVersion: 2,
      primaryRegion: 'main',
      regions: {
        main: {
          initial: SOURCE_STATE,
          states: { [SOURCE_STATE]: {}, [TARGET_STATE]: {} },
          transitions: [{ from: SOURCE_STATE, to: TARGET_STATE }]
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
    cassette_design: {
      feature: 'cassettes',
      read: ['identity.*', 'status.*', 'lineage.*', 'data.*'],
      write: ['data.*'],
      admin: ['attachments.*']
    },
    catalog: {
      feature: 'catalogs',
      read: ['identity.*', 'status.*', 'lineage.*', 'data.material', 'data.options'],
      write: ['data.*'],
      admin: ['attachments.*']
    },
    library: {
      feature: 'libraries',
      read: ['identity.*', 'status.*', 'lineage.*', 'data.material'],
      write: ['data.*'],
      admin: ['attachments.*']
    }
  },
  construction: {
    queue: {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: [
        { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
        { id: 'jobItems', path: 'job.items', type: 'entityList', accepts: ['cassette_design'], required: false },
        { id: 'materialPool', path: 'job.materialPool', type: 'entityList', accepts: ['material_pile', 'sheet', 'remnant'], required: false }
      ]
    },
    cassette: {
      modes: ['createDefaultOccsTemplate'],
      defaultMode: 'createDefaultOccsTemplate',
      inputs: [
        { id: 'name', path: 'name', type: 'string', required: true, prompt: true }
      ]
    },
    cassette_design: {
      modes: ['bakeCassetteDesignFromTemplate'],
      defaultMode: 'bakeCassetteDesignFromTemplate',
      derived: true,
      inputs: [
        { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
        { id: 'templateId', path: 'templateId', type: 'entity', entityType: 'cassette', required: true, prompt: true },
        { id: 'parameters', path: 'parameters', type: 'cassetteParameters', templateFieldId: 'templateId', required: false, prompt: true }
      ]
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
                  initial: INITIAL_STATE,
                  states: { [INITIAL_STATE]: {}, [NEXT_STATE]: {} },
                  transitions: [{ from: INITIAL_STATE, to: NEXT_STATE }]
                }
              }
            }
          },
          fields: { read: ['identity.*'], write: [], private: [] }
        }
      }
    }, domain);

    expect(compiled.workflows.project.regions.main.initial).toBe(INITIAL_STATE);
    expect(compiled.workflows.project.regions.main.transitions[0]).toMatchObject({ from: INITIAL_STATE, to: NEXT_STATE });
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

  it('checks typed port compatibility for core process values', () => {
    expect(portSpecsCompatible(
      { id: 'created', kind: 'entity', entityType: 'project' },
      { id: 'entity', kind: 'entity', entityType: 'project' }
    ).ok).toBe(true);
    expect(portSpecsCompatible(
      { id: 'created', kind: 'entity', entityType: 'project' },
      { id: 'entity', kind: 'entity', entityType: 'queue' }
    ).ok).toBe(false);
    expect(portSpecsCompatible(
      { id: 'created', kind: 'entity', entityType: 'project' },
      { id: 'items', kind: 'entity_list', entityType: 'project' }
    ).ok).toBe(false);
    expect(portSpecsCompatible(
      { id: 'completed', kind: 'event' },
      { id: 'trigger', kind: 'event' }
    ).ok).toBe(true);
    expect(portSpecsCompatible(
      { id: 'completed', kind: 'event' },
      { id: 'entity', kind: 'entity', entityType: 'project' }
    ).ok).toBe(false);
    expect(portSpecsCompatible(
      { id: 'status', kind: 'status' },
      { id: 'status', kind: 'status' }
    ).ok).toBe(true);
    expect(portSpecsCompatible(
      { id: 'name', kind: 'block', block: 'identity', dataPath: 'identity.name' },
      { id: 'name', kind: 'data', dataPath: 'name' }
    ).ok).toBe(true);
  });

  it('rejects persisted edges between incompatible concrete ports', () => {
    const validation = validateProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      graph: {
        nodes: [
          { id: 'create_project', type: 'action', position: {}, data: { refId: 'create_project' } },
          { id: 'update_queue', type: 'action', position: {}, data: { refId: 'update_queue' } }
        ],
        edges: [
          {
            id: 'project-to-queue',
            source: 'create_project',
            target: 'update_queue',
            sourceHandle: 'output',
            targetHandle: 'input:entity'
          }
        ]
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: SOURCE_STATE },
          access: { roleIds: ['role_admin'], level: 'write' },
          inputs: [{ id: 'status', kind: 'status' }],
          outputs: [{ id: 'created', entityType: 'project', status: SOURCE_STATE }]
        },
        update_queue: {
          id: 'update_queue',
          actionKind: 'mutateEntity',
          access: { roleIds: ['role_admin'], level: 'write' },
          inputs: [{ id: 'entity', entityType: 'queue' }],
          outputs: [{ id: 'entity', entityType: 'queue' }],
          mutation: { fields: [] }
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('incompatible ports');
  });

  it('accepts compatible generic entity, parent, and command-output ports', () => {
    const validation = validateProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator', label: 'Operator' }
      },
      entityProfiles: {
        library_profile: {
          id: 'library_profile',
          entityType: 'library',
          lifecycle: { mode: 'defaultCreated' },
          fields: { read: ['identity.*'], write: [], private: [] },
          allowedRoles: { read: ['role_operator'] },
          outputs: [{ id: 'entity', entityType: 'library' }]
        }
      },
      graph: {
        nodes: [
          { id: 'create_queue', type: 'action', position: {}, data: { refId: 'create_queue' } },
          { id: 'create_cassette', type: 'action', position: {}, data: { refId: 'create_cassette' } },
          { id: 'solve_nesting', type: 'action', position: {}, data: { refId: 'solve_nesting' } },
          { id: 'mark_run_cut', type: 'action', position: {}, data: { refId: 'mark_run_cut' } },
          { id: 'mark_sheet_cut', type: 'action', position: {}, data: { refId: 'mark_sheet_cut' } },
          { id: 'library_profile', type: 'entity', position: {}, data: { refId: 'library_profile' } }
        ],
        edges: [
          { id: 'queue-cassette-parent', source: 'create_queue', target: 'create_cassette', sourceHandle: 'output', targetHandle: 'input:parent' },
          { id: 'run-cut', source: 'solve_nesting', target: 'mark_run_cut', sourceHandle: 'output:entity_revision', targetHandle: 'input:entity' },
          { id: 'sheet-cut', source: 'solve_nesting', target: 'mark_sheet_cut', sourceHandle: 'output:sheet_design', targetHandle: 'input:entity' },
          { id: 'library-cassette-parent', source: 'library_profile', target: 'create_cassette', sourceHandle: 'output', targetHandle: 'input:parent' }
        ]
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          status: { to: SOURCE_STATE },
          access: { roleIds: ['role_operator'], level: 'write' },
          outputs: [{ id: 'created', entityType: 'queue' }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          entityType: 'cassette',
          parentEntityType: 'library',
          status: { to: SOURCE_STATE },
          access: { roleIds: ['role_operator'], level: 'write' },
          inputs: [{ id: 'parent', entityType: 'library' }],
          outputs: [{ id: 'created', entityType: 'cassette' }]
        },
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          access: { roleIds: ['role_operator'], level: 'write' },
          inputs: [{ id: 'queue', entityType: 'queue' }],
          outputs: [
            { id: 'entity_revision', entityType: 'entity_revision', multiple: true },
            { id: 'sheet_design', entityType: 'sheet_design', multiple: true }
          ]
        },
        mark_run_cut: {
          id: 'mark_run_cut',
          actionKind: 'mutateEntity',
          status: { to: 'CUT' },
          access: { roleIds: ['role_operator'], level: 'write' },
          inputs: [{ id: 'entity', entityType: 'entity_revision' }],
          outputs: [{ id: 'entity', entityType: 'entity_revision' }]
        },
        mark_sheet_cut: {
          id: 'mark_sheet_cut',
          actionKind: 'mutateEntity',
          status: { to: 'CUT' },
          access: { roleIds: ['role_operator'], level: 'write' },
          inputs: [{ id: 'entity', entityType: 'sheet_design' }],
          outputs: [{ id: 'entity', entityType: 'sheet_design' }]
        }
      }
    }, domain);

    expect(validation.ok).toBe(true);
    expect(validation.errors.join('\n')).not.toContain('incompatible ports');
  });

  it('keeps stale create parent metadata generic during edge validation', () => {
    const validation = validateProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator', label: 'Operator' }
      },
      graph: {
        nodes: [
          { id: 'create_queue', type: 'action', position: {}, data: { refId: 'create_queue' } },
          { id: 'create_cassette', type: 'action', position: {}, data: { refId: 'create_cassette' } },
          { id: 'library_profile', type: 'entity', position: {}, data: { refId: 'library_profile' } }
        ],
        edges: [
          {
            id: 'action_1782325272900-output-action_1782325155992-input:parent-1782325499401',
            source: 'create_queue',
            target: 'create_cassette'
          },
          {
            id: 'action_1782406722872-output-action_1782326891750-input:parent-1782407146418',
            source: 'library_profile',
            target: 'create_cassette'
          }
        ]
      },
      entityProfiles: {
        library_profile: {
          id: 'library_profile',
          entityType: 'library',
          outputs: [{ id: 'entity', entityType: 'library' }]
        }
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          outputs: [{ id: 'created', entityType: 'queue' }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          entityType: 'cassette',
          parentEntityType: 'cassette',
          inputs: [{ id: 'parent', label: 'cassette', entityType: 'cassette', required: false }],
          outputs: [{ id: 'created', entityType: 'cassette' }]
        }
      }
    }, domain);

    const portErrors = validation.errors.filter(error => error.includes('connects incompatible ports'));
    expect(portErrors).toEqual([]);
  });

  it('accepts same-entity command collection outputs into row entity inputs', () => {
    const validation = validateProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator', label: 'Operator' }
      },
      graph: {
        nodes: [
          { id: 'solve_nesting', type: 'action', position: {}, data: { refId: 'solve_nesting' } },
          { id: 'mark_run_cut', type: 'action', position: {}, data: { refId: 'mark_run_cut' } },
          { id: 'mark_sheet_cut', type: 'action', position: {}, data: { refId: 'mark_sheet_cut' } }
        ],
        edges: [
          {
            id: 'action_1782325683073-output:entity_revision-action_1782325734315-input:entity-1782325754528',
            source: 'solve_nesting',
            target: 'mark_run_cut'
          },
          {
            id: 'action_1782325683073-output:sheet_design-action_1782402888990-input:entity-1782402899087',
            source: 'solve_nesting',
            target: 'mark_sheet_cut'
          }
        ]
      },
      actions: {
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          outputs: [
            { id: 'entity_revision', label: 'entity_revision', entityType: 'entity_revision', multiple: true },
            { id: 'sheet_design', label: 'sheet_design', entityType: 'sheet_design', multiple: true }
          ]
        },
        mark_run_cut: {
          id: 'mark_run_cut',
          actionKind: 'mutateEntity',
          inputs: [{ id: 'entity', label: 'entity_revision', entityType: 'entity_revision', multiple: true }],
          outputs: [{ id: 'entity', entityType: 'entity_revision' }]
        },
        mark_sheet_cut: {
          id: 'mark_sheet_cut',
          actionKind: 'mutateEntity',
          inputs: [{ id: 'entity', label: 'sheet_design', entityType: 'sheet_design', multiple: true }],
          outputs: [{ id: 'entity', entityType: 'sheet_design' }]
        }
      }
    }, domain);

    const portErrors = validation.errors.filter(error => error.includes('connects incompatible ports'));
    expect(portErrors).toEqual([]);
  });

  it('round-trips typed process algebra nodes as semantic records', () => {
    const definition = {
      graph: {
        nodes: [
          { id: 'queue_profile', type: 'entity', position: {}, data: { refId: 'queue_profile' } },
          { id: 'decompose_queue', type: 'processNode', position: {}, data: { refId: 'decompose_queue' } },
          { id: 'read_name', type: 'processNode', position: {}, data: { refId: 'read_name' } },
          { id: 'name_exists', type: 'processNode', position: {}, data: { refId: 'name_exists' } }
        ],
        edges: [
          { id: 'queue-decompose', source: 'queue_profile', target: 'decompose_queue', sourceHandle: 'output', targetHandle: 'input:entity' },
          { id: 'decompose-read', source: 'decompose_queue', target: 'read_name', sourceHandle: 'output:identity', targetHandle: 'input:block' },
          { id: 'read-compare', source: 'read_name', target: 'name_exists', sourceHandle: 'output', targetHandle: 'input:left' }
        ]
      },
      entityProfiles: {
        queue_profile: {
          id: 'queue_profile',
          entityType: 'queue',
          lifecycle: { mode: 'defaultCreated' },
          fields: { read: ['identity.*'], write: [], private: [] },
          outputs: [{ id: 'entity', entityType: 'queue' }]
        }
      },
      processNodes: {
        decompose_queue: {
          id: 'decompose_queue',
          kind: 'fieldRead',
          entityType: 'queue',
          inputs: [{ id: 'entity', kind: 'entity', entityType: 'queue' }],
          outputs: [{ id: 'identity', kind: 'block', block: 'identity' }]
        },
        read_name: {
          id: 'read_name',
          kind: 'blockRead',
          block: 'identity',
          path: 'name',
          valueType: 'string',
          inputs: [{ id: 'block', kind: 'block', block: 'identity' }],
          outputs: [{ id: 'value', kind: 'string', block: 'identity', dataPath: 'name' }]
        },
        name_exists: {
          id: 'name_exists',
          kind: 'compare',
          operation: 'exists',
          inputs: [{ id: 'left', kind: 'data' }],
          outputs: [{ id: 'result', kind: 'boolean' }]
        }
      }
    };

    const canvas = definitionToCanvas(definition);
    const roundTripped = canvasToDefinition(canvas, definition);
    const validation = validateProcessDefinition(roundTripped, domain);

    expect(Object.keys(roundTripped.processNodes)).toEqual(['decompose_queue', 'read_name', 'name_exists']);
    expect(validation.errors.filter(error => error.includes('connects incompatible ports'))).toEqual([]);
    expect(validation.errors.join('\n')).not.toContain('Process node');
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

  it('infers generated screens from role grants when no explicit screen is authored', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator', label: 'Operator' }
      },
      entityProfiles: {
        queue_profile: {
          id: 'queue_profile',
          entityType: 'queue',
          allowedRoles: { read: ['role_operator'], write: ['role_operator'] }
        }
      },
      actions: {
        action_accept: {
          id: 'action_accept',
          label: 'Accept',
          actionKind: 'mutateEntity',
          entityType: 'queue',
          status: { to: 'NEXT_STATUS' },
          access: { roleIds: ['role_operator'], level: 'write' }
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

    expect(compiled.screens.auto_role_operator_queue).toMatchObject({
      entityType: 'queue',
      roleIds: ['role_operator'],
      required: { feature: 'queues', level: 'read' },
      actions: ['action_accept']
    });
    expect(compiled.screens.auto_role_operator_queue_detail).toMatchObject({
      entityType: 'queue',
      roleIds: ['role_operator'],
      template: 'entityDetail',
      sources: [expect.objectContaining({
        entityType: 'queue',
        mode: 'single',
        identifier: '$screen.scope.entityId'
      })],
      actions: ['action_accept']
    });
    expect(compiled.userAccess.user_a.screens.find(screen => screen.screenKey === 'auto_queue')).toMatchObject({
      screenKey: 'auto_queue',
      route: '/screens/auto_queue',
      entityType: 'queue',
      actions: ['action_accept']
    });
    expect(compiled.userAccess.user_a.navigation[0]).toMatchObject({
      route: '/screens/home_user_a',
      screenKey: 'home_user_a'
    });
    expect(compiled.userAccess.user_a.screens.find(screen => screen.template === 'home')).toMatchObject({
      screenKey: 'home_user_a',
      sources: [expect.objectContaining({ entityType: 'queue', mode: 'list' })]
    });
  });

  it('includes generated screens for every assigned role grant', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_queue: { id: 'role_queue', label: 'Queue role' },
        role_project: { id: 'role_project', label: 'Project role' }
      },
      entityProfiles: {
        queue_profile: {
          id: 'queue_profile',
          entityType: 'queue',
          allowedRoles: { read: ['role_queue'] }
        },
        project_profile: {
          id: 'project_profile',
          entityType: 'project',
          allowedRoles: { read: ['role_project'] }
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_queue', 'role_project'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    expect(resolveScreens({ compiled, userId: 'user_a' }).map(screen => screen.screenKey).sort()).toEqual([
      'auto_project_detail',
      'auto_project',
      'auto_queue_detail',
      'auto_queue',
      'home_user_a'
    ].sort());
    expect(compiled.userAccess.user_a.screens.find(screen => screen.template === 'home')).toMatchObject({
      screenKey: 'home_user_a'
    });
    expect(compiled.userAccess.user_a.permissions).toMatchObject({
      projects: [{ level: 'read' }],
      queues: [{ level: 'read' }]
    });
  });

  it('does not infer operational screens for domain meta entities', () => {
    const metaDomain = {
      ...domain,
      entities: (domain.entities || []).map(entity => (
        entity.type === 'user' ? { ...entity, meta: true } : entity
      ))
    };
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: {
          id: 'role_admin',
          label: 'Admin',
          grants: [{ feature: 'users', level: 'read' }]
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_admin'],
          bindings: {},
          status: 'active'
        }
      }
    }, metaDomain);

    expect(Object.keys(compiled.screens)).not.toContain('auto_role_admin_user');
    expect(compiled.userAccess.user_a.permissions.users).toEqual([{ level: 'read' }]);
  });

  it('synthesizes home sections from authored list screens', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_queue: { id: 'role_queue', label: 'Queue role' }
      },
      entityProfiles: {
        queue_profile: {
          id: 'queue_profile',
          entityType: 'queue',
          allowedRoles: { read: ['role_queue'] }
        }
      },
      screens: {
        queue_home: {
          id: 'queue_home',
          label: 'Queues',
          template: 'entityList',
          placement: 'hub',
          route: '/queue-home',
          entityType: 'queue',
          roleIds: ['role_queue']
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_queue'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    const home = compiled.userAccess.user_a.screens.find(screen => screen.template === 'home');
    expect(home).toMatchObject({
      screenKey: 'home_user_a',
      sources: [expect.objectContaining({ entityType: 'queue', mode: 'list' })]
    });
    expect(home.regions[0]).toMatchObject({
      sourceId: 'home_queue',
      screenKey: 'queue_home:/queue-home'
    });
  });

  it('does not pin inferred screens to one status when a role has multiple grants for the same entity', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project: { id: 'role_project', label: 'Project role' }
      },
      actions: {
        create_project_created: {
          id: 'create_project_created',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'CREATED' },
          access: { level: 'write', roleIds: ['role_project'] }
        },
        create_project_new: {
          id: 'create_project_new',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'NEW' },
          access: { level: 'admin', roleIds: ['role_project'] }
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_project'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.screens.auto_role_project_project.required).toEqual({
      feature: 'projects',
      level: 'read',
      rule: {
        any: [
          { fact: 'primaryStatus', equals: 'CREATED' },
          { fact: 'primaryStatus', equals: 'NEW' }
        ]
      }
    });
    expect(compiled.userAccess.user_a.screens.find(screen => screen.screenKey === 'auto_project')).toMatchObject({
      screenKey: 'auto_project',
      entityType: 'project',
      required: {
        feature: 'projects',
        level: 'read',
        rule: {
          any: [
            { fact: 'primaryStatus', equals: 'CREATED' },
            { fact: 'primaryStatus', equals: 'NEW' }
          ]
        }
      },
      actions: ['create_project_created', 'create_project_new']
    });
  });

  it('merges same-entity generated screens across assigned roles', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_reader: { id: 'role_reader', label: 'Reader' },
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      actions: {
        create_project_created: {
          id: 'create_project_created',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'CREATED' },
          access: { level: 'read', roleIds: ['role_reader'] }
        },
        create_project_active: {
          id: 'create_project_active',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'ACTIVE' },
          access: { level: 'admin', roleIds: ['role_admin'] }
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_reader', 'role_admin'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    const projectScreens = compiled.userAccess.user_a.screens.filter(screen => screen.entityType === 'project' && screen.template === 'entityList');
    expect(projectScreens).toHaveLength(1);
    expect(projectScreens[0]).toMatchObject({
      screenKey: 'auto_project',
      route: '/screens/auto_project',
      sourceRoleIds: ['role_reader', 'role_admin'],
      actions: ['create_project_active'],
      required: {
        feature: 'projects',
        level: 'read',
        rule: {
          any: [
            { fact: 'primaryStatus', equals: 'CREATED' },
            { fact: 'primaryStatus', equals: 'ACTIVE' }
          ]
        }
      },
      sources: [expect.objectContaining({
        required: {
          feature: 'projects',
          level: 'read',
          rule: {
            any: [
              { fact: 'primaryStatus', equals: 'CREATED' },
              { fact: 'primaryStatus', equals: 'ACTIVE' }
            ]
          }
        }
      })]
    });
    expect(compiled.userAccess.user_a.navigation.filter(item => item.screenKey === 'auto_project')).toHaveLength(1);
  });

  it('treats stale same-entity create parent inputs as root create actions', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_cassette: { id: 'role_cassette', label: 'Cassette role' }
      },
      actions: {
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          entityType: 'cassette',
          parentEntityType: 'cassette',
          status: { to: 'CREATED' },
          access: { level: 'write', roleIds: ['role_cassette'] },
          inputs: [{ id: 'parent', label: 'cassette', entityType: 'cassette', required: false }]
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_cassette'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.actions.create_cassette.parentEntityType).toBeNull();
    expect(compiled.roles.role_cassette.actions[0]).toMatchObject({
      actionId: 'create_cassette',
      parentEntityType: null,
      inputs: [expect.objectContaining({ id: 'parent', entityType: '' })]
    });
    expect(compiled.screens.auto_role_cassette_cassette.actions).toContain('create_cassette');
    expect(compiled.screens.auto_role_cassette_cassette_detail.actions).not.toContain('create_cassette');
  });

  it('strips create parent inputs unsupported by domain relations or construction inputs', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_queue: { id: 'role_queue', label: 'Queue role' }
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          parentEntityType: 'cassette',
          status: { to: 'CREATED' },
          access: { level: 'write', roleIds: ['role_queue'] },
          inputs: [{ id: 'parent', label: 'cassette', entityType: 'cassette', required: false }]
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_queue'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.actions.create_queue.parentEntityType).toBeNull();
    expect(compiled.actions.create_queue.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'parent', entityType: '', required: false })
    ]));
    expect(compiled.roles.role_queue.actions[0]).toMatchObject({
      actionId: 'create_queue',
      parentEntityType: null
    });
    expect(compiled.screens.auto_role_queue_queue.actions).toContain('create_queue');
    expect(compiled.screens.auto_role_queue_cassette).toBeUndefined();
  });

  it('does not expose create actions to roles with read-only target grants', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_writer: { id: 'role_writer', label: 'Writer' },
        role_reader: { id: 'role_reader', label: 'Reader' }
      },
      actions: {
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          entityType: 'cassette',
          status: { to: 'CREATED' },
          access: {
            grants: [
              { roleId: 'role_writer', level: 'write' },
              { roleId: 'role_reader', level: 'read' }
            ]
          }
        }
      },
      assignments: {
        user_writer: { userId: 'user_writer', roleIds: ['role_writer'], status: 'active' },
        user_reader: { userId: 'user_reader', roleIds: ['role_reader'], status: 'active' }
      }
    }, domain);

    expect(compiled.roles.role_writer.actions.map(action => action.actionId)).toContain('create_cassette');
    expect(compiled.roles.role_reader.actions.map(action => action.actionId)).not.toContain('create_cassette');
    expect(compiled.userAccess.user_writer.actions.map(action => action.actionId)).toContain('create_cassette');
    expect(compiled.userAccess.user_reader.actions.map(action => action.actionId)).not.toContain('create_cassette');
  });

  it('exposes manual status actions through inherited access windows', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project: { id: 'role_project', label: 'Project role' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: 'NEW' },
          access: { level: 'admin', roleIds: ['role_project'] }
        },
        approve_project: {
          id: 'approve_project',
          actionKind: 'mutateEntity',
          status: { to: 'APPROVED' },
          access: { level: 'admin', roleIds: [] }
        }
      },
      graph: {
        nodes: [
          { id: 'create_node', type: 'action', data: { refId: 'create_project' } },
          { id: 'approve_node', type: 'action', data: { refId: 'approve_project' } }
        ],
        edges: [{ id: 'edge_create_approve', source: 'create_node', target: 'approve_node' }]
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_project'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.userAccess.user_a.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionId: 'approve_project',
        actionKind: 'mutateEntity',
        feature: 'projects',
        entityType: 'project',
        status: { from: 'NEW', to: 'APPROVED' }
      })
    ]));
    expect(compiled.userAccess.user_a.screens.find(screen => screen.entityType === 'project').actions)
      .toEqual(expect.arrayContaining(['approve_project']));
  });

  it('uses canonical entity collections for derived process action screens', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_designer: { id: 'role_designer', label: 'Designer' }
      },
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          entityType: 'cassette_design',
          status: { to: 'RECEIVED' },
          access: { level: 'write', roleIds: ['role_designer'] }
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_designer'],
          bindings: {},
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.userAccess.user_a.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionId: 'create_design',
        feature: 'cassette_designs',
        entityType: 'cassette_design'
      })
    ]));
    expect(compiled.userAccess.user_a.screens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityType: 'cassette_design',
        required: expect.objectContaining({ feature: 'cassette_designs' })
      })
    ]));
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
          actions: []
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
      route: '/screens/assigned_project%3Aproject-123',
      sourceRoute: '/project/p-123/details',
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

  it('validates generated screen sources and action references', () => {
    const validation = validateProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      screens: {
        project_workspace: {
          id: 'project_workspace',
          route: '/projects',
          roleIds: ['role_operator'],
          template: 'workspaceLanes',
          entityType: 'missingEntity',
          sources: [{ id: 'missing', entityType: 'missingEntity', mode: 'list' }],
          regions: [{ id: 'main', slot: 'center', sourceId: 'missing', surface: 'card' }],
          actions: ['missing_action']
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('unknown entity type missingEntity');
    expect(validation.errors.join('\n')).toContain('references missing action missing_action');
  });

  it('compiles generated screen template, sources, regions, and actions', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          label: 'Create project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'] }
        }
      },
      screens: {
        projects: {
          id: 'projects',
          label: 'Projects',
          route: '/projects',
          roleIds: ['role_operator'],
          template: 'entityList',
          entityType: 'project',
          bindings: { projectId: '$assignment.projectId' },
          sources: [{ id: 'project', entityType: 'project', mode: 'list', filters: { projectId: '$assignment.projectId' } }],
          regions: [{ id: 'main', slot: 'main', sourceId: 'project', surface: 'card', actions: ['create_project'] }],
          actions: ['create_project']
        }
      },
      assignments: {
        user_a: {
          userId: 'user_a',
          roleIds: ['role_operator'],
          bindings: { projectId: 'project-123' },
          status: 'active'
        }
      }
    }, domain);

    const screen = resolveScreens({ compiled, userId: 'user_a' })
      .find(item => item.screenKey === 'projects:project-123');
    expect(screen).toMatchObject({
      template: 'entityList',
      route: '/screens/projects%3Aproject-123',
      sourceRoute: '/projects',
      sources: [{ id: 'project', entityType: 'project', mode: 'list', filters: { projectId: 'project-123' } }],
      regions: [{ id: 'main', slot: 'main', sourceId: 'project', surface: 'card', actions: ['create_project'] }],
      actions: ['create_project']
    });
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
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [],
          outputs: [{ id: 'created', entityType: 'project', status: INITIAL_STATE }]
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
          actionKind: 'mutateEntity',
          status: { to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: [] },
          inputs: [{ id: 'entity', label: 'Incoming entity' }],
          outputs: [{ id: 'entity', label: 'Same entity', status: TARGET_STATE }],
          events: [{ id: 'completed', label: 'Activate incoming completed', kind: 'event' }]
        }
      }
    }, domain);

    expect(compiled.actions.activate_incoming).toMatchObject({
      actionKind: 'mutateEntity',
      entityType: null,
      status: { to: TARGET_STATE },
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
          status: { to: INITIAL_STATE },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: [] },
          inputs: [{ id: 'parent', entityType: 'project' }],
          outputs: [{ id: 'created', entityType: 'queue', status: INITIAL_STATE }]
        }
      }
    }, domain);

    expect(compiled.actions.create_queue.parentEntityType).toBe('project');
    expect(compiled.actions.create_queue).toMatchObject({
      parentInputKey: 'projectId',
      parentLineageRole: 'project'
    });
    expect(compiled.actions.create_queue.inputs[0]).toMatchObject({ id: 'parent', entityType: 'project' });
  });

  it('places parent-bound create actions on parent detail child regions', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', entityType: 'project', status: SOURCE_STATE }]
        },
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          parentEntityType: 'project',
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [{ id: 'parent', entityType: 'project' }],
          outputs: [{ id: 'created', entityType: 'queue', status: INITIAL_STATE }]
        }
      },
      assignments: {
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    const projectDetail = compiled.screens.auto_role_admin_project_detail;
    expect(projectDetail.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'queue_children',
        entityType: 'queue',
        mode: 'list',
        filters: { projectId: '$screen.scope.entityId' }
      })
    ]));
    expect(projectDetail.regions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'queue_children',
        actions: ['create_queue']
      })
    ]));
    expect(compiled.screens.auto_role_admin_queue.actions).toContain('create_queue');
  });

  it('uses graph parent input edges over stale create parent metadata', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      actions: {
        create_library: {
          id: 'create_library',
          actionKind: 'createEntity',
          entityType: 'library',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', entityType: 'library', status: SOURCE_STATE }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          entityType: 'cassette',
          parentEntityType: 'cassette',
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [{ id: 'parent', entityType: 'cassette' }],
          outputs: [{ id: 'created', entityType: 'cassette', status: INITIAL_STATE }]
        }
      },
      graph: {
        nodes: [
          { id: 'create_library', type: 'action', data: { refId: 'create_library' } },
          { id: 'create_cassette', type: 'action', data: { refId: 'create_cassette' } }
        ],
        edges: [
          {
            id: 'library-to-cassette-parent',
            source: 'create_library',
            target: 'create_cassette',
            sourceHandle: 'output',
            targetHandle: 'input:parent'
          }
        ]
      },
      assignments: {
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    expect(compiled.actions.create_cassette.parentEntityType).toBe('library');
    expect(compiled.actions.create_cassette.inputs[0]).toMatchObject({ id: 'parent', entityType: 'library', required: true });
    expect(compiled.screens.auto_role_admin_library_detail.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'cassette_children',
        entityType: 'cassette',
        filters: { libraryId: '$screen.scope.entityId' }
      })
    ]));
    expect(compiled.screens.auto_role_admin_library_detail.regions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'cassette_children',
        actions: ['create_cassette']
      })
    ]));
  });

  it('places readable domain children on parent detail screens without requiring create access', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_reader: { id: 'role_reader', label: 'Reader' }
      },
      actions: {
        create_library: {
          id: 'create_library',
          actionKind: 'createEntity',
          entityType: 'library',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'read', roleIds: ['role_reader'] },
          outputs: [{ id: 'created', entityType: 'library', status: SOURCE_STATE }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          entityType: 'cassette',
          parentEntityType: 'library',
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'read', roleIds: ['role_reader'] },
          inputs: [{ id: 'parent', entityType: 'library' }],
          outputs: [{ id: 'created', entityType: 'cassette', status: INITIAL_STATE }]
        }
      },
      assignments: {
        user_reader: { userId: 'user_reader', roleIds: ['role_reader'], status: 'active' }
      }
    }, domain);

    const libraryDetail = compiled.screens.auto_role_reader_library_detail;
    expect(libraryDetail.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'cassette_children',
        entityType: 'cassette',
        mode: 'list',
        filters: { libraryId: '$screen.scope.entityId' },
        required: expect.objectContaining({
          feature: 'cassette',
          level: 'read'
        })
      })
    ]));
    expect(libraryDetail.regions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'cassette_children',
        actions: []
      })
    ]));
    expect(libraryDetail.actions).not.toContain('create_cassette');
  });

  it('does not auto-render containment owned by a specialized parent detail surface', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator', label: 'Operator' }
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          status: { to: SOURCE_STATE },
          access: { level: 'write', roleIds: ['role_operator'] }
        },
        create_sheet_design: {
          id: 'create_sheet_design',
          actionKind: 'createEntity',
          entityType: 'sheet_design',
          parentEntityType: 'queue',
          status: { to: SOURCE_STATE },
          access: { level: 'write', roleIds: ['role_operator'] },
          inputs: [{ id: 'parent', entityType: 'queue' }]
        }
      },
      assignments: {
        user_operator: { userId: 'user_operator', roleIds: ['role_operator'], status: 'active' }
      }
    }, domain);

    const queueDetail = compiled.screens.auto_role_operator_queue_detail;
    expect(queueDetail.sources.map(source => source.entityType)).not.toContain('sheet_design');
    expect(queueDetail.regions.map(region => region.sourceId)).not.toContain('sheet_design_children');
  });

  it('does not infer child regions without a domain parent relation', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', entityType: 'project', status: SOURCE_STATE }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          entityType: 'cassette',
          parentEntityType: 'project',
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [{ id: 'parent', entityType: 'project' }],
          outputs: [{ id: 'created', entityType: 'cassette', status: INITIAL_STATE }]
        }
      },
      assignments: {
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    expect(compiled.screens.auto_role_admin_project_detail.sources.map(source => source.entityType)).not.toContain('cassette');
  });

  it('does not treat construction entity inputs as parent-bound create actions', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      actions: {
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          entityType: 'cassette',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', entityType: 'cassette', status: SOURCE_STATE }]
        },
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          entityType: 'cassette_design',
          parentEntityType: 'cassette',
          status: { to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [{ id: 'parent', entityType: 'cassette', status: SOURCE_STATE }],
          outputs: [{ id: 'created', entityType: 'cassette_design', status: TARGET_STATE }]
        }
      },
      assignments: {
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    expect(compiled.actions.create_design.parentEntityType).toBeNull();
    expect(compiled.actions.create_design.inputs[0]).toMatchObject({
      id: 'parent',
      entityType: '',
      required: false
    });
    const detail = compiled.screens.auto_role_admin_cassette_detail;
    expect(detail.regions.find(region => region.id === 'main').actions).not.toContain('create_design');
    expect(compiled.userAccess.user_admin.screens.find(screen => screen.screenKey === 'auto_cassette_detail').actions).not.toContain('create_design');
    expect(compiled.screens.auto_role_admin_cassette_design.actions).toContain('create_design');
    expect(compiled.screens.auto_role_admin_cassette_design_detail.actions).not.toContain('create_design');
  });

  it('does not use queue outputs as cassette design construction parents', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_installer: { id: 'role_installer', label: 'Installer' }
      },
      entityProfiles: {
        cassette_profile: {
          id: 'cassette_profile',
          entityType: 'cassette',
          allowedRoles: { read: ['role_installer'] }
        }
      },
      graph: {
        nodes: [
          { id: 'create_queue', type: 'action', data: { refId: 'create_queue' } },
          { id: 'create_design', type: 'action', data: { refId: 'create_design' } }
        ],
        edges: [
          {
            id: 'queue-to-design-parent',
            source: 'create_queue',
            target: 'create_design',
            sourceHandle: 'output',
            targetHandle: 'input:parent'
          }
        ]
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_installer'] },
          outputs: [{ id: 'created', entityType: 'queue', status: SOURCE_STATE }]
        },
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          entityType: 'cassette_design',
          parentEntityType: 'cassette',
          status: { to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_installer'] },
          inputs: [{ id: 'parent', entityType: 'cassette' }],
          outputs: [{ id: 'created', entityType: 'cassette_design', status: TARGET_STATE }]
        }
      },
      assignments: {
        user_installer: { userId: 'user_installer', roleIds: ['role_installer'], status: 'active' }
      }
    }, domain);

    expect(compiled.actions.create_design.parentEntityType).toBeNull();
    expect(compiled.actions.create_design.inputs[0]).toMatchObject({
      id: 'parent',
      entityType: '',
      required: false
    });
    expect(compiled.userAccess.user_installer.actions.find(action => action.actionId === 'create_design')).toMatchObject({
      parentEntityType: null
    });
    expect(compiled.screens.auto_role_installer_queue_detail?.actions || []).not.toContain('create_design');
  });

  it('compiles typed construction and status definitions into actions and workflows', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      statusDefinitions: {
        status_review: {
          id: 'status_review',
          statusId: 'REVIEW',
          label: 'Review',
          severity: 'warn',
          color: 'warn',
          icon: 'pi pi-eye',
          lifecycle: {
            description: { required: true },
            attachments: {
              proof: { kind: 'photo', required: true }
            },
            snapshots: {
              designs: { entityType: 'cassette_design', lineageRole: 'queue', required: true }
            }
          }
        }
      },
      valueInputs: {
        design_name: {
          id: 'design_name',
          block: 'identity',
          valueType: 'string',
          path: 'identity.name',
          value: 'Named design',
          icon: 'pi pi-id-card'
        }
      },
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          entityType: 'cassette_design',
          statusRef: 'status_review',
          construction: {
            mode: 'bakeCassetteDesignFromTemplate',
            inputs: [
              { id: 'name', path: 'name' },
              { id: 'templateId', path: 'templateId' }
            ]
          },
          inputPolicy: {
            prompt: true,
            fields: [
              { id: 'name', path: 'name', default: 'Named design' },
              { id: 'templateId', path: 'templateId' }
            ]
          },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', entityType: 'cassette_design' }]
        }
      }
    }, domain);

    expect(compiled.actions.create_design.status).toMatchObject({ to: 'REVIEW' });
    expect(compiled.actions.create_design.status).toMatchObject({
      label: 'Review',
      color: 'warn',
      severity: 'warn',
      icon: 'pi pi-eye'
    });
    expect(compiled.actions.create_design.construction.mode).toBe('bakeCassetteDesignFromTemplate');
    expect(compiled.statusDefinitions.status_review).toMatchObject({
      statusId: 'REVIEW',
      severity: 'warn',
      color: 'warn',
      lifecycle: {
        description: { required: true },
        attachments: {
          proof: { kind: 'photo', required: true }
        },
        snapshots: {
          designs: { entityType: 'cassette_design', lineageRole: 'queue', required: true }
        }
      }
    });
    expect(compiled.valueInputs.design_name).toMatchObject({
      block: 'identity',
      path: 'identity.name',
      value: 'Named design',
      icon: 'pi pi-id-card'
    });
    expect(compiled.workflows.cassette_design.regions.main.states.REVIEW).toMatchObject({
      label: 'Review',
      color: 'warn',
      severity: 'warn',
      icon: 'pi pi-eye',
      lifecycle: {
        description: { required: true },
        attachments: {
          proof: { kind: 'photo', required: true }
        },
        snapshots: {
          designs: { entityType: 'cassette_design', lineageRole: 'queue', required: true }
        }
      }
    });
  });

  it('labels status-change actions from their target status definition', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      statusDefinitions: {
        status_deleted: {
          id: 'status_deleted',
          statusId: 'DELETED',
          label: 'Deleted',
          severity: 'danger',
          icon: 'pi pi-ban'
        }
      },
      actions: {
        delete_queue: {
          id: 'delete_queue',
          label: 'Action',
          actionKind: 'mutateEntity',
          statusRef: 'status_deleted',
          status: { from: 'CREATED' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          inputs: [{ id: 'entity', entityType: 'queue', status: 'CREATED' }],
          outputs: [{ id: 'entity', entityType: 'queue', status: 'DELETED' }]
        }
      }
    }, domain);

    expect(compiled.actions.delete_queue.label).toBe('Deleted');
    expect(compiled.actions.delete_queue.status).toMatchObject({
      to: 'DELETED',
      label: 'Deleted',
      severity: 'danger',
      icon: 'pi pi-ban'
    });
    expect(compiled.roles.role_admin.actions[0].status).toMatchObject({
      to: 'DELETED',
      label: 'Deleted',
      severity: 'danger',
      icon: 'pi pi-ban'
    });
  });

  it('normalizes generic creation for derived construction contracts to the typed mode', () => {
    const validation = validateProcessDefinition({
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          entityType: 'cassette_design',
          status: { to: 'CREATED' },
          construction: { mode: 'genericCreate', inputs: [] },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: [] },
          outputs: [{ id: 'created', entityType: 'cassette_design', status: 'CREATED' }]
        }
      }
    }, domain);

    expect(validation.ok).toBe(true);
    const compiled = compileProcessDefinition({
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          entityType: 'cassette_design',
          status: { to: 'CREATED' },
          construction: { mode: 'genericCreate', inputs: [] },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: [] },
          outputs: [{ id: 'created', entityType: 'cassette_design', status: 'CREATED' }]
        }
      }
    }, domain);
    expect(compiled.actions.create_design.construction.mode).toBe('bakeCassetteDesignFromTemplate');
  });

  it('hydrates create prompts from the domain construction contract', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          entityType: 'cassette_design',
          status: { to: 'CREATED' },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', entityType: 'cassette_design', status: 'CREATED' }]
        }
      },
      assignments: {
        user_admin: {
          userId: 'user_admin',
          roleIds: ['role_admin'],
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.actions.create_design.construction).toMatchObject({
      mode: 'bakeCassetteDesignFromTemplate',
      inputs: expect.arrayContaining([
        expect.objectContaining({ id: 'name', prompt: true, required: true }),
        expect.objectContaining({ id: 'templateId', prompt: true, required: true }),
        expect.objectContaining({ id: 'parameters', type: 'cassetteParameters', prompt: true })
      ])
    });
    expect(compiled.userAccess.user_admin.actions[0].inputPolicy.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'name', prompt: true, required: true }),
      expect.objectContaining({ id: 'templateId', prompt: true, required: true }),
      expect.objectContaining({ id: 'parameters', type: 'cassetteParameters', prompt: true })
    ]));
  });

  it('does not require queue job items during queue creation', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          parentEntityType: 'cassette',
          status: { to: 'DRAFT' },
          construction: {
            inputs: [
              { id: 'jobItems', path: 'job.items', type: 'entityList', accepts: ['cassette_design'], required: true }
            ]
          },
          inputPolicy: {
            fields: [
              { id: 'jobItems', path: 'job.items', type: 'entityList', accepts: ['cassette_design'], required: true }
            ]
          },
          inputs: [
            { id: 'parent', label: 'cassette', entityType: 'cassette', required: false },
            { id: 'data:jobItems', path: 'job.items', type: 'entityList', accepts: ['cassette_design'], required: true, constructionInputId: 'jobItems' }
          ],
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', entityType: 'queue', status: 'DRAFT' }]
        }
      },
      assignments: {
        user_admin: {
          userId: 'user_admin',
          roleIds: ['role_admin'],
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.actions.create_queue.construction.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'name', required: true, prompt: true }),
      expect.objectContaining({ id: 'jobItems', required: false }),
      expect.objectContaining({ id: 'materialPool', required: false })
    ]));
    expect(compiled.actions.create_queue.parentEntityType).toBeNull();
    expect(compiled.actions.create_queue.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'parent', entityType: '', required: false }),
      expect.objectContaining({ id: 'data:jobItems', required: false })
    ]));
    const exposedQueueAction = compiled.userAccess.user_admin.actions[0];
    expect(exposedQueueAction.parentEntityType).toBeNull();
    expect(exposedQueueAction.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'parent', entityType: '', required: false }),
      expect.objectContaining({ id: 'data:jobItems', required: false })
    ]));
    expect(exposedQueueAction.construction.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'name', required: true, prompt: true }),
      expect.objectContaining({ id: 'jobItems', required: false })
    ]));
    expect(exposedQueueAction.inputPolicy.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'name', required: true, prompt: true })
    ]));
    expect(exposedQueueAction.inputPolicy.fields).not.toContainEqual(expect.objectContaining({ id: 'jobItems' }));
  });

  it('normalizes stale construction modes when an action entity type changes', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      actions: {
        create_template: {
          id: 'create_template',
          actionKind: 'createEntity',
          entityType: 'cassette',
          status: { to: 'ACTIVE' },
          construction: { mode: 'bakeCassetteDesignFromTemplate' },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', entityType: 'cassette', status: 'ACTIVE' }]
        }
      },
      assignments: {
        user_admin: {
          userId: 'user_admin',
          roleIds: ['role_admin'],
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.actions.create_template.construction).toMatchObject({
      mode: 'createDefaultOccsTemplate',
      inputs: [expect.objectContaining({ id: 'name', required: true, prompt: true })]
    });
    expect(compiled.userAccess.user_admin.actions[0].inputPolicy.fields).toEqual([
      expect.objectContaining({ id: 'name', required: true, prompt: true })
    ]);
  });

  it('compiles update actions with field mutation sockets', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_editor: { id: 'role_editor' }
      },
      actions: {
        update_project_data: {
          id: 'update_project_data',
          actionKind: 'mutateEntity',
          mutation: { fields: ['data.metadata'] },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_editor'] },
          inputs: [
            { id: 'entity', entityType: 'project' },
            { id: 'field:data.metadata', dataPath: 'data.metadata', kind: 'data' }
          ],
          outputs: [{ id: 'entity', entityType: 'project' }]
        }
      },
      assignments: {
        user_editor: {
          userId: 'user_editor',
          roleIds: ['role_editor'],
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.actions.update_project_data).toMatchObject({
      actionKind: 'mutateEntity',
      mutation: { fields: ['data.metadata'] },
      inputs: [
        { id: 'entity', entityType: 'project' },
        { id: 'field:data.metadata', dataPath: 'data.metadata' }
      ]
    });
    expect(compiled.userAccess.user_editor.permissions.projects[0]).toMatchObject({ level: 'write' });
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

  it('compiles inbound organization sockets as received entity outputs', () => {
    const compiled = compileProcessDefinition({
      sockets: {
        receive_project: {
          id: 'receive_project',
          direction: 'inbound',
          entityType: 'project',
          projection: { fields: ['identity.*'], excludeFields: [] },
          receiverLifecycle: { mode: 'defaultCreated', workflow: null },
          access: { receiveRoles: [] }
        }
      }
    }, domain);

    expect(compiled.sockets.receive_project).toMatchObject({
      direction: 'inbound',
      inputs: [],
      outputs: [{ id: 'received', entityType: 'project' }]
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

  it('compiles prepaid token billing on service contracts', () => {
    const compiled = compileProcessDefinition({
      services: {
        service_nesting: {
          id: 'service_nesting',
          commandId: 'solveNesting',
          billing: { mode: 'prepaidTokens', tokenCost: 3, meterKey: 'nesting.solve' }
        }
      }
    }, domain);

    expect(compiled.services.service_nesting.billing).toEqual({
      mode: 'prepaidTokens',
      tokenCost: 3,
      meterKey: 'nesting.solve'
    });
  });

  it('preserves command ids on manual command action manifests', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator', label: 'Operator' }
      },
      actions: {
        solve_queue: {
          id: 'solve_queue',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          entityType: 'queue',
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }] },
          inputs: [{ id: 'queue', entityType: 'queue' }]
        }
      },
      assignments: {
        user_operator: { userId: 'user_operator', roleIds: ['role_operator'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_operator.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionId: 'solve_queue',
        actionKind: 'runCommand',
        commandId: 'solveNesting',
        entityType: 'queue'
      })
    ]));
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
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [],
          outputs: [{ id: 'created', entityType: 'project', status: INITIAL_STATE }]
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
          status: { to: INITIAL_STATE },
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
          actionKind: 'mutateEntity',
          entityType: 'project',
          status: { from: SOURCE_STATE, to: TARGET_STATE },
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
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_creator'] },
          inputs: [],
          outputs: [{ id: 'created', entityType: 'project', status: INITIAL_STATE }]
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

    expect(compiled.userAccess.user_creator.permissions.projects[0]).toMatchObject({
      level: 'write',
      rule: { fact: 'primaryStatus', equals: INITIAL_STATE }
    });
    expect(compiled.roles.role_creator.actions[0]).toMatchObject({ actionId: 'create_project', level: 'run' });
    expect(compiled.userAccess.user_creator.actions[0]).toMatchObject({
      actionId: 'create_project',
      label: `Create project ${INITIAL_STATE}`,
      actionKind: 'createEntity',
      feature: 'projects',
      sourceRoleIds: ['role_creator']
    });
  });

  it('keeps per-role action access levels separate', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_writer: { id: 'role_writer' },
        role_admin: { id: 'role_admin' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: {
            grants: [
              { roleId: 'role_writer', level: 'write' },
              { roleId: 'role_admin', level: 'admin' }
            ]
          },
          inputs: [],
          outputs: [{ id: 'created', entityType: 'project', status: INITIAL_STATE }]
        }
      },
      assignments: {
        user_writer: { userId: 'user_writer', roleIds: ['role_writer'], status: 'active' },
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_writer.permissions.projects[0]).toMatchObject({
      level: 'write',
      rule: { fact: 'primaryStatus', equals: INITIAL_STATE }
    });
    expect(compiled.userAccess.user_admin.permissions.projects[0]).toMatchObject({
      level: 'admin',
      rule: { fact: 'primaryStatus', equals: INITIAL_STATE }
    });
  });

  it('derives status action grants for the resulting status contract', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      actions: {
        activate_project: {
          id: 'activate_project',
          actionKind: 'mutateEntity',
          status: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'], statusFrom: SOURCE_STATE, statusTo: TARGET_STATE },
          inputs: [{ id: 'entity', entityType: 'project', status: SOURCE_STATE }],
          outputs: [{ id: 'entity', entityType: 'project', status: TARGET_STATE }]
        }
      },
      assignments: {
        user_operator: {
          userId: 'user_operator',
          roleIds: ['role_operator'],
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.roles.role_operator.grants[0]).toMatchObject({
      feature: 'projects',
      level: 'write',
      transitions: [{ from: SOURCE_STATE, to: TARGET_STATE }],
      rule: { fact: 'primaryStatus', equals: TARGET_STATE }
    });
    expect(compiled.userAccess.user_operator.permissions.projects[0]).toMatchObject({
      transitions: [{ from: SOURCE_STATE, to: TARGET_STATE }],
      rule: { fact: 'primaryStatus', equals: TARGET_STATE }
    });
  });

  it('replaces inherited role grants when a status-change access window is modified', () => {
    const compiled = compileProcessDefinition({
      graph: {
        nodes: [
          { id: 'create_project', type: 'action', position: {}, data: { refId: 'create_project' } },
          { id: 'activate_project', type: 'action', position: {}, data: { refId: 'activate_project' } }
        ],
        edges: [
          {
            id: 'create_project-activate_project',
            source: 'create_project',
            target: 'activate_project',
            sourceHandle: 'output',
            targetHandle: 'input'
          }
        ]
      },
      roles: {
        role_source: { id: 'role_source' },
        role_target: { id: 'role_target' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: SOURCE_STATE },
          access: { level: 'admin', roleIds: ['role_source'] },
          outputs: [{ id: 'created', entityType: 'project', status: SOURCE_STATE }]
        },
        activate_project: {
          id: 'activate_project',
          actionKind: 'mutateEntity',
          status: { to: TARGET_STATE },
          access: {
            level: 'admin',
            roleIds: ['role_target'],
            modified: true,
            statusFrom: SOURCE_STATE,
            statusTo: TARGET_STATE
          },
          inputs: [{ id: 'entity', entityType: 'project', status: SOURCE_STATE }],
          outputs: [{ id: 'entity', entityType: 'project', status: TARGET_STATE }]
        }
      },
      assignments: {
        user_source: { userId: 'user_source', roleIds: ['role_source'], status: 'active' },
        user_target: { userId: 'user_target', roleIds: ['role_target'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_source.permissions.projects).toEqual([
      { level: 'admin', rule: { fact: 'primaryStatus', equals: SOURCE_STATE } }
    ]);
    expect(compiled.userAccess.user_target.permissions.projects).toEqual([
      {
        level: 'admin',
        transitions: [{ from: SOURCE_STATE, to: TARGET_STATE }],
        rule: { fact: 'primaryStatus', equals: TARGET_STATE }
      }
    ]);
    expect(compiled.userAccess.user_source.actions.map(action => action.actionId)).toContain('activate_project');
    expect(compiled.userAccess.user_target.actions.map(action => action.actionId)).not.toContain('activate_project');
    expect(compiled.workflows.project.regions.main.transitions[0].processRoleIds).toEqual(['role_source']);
    expect(compiled.workflows.project.regions.main.transitions[0].access).toBeUndefined();
  });

  it('carries scoped parent lineage into child entity action grants', () => {
    const compiled = compileProcessDefinition({
      graph: {
        nodes: [
          { id: 'create_project', type: 'action', position: {}, data: { refId: 'create_project' } },
          { id: 'create_queue', type: 'action', position: {}, data: { refId: 'create_queue' } }
        ],
        edges: [
          {
            id: 'create_project-create_queue',
            source: 'create_project',
            target: 'create_queue',
            sourceHandle: 'output',
            targetHandle: 'input:parent'
          }
        ]
      },
      roles: {
        role_project: { id: 'role_project' },
        role_queue: { id: 'role_queue' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: SOURCE_STATE },
          access: {
            level: 'admin',
            roleIds: ['role_project'],
            scope: { entityId: '$assignment.projectId' }
          },
          outputs: [{ id: 'created', entityType: 'project', status: SOURCE_STATE }]
        },
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          status: { to: INITIAL_STATE },
          access: { level: 'write', roleIds: ['role_queue'] },
          inputs: [{ id: 'parent', entityType: 'project' }],
          outputs: [{ id: 'created', entityType: 'queue', status: INITIAL_STATE }]
        }
      },
      assignments: {
        user_queue: {
          userId: 'user_queue',
          roleIds: ['role_queue'],
          bindings: { projectId: 'project-a' },
          status: 'active'
        }
      }
    }, domain);

    expect(compiled.userAccess.user_queue.permissions.queues).toEqual([
      {
        level: 'write',
        scope: { projectId: 'project-a' },
        rule: { fact: 'primaryStatus', equals: INITIAL_STATE }
      }
    ]);
  });

  it('inherits command output grants from the source entity window', () => {
    const compiled = compileProcessDefinition({
      graph: {
        nodes: [
          { id: 'create_queue', type: 'action', position: {}, data: { refId: 'create_queue' } },
          { id: 'solve_nesting', type: 'action', position: {}, data: { refId: 'solve_nesting' } }
        ],
        edges: [
          {
            id: 'create_queue-solve_nesting',
            source: 'create_queue',
            target: 'solve_nesting',
            sourceHandle: 'output',
            targetHandle: 'input:queue'
          }
        ]
      },
      roles: {
        role_operator: { id: 'role_operator' }
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }] },
          outputs: [{ id: 'created', entityType: 'queue', status: SOURCE_STATE }]
        },
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          trigger: { mode: 'event' },
          inputs: [{ id: 'queue', entityType: 'queue', status: SOURCE_STATE }]
        }
      },
      assignments: {
        user_operator: { userId: 'user_operator', roleIds: ['role_operator'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_operator.permissions.entity_revisions).toEqual([
      { level: 'write' }
    ]);
    expect(compiled.userAccess.user_operator.permissions.sheet_designs).toEqual([
      { level: 'write' }
    ]);
  });

  it('keeps command output grants when a command is fed by an upstream status node', () => {
    const compiled = compileProcessDefinition({
      graph: {
        nodes: [
          { id: 'create_queue', type: 'action', position: {}, data: { refId: 'create_queue' } },
          { id: 'send_queue', type: 'action', position: {}, data: { refId: 'send_queue' } },
          { id: 'solve_nesting', type: 'action', position: {}, data: { refId: 'solve_nesting' } },
          { id: 'mark_run_cut', type: 'action', position: {}, data: { refId: 'mark_run_cut' } },
          { id: 'reject_queue', type: 'action', position: {}, data: { refId: 'reject_queue' } }
        ],
        edges: [
          { id: 'create-send', source: 'create_queue', target: 'send_queue', sourceHandle: 'output', targetHandle: 'input:entity' },
          { id: 'send-solve', source: 'send_queue', target: 'solve_nesting', sourceHandle: 'output', targetHandle: 'input' },
          { id: 'solve-run-cut', source: 'solve_nesting', target: 'mark_run_cut', sourceHandle: 'output:entity_revision', targetHandle: 'input:entity' },
          { id: 'send-reject', source: 'send_queue', target: 'reject_queue', sourceHandle: 'output', targetHandle: 'input:entity' },
          { id: 'reject-send', source: 'reject_queue', target: 'send_queue', sourceHandle: 'output', targetHandle: 'input:entity' }
        ]
      },
      roles: {
        role_operator: { id: 'role_operator' }
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }] },
          outputs: [{ id: 'created', entityType: 'queue', status: SOURCE_STATE }]
        },
        send_queue: {
          id: 'send_queue',
          actionKind: 'mutateEntity',
          entityType: 'queue',
          status: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'admin' }], modified: true }
        },
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'admin' }], modified: true },
          inputs: [{ id: 'queue', entityType: 'queue' }],
          outputs: [
            { id: 'entity_revision', entityType: 'entity_revision', multiple: true },
            { id: 'sheet_design', entityType: 'sheet_design', multiple: true }
          ]
        },
        mark_run_cut: {
          id: 'mark_run_cut',
          actionKind: 'mutateEntity',
          entityType: 'entity_revision',
          status: { to: 'CUT' },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'admin' }], modified: true }
        },
        reject_queue: {
          id: 'reject_queue',
          actionKind: 'mutateEntity',
          entityType: 'queue',
          status: { from: TARGET_STATE, to: 'REJECTED' },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'read' }], modified: true }
        }
      },
      assignments: {
        user_operator: { userId: 'user_operator', roleIds: ['role_operator'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_operator.permissions.sheet_designs).toEqual([
      { level: 'admin' }
    ]);
  });

  it('places manual command actions on the input entity detail screen', () => {
    const compiled = compileProcessDefinition({
      graph: {
        nodes: [
          { id: 'create_queue', type: 'action', position: {}, data: { refId: 'create_queue' } },
          { id: 'send_queue', type: 'action', position: {}, data: { refId: 'send_queue' } },
          { id: 'solve_nesting', type: 'action', position: {}, data: { refId: 'solve_nesting' } }
        ],
        edges: [
          { id: 'create-send', source: 'create_queue', target: 'send_queue', sourceHandle: 'output', targetHandle: 'input:entity' },
          { id: 'send-solve', source: 'send_queue', target: 'solve_nesting', sourceHandle: 'output', targetHandle: 'input:queue' }
        ]
      },
      roles: {
        role_operator: { id: 'role_operator' }
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }] },
          outputs: [{ id: 'created', entityType: 'queue', status: SOURCE_STATE }]
        },
        send_queue: {
          id: 'send_queue',
          actionKind: 'mutateEntity',
          entityType: 'queue',
          status: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }], modified: true }
        },
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          trigger: { mode: 'manual' },
          inputs: [{ id: 'queue', entityType: 'queue' }],
          outputs: [
            { id: 'entity_revision', entityType: 'entity_revision', multiple: true },
            { id: 'sheet_design', entityType: 'sheet_design', multiple: true }
          ]
        }
      },
      assignments: {
        user_operator: { userId: 'user_operator', roleIds: ['role_operator'], status: 'active' }
      }
    }, domain);

    const userAccess = compiled.userAccess.user_operator;
    const commandAction = userAccess.actions.find(action => action.actionId === 'solve_nesting');
    const queueDetail = userAccess.screens.find(screen => screen.id === 'auto_role_operator_queue_detail');

    expect(commandAction).toMatchObject({
      actionKind: 'runCommand',
      commandId: 'solveNesting',
      feature: 'queues',
      entityType: 'queue',
      status: { from: TARGET_STATE }
    });
    expect(queueDetail.actions).toContain('solve_nesting');
    expect(queueDetail.regions[0].actions).toContain('solve_nesting');
    expect(userAccess.permissions.entity_revisions).toEqual([{ level: 'write' }]);
    expect(userAccess.permissions.sheet_designs).toEqual([{ level: 'write' }]);
  });

  it('synthesizes workflows and transition access from action nodes', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          entityType: 'project',
          status: { to: SOURCE_STATE },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: ['role_operator'] },
          outputs: [{ id: 'created', entityType: 'project', status: SOURCE_STATE }]
        },
        activate_project: {
          id: 'activate_project',
          actionKind: 'mutateEntity',
          status: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'], statusFrom: SOURCE_STATE, statusTo: TARGET_STATE },
          inputs: [{ id: 'entity', entityType: 'project', status: SOURCE_STATE }],
          outputs: [{ id: 'entity', entityType: 'project', status: TARGET_STATE }]
        }
      }
    }, domain);

    const workflow = compiled.workflows.project;
    expect(workflow.regions.main.initial).toBe(SOURCE_STATE);
    expect(workflow.regions.main.states).toHaveProperty(SOURCE_STATE);
    expect(workflow.regions.main.states).toHaveProperty(TARGET_STATE);
    expect(workflow.regions.main.transitions[0]).toMatchObject({
      from: SOURCE_STATE,
      to: TARGET_STATE,
      processRoleIds: ['role_operator']
    });
    expect(workflow.regions.main.transitions[0].access).toBeUndefined();
  });

  it('synthesizes repeated status-action transitions from all graph entity inputs', () => {
    const compiled = compileProcessDefinition({
      graph: {
        nodes: [
          { id: 'create_queue', type: 'action', position: {}, data: { refId: 'create_queue' } },
          { id: 'send_queue', type: 'action', position: {}, data: { refId: 'send_queue' } },
          { id: 'reject_queue', type: 'action', position: {}, data: { refId: 'reject_queue' } }
        ],
        edges: [
          {
            id: 'create_queue-send_queue',
            source: 'create_queue',
            target: 'send_queue',
            sourceHandle: 'output',
            targetHandle: 'input:entity'
          },
          {
            id: 'send_queue-reject_queue',
            source: 'send_queue',
            target: 'reject_queue',
            sourceHandle: 'output',
            targetHandle: 'input:entity'
          },
          {
            id: 'reject_queue-send_queue',
            source: 'reject_queue',
            target: 'send_queue',
            sourceHandle: 'output',
            targetHandle: 'input:entity'
          }
        ]
      },
      roles: {
        role_operator: { id: 'role_operator' }
      },
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          entityType: 'queue',
          status: { to: INITIAL_STATE },
          access: { level: 'write', roleIds: ['role_operator'] },
          outputs: [{ id: 'created', entityType: 'queue', status: INITIAL_STATE }]
        },
        send_queue: {
          id: 'send_queue',
          actionKind: 'mutateEntity',
          status: { from: INITIAL_STATE, to: TARGET_STATE },
          access: { level: 'write', roleIds: ['role_operator'], statusFrom: INITIAL_STATE, statusTo: TARGET_STATE },
          inputs: [{ id: 'entity', entityType: 'queue', status: INITIAL_STATE }],
          outputs: [{ id: 'entity', entityType: 'queue', status: TARGET_STATE }]
        },
        reject_queue: {
          id: 'reject_queue',
          actionKind: 'mutateEntity',
          status: { from: TARGET_STATE, to: NEXT_STATE },
          access: { level: 'write', roleIds: ['role_operator'], statusFrom: TARGET_STATE, statusTo: NEXT_STATE },
          inputs: [{ id: 'entity', entityType: 'queue', status: TARGET_STATE }],
          outputs: [{ id: 'entity', entityType: 'queue', status: NEXT_STATE }]
        }
      }
    }, domain);

    const transitions = compiled.workflows.queue.regions.main.transitions.map(({ from, to, processRoleIds }) => ({
      from,
      to,
      processRoleIds
    }));

    expect(transitions).toEqual(expect.arrayContaining([
      { from: INITIAL_STATE, to: TARGET_STATE, processRoleIds: ['role_operator'] },
      { from: NEXT_STATE, to: TARGET_STATE, processRoleIds: ['role_operator'] },
      { from: TARGET_STATE, to: NEXT_STATE, processRoleIds: ['role_operator'] }
    ]));
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
