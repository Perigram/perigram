import { describe, expect, it } from 'vitest';
import { syncProcessNodeProducerOutputs } from './designer.js';
import { executeProcessDataNode } from './evaluator.js';
import { createDataPacket } from './data-tree.js';
import { compileLineageBindings, normalizeProcessDefinition, validateProcessDefinition } from './index.js';

const SOURCE_STATE = 'ACTIVE';
const ROLES = { operator: { id: 'operator', label: 'Operator' } };

const domain = {
  entities: [
    { type: 'project', label: 'Project', fields: [] },
    { type: 'queue', label: 'Queue', fields: [] }
  ],
  relations: [],
  workflows: {},
  containment: [{ childType: 'queue', parentType: 'project', lineageKey: 'projectId' }],
  construction: {
    project: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] },
    queue: { modes: ['genericCreate'], defaultMode: 'genericCreate', inputs: [] }
  },
  blockComposition: { lineage: { mode: 'ancestors', valueBase: 'entityRef' } },
  blockSchemas: {
    lineage: [{ path: 'lineage', block: 'lineage', type: { base: 'map', shape: 'item' } }]
  }
};

function producerOutputRecords(entries) {
  return Object.fromEntries(entries.map(([nodeId, typeId]) => {
    const producerOutputId = `${nodeId}:entity`;
    return [producerOutputId, {
      id: producerOutputId,
      producerOutputId,
      nodeId,
      outputSocketId: 'entity',
      typeId,
      lifecycle: { mode: 'defaultCreated' },
      fields: { read: [], write: [], private: [] }
    }];
  }));
}

function createProjectRecord(id, label) {
  return {
    id,
    kind: 'effect.createEntity',
    typeId: 'project',
    producerOutputId: `${id}:entity`,
    label,
    trigger: { mode: 'manual' },
    access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
    status: { to: SOURCE_STATE }
  };
}

function joinedFixture({ selectedProducerOutputId = 'project_a:entity' } = {}) {
  return {
    dataflowVersion: 4,
    producerOutputs: producerOutputRecords([['project_a', 'project'], ['project_b', 'project']]),
    processNodes: {
      project_a: createProjectRecord('project_a', 'Create project A'),
      project_b: createProjectRecord('project_b', 'Create project B'),
      join_paths: {
        id: 'join_paths',
        kind: 'producer.join',
        typeId: 'project',
        selectedProducerOutputId
      },
      consumer: {
        id: 'consumer',
        kind: 'collection.count',
        type: { base: 'entity', typeId: 'project' }
      }
    },
    graph: {
      nodes: ['project_a', 'project_b', 'join_paths', 'consumer']
        .map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges: [
        { id: 'a-join', source: 'project_a', sourceHandle: 'data:result', target: 'join_paths', targetHandle: 'data:primary', role: 'data' },
        { id: 'b-join', source: 'project_b', sourceHandle: 'data:result', target: 'join_paths', targetHandle: 'data:secondary', role: 'data' },
        { id: 'join-consumer', source: 'join_paths', sourceHandle: 'data:result', target: 'consumer', targetHandle: 'data:value', role: 'data' }
      ]
    }
  };
}

function validate(definition) {
  return validateProcessDefinition(definition, domain, { roles: ROLES });
}

describe('explicit producer join contract', () => {
  it('rejects implicit same-type producer convergence at an ordinary consumer', () => {
    const definition = joinedFixture();
    delete definition.processNodes.join_paths;
    definition.processNodes.consumer = {
      id: 'consumer',
      kind: 'collection.makeList',
      type: { base: 'entity', typeId: 'project' }
    };
    definition.graph.nodes = definition.graph.nodes.filter(node => node.id !== 'join_paths');
    definition.graph.edges = [
      { id: 'a-consumer', source: 'project_a', sourceHandle: 'data:result', target: 'consumer', targetHandle: 'data:item1', role: 'data' },
      { id: 'b-consumer', source: 'project_b', sourceHandle: 'data:result', target: 'consumer', targetHandle: 'data:item2', role: 'data' }
    ];

    const validation = validate(definition);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('implicitly converges project producer outputs project_a:entity (edge a-consumer) and project_b:entity (edge b-consumer)');
    expect(validation.errors.join('\n')).toContain('use an explicit producer join');
    expect(validation.diagnostics).toContainEqual(expect.objectContaining({
      nodeId: 'consumer',
      edgeId: 'a-consumer',
      producerOutputId: 'project_a:entity'
    }));
  });

  it('accepts the same paths converged through a configured join', () => {
    const validation = validate(joinedFixture());
    expect(validation.errors || []).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('rejects a join whose selection is not one of its connected sources', () => {
    const definition = joinedFixture({ selectedProducerOutputId: 'project_c:entity' });
    const validation = validate(definition);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('Join join_paths selects producer output project_c:entity, which is not among its connected sources project_a:entity, project_b:entity');
  });

  it('rejects a join without a resulting producer selection', () => {
    const definition = joinedFixture({ selectedProducerOutputId: '' });
    const validation = validate(definition);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('Join join_paths must select the resulting producer output from project_a:entity, project_b:entity');
  });

  it('rejects a join with an unconnected entity stream input', () => {
    const definition = joinedFixture();
    definition.graph.edges = definition.graph.edges.filter(edge => edge.id !== 'b-join');
    const validation = validate(definition);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join('\n')).toContain('Join join_paths requires a connected secondary entity stream');
  });

  it('never creates a producer output for the join node itself', () => {
    const data = { producerOutputs: { ...producerOutputRecords([['project_a', 'project']]) } };
    const ids = syncProcessNodeProducerOutputs(data, {
      id: 'join_paths',
      kind: 'producer.join',
      typeId: 'project',
      selectedProducerOutputId: 'project_a:entity',
      outputs: [{ id: 'result', type: { base: 'entity', typeId: 'project' } }]
    });
    expect(ids).toEqual([]);
    expect(Object.keys(data.producerOutputs)).toEqual(['project_a:entity']);
  });

  it('retains the selected producer identity for downstream lineage bindings', () => {
    const definition = joinedFixture({ selectedProducerOutputId: 'project_b:entity' });
    definition.processNodes.queue_lineage = {
      id: 'queue_lineage',
      kind: 'record.composeBlock',
      block: 'lineage',
      compositionMode: 'ancestors',
      entries: [{ id: 'project', key: 'projectId', typeId: 'project' }]
    };
    definition.processNodes.create_queue = {
      id: 'create_queue',
      kind: 'effect.createEntity',
      typeId: 'queue',
      producerOutputId: 'create_queue:entity',
      label: 'Create queue',
      trigger: { mode: 'manual' },
      access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
      status: { to: SOURCE_STATE },
      blocks: ['lineage']
    };
    definition.producerOutputs['create_queue:entity'] = producerOutputRecords([['create_queue', 'queue']])['create_queue:entity'];
    definition.graph.nodes.push(
      { id: 'queue_lineage', type: 'processNode', data: { refId: 'queue_lineage' } },
      { id: 'create_queue', type: 'processNode', data: { refId: 'create_queue' } }
    );
    definition.graph.edges.push(
      { id: 'join-lineage', source: 'join_paths', sourceHandle: 'data:result', target: 'queue_lineage', targetHandle: 'entry:project', role: 'data' },
      { id: 'lineage-queue', source: 'queue_lineage', sourceHandle: 'data:block', target: 'create_queue', targetHandle: 'data:lineage', role: 'data' }
    );

    const bindings = compileLineageBindings(normalizeProcessDefinition(definition, domain), domain);
    const binding = bindings.find(item => item.childTypeId === 'queue' && item.parentTypeId === 'project');
    expect(binding).toBeDefined();
    expect(binding.sourceProducerOutputId).toBe('project_b:entity');
  });

  it('concatenates both joined streams as the data semantics', async () => {
    const result = await executeProcessDataNode({
      id: 'join_paths',
      kind: 'producer.join',
      typeId: 'project',
      selectedProducerOutputId: 'project_a:entity'
    }, {
      primary: createDataPacket([{ id: 'a1' }, { id: 'a2' }], 'list'),
      secondary: createDataPacket([{ id: 'b1' }], 'list')
    }, {});
    expect(result.branches[0].items).toEqual([{ id: 'a1' }, { id: 'a2' }, { id: 'b1' }]);
  });
});
