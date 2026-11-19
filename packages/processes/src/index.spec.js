import { describe, expect, it } from 'vitest';
import {
  canvasToDefinition,
  compileProcessDefinition as compileContract,
  definitionToCanvas,
  normalizeProcessDefinition,
  compareProcessPorts,
  resolveRoleAssignmentAccess,
  resolveScreens as resolveAccessScreens,
  validateProcessDefinition as validateContract,
  validateRoundTrip
} from './index.js';
import { createTemplate } from './test-support.js';

const SOURCE_STATE = 'SOURCE_STATE';
const TARGET_STATE = 'TARGET_STATE';
const INITIAL_STATE = 'INITIAL_STATE';
const NEXT_STATE = 'NEXT_STATE';

function externalizeTestRoles(definition = {}) {
  const next = structuredClone(definition);
  const data = next.data || next;
  const storedRoles = data.roles || {};
  const roles = Object.keys(storedRoles).length
    ? Object.fromEntries(Object.entries(storedRoles).map(([roleId, role]) => [roleId, { id: role.id || roleId, label: role.label || roleId }]))
    : Object.fromEntries(Object.keys(data.roleGrants || {}).map(roleId => [roleId, { id: roleId, label: roleId }]));
  const assignments = data.assignments || {};
  data.roleGrants = {
    ...(data.roleGrants || {}),
    ...Object.fromEntries(Object.entries(storedRoles)
      .filter(([, role]) => Array.isArray(role.grants))
      .map(([roleId, role]) => [roleId, role.grants]))
  };
  delete data.roles;
  delete data.assignments;
  return { definition: next, roles, assignments };
}

function validateProcessDefinition(definition, testDomain = {}) {
  const external = externalizeTestRoles(definition);
  return validateContract(external.definition, testDomain, { roles: external.roles });
}

function compileProcessDefinition(definition, testDomain = {}) {
  const external = externalizeTestRoles(definition);
  const compiled = compileContract(external.definition, testDomain, { roles: external.roles });
  compiled.userAccess = Object.fromEntries(Object.entries(external.assignments).map(([userId, assignment]) => [userId,
    resolveRoleAssignmentAccess({ compiled, assignment, domain: testDomain })
  ]));
  return compiled;
}

function resolveScreens({ compiled, userId } = {}) {
  return resolveAccessScreens({ access: compiled?.userAccess?.[String(userId)] });
}

function producerOutputRecords(entries) {
  return Object.fromEntries(entries.map(entry => {
    const [nodeId, typeId, extras = {}, outputSocketId = 'entity'] = entry;
    const producerOutputId = `${nodeId}:${outputSocketId}`;
    return [producerOutputId, {
      id: producerOutputId,
      producerOutputId,
      nodeId,
      outputSocketId,
      typeId,
      lifecycle: { mode: 'defaultCreated' },
      fields: { read: [], write: [], private: [] },
      ...extras
    }];
  }));
}

const domain = {
  entities: [
    { type: 'project' },
    { type: 'queue' },
    { type: 'nesting_run', collection: 'nesting_runs' },
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
      output: { entities: [
        { type: 'nesting_run', persistenceOwner: 'commandOwned', timing: 'immediate' },
        { type: 'sheet_design', persistenceOwner: 'commandOwned', timing: 'completion' }
      ] }
    }
  },
  summaries: [
    { typeId: 'queue', parentType: 'project', parentIdKey: 'projectId' },
    { typeId: 'nesting_run', parentType: 'queue', parentIdKey: 'queueId' },
    { typeId: 'sheet_design', parentType: 'queue', parentIdKey: 'queueId' },
    { typeId: 'cassette', parentType: 'library', parentIdKey: 'libraryId' }
  ],
  containment: [
    { childType: 'queue', parentType: 'project', lineageKey: 'projectId' },
    { childType: 'nesting_run', parentType: 'queue', lineageKey: 'queueId' },
    { childType: 'sheet_design', parentType: 'queue', lineageKey: 'queueId' },
    { childType: 'cassette', parentType: 'library', lineageKey: 'libraryId' }
  ],
  revisions: {
    library: { scopes: ['content'], defaultScope: 'content' }
  },
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
      read: ['name', 'fields.*', 'status.*', 'lineage.*', 'fields.name'],
      write: ['fields.metadata'],
      admin: ['fields.*']
    },
    queue: {
      feature: 'queues',
      read: ['name', 'fields.*', 'status.*', 'lineage.*'],
      write: ['name', 'fields.*'],
      admin: ['attachments.*']
    },
    cassette_design: {
      feature: 'cassettes',
      read: ['name', 'fields.*', 'status.*', 'lineage.*', 'fields.*'],
      write: ['fields.*'],
      admin: ['attachments.*']
    },
    catalog: {
      feature: 'catalogs',
      read: ['name', 'fields.*', 'status.*', 'lineage.*', 'fields.material', 'fields.options'],
      write: ['fields.*'],
      admin: ['attachments.*']
    },
    library: {
      feature: 'libraries',
      read: ['name', 'fields.*', 'status.*', 'lineage.*', 'fields.material'],
      write: ['fields.*'],
      admin: ['attachments.*']
    }
  },
  fieldSchemas: {
    queue: [
      {
        path: 'name',
        block: 'identity',
        type: { base: 'string', shape: 'item', nullable: false },
        readable: true,
        writable: true
      },
      {
        path: 'lineage.projectId',
        block: 'lineage',
        type: { base: 'entityRef', shape: 'item', nullable: true, typeId: 'project' },
        readable: true,
        writable: false,
        constructible: true
      }
    ]
  },
  blockSchemas: {
    identity: [{
      path: 'name',
      block: 'identity',
      type: { base: 'string', shape: 'item', nullable: false }
    }],
    lineage: [{
      path: 'lineage.projectId',
      block: 'lineage',
      type: { base: 'entityRef', shape: 'item', nullable: true, typeId: 'project' }
    }]
  },
  construction: {
    project: {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: [
        { id: 'name', path: 'name', type: 'string', required: true, prompt: true }
      ]
    },
    library: {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: [
        { id: 'name', path: 'name', type: 'string', required: true, prompt: true }
      ]
    },
    queue: {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: [
        { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
        { id: 'jobItems', path: 'job.items', type: 'typeList', accepts: ['cassette_design'], required: false },
        { id: 'materialPool', path: 'job.materialPool', type: 'typeList', accepts: ['material_pile', 'sheet', 'remnant'], required: false }
      ]
    },
    cassette: {
      modes: ['genericCreate'],
      defaultMode: 'genericCreate',
      inputs: []
    },
    cassette_design: {
      modes: ['bakeCassetteDesignFromTemplate'],
      defaultMode: 'bakeCassetteDesignFromTemplate',
      derived: true,
      inputs: [
        { id: 'templateId', path: 'templateId', type: 'entity', typeId: 'cassette', required: true, prompt: true },
        { id: 'parameters', path: 'parameters', type: 'cassetteParameters', templateFieldId: 'templateId', required: false, prompt: true }
      ]
    }
  }
};

describe('@perigram/processes compiler', () => {
  it('derives runnable action contracts from authored effect nodes', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      roles: { operator: { id: 'operator', label: 'Operator' } },
      producerOutputs: producerOutputRecords([['create_queue', 'queue', {}, 'result']]),
      processNodes: {
        create_queue: {
          id: 'create_queue',
          kind: 'cts.construct',
          label: 'Create queue',
          typeId: 'queue',
          producerOutputId: 'create_queue:result',
          construction: domain.construction.queue,
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
          state: { to: SOURCE_STATE },
          inputDefaults: { name: 'Queue' },
          inputs: [],
          outputs: []
        }
      },
      graph: {
        nodes: [{ id: 'create_queue', type: 'processNode', data: { refId: 'create_queue' } }],
        edges: []
      }
    }, domain);

    expect(compiled.actions.create_queue).toMatchObject({
      id: 'create_queue',
      actionKind: 'createEntity',
      typeId: 'queue',
      parentTypeId: null,
      trigger: { mode: 'manual' }
    });
    expect(compiled.actions.create_queue.inputPolicy).toMatchObject({ prompt: true });
    // The defaulted name is not prompted again; the remaining typed inputs are.
    expect(compiled.actions.create_queue.inputPolicy.fields.map(field => field.path))
      .toEqual(['job.items', 'job.materialPool']);
    expect(compiled.roles.operator.actions).toContainEqual(expect.objectContaining({ actionId: 'create_queue' }));
  });

  it('prompts for identity name when a manual create has no identity wire', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      producerOutputs: producerOutputRecords([['create_project', 'queue', {}, 'result']]),
      processNodes: {
        create_project: {
          id: 'create_project',
          kind: 'cts.construct',
          typeId: 'queue',
          producerOutputId: 'create_project:result',
          trigger: { mode: 'manual' },
          construction: domain.construction.queue,
          state: { to: SOURCE_STATE }
        }
      },
      graph: {
        nodes: [{ id: 'create_project', type: 'processNode', data: { refId: 'create_project' } }],
        edges: []
      }
    }, domain);

    // The blocks list is presentation: with no wire, the typed construction
    // inputs prompt beside the identity-name fallback.
    expect(compiled.actions.create_project.inputPolicy).toMatchObject({ prompt: true });
    expect(compiled.actions.create_project.inputPolicy.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'name', type: 'string', prompt: true })
    ]));
  });

  it('keeps typed construction inputs when a create only lists canonical blocks', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      producerOutputs: producerOutputRecords([['create_facade', 'facade', {}, 'result']]),
      processNodes: {
        create_facade: {
          id: 'create_facade',
          kind: 'cts.construct',
          typeId: 'facade',
          producerOutputId: 'create_facade:result',
          trigger: { mode: 'manual' },
          construction: { mode: 'genericCreate' },
          blocks: ['identity', 'lineage'],
          state: { to: SOURCE_STATE }
        }
      },
      graph: {
        nodes: [{ id: 'create_facade', type: 'processNode', data: { refId: 'create_facade' } }],
        edges: []
      }
    }, {
      ...domain,
      entities: [...domain.entities, { type: 'facade' }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        facade: domain.fieldSchemas.queue
      },
      construction: {
        ...domain.construction,
        facade: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
            { id: 'customLabel', path: 'customLabel', type: 'string', required: false, prompt: true }
          ]
        }
      }
    });

    // No wire carries the canonical content: the block list never implies
    // composition, so every typed input prompts.
    expect(compiled.actions.create_facade.construction.inputs.map(input => input.id)).toEqual(['name', 'customLabel']);
  });

  it('drops an authored construction input the current contract does not address', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      producerOutputs: producerOutputRecords([['create_facade', 'facade', {}, 'result']]),
      processNodes: {
        create_facade: {
          id: 'create_facade',
          kind: 'cts.construct',
          typeId: 'facade',
          producerOutputId: 'create_facade:result',
          trigger: { mode: 'manual' },
          construction: {
            mode: 'genericCreate',
            inputs: [
              { id: 'customLabel', path: 'customLabel', type: 'string', required: false, prompt: true },
              { id: 'name', path: 'name', type: 'string', required: true, prompt: true }
            ]
          },
          state: { to: SOURCE_STATE }
        }
      },
      graph: {
        nodes: [{ id: 'create_facade', type: 'processNode', data: { refId: 'create_facade' } }],
        edges: []
      }
    }, {
      ...domain,
      entities: [...domain.entities, { type: 'facade' }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        facade: domain.fieldSchemas.queue
      },
      construction: {
        ...domain.construction,
        facade: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            { id: 'name', path: 'name', type: 'string', required: true, prompt: true }
          ]
        }
      }
    });
    // Authored entries address the current contract; a stale stamp from a
    // retired contract (the ancestor-axis prompts) dies here.
    expect(compiled.actions.create_facade.construction.inputs.map(input => input.id)).toEqual(['name']);
  });

  it('drops a stale lineage axis on a block-composed create', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      producerOutputs: producerOutputRecords([['create_run', 'nesting_run', {}, 'result']]),
      processNodes: {
        create_run: {
          id: 'create_run',
          kind: 'cts.construct',
          typeId: 'nesting_run',
          producerOutputId: 'create_run:result',
          trigger: { mode: 'manual' },
          construction: {
            mode: 'genericCreate',
            blockComposed: true,
            inputs: [
              { id: 'lineage.queueId', path: 'lineage.queueId', type: 'entity', typeId: 'queue', prompt: true },
              { id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project', prompt: true },
              { id: 'name', path: 'name', type: 'string', required: true, prompt: true }
            ]
          },
          state: { to: SOURCE_STATE }
        }
      },
      graph: {
        nodes: [{ id: 'create_run', type: 'processNode', data: { refId: 'create_run' } }],
        edges: []
      }
    }, {
      ...domain,
      construction: {
        ...domain.construction,
        nesting_run: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            { id: 'lineage.queueId', path: 'lineage.queueId', type: 'entity', typeId: 'queue', required: false, prompt: true }
          ]
        }
      }
    });
    // Lineage axes address the contract's lineage set — the immediate
    // parent — on a block-composed construct too; the ancestor axis is a
    // stale stamp and dies, the composed block entries stay.
    expect(compiled.actions.create_run.construction.inputs.map(input => input.id))
      .toEqual(['lineage.queueId', 'name']);
  });

  it('drops a wired construction input from the prompted create form', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      producerOutputs: producerOutputRecords([['create_facade', 'facade', {}, 'result']]),
      processNodes: {
        name_source: {
          id: 'name_source',
          kind: 'source.literalItem',
          type: { base: 'string', shape: 'item' },
          value: 'Facade'
        },
        create_facade: {
          id: 'create_facade',
          kind: 'cts.construct',
          typeId: 'facade',
          producerOutputId: 'create_facade:result',
          trigger: { mode: 'manual' },
          construction: { mode: 'genericCreate' },
          state: { to: SOURCE_STATE }
        }
      },
      graph: {
        nodes: [
          { id: 'name_source', type: 'processNode', data: { refId: 'name_source' } },
          { id: 'create_facade', type: 'processNode', data: { refId: 'create_facade' } }
        ],
        edges: [
          { id: 'name-create', source: 'name_source', sourceHandle: 'data:value', target: 'create_facade', targetHandle: 'data:name', role: 'data' }
        ]
      }
    }, {
      ...domain,
      entities: [...domain.entities, { type: 'facade' }],
      fieldSchemas: {
        ...domain.fieldSchemas,
        facade: domain.fieldSchemas.queue
      },
      construction: {
        ...domain.construction,
        facade: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
            { id: 'customLabel', path: 'customLabel', type: 'string', required: false, prompt: true }
          ]
        }
      }
    });

    // The wired name input owns the canonical content: it is not prompted,
    // while the unwired typed input stays.
    expect(compiled.actions.create_facade.inputPolicy.fields.map(field => field.path))
      .toEqual(['customLabel']);
  });

  it('does not infer persistence contracts from connected data topology', () => {
    const definition = normalizeProcessDefinition({
      dataflowVersion: 4,
      processNodes: {
        library: {
          id: 'library',
          kind: 'source.literalItem',
          type: { base: 'entityRef', typeId: 'library' }
        },
        relations: {
          id: 'relations',
          kind: 'record.composeBlock',
          block: 'relations',
          compositionMode: 'relations',
          entries: [{ id: 'library', key: 'library', typeId: 'project' }]
        }
      },
      graph: {
        nodes: ['library', 'relations'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [{
          id: 'library-relations',
          source: 'library',
          sourceHandle: 'data:value',
          target: 'relations',
          targetHandle: 'data:entry:library',
          role: 'data'
        }]
      }
    }, domain);

    expect(definition.processNodes.relations.entries[0]).toMatchObject({
      typeId: 'project',
      key: 'library'
    });
  });

  it('reprojects command sockets from the current typed template contract', () => {
    const attachmentDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'passbook', collection: 'passbooks' }],
      commands: {
        ...domain.commands,
        generateAttachment: {
          id: 'generateAttachment',
          input: {
            abstractEntities: [{ name: 'source', capability: 'attachments.generate', accepts: ['sheet_design'], required: true }],
            entities: [{ name: 'sheetDesign', type: 'sheet_design' }, { name: 'template', type: 'passbook' }],
            parameters: [
              { name: 'kind', type: 'string', required: true },
              { name: 'values', type: 'object', default: {} }
            ]
          },
          output: { events: ['attachment.generationCompleted'] }
        }
      },
      fieldAccess: {
        ...domain.fieldAccess,
        passbook: { feature: 'passbooks', read: ['name', 'fields.*'], write: ['fields.*'], admin: ['fields.*'] }
      }
    };
    const compiled = compileProcessDefinition({
      roles: { operator: { id: 'operator' } },
      actions: {
        generate: {
          id: 'generate',
          actionKind: 'runCommand',
          commandId: 'generateAttachment',
          access: { roleIds: ['operator'], level: 'write' },
          inputs: [{ id: 'pdfTemplateId', kind: 'string' }]
        }
      }
    }, attachmentDomain);

    expect(compiled.actions.generate.inputs.map(input => input.id)).toEqual(['source', 'template', 'kind', 'values']);
    expect(compiled.actions.generate.inputs.find(input => input.id === 'template')).toMatchObject({
      typeId: 'passbook',
      path: 'entities.template',
      prompt: true
    });
    expect(compiled.actions.generate.inputs.find(input => input.id === 'values')).toMatchObject({
      kind: 'json',
      path: 'parameters.values'
    });
  });

  it('normalizes legacy changeStatus actions at the compiler boundary', () => {
    const compiled = compileProcessDefinition({
      roles: {
        operator: { id: 'operator' }
      },
      producerOutputs: producerOutputRecords([['queue', 'queue']]),
      actions: {
        send_queue: {
          id: 'send_queue',
          actionKind: 'changeStatus',
          typeId: 'queue',
          producerOutputId: 'queue:entity',
          state: { from: 'DRAFT', to: 'SENT' },
          access: { roleIds: ['operator'], level: 'write' }
        }
      }
    }, domain);

    expect(compiled.actions.send_queue.actionKind).toBe('updateEntity');
    expect(compiled.actions.send_queue.access).toMatchObject({
      stateFrom: 'DRAFT',
      stateTo: 'SENT'
    });
    expect(compiled.actions.send_queue.contracts.outputs).toContainEqual(expect.objectContaining({
      typeId: 'queue'
    }));
  });

  it('compiles custom entity lifecycle directly to a v2 workflow', () => {
    const compiled = compileProcessDefinition({
      producerOutputs: producerOutputRecords([['projectMain', 'project', {
        lifecycle: {
          mode: 'custom',
          workflow: {
            schemaVersion: 2,
            primaryRegion: 'lifecycle',
            contracts: { archive: { intent: 'archiveProject' } },
            regions: {
              lifecycle: {
                label: 'Lifecycle',
                initial: INITIAL_STATE,
                states: { [INITIAL_STATE]: {}, [NEXT_STATE]: {} },
                transitions: [{ from: INITIAL_STATE, to: NEXT_STATE }]
              },
              review: {
                initial: 'OPEN',
                states: { OPEN: {}, RESOLVED: {} },
                transitions: [{ from: 'OPEN', to: 'RESOLVED' }]
              }
            }
          }
        },
        fields: { read: ['name', 'fields.*'], write: [], private: [] }
      }]])
    }, domain);

    const workflow = compiled.producerOutputs['projectMain:entity'].workflow;
    expect(workflow.primaryRegion).toBe('lifecycle');
    expect(workflow.contracts).toEqual({ archive: { intent: 'archiveProject' } });
    expect(Object.keys(workflow.regions).sort()).toEqual(['lifecycle', 'review']);
    expect(workflow.regions.lifecycle.label).toBe('Lifecycle');
    expect(workflow.regions.lifecycle.initial).toBe(INITIAL_STATE);
    expect(workflow.regions.lifecycle.transitions[0]).toMatchObject({ from: INITIAL_STATE, to: NEXT_STATE });
    expect(workflow.regions.review.initial).toBe('OPEN');
    expect(workflow.regions.review.transitions[0]).toMatchObject({ from: 'OPEN', to: 'RESOLVED' });
  });

  it('synthesizes action transitions into the primary region without dropping sibling regions', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      producerOutputs: producerOutputRecords([['projectMain', 'project', {
        lifecycle: {
          mode: 'custom',
          workflow: {
            schemaVersion: 2,
            primaryRegion: 'main',
            regions: {
              main: {
                initial: SOURCE_STATE,
                states: { [SOURCE_STATE]: {} },
                transitions: []
              },
              review: {
                initial: 'OPEN',
                states: { OPEN: {}, RESOLVED: {} },
                transitions: [{ from: 'OPEN', to: 'RESOLVED' }]
              }
            }
          }
        },
        fields: { read: ['name', 'fields.*'], write: [], private: [] }
      }]]),
      actions: {
        advance_project: {
          id: 'advance_project',
          actionKind: 'updateEntity',
          producerOutputId: 'projectMain:entity',
          state: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'], stateFrom: SOURCE_STATE, stateTo: TARGET_STATE },
          inputs: [{ id: 'entity', typeId: 'project', state: SOURCE_STATE }],
          outputs: [{ id: 'entity', typeId: 'project', state: TARGET_STATE }]
        }
      }
    }, domain);

    const workflow = compiled.producerOutputs['projectMain:entity'].workflow;
    expect(workflow.primaryRegion).toBe('main');
    expect(Object.keys(workflow.regions).sort()).toEqual(['main', 'review']);
    expect(workflow.regions.main.transitions).toContainEqual(expect.objectContaining({
      from: SOURCE_STATE,
      to: TARGET_STATE,
      processRoleIds: ['role_operator']
    }));
    expect(workflow.regions.review.initial).toBe('OPEN');
    expect(workflow.regions.review.states).toHaveProperty('RESOLVED');
    expect(workflow.regions.review.transitions[0]).toMatchObject({ from: 'OPEN', to: 'RESOLVED' });
  });

  it('emits no workflow for a defaultCreated producer whose type declares no vocabulary', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      graph: { nodes: [], edges: [] },
      producerOutputs: producerOutputRecords([['make_queue', 'queue']])
    }, domain);

    expect(compiled.producerOutputs['make_queue:entity'].workflow).toBeUndefined();
  });

  it('stamps the wiring arrival state on a status-mutating action so surfaces scope the button', () => {
    // Same wiring fact as the machine edge: the producer's output state is
    // the transition's declared from-state, and the manifest carries it so
    // the client hides the action in states the transition does not
    // leave. The projection must keep `from` beside `to`.
    const projectDomain = {
      ...domain,
      construction: { ...(domain.construction || {}), project: { modes: ['genericCreate'], defaultMode: 'genericCreate' } }
    };
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      roles: { role_operator: { id: 'role_operator' } },
      graph: {
        nodes: ['make_project', 't'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'e1', source: 'make_project', sourceHandle: 'data:result', target: 't', targetHandle: 'data:entity', role: 'data' },
          { id: 'e2', source: 'make_project', sourceHandle: 'control:completed', target: 't', targetHandle: 'control:in', role: 'control' }
        ]
      },
      producerOutputs: producerOutputRecords([['make_project', 'project']]),
      ctsTypes: {
        s1: { id: 's1', kind: 'state', typeId: 'project', value: 'draft' },
        s2: { id: 's2', kind: 'state', typeId: 'project', value: 'done' }
      },
      actions: {
        make_project: { id: 'make_project', actionKind: 'createEntity', typeId: 'project', producerOutputId: 'make_project:entity', trigger: { mode: 'manual' }, access: { grants: [{ roleId: 'role_operator', level: 'write' }] }, inputDefaults: { state: 'draft' } },
        t: { id: 't', actionKind: 'updateEntity', typeId: 'project', state: { axis: 'main', to: 'done' }, trigger: { mode: 'manual' }, access: { grants: [{ roleId: 'role_operator', level: 'write' }] } }
      },
      processNodes: {
        make_project: { id: 'make_project', kind: 'cts.construct', typeId: 'project', construction: { mode: 'genericCreate' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_operator', level: 'write' }] }, inputDefaults: { state: 'draft' } },
        t: { id: 't', kind: 'cts.transition', typeId: 'project', state: { to: 'done' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_operator', level: 'write' }] } }
      }
    }, projectDomain);
    const action = compiled.actions.t;
    expect(action.state).toMatchObject({ from: 'draft', to: 'done' });
    // The exposed/manifest action (what generated screens gate on) carries
    // the same arrival state, not just `to`: the action window's arrival
    // rides under `status`, and the exposure must project it as `from`.
    const exposed = compiled.roles.role_operator.actions.find(entry => (entry.actionId || entry.id) === 't');
    expect(exposed.state).toMatchObject({ from: 'draft', to: 'done' });
  });

  it('nests the wired state under its parent and keeps the parent-to-child transition', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      roles: { role_operator: { id: 'role_operator' } },
      graph: {
        nodes: [
          { id: 'cs1', type: 'ctsState', data: { refId: 'r1', value: 'state1' } },
          { id: 'cs2', type: 'ctsState', data: { refId: 'r2', value: 'parentState' } },
          { id: 'make_project', type: 'processNode', data: { refId: 'make_project' } },
          { id: 't', type: 'processNode', data: { refId: 't' } }
        ],
        edges: [
          { id: 'nest', source: 'cs2', target: 'cs1', sourceHandle: 'output:state', targetHandle: 'input:state', role: 'type', label: 'nested' },
          { id: 'init', source: 'cs1', target: 'make_project', sourceHandle: 'output:state', targetHandle: 'data:state' },
          { id: 'target', source: 'cs2', target: 't', sourceHandle: 'output:state', targetHandle: 'data:state' },
          { id: 'entity', source: 'make_project', sourceHandle: 'data:result', target: 't', targetHandle: 'data:entity', role: 'data' }
        ]
      },
      producerOutputs: producerOutputRecords([['make_project', 'project']]),
      ctsTypes: {
        r1: { id: 'r1', kind: 'state', typeId: 'project', value: 'state1' },
        r2: { id: 'r2', kind: 'state', typeId: 'project', value: 'parentState' }
      },
      processNodes: {
        make_project: { id: 'make_project', kind: 'cts.construct', typeId: 'project', producerOutputId: 'make_project:entity', construction: { mode: 'genericCreate' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_operator', level: 'write' }] }, inputDefaults: { state: 'state1' } },
        t: { id: 't', kind: 'cts.transition', typeId: 'project', state: { to: 'parentState' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_operator', level: 'write' }] } }
      }
    }, {
      ...domain,
      construction: { ...(domain.construction || {}), project: { modes: ['genericCreate'], defaultMode: 'genericCreate' } }
    });
    const region = compiled.producerOutputs['make_project:entity'].workflow.regions.main;
    // The wire's source is the parent, its target the child: state1 nests
    // under parentState, and the entry is the wired child (parentState.state1).
    expect(Object.keys(region.states).sort()).toEqual(['parentState', 'parentState.state1']);
    expect(region.initial).toBe('parentState.state1');
    // parentState is itself a leaf, so moving to it from its child is a real
    // transition (the machine compiles the edge and exposes/executes it).
    expect(region.transitions).toEqual([
      expect.objectContaining({ from: 'parentState.state1', to: 'parentState' })
    ]);
    const exposed = compiled.roles.role_operator.actions.filter(entry => entry.actionKind === 'updateEntity');
    expect(exposed.map(entry => entry.state)).toEqual([
      { to: 'parentState', from: 'state1' }
    ]);
    expect(compiled.actions.t.state).toMatchObject({ from: 'state1', to: 'parentState' });
  });

  it('prompts one row per construction input path, never a field-echo duplicate', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      producerOutputs: producerOutputRecords([['make_gadget', 'gadget']]),
      processNodes: {
        make_gadget: { id: 'make_gadget', kind: 'cts.construct', typeId: 'gadget', producerOutputId: 'make_gadget:entity', construction: { mode: 'genericCreate' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [] } }
      },
      graph: { nodes: [{ id: 'make_gadget', type: 'processNode', data: { refId: 'make_gadget' } }], edges: [] }
    }, {
      ...domain,
      entities: [...domain.entities, { type: 'gadget' }],
      construction: {
        ...domain.construction,
        gadget: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [{ id: 'fields.code', path: 'fields.code', type: 'string', required: true, prompt: true }] }
      }
    });
    const fields = compiled.actions.make_gadget.inputPolicy.fields;
    // The derived `field:<path>` echo addresses the same value as the
    // construction input: one typed row, not a second json-typed row.
    expect(fields.length).toBe(1);
    expect(fields[0]).toMatchObject({ path: 'fields.code', type: 'string' });
  });

  it('passes the declared workflow through verbatim for defaultCreated producer workflows', () => {
    // Org-authored lifecycles stay traversable: the declared machine is the
    // whole contract — its own states, transitions, and entry — with no
    // synthesized CREATED state and no replaced initial.
    const declaredDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'widget' }],
      workflows: {
        widget: {
          primaryRegion: 'main',
          regions: {
            main: {
              initial: 'new',
              states: { new: {}, active: {} },
              transitions: [{ from: 'new', to: 'active' }]
            }
          }
        }
      }
    };
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      graph: { nodes: [], edges: [] },
      producerOutputs: producerOutputRecords([['make_widget', 'widget']])
    }, declaredDomain);
    const workflow = compiled.producerOutputs['make_widget:entity'].workflow;
    expect(Object.keys(workflow.regions.main.states).sort()).toEqual(['active', 'new']);
    expect(workflow.regions.main.initial).toBe('new');
    expect(workflow.regions.main.transitions).toContainEqual(expect.objectContaining({ from: 'new', to: 'active' }));
  });

  it('rejects graph refs that do not exist', () => {
    const validation = validateProcessDefinition({
      graph: {
        nodes: [{ id: 'entity_1', type: 'entity', position: {}, data: { refId: 'missing' } }],
        edges: []
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('references missing producer output');
  });

  it('checks typed port compatibility for core process values', () => {
    expect(compareProcessPorts(
      { id: 'created', kind: 'entity', typeId: 'project' },
      { id: 'entity', kind: 'entity', typeId: 'project' }
    ).ok).toBe(true);
    expect(compareProcessPorts(
      { id: 'created', kind: 'entity', typeId: 'project' },
      { id: 'entity', kind: 'entity', typeId: 'queue' }
    ).ok).toBe(false);
    expect(compareProcessPorts(
      { id: 'created', kind: 'entity', typeId: 'project' },
      { id: 'items', kind: 'entity_list', typeId: 'project' }
    ).ok).toBe(true);
    expect(compareProcessPorts(
      { id: 'created', kind: 'entity', typeId: 'project' },
      { id: 'items', kind: 'entity_list', typeId: 'queue' }
    ).ok).toBe(false);
    expect(compareProcessPorts(
      { id: 'completed', kind: 'event' },
      { id: 'trigger', kind: 'event' }
    ).ok).toBe(true);
    expect(compareProcessPorts(
      { id: 'completed', kind: 'event' },
      { id: 'entity', kind: 'entity', typeId: 'project' }
    ).ok).toBe(false);
    expect(compareProcessPorts(
      { id: 'status', kind: 'status' },
      { id: 'status', kind: 'status' }
    ).ok).toBe(true);
    expect(compareProcessPorts(
      { id: 'name', kind: 'block', block: 'fields', dataPath: 'name' },
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
      producerOutputs: producerOutputRecords([['create_project', 'project']]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'create_project:entity',
          state: { to: SOURCE_STATE },
          access: { roleIds: ['role_admin'], level: 'write' },
          inputs: [{ id: 'status', kind: 'status' }],
          outputs: [{ id: 'created', typeId: 'project', state: SOURCE_STATE }]
        },
        update_queue: {
          id: 'update_queue',
          actionKind: 'updateEntity',
          access: { roleIds: ['role_admin'], level: 'write' },
          inputs: [{ id: 'entity', typeId: 'queue' }],
          outputs: [{ id: 'entity', typeId: 'queue' }],
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
          typeId: 'library',
          lifecycle: { mode: 'defaultCreated' },
          fields: { read: ['name', 'fields.*'], write: [], private: [] },
          allowedRoles: { read: ['role_operator'] },
          outputs: [{ id: 'entity', typeId: 'library' }]
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
          { id: 'run-cut', source: 'solve_nesting', target: 'mark_run_cut', sourceHandle: 'output:nesting_run', targetHandle: 'input:entity' },
          { id: 'sheet-cut', source: 'solve_nesting', target: 'mark_sheet_cut', sourceHandle: 'output:sheet_design', targetHandle: 'input:entity' },
          { id: 'library-cassette-parent', source: 'library_profile', target: 'create_cassette', sourceHandle: 'output', targetHandle: 'input:parent' }
        ]
      },
      producerOutputs: producerOutputRecords([['create_queue', 'queue'], ['create_cassette', 'cassette']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          state: { to: SOURCE_STATE },
          access: { roleIds: ['role_operator'], level: 'write' },
          outputs: [{ id: 'created', typeId: 'queue' }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'create_cassette:entity',
          parentTypeId: 'library',
          parentRevision: { enabled: true, scope: 'content' },
          state: { to: SOURCE_STATE },
          access: { roleIds: ['role_operator'], level: 'write' },
          inputs: [{ id: 'parent', typeId: 'library' }],
          outputs: [{ id: 'created', typeId: 'cassette' }]
        },
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          access: { roleIds: ['role_operator'], level: 'write' },
          inputs: [{ id: 'queue', typeId: 'queue' }],
          outputs: [
            { id: 'nesting_run', typeId: 'nesting_run', multiple: true },
            { id: 'sheet_design', typeId: 'sheet_design', multiple: true }
          ]
        },
        mark_run_cut: {
          id: 'mark_run_cut',
          actionKind: 'updateEntity',
          state: { to: 'CUT' },
          access: { roleIds: ['role_operator'], level: 'write' },
          inputs: [{ id: 'entity', typeId: 'nesting_run' }],
          outputs: [{ id: 'entity', typeId: 'nesting_run' }]
        },
        mark_sheet_cut: {
          id: 'mark_sheet_cut',
          actionKind: 'updateEntity',
          state: { to: 'CUT' },
          access: { roleIds: ['role_operator'], level: 'write' },
          inputs: [{ id: 'entity', typeId: 'sheet_design' }],
          outputs: [{ id: 'entity', typeId: 'sheet_design' }]
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
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
          typeId: 'library',
          outputs: [{ id: 'entity', typeId: 'library' }]
        }
      },
      producerOutputs: producerOutputRecords([['create_queue', 'queue'], ['create_cassette', 'cassette']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          outputs: [{ id: 'created', typeId: 'queue' }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'create_cassette:entity',
          parentTypeId: 'cassette',
          inputs: [{ id: 'parent', label: 'cassette', typeId: 'cassette', required: false }],
          outputs: [{ id: 'created', typeId: 'cassette' }]
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
            id: 'action_1782325683073-output:nesting_run-action_1782325734315-input:entity-1782325754528',
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
            { id: 'nesting_run', label: 'nesting_run', typeId: 'nesting_run', multiple: true },
            { id: 'sheet_design', label: 'sheet_design', typeId: 'sheet_design', multiple: true }
          ]
        },
        mark_run_cut: {
          id: 'mark_run_cut',
          actionKind: 'updateEntity',
          inputs: [{ id: 'entity', label: 'nesting_run', typeId: 'nesting_run', multiple: true }],
          outputs: [{ id: 'entity', typeId: 'nesting_run' }]
        },
        mark_sheet_cut: {
          id: 'mark_sheet_cut',
          actionKind: 'updateEntity',
          inputs: [{ id: 'entity', label: 'sheet_design', typeId: 'sheet_design', multiple: true }],
          outputs: [{ id: 'entity', typeId: 'sheet_design' }]
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
          { id: 'decompose-read', source: 'decompose_queue', target: 'read_name', sourceHandle: 'output:fields.name', targetHandle: 'input:block' },
          { id: 'read-compare', source: 'read_name', target: 'name_exists', sourceHandle: 'output', targetHandle: 'input:left' }
        ]
      },
      entityProfiles: {
        queue_profile: {
          id: 'queue_profile',
          typeId: 'queue',
          lifecycle: { mode: 'defaultCreated' },
          fields: { read: ['name', 'fields.*'], write: [], private: [] },
          outputs: [{ id: 'entity', typeId: 'queue' }]
        }
      },
      processNodes: {
        decompose_queue: {
          id: 'decompose_queue',
          kind: 'entityDecompose',
          typeId: 'queue',
          inputs: [{ id: 'entity', kind: 'entity', typeId: 'queue' }],
          outputs: [{ id: 'identity', kind: 'block', block: 'identity' }]
        },
        read_name: {
          id: 'read_name',
          kind: 'blockRead',
          typeId: 'queue',
          block: 'fields',
          path: 'name',
          valueType: 'string',
          inputs: [{ id: 'block', kind: 'block', block: 'fields' }],
          outputs: [{ id: 'value', kind: 'string', block: 'fields', dataPath: 'name' }]
        },
        name_exists: {
          id: 'name_exists',
          kind: 'compare',
          operation: 'exists',
          valueType: 'string',
          structure: 'item',
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

  it('rejects block composition outside the selected entity contract', () => {
    const validation = validateProcessDefinition({
      processNodes: {
        invalid_block: {
          id: 'invalid_block',
          kind: 'entityModify',
          typeId: 'project',
          block: 'summary'
        }
      }
    }, domain);

    expect(validation.errors).toContain('Process node invalid_block uses block summary outside project');
  });

  it('rejects fields outside the domain field policy', () => {
    const validation = validateProcessDefinition({
      producerOutputs: producerOutputRecords([['projectMain', 'project', {
        lifecycle: { mode: 'defaultCreated' },
        fields: { read: ['billing.secret'], write: [], private: [] }
      }]])
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('billing.secret');
  });

  it('keeps control handles out of an event-wired mutate mutation field list', () => {
    const mutateDomain = {
      ...domain,
      fieldSchemas: {
        ...domain.fieldSchemas,
        project: [{ path: 'fields.metadata', block: 'fields', type: { base: 'json', nullable: true }, readable: true, writable: true }]
      }
    };
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      roles: { role_operator: { id: 'role_operator' } },
      graph: {
        nodes: ['make_project', 'patch'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'e1', source: 'make_project', sourceHandle: 'data:result', target: 'patch', targetHandle: 'data:entity', role: 'data' },
          { id: 'e2', source: 'make_project', sourceHandle: 'data:result', target: 'patch', targetHandle: 'data:fields.metadata', role: 'data' },
          { id: 'e3', source: 'make_project', sourceHandle: 'control:completed', target: 'patch', targetHandle: 'control:in', role: 'control' }
        ]
      },
      producerOutputs: producerOutputRecords([['make_project', 'project']]),
      processNodes: {
        make_project: { id: 'make_project', kind: 'cts.construct', typeId: 'project', construction: { mode: 'genericCreate' }, trigger: { mode: 'manual' }, access: { level: 'write', grants: [{ roleId: 'role_operator', level: 'write' }] }, producerOutputId: 'make_project:entity' },
        patch: { id: 'patch', kind: 'cts.mutate', typeId: 'project', trigger: { mode: 'event' }, access: { level: 'write', grants: [{ roleId: 'role_operator', level: 'write' }] }, inputs: [
          { id: 'entity', type: { base: 'entityRef', typeId: 'project', nullable: false }, role: 'data', required: true, access: 'list', multiple: false },
          { id: 'fields.metadata', type: { base: 'json', nullable: true }, role: 'data', required: false, access: 'list', multiple: false }
        ] }
      }
    }, mutateDomain);
    expect(compiled.actions.patch.mutation.fields).toEqual(['fields.metadata']);
  });

  it('does not let write-level update actions mutate admin-only fields', () => {
    const validation = validateProcessDefinition({
      roles: { role_editor: { id: 'role_editor' } },
      actions: {
        update_project_admin_data: {
          id: 'update_project_admin_data',
          actionKind: 'updateEntity',
          mutation: { fields: ['fields.internal'] },
          access: { level: 'write', roleIds: ['role_editor'] },
          inputs: [{ id: 'entity', typeId: 'project' }],
          outputs: [{ id: 'entity', typeId: 'project' }]
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('fields.internal');
  });

  it('rejects mixed action grants when a lower grant reaches an admin-only mutation', () => {
    const validation = validateProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' },
        role_editor: { id: 'role_editor' }
      },
      actions: {
        update_project_admin_data: {
          id: 'update_project_admin_data',
          actionKind: 'updateEntity',
          mutation: { fields: ['fields.internal'] },
          access: {
            grants: [
              { roleId: 'role_admin', level: 'admin' },
              { roleId: 'role_editor', level: 'write' }
            ]
          },
          inputs: [{ id: 'entity', typeId: 'project' }],
          outputs: [{ id: 'entity', typeId: 'project' }]
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('role_editor');
    expect(validation.errors.join('\n')).toContain('admin-only field fields.internal');
  });

  it('uses an authored grant for a screen requirement without deriving capability from layout', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project_viewer: { id: 'role_project_viewer' }
      },
      roleGrants: {
        role_project_viewer: [{ feature: 'projects', level: 'read', scope: { instanceId: '$assignment.projectId' } }]
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
            scope: { instanceId: '$assignment.projectId' }
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

    expect(compiled.userAccess.user_a.permissions.projects[0].scope.instanceId).toBe('project-123');
  });

  it('does not grant backend capability or a gated screen from screen layout alone', () => {
    const compiled = compileProcessDefinition({
      roles: { viewer: { id: 'viewer' } },
      screens: {
        projects: { id: 'projects', route: '/projects', roleIds: ['viewer'], required: { feature: 'projects', level: 'read' } }
      },
      assignments: { user: { userId: 'user', roleIds: ['viewer'], bindings: {}, status: 'active' } }
    }, domain);
    expect(compiled.roles.viewer.grants).toEqual([]);
    expect(compiled.userAccess.user.permissions.projects).toBeUndefined();
    expect(compiled.userAccess.user.screens).toEqual([]);
  });

  it('preserves every typed evaluator dimension on action role grants', () => {
    const compiled = compileProcessDefinition({
      roles: { operator: { id: 'operator' } },
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      actions: {
        create_project: {
          id: 'create_project', actionKind: 'createEntity', typeId: 'project', producerOutputId: 'project_entity:entity', state: { to: 'READY' },
          access: { grants: [{
            roleId: 'operator', level: 'write', actions: { create: true },
            scope: { instanceId: '$assignment.projectId' }, transitions: ['DRAFT->READY'],
            rule: { any: [{ fact: 'lineage.projectId', equals: '$assignment.projectId' }] }
          }] }
        }
      },
      assignments: { user: { userId: 'user', roleIds: ['operator'], bindings: { projectId: 'project-1' }, status: 'active' } }
    }, domain);
    expect(compiled.userAccess.user.permissions.projects[0]).toMatchObject({
      level: 'write', actions: { create: true }, scope: { instanceId: 'project-1' },
      transitions: expect.arrayContaining(['DRAFT->READY']),
      rule: { all: expect.any(Array) }
    });
  });

  it('infers generated screens from role grants when no explicit screen is authored', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator', label: 'Operator', grants: [{ feature: 'queues', level: 'write' }] }
      },
      producerOutputs: producerOutputRecords([['queue_profile', 'queue']]),
      actions: {
        action_accept: {
          id: 'action_accept',
          label: 'Accept',
          actionKind: 'updateEntity',
          typeId: 'queue',
          producerOutputId: 'queue_profile:entity',
          state: { to: 'NEXT_STATUS' },
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
      typeId: 'queue',
      roleIds: ['role_operator'],
      required: { feature: 'queues', level: 'read' },
      actions: ['action_accept']
    });
    expect(compiled.screens.auto_role_operator_queue_detail).toMatchObject({
      typeId: 'queue',
      roleIds: ['role_operator'],
      template: 'instanceDetail',
      sources: [expect.objectContaining({
        typeId: 'queue',
        mode: 'single',
        identifier: '$screen.scope.instanceId'
      })],
      actions: ['action_accept']
    });
    expect(compiled.userAccess.user_a.screens.find(screen => screen.screenKey === 'auto_queue')).toMatchObject({
      screenKey: 'auto_queue',
      route: '/screens/auto_queue',
      typeId: 'queue',
      actions: ['action_accept']
    });
    expect(compiled.userAccess.user_a.navigation[0]).toMatchObject({
      route: '/home',
      screenKey: 'home_user_a'
    });
    expect(compiled.userAccess.user_a.screens.find(screen => screen.template === 'home')).toMatchObject({
      screenKey: 'home_user_a',
      sources: [expect.objectContaining({ typeId: 'queue', mode: 'list' })]
    });
  });

  it('includes generated screens for every assigned role grant', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_queue: { id: 'role_queue', label: 'Queue role', grants: [{ feature: 'queues', level: 'read' }] },
        role_project: { id: 'role_project', label: 'Project role', grants: [{ feature: 'projects', level: 'read' }] }
      },
      producerOutputs: producerOutputRecords([
        ['queue_profile', 'queue'],
        ['project_profile', 'project']
      ]),
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

  it('composes declared many-relations as detail child collections', () => {
    const relationDomain = {
      ...domain,
      relations: [
        { ownerType: 'queue', key: 'reviewLibraries', targetType: 'library', cardinality: 'many' },
        { ownerType: 'queue', key: 'homeLibrary', targetType: 'library', cardinality: 'one' }
      ]
    };
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: {
          id: 'role_operator',
          label: 'Operator',
          grants: [{ feature: 'queues', level: 'read' }, { feature: 'libraries', level: 'read' }]
        }
      },
      assignments: {
        user_a: { userId: 'user_a', roleIds: ['role_operator'], bindings: {}, status: 'active' }
      }
    }, relationDomain);

    const detail = compiled.screens.auto_role_operator_queue_detail;
    expect(detail.sources.find(source => source.id === 'library_reviewLibraries_related')).toMatchObject({
      typeId: 'library',
      mode: 'list',
      relation: { sourceId: 'queue', key: 'reviewLibraries' },
      required: { feature: 'libraries', level: 'read' }
    });
    expect(detail.regions.find(region => region.sourceId === 'library_reviewLibraries_related')).toMatchObject({
      slot: 'children',
      surface: 'card'
    });
    // single-target relations stay chip rows on the record body
    expect(detail.sources.some(source => source.id === 'library_homeLibrary_related')).toBe(false);
  });

  it('leaves relation child collections off when the target feature is unread', () => {
    const relationDomain = {
      ...domain,
      relations: [{ ownerType: 'queue', key: 'reviewLibraries', targetType: 'library', cardinality: 'many' }]
    };
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator', label: 'Operator', grants: [{ feature: 'queues', level: 'read' }] }
      },
      assignments: {
        user_a: { userId: 'user_a', roleIds: ['role_operator'], bindings: {}, status: 'active' }
      }
    }, relationDomain);

    expect(compiled.screens.auto_role_operator_queue_detail.sources.some(source => source.relation)).toBe(false);
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
          typeId: 'queue',
          allowedRoles: { read: ['role_queue'] }
        }
      },
      screens: {
        queue_home: {
          id: 'queue_home',
          label: 'Queues',
          template: 'typeList',
          placement: 'hub',
          route: '/queue-home',
          typeId: 'queue',
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
      sources: [expect.objectContaining({ typeId: 'queue', mode: 'list' })]
    });
    expect(home.regions[0]).toMatchObject({
      sourceId: 'home_queue',
      screenKey: 'queue_home:/queue-home'
    });
  });

  it('scopes home and detail placement by declared containment without graph lineage compositions', () => {
    // The org-authoring shape: hierarchy declared through children edges
    // (domain containment), no Lineage composition wired in the graph.
    const containedDomain = {
      ...domain,
      containment: [...(domain.containment || []), { parentType: 'project', childType: 'queue', lineageKey: 'projectId', declared: 'org' }]
    };
    const compiled = compileProcessDefinition({
      roles: { role_op: { id: 'role_op', label: 'Operator' } },
      roleGrants: {
        role_op: [
          { feature: 'projects', level: 'read' },
          { feature: 'queues', level: 'write' }
        ]
      },
      producerOutputs: {
        ...producerOutputRecords([['queue_source', 'queue']]),
        'project_source:result': {
          id: 'project_source:result', producerOutputId: 'project_source:result',
          nodeId: 'project_source', outputSocketId: 'result', typeId: 'project',
          lifecycle: { mode: 'domainDefault' },
          fields: { read: ['name', 'fields.*'], write: [], private: [] },
          allowedRoles: { read: ['role_op'], write: ['role_op'], admin: [] }
        }
      },
      actions: {},
      assignments: {
        user_a: { userId: 'user_a', roleIds: ['role_op'], bindings: {}, status: 'active' }
      }
    }, containedDomain);
    const access = resolveRoleAssignmentAccess({
      compiled,
      assignment: { userId: 'user_a', roleIds: ['role_op'], bindings: {}, status: 'active' },
      domain: containedDomain
    });

    // The declared child list is suppressed from home: it remains
    // reachable through its parent's detail child region.
    const home = access.screens.find(screen => screen.template === 'home');
    expect(home.sources.map(source => source.typeId)).toEqual(['project']);

    // The parent detail screen carries the child collection region,
    // filtered by the declared lineage key.
    const projectDetail = access.screens.find(screen => screen.screenKey === 'auto_project_detail');
    const childRegion = (projectDetail.regions || []).find(region => region.sourceId === 'queue_children');
    expect(childRegion).toMatchObject({ slot: 'children' });
    expect(projectDetail.sources.find(source => source.id === 'queue_children'))
      .toMatchObject({ typeId: 'queue', mode: 'list', filters: { projectId: '$screen.scope.instanceId' } });
  });

  it('excludes detail screens from top-level navigation while keeping them in the manifest', () => {
    const compiled = compileProcessDefinition({
      roles: { role_op: { id: 'role_op', label: 'Operator' } },
      roleGrants: { role_op: [{ feature: 'queues', level: 'read' }] },
      producerOutputs: producerOutputRecords([['queue_source', 'queue']]),
      actions: {},
      assignments: { user_a: { userId: 'user_a', roleIds: ['role_op'], bindings: {}, status: 'active' } }
    }, domain);
    const access = resolveRoleAssignmentAccess({ compiled, assignment: { userId: 'user_a', roleIds: ['role_op'], bindings: {}, status: 'active' }, domain });
    const navIds = access.navigation.map(item => item.id);
    expect(navIds).toContain('auto_queue');
    expect(navIds).not.toContain('auto_queue_detail');
    expect(access.screens.some(screen => (screen.screenKey || screen.id) === 'auto_queue_detail')).toBe(true);
  });

  it('keeps wiring-derived status windows off inferred read requirements while permissions stay state-scoped', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project: { id: 'role_project', label: 'Project role' }
      },
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      actions: {
        create_project_created: {
          id: 'create_project_created',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'project_entity:entity',
          state: { to: 'CREATED' },
          access: { level: 'write', roleIds: ['role_project'] }
        },
        create_project_new: {
          id: 'create_project_new',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'project_entity:entity',
          state: { to: 'NEW' },
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

    // The read requirement carries no status window: the list shows every
    // instance the read level covers, whatever state it is in (or none).
    expect(compiled.screens.auto_role_project_project.required).toEqual({
      feature: 'projects',
      level: 'read'
    });
    // State scoping survives where it belongs — on the permission grants
    // that gate state-changing actions.
    expect(compiled.userAccess.user_a.permissions.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: 'write', rule: { fact: 'primaryState', equals: 'CREATED' } }),
      expect.objectContaining({ level: 'admin', rule: { fact: 'primaryState', equals: 'NEW' } })
    ]));
    expect(compiled.userAccess.user_a.screens.find(screen => screen.screenKey === 'auto_project')).toMatchObject({
      screenKey: 'auto_project',
      typeId: 'project',
      required: {
        feature: 'projects',
        level: 'read'
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
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      actions: {
        create_project_created: {
          id: 'create_project_created',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'project_entity:entity',
          state: { to: 'CREATED' },
          access: { level: 'read', roleIds: ['role_reader'] }
        },
        create_project_active: {
          id: 'create_project_active',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'project_entity:entity',
          state: { to: 'ACTIVE' },
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

    const projectScreens = compiled.userAccess.user_a.screens.filter(screen => screen.typeId === 'project' && screen.template === 'typeList');
    expect(projectScreens).toHaveLength(1);
    expect(projectScreens[0]).toMatchObject({
      screenKey: 'auto_project',
      route: '/screens/auto_project',
      sourceRoleIds: ['role_reader', 'role_admin'],
      actions: ['create_project_active'],
      required: {
        feature: 'projects',
        level: 'read'
      },
      sources: [expect.objectContaining({
        required: {
          feature: 'projects',
          level: 'read'
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
      producerOutputs: producerOutputRecords([['cassette_entity', 'cassette']]),
      actions: {
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'cassette_entity:entity',
          parentTypeId: 'cassette',
          state: { to: 'CREATED' },
          access: { level: 'write', roleIds: ['role_cassette'] },
          inputs: [{ id: 'parent', label: 'cassette', typeId: 'cassette', required: false }]
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

    expect(compiled.actions.create_cassette.parentTypeId).toBeNull();
    expect(compiled.roles.role_cassette.actions[0]).toMatchObject({
      actionId: 'create_cassette',
      parentTypeId: null,
      inputs: [expect.objectContaining({ id: 'parent', typeId: '' })]
    });
    expect(compiled.screens.auto_role_cassette_cassette.actions).toContain('create_cassette');
    expect(compiled.screens.auto_role_cassette_cassette_detail.actions).not.toContain('create_cassette');
  });

  it('strips create parent inputs unsupported by domain relations or construction inputs', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_queue: { id: 'role_queue', label: 'Queue role' }
      },
      producerOutputs: producerOutputRecords([['queue_entity', 'queue']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'queue_entity:entity',
          parentTypeId: 'cassette',
          state: { to: 'CREATED' },
          access: { level: 'write', roleIds: ['role_queue'] },
          inputs: [{ id: 'parent', label: 'cassette', typeId: 'cassette', required: false }]
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

    expect(compiled.actions.create_queue.parentTypeId).toBeNull();
    expect(compiled.actions.create_queue.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'parent', typeId: '', required: false })
    ]));
    expect(compiled.roles.role_queue.actions[0]).toMatchObject({
      actionId: 'create_queue',
      parentTypeId: null
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
      producerOutputs: producerOutputRecords([['cassette_entity', 'cassette']]),
      actions: {
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'cassette_entity:entity',
          state: { to: 'CREATED' },
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
    expect(compiled.userAccess.user_writer.actions.map(action => action.id)).toContain('create_cassette');
    expect(compiled.userAccess.user_reader.actions.map(action => action.id)).not.toContain('create_cassette');
  });

  it('exposes manual status actions through inherited access windows', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project: { id: 'role_project', label: 'Project role' }
      },
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'project_entity:entity',
          state: { to: 'NEW' },
          access: { level: 'admin', roleIds: ['role_project'] }
        },
        approve_project: {
          id: 'approve_project',
          actionKind: 'updateEntity',
          typeId: 'project',
          producerOutputId: 'project_entity:entity',
          state: { to: 'APPROVED' },
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
        id: 'approve_project',
        actionKind: 'updateInstance',
        typeId: 'project',
        state: { from: 'NEW', to: 'APPROVED' }
      })
    ]));
    expect(compiled.userAccess.user_a.screens.find(screen => screen.typeId === 'project').actions)
      .toEqual(expect.arrayContaining(['approve_project']));
  });

  it('uses canonical entity collections for derived process action screens', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_designer: { id: 'role_designer', label: 'Designer' }
      },
      producerOutputs: producerOutputRecords([['design_entity', 'cassette_design']]),
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          typeId: 'cassette_design',
          producerOutputId: 'design_entity:entity',
          state: { to: 'RECEIVED' },
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
        id: 'create_design',
        actionKind: 'createInstance',
        typeId: 'cassette_design'
      })
    ]));
    expect(compiled.userAccess.user_a.screens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        typeId: 'cassette_design',
        required: expect.objectContaining({ feature: 'cassette_designs' })
      })
    ]));
  });

  it('skips screen-derived grants with incomplete assignment bindings', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_project_viewer: { id: 'role_project_viewer' }
      },
      roleGrants: {
        role_project_viewer: [{ feature: 'projects', level: 'read', scope: { instanceId: '$assignment.projectId' } }]
      },
      screens: {
        assigned_project: {
          id: 'assigned_project',
          route: '/project/$assignment.projectSlug/details',
          roleIds: ['role_project_viewer'],
          required: {
            feature: 'projects',
            level: 'read',
            scope: { instanceId: '$assignment.projectId' }
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
      roleGrants: {
        role_operator: [{ feature: 'projects', level: 'read', scope: { instanceId: '$assignment.projectId' } }],
        role_supervisor: [{ feature: 'projects', level: 'read', scope: { instanceId: '$assignment.projectId' } }]
      },
      screens: {
        assigned_project: {
          id: 'assigned_project',
          label: 'Assigned project',
          kind: 'instanceDetail',
          route: '/project/$assignment.projectSlug/details',
          placement: 'hub',
          typeId: 'project',
          required: { feature: 'projects', level: 'read', scope: { instanceId: '$assignment.projectId' } },
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
    const assigned = screens.find(screen => screen.screenKey === 'assigned_project:project-123');
    expect(assigned).toMatchObject({
      route: '/screens/assigned_project%3Aproject-123',
      sourceRoute: '/project/p-123/details',
      scope: { projectId: 'project-123' },
      sourceRoleIds: ['role_operator', 'role_supervisor']
    });
    // Per-kind suppression: the authored instanceDetail suppresses only
    // the inferred detail, so the read grants keep the inference-owned
    // project list (both roles merged per user), which also feeds the
    // generated home screen.
    expect(screens.map(screen => screen.screenKey).sort()).toEqual(['assigned_project:project-123', 'auto_project', 'home_user_a']);
    expect(compiled.userAccess.user_a.permissions.projects[0].scope.instanceId).toBe('project-123');
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
          typeId: 'missingEntity',
          sources: [{ id: 'missing', typeId: 'missingEntity', mode: 'list' }],
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
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      actions: {
        create_project: {
          id: 'create_project',
          label: 'Create project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'project_entity:entity',
          state: { to: INITIAL_STATE },
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
          template: 'typeList',
          typeId: 'project',
          bindings: { projectId: '$assignment.projectId' },
          sources: [{ id: 'project', typeId: 'project', mode: 'list', filters: { projectId: '$assignment.projectId' } }],
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
      template: 'typeList',
      route: '/screens/projects%3Aproject-123',
      sourceRoute: '/projects',
      sources: [expect.objectContaining({ id: 'project', typeId: 'project', mode: 'list', filters: { projectId: 'project-123' } })],
      regions: [{ id: 'main', slot: 'main', sourceId: 'project', surface: 'card', actions: ['create_project'] }],
      actions: ['create_project']
    });
  });

  it('compiles user-triggered action contracts', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      actions: {
        create_project: {
          id: 'create_project',
          label: 'Create project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'project_entity:entity',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [],
          outputs: [{ id: 'created', typeId: 'project', state: INITIAL_STATE }]
        }
      }
    }, domain);

    expect(compiled.actions.create_project).toMatchObject({
      actionKind: 'createEntity',
      typeId: 'project',
      trigger: { mode: 'manual' },
      access: { level: 'write', roleIds: ['role_admin'] }
    });
  });

  it('compiles input-driven status actions with event outputs', () => {
    const compiled = compileProcessDefinition({
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      actions: {
        activate_incoming: {
          id: 'activate_incoming',
          label: 'Activate incoming',
          actionKind: 'updateEntity',
          producerOutputId: 'project_entity:entity',
          state: { to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: [] },
          inputs: [{ id: 'entity', label: 'Incoming entity', typeId: 'project' }],
          outputs: [{ id: 'entity', label: 'Same entity', typeId: 'project', state: TARGET_STATE }],
          events: [{ id: 'completed', label: 'Activate incoming completed', kind: 'event' }]
        }
      }
    }, domain);

    expect(compiled.actions.activate_incoming).toMatchObject({
      actionKind: 'updateEntity',
      typeId: 'project',
      state: { to: TARGET_STATE },
      trigger: { mode: 'manual' },
      events: [{ id: 'completed', kind: 'event' }]
    });
  });

  it('exposes manual relation updates as generated entity-detail actions', () => {
    const relationDomain = {
      ...domain,
      relations: [{ ownerType: 'project', key: 'library', targetType: 'library', cardinality: 'one' }],
      fieldAccess: {
        ...domain.fieldAccess,
        project: { ...domain.fieldAccess.project, write: [...domain.fieldAccess.project.write, 'relations.*'] }
      },
      fieldSchemas: {
        ...domain.fieldSchemas,
        project: [{
          path: 'relations.library',
          block: 'relations',
          type: { base: 'entityRef', shape: 'item', nullable: true, typeId: 'library' },
          readable: true,
          writable: true
        }]
      }
    };
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      processNodes: {
        current: { id: 'current', kind: 'cts.read', select: 'current', typeId: 'project' },
        library: {
          id: 'library',
          kind: 'source.literalItem',
          type: { base: 'entityRef', shape: 'item', typeId: 'library' },
          value: { type: 'library', id: 'library-1' }
        },
        update_relations: {
          id: 'update_relations',
          kind: 'cts.mutate',
          label: 'Link library',
          typeId: 'project',
          blocks: ['relations'],
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
        }
      },
      graph: {
        nodes: ['current', 'library', 'update_relations']
          .map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'current-update', source: 'current', sourceHandle: 'data:result', target: 'update_relations', targetHandle: 'data:entity', role: 'data' },
          { id: 'library-update', source: 'library', sourceHandle: 'data:value', target: 'update_relations', targetHandle: 'data:relations.library', role: 'data' }
        ]
      }
    }, relationDomain);

    expect(compiled.actions.update_relations).toMatchObject({
      actionKind: 'updateEntity',
      typeId: 'project',
      mutation: { fields: ['relations.library'] }
    });
    expect(compiled.screens.auto_role_admin_project_detail.regions
      .find(region => region.id === 'main').actions).toContain('update_relations');
  });

  it('derives Link and Unlink detail actions from construct relation inputs', () => {
    const relationDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'drawing', collection: 'drawings' }],
      relations: [
        { ownerType: 'project', key: 'libraries', targetType: 'library', cardinality: 'many' },
        { ownerType: 'project', key: 'drawing', targetType: 'drawing', cardinality: 'one' }
      ],
      construction: {
        ...domain.construction,
        project: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
            { id: 'relations.libraries', path: 'relations.libraries', type: 'entity', typeId: 'library', required: false, prompt: true },
            { id: 'relations.drawing', path: 'relations.drawing', type: 'entity', typeId: 'drawing', required: false, prompt: true }
          ]
        }
      },
      fieldAccess: {
        ...domain.fieldAccess,
        project: { ...domain.fieldAccess.project, write: [...domain.fieldAccess.project.write, 'relations.*'] }
      }
    };
    const definition = {
      dataflowVersion: 4,
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } },
      producerOutputs: producerOutputRecords([
        ['library', 'library', {}, 'result'],
        ['create', 'project', {}, 'result']
      ]),
      processNodes: {
        library: {
          id: 'library',
          kind: 'cts.construct',
          typeId: 'library',
          producerOutputId: 'library:result',
          construction: {
            mode: 'genericCreate',
            inputs: [{ id: 'name', path: 'name', label: 'Library name', type: 'string', required: true, prompt: true }]
          },
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
        },
        create: {
          id: 'create',
          kind: 'cts.construct',
          label: 'Create project',
          typeId: 'project',
          producerOutputId: 'create:result',
          construction: {
            mode: 'genericCreate',
            inputs: [
              { id: 'relations.libraries', path: 'relations.libraries', type: 'entity', typeId: 'library', required: false, prompt: true },
              { id: 'relations.drawing', path: 'relations.drawing', type: 'entity', typeId: 'drawing', required: false, prompt: true }
            ]
          },
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
        }
      },
      graph: {
        nodes: ['library', 'create'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'library-create', source: 'library', sourceHandle: 'data:result', target: 'create', targetHandle: 'data:relations.libraries', role: 'data' }
        ]
      }
    };
    const compiled = compileProcessDefinition(definition, relationDomain);

    expect(compiled.actions['create:link:libraries']).toMatchObject({
      label: 'Link libraries',
      actionKind: 'updateEntity',
      typeId: 'project',
      relationMutation: {
        key: 'libraries',
        targetTypes: ['library'],
        cardinality: 'many',
        operation: 'link'
      }
    });
    expect(compiled.actions['create:unlink:libraries']).toMatchObject({
      label: 'Unlink libraries',
      relationMutation: { key: 'libraries', targetTypes: ['library'], operation: 'unlink' },
      inputPolicy: { prompt: false, fields: [] }
    });
    expect(compiled.actions['create:link:drawing']).toMatchObject({
      relationMutation: { key: 'drawing', targetTypes: ['drawing'] }
    });
    expect(compiled.screens.auto_role_admin_project_detail.actions).toEqual(expect.arrayContaining([
      'create:link:libraries',
      'create:unlink:libraries'
    ]));
  });

  it('rides a declared delete policy on the compiled Unlink action alone', () => {
    const relationDomain = {
      ...domain,
      relations: [
        { ownerType: 'project', key: 'libraries', targetType: 'library', cardinality: 'many', unlink: 'delete' }
      ],
      construction: {
        ...domain.construction,
        project: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
            { id: 'relations.libraries', path: 'relations.libraries', type: 'entity', typeId: 'library', required: false, prompt: true }
          ]
        }
      },
      fieldAccess: {
        ...domain.fieldAccess,
        project: { ...domain.fieldAccess.project, write: [...domain.fieldAccess.project.write, 'relations.*'] }
      }
    };
    const definition = {
      dataflowVersion: 4,
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } },
      producerOutputs: producerOutputRecords([
        ['create', 'project', {}, 'result']
      ]),
      processNodes: {
        create: {
          id: 'create',
          kind: 'cts.construct',
          typeId: 'project',
          producerOutputId: 'create:result',
          construction: {
            mode: 'genericCreate',
            inputs: [
              { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
              { id: 'relations.libraries', path: 'relations.libraries', type: 'entity', typeId: 'library', required: false, prompt: true }
            ]
          },
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
        }
      },
      graph: { nodes: [{ id: 'create', type: 'processNode', data: { refId: 'create' } }], edges: [] }
    };
    const compiled = compileProcessDefinition(definition, relationDomain);

    expect(compiled.actions['create:unlink:libraries'].relationMutation).toMatchObject({
      operation: 'unlink',
      unlink: 'delete'
    });
    expect(compiled.actions['create:link:libraries'].relationMutation.unlink).toBeUndefined();
  });

  it('derives one Link/Unlink pair per relation entry across sibling constructs', () => {
    const relationDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'drawing', collection: 'drawings' }],
      relations: [
        { ownerType: 'project', key: 'libraries', targetType: 'library', cardinality: 'many' }
      ],
      construction: {
        ...domain.construction,
        project: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
            { id: 'relations.libraries', path: 'relations.libraries', type: 'entity', typeId: 'library', required: false, prompt: true }
          ]
        }
      },
      fieldAccess: {
        ...domain.fieldAccess,
        project: { ...domain.fieldAccess.project, write: [...domain.fieldAccess.project.write, 'relations.*'] }
      }
    };
    const relationInputs = () => ({
      mode: 'genericCreate',
      inputs: [
        { id: 'relations.libraries', path: 'relations.libraries', type: 'entity', typeId: 'library', required: false, prompt: true }
      ]
    });
    const definition = {
      dataflowVersion: 4,
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } },
      producerOutputs: producerOutputRecords([
        ['create', 'project', {}, 'result'],
        ['create_twin', 'project', {}, 'result']
      ]),
      processNodes: {
        create: {
          id: 'create',
          kind: 'cts.construct',
          typeId: 'project',
          producerOutputId: 'create:result',
          construction: relationInputs(),
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
        },
        create_twin: {
          id: 'create_twin',
          kind: 'cts.construct',
          typeId: 'project',
          producerOutputId: 'create_twin:result',
          construction: relationInputs(),
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
        }
      },
      graph: {
        nodes: ['create', 'create_twin'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: []
      }
    };
    const compiled = compileProcessDefinition(definition, relationDomain);

    expect(compiled.actions['create:link:libraries']).toBeTruthy();
    expect(compiled.actions['create:unlink:libraries']).toBeTruthy();
    expect(compiled.actions['create_twin:link:libraries']).toBeUndefined();
    expect(compiled.actions['create_twin:unlink:libraries']).toBeUndefined();
    const detailScreen = compiled.screens.auto_role_admin_project_detail;
    const linkActionIds = detailScreen.regions
      .find(region => region.id === 'main').actions
      .filter(actionId => (actionId || '').includes(':link:'));
    expect(linkActionIds).toEqual(['create:link:libraries']);
    // One create affordance per (type, mode): the twin construct stays
    // executable while the surfaces carry the first create alone.
    const listScreen = compiled.screens.auto_role_admin_project;
    const createActionIds = listScreen.regions
      .find(region => region.id === 'main').actions
      .filter(actionId => (compiled.actions[actionId]?.actionKind || 'createEntity') === 'createEntity');
    expect(createActionIds).toEqual(['create']);
  });

  it('expands the userCreatable attachment-kind selector on declared creator inputs', () => {
    const photoDomain = {
      ...domain,
      entities: [...domain.entities, { type: 'site_photo' }],
      attachmentKinds: {
        'site-photo': { kind: 'site-photo', creation: { mode: 'upload' } },
        'site-video': { kind: 'site-video', creation: { mode: 'capture' } },
        'render-only': { kind: 'render-only', creation: { mode: 'workflow' } }
      },
      construction: {
        ...domain.construction,
        site_photo: {
          modes: ['upload'],
          defaultMode: 'upload',
          modeInputs: {
            upload: [{
              id: 'photo',
              type: 'payloadUpload',
              required: true,
              prompt: true,
              creator: { typeId: 'site_photo', attachmentKinds: 'userCreatable' }
            }]
          }
        }
      }
    };
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } },
      producerOutputs: producerOutputRecords([['upload', 'site_photo', {}, 'result']]),
      processNodes: {
        upload: {
          id: 'upload',
          kind: 'cts.construct',
          typeId: 'site_photo',
          producerOutputId: 'upload:result',
          construction: {
            mode: 'upload',
            // Authored nodes re-carry the domain's selector string verbatim;
            // compiled output must still expose expanded user-creatable kinds.
            inputs: [{
              id: 'photo',
              type: 'payloadUpload',
              required: true,
              prompt: true,
              creator: { typeId: 'site_photo', attachmentKinds: 'userCreatable' }
            }]
          },
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'role_admin', level: 'write' }] }
        }
      },
      graph: {
        nodes: [{ id: 'upload', type: 'processNode', data: { refId: 'upload' } }],
        edges: []
      }
    }, photoDomain);

    const expectedKinds = [
      { kind: 'site-photo', creation: { mode: 'upload' } },
      { kind: 'site-video', creation: { mode: 'capture' } }
    ];
    const action = compiled.actions.upload;
    expect(action.construction.inputs.find(input => input.id === 'photo').creator.attachmentKinds)
      .toEqual(expectedKinds);
    expect(action.inputPolicy.fields.find(field => field.id === 'photo').creator.attachmentKinds)
      .toEqual(expectedKinds);
  });

  it('carries declared many cardinality through construct relation inputs', () => {
    const normalized = normalizeProcessDefinition({
      dataflowVersion: 4,
      producerOutputs: producerOutputRecords([['update', 'project', {}, 'result']]),
      processNodes: {
        update: {
          id: 'update',
          kind: 'cts.construct',
          typeId: 'project',
          producerOutputId: 'update:result',
          construction: {
            mode: 'genericCreate',
            inputs: [{ id: 'relations.reviewLibraries', path: 'relations.reviewLibraries', type: 'entity', typeId: 'library' }]
          },
          trigger: { mode: 'manual' }
        }
      },
      graph: {
        nodes: ['update'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: []
      }
    }, {
      entities: [{ type: 'project' }, { type: 'library' }],
      relations: [{ ownerType: 'project', key: 'reviewLibraries', targetType: 'library', cardinality: 'many' }]
    });

    expect(normalized.actions.update.mutation.relationContracts[0]).toMatchObject({
      ownerType: 'project',
      targetType: 'library',
      cardinality: 'many'
    });
  });

  it('normalizes embedded relation creators against the current derived construction contract', () => {
    const normalized = normalizeProcessDefinition({
      producerOutputs: producerOutputRecords([['create_design', 'cassette_design'], ['update_queue', 'queue']]),
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          typeId: 'cassette_design',
          producerOutputId: 'create_design:entity',
          construction: {
            mode: 'bakeCassetteDesignFromTemplate',
            blockComposed: true,
            inputs: [
              { id: 'name', type: 'string', required: true, prompt: true },
              { id: 'templateId', type: 'entity', typeId: 'cassette', required: true, prompt: true }
            ]
          },
          inputPolicy: {
            fields: [
              { id: 'name', type: 'string', required: true, prompt: true },
              { id: 'templateId', type: 'entity', typeId: 'cassette', required: true, prompt: true }
            ]
          }
        },
        update_queue: {
          id: 'update_queue',
          actionKind: 'updateEntity',
          typeId: 'queue',
          producerOutputId: 'update_queue:entity',
          mutation: {
            relationContracts: [{
              ownerType: 'queue',
              key: 'cassettes',
              targetType: 'cassette_design',
              cardinality: 'many',
              creator: { actionId: 'create_design' }
            }]
          }
        }
      }
    }, {
      construction: {
        cassette_design: {
          modes: ['bakeCassetteDesignFromTemplate'],
          defaultMode: 'bakeCassetteDesignFromTemplate',
          derived: true,
          inputs: [{ id: 'templateId', type: 'entity', typeId: 'cassette', required: true, prompt: true }]
        }
      }
    });

    expect(normalized.actions['update_queue:link:cassettes'].relationMutation.creator.inputPolicy.fields)
      .toEqual([expect.objectContaining({ id: 'templateId' })]);
    expect(normalized.actions['update_queue:link:cassettes'].relationMutation.creator.construction.inputs)
      .toEqual([expect.objectContaining({ id: 'templateId' })]);
  });

  it('does not compile explicit parent inputs as hierarchy', () => {
    const compiled = compileProcessDefinition({
      producerOutputs: producerOutputRecords([['create_queue', 'queue']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          parentTypeId: 'project',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: [] },
          inputs: [{ id: 'parent', typeId: 'project' }],
          outputs: [{ id: 'created', typeId: 'queue', state: INITIAL_STATE }]
        }
      }
    }, domain);

    expect(compiled.actions.create_queue.parentTypeId).toBeNull();
  });

  it('does not place parent metadata without a compiled Lineage binding', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      producerOutputs: producerOutputRecords([['create_project', 'project'], ['create_queue', 'queue']]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'create_project:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', typeId: 'project', state: SOURCE_STATE }]
        },
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          parentTypeId: 'project',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [{ id: 'parent', typeId: 'project' }],
          outputs: [{ id: 'created', typeId: 'queue', state: INITIAL_STATE }]
        }
      },
      assignments: {
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    const projectDetail = compiled.screens.auto_role_admin_project_detail;
    expect(projectDetail.sources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'queue_children' })
    ]));
    expect(compiled.screens.auto_role_admin_queue.actions).toContain('create_queue');
    expect(compiled.screens.auto_role_admin_queue.sources).toEqual([
      expect.objectContaining({
        typeId: 'queue',
        mode: 'list'
      })
    ]);
    expect(compiled.userAccess.user_admin.screens.find(screen => screen.template === 'home')).toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({ typeId: 'project' }),
        expect.objectContaining({ typeId: 'queue' })
      ])
    });
  });

  it('does not mark an explicitly parent-filtered list source as a root source', () => {
    const scopedDomain = {
      ...domain,
      containment: [
        ...domain.containment,
        { parentType: 'project', childType: 'sheet_design', lineageKey: 'projectId' },
        { parentType: 'nesting_run', childType: 'sheet_design', lineageKey: 'runId' }
      ]
    };
    const compiled = compileProcessDefinition({
      roles: { role_reader: { id: 'role_reader' } },
      screens: {
        project_designs: {
          id: 'project_designs',
          label: 'Project designs',
          route: '/project-designs',
          template: 'typeList',
          typeId: 'sheet_design',
          roleIds: ['role_reader'],
          sources: [{
            id: 'sheet_designs',
            typeId: 'sheet_design',
            mode: 'list',
            filters: { projectId: '$assignment.projectId' }
          }]
        }
      },
      assignments: {
        user_reader: {
          userId: 'user_reader',
          roleIds: ['role_reader'],
          bindings: { projectId: 'project-1' },
          status: 'active'
        }
      }
    }, scopedDomain);

    const screen = resolveScreens({ compiled, userId: 'user_reader' })
      .find(item => item.typeId === 'sheet_design');
    expect(screen.sources[0]).toMatchObject({ filters: { projectId: 'project-1' } });
    expect(screen.sources[0].filters).toBeDefined();
  });

  it('ignores stale parent input edges without a compiled Lineage binding', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      producerOutputs: producerOutputRecords([['create_library', 'library'], ['create_cassette', 'cassette']]),
      actions: {
        create_library: {
          id: 'create_library',
          actionKind: 'createEntity',
          typeId: 'library',
          producerOutputId: 'create_library:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', typeId: 'library', state: SOURCE_STATE }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'create_cassette:entity',
          parentTypeId: 'cassette',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [{ id: 'parent', typeId: 'cassette' }],
          outputs: [{ id: 'created', typeId: 'cassette', state: INITIAL_STATE }]
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

    expect(compiled.actions.create_cassette.parentTypeId).toBeNull();
    expect(compiled.screens.auto_role_admin_library_detail.sources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cassette_children' })
    ]));
  });

  it('does not place readable domain children without a compiled Lineage binding', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_reader: { id: 'role_reader', label: 'Reader' }
      },
      producerOutputs: producerOutputRecords([['create_library', 'library'], ['create_cassette', 'cassette']]),
      actions: {
        create_library: {
          id: 'create_library',
          actionKind: 'createEntity',
          typeId: 'library',
          producerOutputId: 'create_library:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'read', roleIds: ['role_reader'] },
          outputs: [{ id: 'created', typeId: 'library', state: SOURCE_STATE }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'create_cassette:entity',
          parentTypeId: 'library',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'read', roleIds: ['role_reader'] },
          inputs: [{ id: 'parent', typeId: 'library' }],
          outputs: [{ id: 'created', typeId: 'cassette', state: INITIAL_STATE }]
        }
      },
      assignments: {
        user_reader: { userId: 'user_reader', roleIds: ['role_reader'], status: 'active' }
      }
    }, domain);

    const libraryDetail = compiled.screens.auto_role_reader_library_detail;
    expect(libraryDetail.sources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cassette_children' })
    ]));
    expect(libraryDetail.actions).not.toContain('create_cassette');
  });

  it('does not infer child regions without a domain parent relation', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      producerOutputs: producerOutputRecords([['create_project', 'project'], ['create_cassette', 'cassette']]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'create_project:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', typeId: 'project', state: SOURCE_STATE }]
        },
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'create_cassette:entity',
          parentTypeId: 'project',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [{ id: 'parent', typeId: 'project' }],
          outputs: [{ id: 'created', typeId: 'cassette', state: INITIAL_STATE }]
        }
      },
      assignments: {
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    expect(compiled.screens.auto_role_admin_project_detail.sources.map(source => source.typeId)).not.toContain('cassette');
  });

  it('does not treat construction entity inputs as parent-bound create actions', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      producerOutputs: producerOutputRecords([['create_cassette', 'cassette'], ['create_design', 'cassette_design']]),
      actions: {
        create_cassette: {
          id: 'create_cassette',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'create_cassette:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', typeId: 'cassette', state: SOURCE_STATE }]
        },
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          typeId: 'cassette_design',
          producerOutputId: 'create_design:entity',
          parentTypeId: 'cassette',
          state: { to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          inputs: [{ id: 'parent', typeId: 'cassette', state: SOURCE_STATE }],
          outputs: [{ id: 'created', typeId: 'cassette_design', state: TARGET_STATE }]
        }
      },
      assignments: {
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    expect(compiled.actions.create_design.parentTypeId).toBeNull();
    expect(compiled.actions.create_design.inputs[0]).toMatchObject({
      id: 'parent',
      typeId: '',
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
          typeId: 'cassette',
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
      producerOutputs: producerOutputRecords([['create_queue', 'queue'], ['create_design', 'cassette_design']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_installer'] },
          outputs: [{ id: 'created', typeId: 'queue', state: SOURCE_STATE }]
        },
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          typeId: 'cassette_design',
          producerOutputId: 'create_design:entity',
          parentTypeId: 'cassette',
          state: { to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_installer'] },
          inputs: [{ id: 'parent', typeId: 'cassette' }],
          outputs: [{ id: 'created', typeId: 'cassette_design', state: TARGET_STATE }]
        }
      },
      assignments: {
        user_installer: { userId: 'user_installer', roleIds: ['role_installer'], status: 'active' }
      }
    }, domain);

    expect(compiled.actions.create_design.parentTypeId).toBeNull();
    expect(compiled.actions.create_design.inputs[0]).toMatchObject({
      id: 'parent',
      typeId: '',
      required: false
    });
    expect(compiled.userAccess.user_installer.actions.find(action => action.id === 'create_design')).toMatchObject({
      actionKind: 'createInstance'
    });
    expect(compiled.screens.auto_role_installer_queue_detail?.actions || []).not.toContain('create_design');
  });

  it('compiles typed construction and status definitions into actions and workflows', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      stateDefinitions: {
        status_review: {
          id: 'status_review',
          stateId: 'REVIEW',
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
              designs: { typeId: 'cassette_design', lineageKey: 'queueId', required: true }
            }
          }
        }
      },
      valueInputs: {
        design_name: {
          id: 'design_name',
          block: 'identity',
          valueType: 'string',
          path: 'name',
          value: 'Named design',
          icon: 'pi pi-id-card'
        }
      },
      producerOutputs: producerOutputRecords([['create_design', 'cassette_design']]),
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          typeId: 'cassette_design',
          producerOutputId: 'create_design:entity',
          stateRef: 'status_review',
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
          outputs: [{ id: 'created', typeId: 'cassette_design' }]
        }
      }
    }, domain);

    expect(compiled.actions.create_design.state).toMatchObject({ to: 'REVIEW' });
    expect(compiled.actions.create_design.state).toMatchObject({
      label: 'Review',
      color: 'warn',
      severity: 'warn',
      icon: 'pi pi-eye'
    });
    expect(compiled.actions.create_design.construction.mode).toBe('bakeCassetteDesignFromTemplate');
    expect(compiled.actions.create_design.construction.inputs.map(input => input.id)).toEqual(['templateId', 'parameters']);
    expect(compiled.actions.create_design.inputPolicy.fields.map(field => field.id)).not.toContain('name');
    expect(compiled.stateDefinitions.status_review).toMatchObject({
      stateId: 'REVIEW',
      severity: 'warn',
      color: 'warn',
      lifecycle: {
        description: { required: true },
        attachments: {
          proof: { kind: 'photo', required: true }
        },
        snapshots: {
          designs: { typeId: 'cassette_design', lineageKey: 'queueId', required: true }
        }
      }
    });
    expect(compiled.valueInputs.design_name).toMatchObject({
      value: 'Named design',
      icon: 'pi pi-id-card'
    });
    expect(compiled.producerOutputs['create_design:entity'].workflow.regions.main.states.REVIEW).toMatchObject({
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
          designs: { typeId: 'cassette_design', lineageKey: 'queueId', required: true }
        }
      }
    });
  });

  it('labels status-change actions from their target status definition', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      producerOutputs: producerOutputRecords([['queue_entity', 'queue']]),
      stateDefinitions: {
        status_deleted: {
          id: 'status_deleted',
          stateId: 'DELETED',
          label: 'Deleted',
          severity: 'danger',
          icon: 'pi pi-ban'
        }
      },
      actions: {
        delete_queue: {
          id: 'delete_queue',
          label: 'Action',
          actionKind: 'updateEntity',
          producerOutputId: 'queue_entity:entity',
          stateRef: 'status_deleted',
          state: { from: 'CREATED' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          inputs: [{ id: 'entity', typeId: 'queue', state: 'CREATED' }],
          outputs: [{ id: 'entity', typeId: 'queue', state: 'DELETED' }]
        }
      }
    }, domain);

    expect(compiled.actions.delete_queue.label).toBe('Deleted');
    expect(compiled.actions.delete_queue.state).toMatchObject({
      to: 'DELETED',
      label: 'Deleted',
      severity: 'danger',
      icon: 'pi pi-ban'
    });
    expect(compiled.roles.role_admin.actions[0].state).toMatchObject({
      to: 'DELETED',
      label: 'Deleted',
      severity: 'danger',
      icon: 'pi pi-ban'
    });
  });

  it('derives generic-label create action captions from the domain entity label on the actions channel', () => {
    // The actions channel (compiled.actions — what projectUiAction feeds
    // to the manifest) previously dropped the domain from its label
    // derivation, so a generic 'cts.construct' node captioned with the
    // raw type id instead of the authored render label.
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      producerOutputs: producerOutputRecords([['worksite_entity', 'worksite']]),
      actions: {
        create_worksite: {
          id: 'create_worksite',
          label: 'cts.construct',
          actionKind: 'createEntity',
          typeId: 'worksite',
          producerOutputId: 'worksite_entity:entity',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'] }
        }
      }
    }, {
      ...domain,
      entities: [...domain.entities, { type: 'worksite', label: 'Worksite' }],
      construction: { ...domain.construction, worksite: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] } }
    });

    expect(compiled.actions.create_worksite.label).toBe('Create Worksite');
  });

  it('captions a run action with the service declaration render label', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      actions: {
        solve: {
          id: 'solve',
          label: 'cts.service',
          actionKind: 'runCommand',
          commandId: 'plugin.facade.nesting-solve',
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'] }
        }
      }
    }, {
      ...domain,
      commands: {
        'plugin.facade.nesting-solve': { id: 'plugin.facade.nesting-solve', service: 'plugin.facade', action: 'run', plugin: true }
      },
      serviceContracts: {
        'plugin.facade.nesting-solve': { id: 'plugin.facade.nesting-solve', command: 'plugin.facade.nesting-solve', render: { label: 'Nesting solver' } }
      }
    });

    expect(compiled.actions.solve.label).toBe('Run Nesting solver');
  });

  it('rejects generic creation for derived construction contracts', () => {
    const validation = validateProcessDefinition({
      producerOutputs: producerOutputRecords([['create_design', 'cassette_design']]),
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          typeId: 'cassette_design',
          producerOutputId: 'create_design:entity',
          state: { to: 'CREATED' },
          construction: { mode: 'genericCreate', inputs: [] },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: [] },
          outputs: [{ id: 'created', typeId: 'cassette_design', state: 'CREATED' }]
        }
      }
    }, domain);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toContain('typed construction mode');
  });

  it('hydrates create prompts from the domain construction contract', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      producerOutputs: producerOutputRecords([['create_design', 'cassette_design']]),
      actions: {
        create_design: {
          id: 'create_design',
          actionKind: 'createEntity',
          typeId: 'cassette_design',
          producerOutputId: 'create_design:entity',
          state: { to: 'CREATED' },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', typeId: 'cassette_design', state: 'CREATED' }]
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
        expect.objectContaining({ id: 'templateId', prompt: true, required: true }),
        expect.objectContaining({ id: 'parameters', type: 'cassetteParameters', prompt: true })
      ])
    });
    expect(compiled.userAccess.user_admin.actions[0].construction.inputs).toEqual(expect.arrayContaining(['templateId', 'parameters']));
    expect(compiled.userAccess.user_admin.actions[0].fields).toEqual(['templateId', 'parameters']);
  });

  it('propagates required queue construction inputs during queue creation', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      producerOutputs: producerOutputRecords([['create_queue', 'queue']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          parentTypeId: 'cassette',
          state: { to: 'DRAFT' },
          construction: {
            inputs: [
              { id: 'jobItems', path: 'job.items', type: 'typeList', accepts: ['cassette_design'], required: true }
            ]
          },
          inputPolicy: {
            fields: [
              { id: 'jobItems', path: 'job.items', type: 'typeList', accepts: ['cassette_design'], required: true }
            ]
          },
          inputs: [
            { id: 'parent', label: 'cassette', typeId: 'cassette', required: false },
            { id: 'data:jobItems', path: 'job.items', type: 'typeList', accepts: ['cassette_design'], required: true, constructionInputId: 'jobItems' }
          ],
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', typeId: 'queue', state: 'DRAFT' }]
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

    expect(compiled.actions.create_queue.construction.inputs.map(input => input.id)).toEqual(expect.arrayContaining([
      'name',
      'jobItems',
      'materialPool'
    ]));
    expect(compiled.actions.create_queue.parentTypeId).toBeNull();
    expect(compiled.actions.create_queue.inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'parent', typeId: '', required: false }),
      expect.objectContaining({ id: 'data:jobItems', required: true })
    ]));
    const exposedQueueAction = compiled.userAccess.user_admin.actions[0];
    expect(exposedQueueAction.actionKind).toBe('createInstance');
    expect(exposedQueueAction.typeId).toBe('queue');
    expect(exposedQueueAction.construction.inputs).toEqual(expect.arrayContaining(['name', 'jobItems', 'materialPool']));
    expect(exposedQueueAction.fields).toEqual(expect.arrayContaining(['name']));
    expect(exposedQueueAction.fields).not.toContain('jobItems');
  });

  it('rejects stale construction modes when an action entity type changes', () => {
    const validation = validateProcessDefinition({
      roles: {
        role_admin: { id: 'role_admin' }
      },
      producerOutputs: producerOutputRecords([['create_template', 'cassette']]),
      actions: {
        create_template: {
          id: 'create_template',
          actionKind: 'createEntity',
          typeId: 'cassette',
          producerOutputId: 'create_template:entity',
          state: { to: 'ACTIVE' },
          construction: { mode: 'bakeCassetteDesignFromTemplate' },
          trigger: { mode: 'manual' },
          access: { level: 'admin', roleIds: ['role_admin'] },
          outputs: [{ id: 'created', typeId: 'cassette', state: 'ACTIVE' }]
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

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toContain('construction mode bakeCassetteDesignFromTemplate');
  });

  it('compiles update actions with field mutation sockets', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_editor: { id: 'role_editor' }
      },
      producerOutputs: producerOutputRecords([['project_entity', 'project']]),
      actions: {
        update_project_data: {
          id: 'update_project_data',
          actionKind: 'updateEntity',
          producerOutputId: 'project_entity:entity',
          mutation: { fields: ['fields.metadata'] },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_editor'] },
          inputs: [
            { id: 'entity', typeId: 'project' },
            { id: 'field:data.metadata', dataPath: 'fields.metadata', kind: 'data' }
          ],
          outputs: [{ id: 'entity', typeId: 'project' }]
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
      actionKind: 'updateEntity',
      mutation: { fields: ['fields.metadata'] },
      inputs: [
        { id: 'entity', typeId: 'project' },
        { id: 'field:data.metadata', dataPath: 'fields.metadata' }
      ]
    });
    expect(compiled.userAccess.user_editor.permissions.projects[0]).toMatchObject({ level: 'write' });
  });

  it('compiles send-to-organization projection actions', () => {
    const compiled = compileProcessDefinition({
      producerOutputs: producerOutputRecords([['send_project', 'project']]),
      actions: {
        send_project: {
          id: 'send_project',
          actionKind: 'sendToOrganization',
          typeId: 'project',
          producerOutputId: 'send_project:entity',
          projection: { fields: ['name', 'fields.*'], excludeFields: [] },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: [] },
          inputs: [{ id: 'entity', typeId: 'project' }],
          outputs: [{ id: 'projection', typeId: 'project', projection: true }]
        }
      }
    }, domain);

    expect(compiled.actions.send_project).toMatchObject({
      actionKind: 'sendToOrganization',
      projection: { fields: ['name', 'fields.*'] }
    });
  });

  it('compiles inbound organization sockets as received entity outputs', () => {
    const compiled = compileProcessDefinition({
      sockets: {
        receive_project: {
          id: 'receive_project',
          direction: 'inbound',
          typeId: 'project',
          projection: { fields: ['name', 'fields.*'], excludeFields: [] },
          receiverLifecycle: { mode: 'defaultCreated', workflow: null },
          access: { receiveRoles: [] }
        }
      }
    }, domain);

    expect(compiled.sockets.receive_project).toMatchObject({
      direction: 'inbound',
      inputs: [],
      outputs: [{ id: 'received', typeId: 'project' }]
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
      producerOutputs: producerOutputRecords([['solve_queue', 'queue']]),
      actions: {
        solve_queue: {
          id: 'solve_queue',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          typeId: 'queue',
          producerOutputId: 'solve_queue:entity',
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }] },
          inputs: [{ id: 'queue', typeId: 'queue' }]
        }
      },
      assignments: {
        user_operator: { userId: 'user_operator', roleIds: ['role_operator'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_operator.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'solve_queue',
        actionKind: 'runCommand',
        commandId: 'solveNesting',
        typeId: 'queue'
      })
    ]));
  });

  it('keeps definition-plane records off the canvas while round-tripping them', () => {
    const definition = {
      roles: {
        role_admin: { id: 'role_admin', label: 'Admin' }
      },
      servicePrincipals: {
        principal_nesting: { id: 'principal_nesting', label: 'Nesting service' }
      },
      producerOutputs: producerOutputRecords([['project_profile', 'project', {
        lifecycle: { mode: 'defaultCreated' },
        fields: { read: ['name', 'fields.*'], write: [], private: [] }
      }]])
    };

    const canvas = definitionToCanvas(definition);
    const roundTrip = validateRoundTrip(definition);

    expect(canvas.nodes).toEqual([]);
    expect(roundTrip.ok).toBe(true);
    expect(canvasToDefinition(canvas, definition).producerOutputs).toEqual(definition.producerOutputs);
  });

  it('converts canvas deletion back into semantic record deletion', () => {
    const definition = {
      processNodes: {
        create_project: { id: 'create_project', kind: 'source.literalItem', value: 'create' },
        send_project: { id: 'send_project', kind: 'source.literalItem', value: 'send' }
      },
      graph: {
        nodes: ['create_project', 'send_project'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: []
      }
    };

    const canvas = definitionToCanvas(definition);
    const next = canvasToDefinition({ ...canvas, nodes: canvas.nodes.filter(node => node.id !== 'send_project') }, definition);

    expect(Object.keys(next.processNodes)).toEqual(['create_project']);
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
      producerOutputs: producerOutputRecords([['activate_project', 'project']]),
      actions: {
        activate_project: {
          actionKind: 'updateEntity',
          typeId: 'project',
          producerOutputId: 'activate_project:entity',
          state: { from: SOURCE_STATE, to: TARGET_STATE },
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
      producerOutputs: producerOutputRecords([['create_project', 'project']]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'create_project:entity',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_creator'] },
          inputs: [],
          outputs: [{ id: 'created', typeId: 'project', state: INITIAL_STATE }]
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
      rule: { fact: 'primaryState', equals: INITIAL_STATE }
    });
    expect(compiled.roles.role_creator.actions[0]).toMatchObject({ actionId: 'create_project', level: 'run' });
    expect(compiled.userAccess.user_creator.actions[0]).toMatchObject({
      id: 'create_project',
      label: 'Create project',
      actionKind: 'createInstance',
      typeId: 'project',
      sourceRoleIds: ['role_creator']
    });
  });

  it('exposes a root create from the producer output create rights and labels it with the authored entity label', () => {
    const labeledDomain = {
      ...domain,
      entities: domain.entities.map(entity => (
        entity.type === 'project' ? { ...entity, label: 'Production Order' } : entity
      ))
    };
    const compiled = compileProcessDefinition({
      roles: {
        role_maker: { id: 'role_maker' }
      },
      producerOutputs: producerOutputRecords([['make_project', 'project', {
        allowedRoles: { read: ['role_maker'], write: ['role_maker'], admin: [] }
      }]]),
      actions: {
        make_project: {
          id: 'make_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'make_project:entity',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: [], grants: [] },
          inputs: [],
          outputs: [{ id: 'created', typeId: 'project', state: INITIAL_STATE }]
        }
      },
      assignments: {
        user_maker: {
          userId: 'user_maker',
          roleIds: ['role_maker'],
          status: 'active'
        }
      }
    }, labeledDomain);

    // Create rights on the producer output expose the manual create: the
    // role manifest, the assignment manifest, and the inferred list/home
    // region all carry the class-level create action.
    expect(compiled.roles.role_maker.actions.map(action => action.actionId)).toContain('make_project');
    expect(compiled.userAccess.user_maker.actions.find(action => action.id === 'make_project')).toMatchObject({
      actionKind: 'createInstance',
      typeId: 'project',
      label: 'Create Production Order'
    });
    expect(compiled.userAccess.user_maker.actions.find(action => action.id === 'make_project').typeId).toBe('project');
    expect(compiled.userAccess.user_maker.actions.find(action => action.id === 'make_project').inputPolicy).toBeTruthy();
    expect(compiled.screens.auto_role_maker_project.regions[0].actions).toContain('make_project');
    const home = compiled.userAccess.user_maker.screens.find(screen => screen.template === 'home');
    expect(home.regions[0].actions).toContain('make_project');
  });

  it('keeps per-role action access levels separate', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_writer: { id: 'role_writer' },
        role_admin: { id: 'role_admin' }
      },
      producerOutputs: producerOutputRecords([['create_project', 'project']]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'create_project:entity',
          state: { to: INITIAL_STATE },
          trigger: { mode: 'manual' },
          access: {
            grants: [
              { roleId: 'role_writer', level: 'write' },
              { roleId: 'role_admin', level: 'admin' }
            ]
          },
          inputs: [],
          outputs: [{ id: 'created', typeId: 'project', state: INITIAL_STATE }]
        }
      },
      assignments: {
        user_writer: { userId: 'user_writer', roleIds: ['role_writer'], status: 'active' },
        user_admin: { userId: 'user_admin', roleIds: ['role_admin'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_writer.permissions.projects[0]).toMatchObject({
      level: 'write',
      rule: { fact: 'primaryState', equals: INITIAL_STATE }
    });
    expect(compiled.userAccess.user_admin.permissions.projects[0]).toMatchObject({
      level: 'admin',
      rule: { fact: 'primaryState', equals: INITIAL_STATE }
    });
  });

  it('derives status action grants for the resulting status contract', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      producerOutputs: producerOutputRecords([['activate_project_entity', 'project']]),
      actions: {
        activate_project: {
          id: 'activate_project',
          actionKind: 'updateEntity',
          producerOutputId: 'activate_project_entity:entity',
          state: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'], stateFrom: SOURCE_STATE, stateTo: TARGET_STATE },
          inputs: [{ id: 'entity', typeId: 'project', state: SOURCE_STATE }],
          outputs: [{ id: 'entity', typeId: 'project', state: TARGET_STATE }]
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
      rule: { fact: 'primaryState', equals: TARGET_STATE }
    });
    expect(compiled.userAccess.user_operator.permissions.projects[0]).toMatchObject({
      transitions: [{ from: SOURCE_STATE, to: TARGET_STATE }],
      rule: { fact: 'primaryState', equals: TARGET_STATE }
    });
  });

  it('surfaces a status-change action to its authored roles over inherited input access', () => {
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
      producerOutputs: producerOutputRecords([['create_project', 'project', { lifecycle: { mode: 'domainDefault' } }]]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'create_project:entity',
          state: { to: SOURCE_STATE },
          access: { level: 'admin', roleIds: ['role_source'] },
          outputs: [{ id: 'created', typeId: 'project', state: SOURCE_STATE }]
        },
        activate_project: {
          id: 'activate_project',
          actionKind: 'updateEntity',
          producerOutputId: 'create_project:entity',
          state: { to: TARGET_STATE },
          access: {
            level: 'admin',
            roleIds: ['role_target'],
            modified: true,
            stateFrom: SOURCE_STATE,
            stateTo: TARGET_STATE
          },
          inputs: [{ id: 'entity', typeId: 'project', state: SOURCE_STATE }],
          outputs: [{ id: 'entity', typeId: 'project', state: TARGET_STATE }]
        }
      },
      assignments: {
        user_source: { userId: 'user_source', roleIds: ['role_source'], status: 'active' },
        user_target: { userId: 'user_target', roleIds: ['role_target'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_source.permissions.projects).toEqual([
      { level: 'admin', rule: { fact: 'primaryState', equals: SOURCE_STATE } }
    ]);
    expect(compiled.userAccess.user_target.permissions.projects).toEqual([
      {
        level: 'admin',
        transitions: [{ from: SOURCE_STATE, to: TARGET_STATE }],
        rule: { fact: 'primaryState', equals: TARGET_STATE }
      }
    ]);
    expect(compiled.userAccess.user_target.actions.map(action => action.id)).toContain('activate_project');
    expect(compiled.userAccess.user_source.actions.map(action => action.id)).not.toContain('activate_project');
    expect(compiled.producerOutputs['create_project:entity'].workflow.regions.main.transitions[0].processRoleIds).toEqual(['role_target']);
    expect(compiled.producerOutputs['create_project:entity'].workflow.regions.main.transitions[0].access).toBeUndefined();
  });

  it('does not invent a lineage scope from a parent input edge', () => {
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
      producerOutputs: producerOutputRecords([['create_project', 'project'], ['create_queue', 'queue']]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'create_project:entity',
          state: { to: SOURCE_STATE },
          access: {
            level: 'admin',
            roleIds: ['role_project'],
            scope: { instanceId: '$assignment.projectId' }
          },
          outputs: [{ id: 'created', typeId: 'project', state: SOURCE_STATE }]
        },
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          state: { to: INITIAL_STATE },
          access: { level: 'write', roleIds: ['role_queue'] },
          inputs: [{ id: 'parent', typeId: 'project' }],
          outputs: [{ id: 'created', typeId: 'queue', state: INITIAL_STATE }]
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
        scope: { instanceId: 'project-a' },
        rule: { fact: 'primaryState', equals: INITIAL_STATE }
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
      producerOutputs: producerOutputRecords([['create_queue', 'queue']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }] },
          outputs: [{ id: 'created', typeId: 'queue', state: SOURCE_STATE }]
        },
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          producerOutputId: 'create_queue:entity',
          trigger: { mode: 'event' },
          inputs: [{ id: 'queue', typeId: 'queue', state: SOURCE_STATE }]
        }
      },
      assignments: {
        user_operator: { userId: 'user_operator', roleIds: ['role_operator'], status: 'active' }
      }
    }, domain);

    expect(compiled.userAccess.user_operator.permissions.nesting_runs).toEqual([
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
          { id: 'solve-run-cut', source: 'solve_nesting', target: 'mark_run_cut', sourceHandle: 'output:nesting_run', targetHandle: 'input:entity' },
          { id: 'send-reject', source: 'send_queue', target: 'reject_queue', sourceHandle: 'output', targetHandle: 'input:entity' },
          { id: 'reject-send', source: 'reject_queue', target: 'send_queue', sourceHandle: 'output', targetHandle: 'input:entity' }
        ]
      },
      roles: {
        role_operator: { id: 'role_operator' }
      },
      producerOutputs: producerOutputRecords([['create_queue', 'queue'], ['send_queue', 'queue'], ['mark_run_cut', 'nesting_run'], ['reject_queue', 'queue']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }] },
          outputs: [{ id: 'created', typeId: 'queue', state: SOURCE_STATE }]
        },
        send_queue: {
          id: 'send_queue',
          actionKind: 'updateEntity',
          typeId: 'queue',
          producerOutputId: 'send_queue:entity',
          state: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'admin' }], modified: true }
        },
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          producerOutputId: 'send_queue:entity',
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'admin' }], modified: true },
          inputs: [{ id: 'queue', typeId: 'queue' }],
          outputs: [
            { id: 'nesting_run', typeId: 'nesting_run', multiple: true },
            { id: 'sheet_design', typeId: 'sheet_design', multiple: true }
          ]
        },
        mark_run_cut: {
          id: 'mark_run_cut',
          actionKind: 'updateEntity',
          typeId: 'nesting_run',
          producerOutputId: 'mark_run_cut:entity',
          state: { to: 'CUT' },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'admin' }], modified: true }
        },
        reject_queue: {
          id: 'reject_queue',
          actionKind: 'updateEntity',
          typeId: 'queue',
          producerOutputId: 'reject_queue:entity',
          state: { from: TARGET_STATE, to: 'REJECTED' },
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
      producerOutputs: producerOutputRecords([['create_queue', 'queue'], ['send_queue', 'queue']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }] },
          outputs: [{ id: 'created', typeId: 'queue', state: SOURCE_STATE }]
        },
        send_queue: {
          id: 'send_queue',
          actionKind: 'updateEntity',
          typeId: 'queue',
          producerOutputId: 'send_queue:entity',
          state: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { grants: [{ roleId: 'role_operator', level: 'write' }], modified: true }
        },
        solve_nesting: {
          id: 'solve_nesting',
          actionKind: 'runCommand',
          commandId: 'solveNesting',
          producerOutputId: 'send_queue:entity',
          trigger: { mode: 'manual' },
          inputs: [{ id: 'queue', typeId: 'queue' }],
          outputs: [
            { id: 'nesting_run', typeId: 'nesting_run', multiple: true },
            { id: 'sheet_design', typeId: 'sheet_design', multiple: true }
          ]
        }
      },
      assignments: {
        user_operator: { userId: 'user_operator', roleIds: ['role_operator'], status: 'active' }
      }
    }, domain);

    const userAccess = compiled.userAccess.user_operator;
    const commandAction = userAccess.actions.find(action => action.id === 'solve_nesting');
    const queueDetail = userAccess.screens.find(screen => screen.id === 'auto_role_operator_queue_detail');

    expect(commandAction).toMatchObject({
      actionKind: 'runCommand',
      commandId: 'solveNesting',
      typeId: 'queue'
    });
    expect(queueDetail.actions).toContain('solve_nesting');
    expect(queueDetail.regions[0].actions).toContain('solve_nesting');
    expect(userAccess.permissions.nesting_runs).toEqual([{ level: 'write' }]);
    expect(userAccess.permissions.sheet_designs).toEqual([{ level: 'write' }]);
  });

  it('synthesizes workflows and transition access from action nodes', () => {
    const compiled = compileProcessDefinition({
      roles: {
        role_operator: { id: 'role_operator' }
      },
      producerOutputs: producerOutputRecords([['create_project', 'project', { lifecycle: { mode: 'domainDefault' } }]]),
      actions: {
        create_project: {
          id: 'create_project',
          actionKind: 'createEntity',
          typeId: 'project',
          producerOutputId: 'create_project:entity',
          state: { to: SOURCE_STATE },
          trigger: { mode: 'event' },
          access: { level: 'write', roleIds: ['role_operator'] },
          outputs: [{ id: 'created', typeId: 'project', state: SOURCE_STATE }]
        },
        activate_project: {
          id: 'activate_project',
          actionKind: 'updateEntity',
          producerOutputId: 'create_project:entity',
          state: { from: SOURCE_STATE, to: TARGET_STATE },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'], stateFrom: SOURCE_STATE, stateTo: TARGET_STATE },
          inputs: [{ id: 'entity', typeId: 'project', state: SOURCE_STATE }],
          outputs: [{ id: 'entity', typeId: 'project', state: TARGET_STATE }]
        }
      }
    }, domain);

    const workflow = compiled.producerOutputs['create_project:entity'].workflow;
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
      producerOutputs: producerOutputRecords([['create_queue', 'queue']]),
      actions: {
        create_queue: {
          id: 'create_queue',
          actionKind: 'createEntity',
          typeId: 'queue',
          producerOutputId: 'create_queue:entity',
          state: { to: INITIAL_STATE },
          access: { level: 'write', roleIds: ['role_operator'] },
          outputs: [{ id: 'created', typeId: 'queue', state: INITIAL_STATE }]
        },
        send_queue: {
          id: 'send_queue',
          actionKind: 'updateEntity',
          producerOutputId: 'create_queue:entity',
          state: { from: INITIAL_STATE, to: TARGET_STATE },
          access: { level: 'write', roleIds: ['role_operator'], stateFrom: INITIAL_STATE, stateTo: TARGET_STATE },
          inputs: [{ id: 'entity', typeId: 'queue', state: INITIAL_STATE }],
          outputs: [{ id: 'entity', typeId: 'queue', state: TARGET_STATE }]
        },
        reject_queue: {
          id: 'reject_queue',
          actionKind: 'updateEntity',
          producerOutputId: 'create_queue:entity',
          state: { from: TARGET_STATE, to: NEXT_STATE },
          access: { level: 'write', roleIds: ['role_operator'], stateFrom: TARGET_STATE, stateTo: NEXT_STATE },
          inputs: [{ id: 'entity', typeId: 'queue', state: TARGET_STATE }],
          outputs: [{ id: 'entity', typeId: 'queue', state: NEXT_STATE }]
        }
      }
    }, domain);

    const transitions = compiled.producerOutputs['create_queue:entity'].workflow.regions.main.transitions.map(({ from, to, processRoleIds }) => ({
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

  it('creates compilable starter process definitions from a synthetic template', () => {
    const template = createTemplate({
      id: 'synthetic-manufacturer',
      label: 'Synthetic manufacturer',
      adminLabel: 'Synthetic admin',
      grants: { libraries: 'admin', catalogs: 'admin' },
      entities: {
        library: {
          id: 'library',
          typeId: 'library',
          label: 'Library',
          lifecycle: { mode: 'domainDefault', workflow: null },
          fields: { read: ['name', 'fields.*'], write: [], private: [] },
          stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] },
          allowedRoles: { read: ['role_admin'], write: ['role_admin'], admin: ['role_admin'] }
        }
      },
      services: {}
    });
    const definition = JSON.parse(JSON.stringify(template.definition));
    definition.compiled = null;
    const process = {
      identity: { uid: `process-${template.id}-org-1`, name: template.label, slug: template.id },
      lineage: { organizationId: 'org-1' },
      data: definition
    };
    const compiled = compileContract(process.data, domain, { roles: template.organizationRoles });
    const access = resolveRoleAssignmentAccess({ compiled, assignment: { userId: 'user-1', roleIds: ['role_admin'], bindings: {} }, domain });

    expect(process.data.sourceTemplateId).toBe('synthetic-manufacturer');
    expect(access.screens.length).toBeGreaterThan(0);
  });

  it('compiles lineage bindings from a Project -> Queue construct graph', () => {
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      roles: { operator: { id: 'operator', label: 'Operator' } },
      producerOutputs: producerOutputRecords([
        ['project_source', 'project', {}, 'result'],
        ['create_queue', 'queue', {}, 'result']
      ]),
      processNodes: {
        project_source: {
          id: 'project_source',
          kind: 'cts.construct',
          typeId: 'project',
          producerOutputId: 'project_source:result',
          label: 'Create project',
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
          state: { to: SOURCE_STATE },
          construction: { mode: 'genericCreate', inputs: [{ id: 'name', path: 'name', type: 'string', required: true, prompt: true }] }
        },
        create_queue: {
          id: 'create_queue',
          kind: 'cts.construct',
          typeId: 'queue',
          producerOutputId: 'create_queue:result',
          label: 'Create queue',
          trigger: { mode: 'manual' },
          access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
          state: { to: SOURCE_STATE },
          construction: {
            mode: 'genericCreate',
            inputs: [
              { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
              { id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project', required: false }
            ]
          }
        }
      },
      graph: {
        nodes: ['project_source', 'create_queue'].map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          {
            id: 'project-to-queue',
            source: 'project_source',
            sourceHandle: 'data:result',
            target: 'create_queue',
            targetHandle: 'data:lineage.projectId',
            role: 'data'
          }
        ]
      }
    }, {
      ...domain,
      construction: {
        ...domain.construction,
        queue: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            ...domain.construction.queue.inputs,
            { id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project', required: false }
          ]
        }
      }
    });

    const binding = compiled.lineageBindings.find(item => (
      item.childTypeId === 'queue'
      && item.parentTypeId === 'project'
    ));
    expect(binding).toBeDefined();
    expect(binding.lineageKey).toBe('projectId');
    expect(binding.sourceNode).toBe('project_source');
    expect(binding.sourceSocket).toBe('data:result');
    expect(binding.consumingNode).toBe('create_queue');
    expect(binding.consumingSocket).toBe('data:lineage.projectId');
    expect(binding.sourceProducerOutputId).toBe('project_source:result');
    expect(binding.producerOutputId).toBe('create_queue:result');
    expect(compiled.producerOutputs['create_queue:result'].lineageBindings).toEqual([
      expect.objectContaining({ producerOutputId: 'create_queue:result', lineageKey: 'projectId' })
    ]);
  });

  it('nests status definitions under their parent status and exposes the dotted state id', () => {
    const compiled = compileProcessDefinition({
      roles: { role_operator: { id: 'role_operator' } },
      producerOutputs: producerOutputRecords([['projectMain', 'project', {
        lifecycle: {
          mode: 'custom',
          workflow: {
            schemaVersion: 2,
            primaryRegion: 'main',
            regions: {
              main: {
                initial: 'PRODUCTION',
                states: {
                  PRODUCTION: { initial: 'cut', states: { cut: {} } },
                  DONE: {}
                },
                transitions: []
              }
            }
          }
        },
        fields: { read: [], write: [], private: [] }
      }]]),
      stateDefinitions: {
        production: { id: 'production', stateId: 'PRODUCTION', label: 'Production' },
        cut: { id: 'cut', stateId: 'cut', label: 'Cut', parentStatusId: 'PRODUCTION' }
      },
      actions: {
        mark_cut: {
          id: 'mark_cut',
          actionKind: 'updateEntity',
          typeId: 'project',
          producerOutputId: 'projectMain:entity',
          state: { to: 'PRODUCTION.cut' },
          trigger: { mode: 'manual' },
          access: { level: 'write', roleIds: ['role_operator'] }
        }
      }
    }, domain);

    const workflow = compiled.producerOutputs['projectMain:entity'].workflow;
    expect(workflow.regions.main.states['PRODUCTION.cut']).toMatchObject({ label: 'Cut' });
    expect(workflow.regions.main.states['PRODUCTION.cut'].path).toEqual(['PRODUCTION', 'cut']);
    expect(workflow.regions.main.states.PRODUCTION.label).toBe('Production');
    // PRODUCTION is a leaf beside its child, so the action targets a
    // distinct state and stays part of the contract.
    expect(compiled.actions.mark_cut.state.to).toBe('PRODUCTION.cut');
    expect(compiled.stateDefinitions.cut.parentStatusId).toBe('PRODUCTION');
  });

  it('rejects unknown and cyclic status definition parents', () => {
    const base = {
      producerOutputs: producerOutputRecords([['projectMain', 'project']]),
      stateDefinitions: {}
    };
    const unknown = structuredClone(base);
    unknown.stateDefinitions = { orphan: { id: 'orphan', stateId: 'CUT', parentStatusId: 'GHOST' } };
    const unknownResult = validateProcessDefinition(unknown, domain);
    expect(unknownResult.ok).toBe(false);
    expect(unknownResult.errors.join('\n')).toContain('references unknown parent status GHOST');

    const cyclic = structuredClone(base);
    cyclic.stateDefinitions = {
      one: { id: 'one', stateId: 'ONE', parentStatusId: 'TWO' },
      two: { id: 'two', stateId: 'TWO', parentStatusId: 'ONE' }
    };
    const cyclicResult = validateProcessDefinition(cyclic, domain);
    expect(cyclicResult.ok).toBe(false);
    expect(cyclicResult.errors.join('\n')).toContain('cyclic parent status chain');
  });

  it('keeps same-type lineage bindings separate by full producer and socket identity', () => {
    const lineageQueueConstruct = id => ({
      id,
      kind: 'cts.construct',
      typeId: 'queue',
      producerOutputId: `${id}:result`,
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
      state: { to: SOURCE_STATE },
      construction: {
        mode: 'genericCreate',
        inputs: [
          { id: 'name', path: 'name', type: 'string', required: true, prompt: true },
          { id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project', required: false }
        ]
      }
    });
    const projectConstruct = id => ({
      id,
      kind: 'cts.construct',
      typeId: 'project',
      producerOutputId: `${id}:result`,
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
      state: { to: SOURCE_STATE },
      construction: { mode: 'genericCreate', inputs: [{ id: 'name', path: 'name', type: 'string', required: true, prompt: true }] }
    });
    const compiled = compileProcessDefinition({
      dataflowVersion: 4,
      roles: { operator: { id: 'operator', label: 'Operator' } },
      producerOutputs: producerOutputRecords([
        ['project_a', 'project', {}, 'result'],
        ['project_b', 'project', {}, 'result'],
        ['queue_a', 'queue', {}, 'result'],
        ['queue_b', 'queue', {}, 'result']
      ]),
      processNodes: {
        project_a: projectConstruct('project_a'),
        project_b: projectConstruct('project_b'),
        queue_a: lineageQueueConstruct('queue_a'),
        queue_b: lineageQueueConstruct('queue_b')
      },
      graph: {
        nodes: ['project_a', 'project_b', 'queue_a', 'queue_b']
          .map(id => ({ id, type: 'processNode', data: { refId: id } })),
        edges: [
          { id: 'a-queue', source: 'project_a', sourceHandle: 'data:result', target: 'queue_a', targetHandle: 'data:lineage.projectId', role: 'data' },
          { id: 'b-queue', source: 'project_b', sourceHandle: 'data:result', target: 'queue_b', targetHandle: 'data:lineage.projectId', role: 'data' }
        ]
      }
    }, {
      ...domain,
      construction: {
        ...domain.construction,
        queue: {
          modes: ['genericCreate'],
          defaultMode: 'genericCreate',
          inputs: [
            ...domain.construction.queue.inputs,
            { id: 'lineage.projectId', path: 'lineage.projectId', type: 'entity', typeId: 'project', required: false }
          ]
        }
      }
    });

    const bindings = compiled.lineageBindings.filter(item => (
      item.childTypeId === 'queue' && item.parentTypeId === 'project'
    ));
    expect(bindings).toHaveLength(2);
    expect(new Set(bindings.map(item => item.producerOutputId))).toEqual(new Set(['queue_a:result', 'queue_b:result']));
    expect(new Set(bindings.map(item => item.sourceProducerOutputId))).toEqual(new Set(['project_a:result', 'project_b:result']));
    expect(new Set(bindings.map(item => item.consumingNode))).toEqual(new Set(['queue_a', 'queue_b']));
    expect(compiled.producerOutputs['queue_a:result'].lineageBindings.map(item => item.producerOutputId)).toEqual(['queue_a:result']);
    expect(compiled.producerOutputs['queue_b:result'].lineageBindings.map(item => item.producerOutputId)).toEqual(['queue_b:result']);
  });
});
