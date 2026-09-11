import { describe, expect, it } from 'vitest';
import {
  compileLineageBindings,
  normalizeProcessDefinition,
  validateLineageBindingResolution,
  validateRequiredInputAvailability
} from './index.js';

const SOURCE_STATE = 'ACTIVE';

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
  return Object.fromEntries(entries.map(([nodeId, entityType]) => {
    const producerOutputId = `${nodeId}:entity`;
    return [producerOutputId, {
      id: producerOutputId,
      producerOutputId,
      nodeId,
      outputSocketId: 'entity',
      entityType,
      lifecycle: { mode: 'defaultCreated' },
      fields: { read: [], write: [], private: [] }
    }];
  }));
}

function lineageFixture() {
  return {
    dataflowVersion: 4,
    roles: { operator: { id: 'operator', label: 'Operator' } },
    producerOutputs: producerOutputRecords([['project_source', 'project'], ['create_queue', 'queue']]),
    processNodes: {
      project_source: {
        id: 'project_source',
        kind: 'effect.createEntity',
        entityType: 'project',
        producerOutputId: 'project_source:entity',
        label: 'Create project',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
        status: { to: SOURCE_STATE }
      },
      queue_lineage: {
        id: 'queue_lineage',
        kind: 'record.composeBlock',
        block: 'lineage',
        compositionMode: 'ancestors',
        entries: [{ id: 'project' }]
      },
      create_queue: {
        id: 'create_queue',
        kind: 'effect.createEntity',
        entityType: 'queue',
        producerOutputId: 'create_queue:entity',
        label: 'Create queue',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
        status: { to: SOURCE_STATE },
        blocks: ['lineage']
      }
    },
    graph: {
      nodes: ['project_source', 'queue_lineage', 'create_queue']
        .map(id => ({ id, type: 'processNode', data: { refId: id } })),
      edges: [
        {
          id: 'project-to-lineage',
          source: 'project_source',
          sourceHandle: 'data:result',
          target: 'queue_lineage',
          targetHandle: 'entry:project',
          role: 'data'
        },
        {
          id: 'lineage-to-queue',
          source: 'queue_lineage',
          sourceHandle: 'data:block',
          target: 'create_queue',
          targetHandle: 'data:lineage',
          role: 'data'
        }
      ]
    }
  };
}

describe('producer-scoped binding diagnostics', () => {
  it('reports no diagnostics for a resolvable lineage graph', () => {
    expect(validateLineageBindingResolution(lineageFixture(), domain)).toEqual([]);
  });

  it('names the edge and target when a lineage entry socket does not exist', () => {
    const definition = lineageFixture();
    definition.graph.edges[0].targetHandle = 'entry:missing';
    definition.processNodes.queue_lineage.entries = [];

    const errors = validateLineageBindingResolution(definition, domain);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-lineage targets missing lineage entry missing on queue_lineage');
  });

  it('names the edge and source when the lineage source node has no record', () => {
    const definition = lineageFixture();
    delete definition.processNodes.project_source;
    delete definition.producerOutputs['project_source:entity'];
    definition.producerOutputs = producerOutputRecords([['create_queue', 'queue']]);

    const errors = validateLineageBindingResolution(definition, domain);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-lineage cannot resolve lineage source node project_source');
  });

  it('rejects organization as a lineage ancestor with the edge and entry', () => {
    const definition = lineageFixture();
    definition.processNodes.project_source.entityType = 'organization';
    definition.producerOutputs['project_source:entity'].entityType = 'organization';

    const errors = validateLineageBindingResolution(definition, domain);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-lineage lineage entry project on queue_lineage cannot use organization as an ancestor');
  });

  it('reports an entity-emitting lineage source socket without a producer output record', () => {
    const definition = lineageFixture();
    delete definition.producerOutputs['project_source:entity'];
    definition.producerOutputs = producerOutputRecords([['create_queue', 'queue']]);

    const errors = validateLineageBindingResolution(definition, domain);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-lineage lineage source socket project_source:result');
    expect(errors[0]).toContain('emits entity type project but has no resolvable producer output record');
  });

  it('reports ambiguity when two same-type producer outputs could source one lineage edge', () => {
    const definition = lineageFixture();
    definition.producerOutputs['project_source_b:entity'] = {
      ...definition.producerOutputs['project_source:entity'],
      id: 'project_source_b:entity',
      producerOutputId: 'project_source_b:entity',
      nodeId: 'project_source'
    };

    const errors = validateLineageBindingResolution(definition, domain);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('emits entity type project but has no resolvable producer output record');
  });

  it('resolves the authored socket alias when the catalog port id differs', () => {
    const bindings = compileLineageBindings(normalizeProcessDefinition(lineageFixture(), domain), domain);
    const binding = bindings.find(item => (
      item.childEntityType === 'queue' && item.ancestorEntityType === 'project'
    ));
    expect(binding).toBeDefined();
    expect(binding.sourceProducerOutputId).toBe('project_source:entity');
  });

  it('names the producer output when a required effect input has no source', () => {
    const definition = lineageFixture();
    definition.processNodes.create_queue = {
      ...definition.processNodes.create_queue,
      trigger: { mode: 'event' },
      blocks: [],
      construction: {
        mode: 'typedQueue',
        inputs: [
          { id: 'sourceRef', path: 'sourceRef', type: 'entity', entityType: 'project', required: true, prompt: true }
        ]
      }
    };
    delete definition.processNodes.queue_lineage;
    definition.graph.nodes = definition.graph.nodes.filter(node => node.id !== 'queue_lineage');
    definition.graph.edges = [];

    const errors = validateRequiredInputAvailability(definition, domain);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('of producer output create_queue:entity');
    expect(errors[0]).toContain('Required input sourceRef');
  });
});
