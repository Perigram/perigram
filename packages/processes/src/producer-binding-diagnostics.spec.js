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

function lineageFixture() {
  return {
    dataflowVersion: 4,
    roles: { operator: { id: 'operator', label: 'Operator' } },
    producerOutputs: producerOutputRecords([['project_source', 'project'], ['create_queue', 'queue']]),
    processNodes: {
      project_source: {
        id: 'project_source',
        kind: 'cts.construct',
        typeId: 'project',
        producerOutputId: 'project_source:entity',
        label: 'Create project',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
        state: { to: SOURCE_STATE }
      },
      queue_lineage: {
        id: 'queue_lineage',
        kind: 'cts.compose',
        block: 'lineage',
        compositionMode: 'ancestors',
        entries: [{ id: 'project' }]
      },
      create_queue: {
        id: 'create_queue',
        kind: 'cts.construct',
        typeId: 'queue',
        producerOutputId: 'create_queue:entity',
        label: 'Create queue',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
        state: { to: SOURCE_STATE },
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

// The native species wiring for the same hierarchy: a typed
// `lineage.<lineageKey>` data socket on the consuming construct, fed by
// the producer's entity output — no compose-block node participates.
function nativeLineageFixture() {
  const output = (nodeId, typeId) => ({
    producerOutputId: `${nodeId}:result`,
    nodeId,
    outputSocketId: 'result',
    typeId,
    lifecycle: { mode: 'defaultCreated' },
    fields: { read: [], write: [], private: [] }
  });
  return {
    dataflowVersion: 4,
    roles: { operator: { id: 'operator', label: 'Operator' } },
    producerOutputs: {
      'project_source:result': output('project_source', 'project'),
      'create_queue:result': output('create_queue', 'queue')
    },
    processNodes: {
      project_source: {
        id: 'project_source',
        kind: 'cts.construct',
        typeId: 'project',
        producerOutputId: 'project_source:result',
        label: 'Create project',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] }
      },
      create_queue: {
        id: 'create_queue',
        kind: 'cts.construct',
        typeId: 'queue',
        producerOutputId: 'create_queue:result',
        label: 'Create queue',
        trigger: { mode: 'manual' },
        access: { level: 'write', grants: [{ roleId: 'operator', level: 'write' }] },
        construction: {
          mode: 'genericCreate',
          inputs: [{ id: 'lineage.projectId', label: 'Project', path: 'lineage.projectId', type: 'entity', typeId: 'project', required: false, prompt: true }]
        }
      }
    },
    graph: {
      nodes: ['project_source', 'create_queue']
        .map(id => ({ id, type: 'processNode', data: { refId: id } })),
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
  };
}

describe('producer-scoped binding diagnostics', () => {
  it('reports no diagnostics for a resolvable lineage graph', () => {
    expect(validateLineageBindingResolution(lineageFixture(), domain)).toEqual([]);
  });

  it('anchors lineage diagnostics on the edge, node, and entry socket', () => {
    const definition = lineageFixture();
    definition.graph.edges[0].targetHandle = 'entry:missing';
    definition.processNodes.queue_lineage.entries = [];

    const diagnostics = validateLineageBindingResolution(definition, domain);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ edgeId: 'project-to-lineage', nodeId: 'queue_lineage', socketId: 'entry:missing' });
  });

  it('names the edge and target when a lineage entry socket does not exist', () => {
    const definition = lineageFixture();
    definition.graph.edges[0].targetHandle = 'entry:missing';
    definition.processNodes.queue_lineage.entries = [];

    const errors = validateLineageBindingResolution(definition, domain).map(diagnostic => diagnostic.message);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-lineage targets missing lineage entry missing on queue_lineage');
  });

  it('names the edge and source when the lineage source node has no record', () => {
    const definition = lineageFixture();
    delete definition.processNodes.project_source;
    delete definition.producerOutputs['project_source:entity'];
    definition.producerOutputs = producerOutputRecords([['create_queue', 'queue']]);

    const errors = validateLineageBindingResolution(definition, domain).map(diagnostic => diagnostic.message);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-lineage cannot resolve lineage source node project_source');
  });

  it('rejects organization as a lineage ancestor with the edge and entry', () => {
    const definition = lineageFixture();
    definition.processNodes.project_source.typeId = 'organization';
    definition.producerOutputs['project_source:entity'].typeId = 'organization';

    const errors = validateLineageBindingResolution(definition, domain).map(diagnostic => diagnostic.message);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-lineage lineage entry project on queue_lineage cannot use organization as an ancestor');
  });

  it('accepts ambiguous same-type lineage sources as typed entity sources', () => {
    const definition = lineageFixture();
    definition.producerOutputs['project_source_b:entity'] = {
      ...definition.producerOutputs['project_source:entity'],
      id: 'project_source_b:entity',
      producerOutputId: 'project_source_b:entity',
      nodeId: 'project_source'
    };

    const errors = validateLineageBindingResolution(definition, domain).map(diagnostic => diagnostic.message);
    expect(errors).toEqual([]);
  });

  it('resolves the authored socket alias when the catalog port id differs', () => {
    const bindings = compileLineageBindings(normalizeProcessDefinition(lineageFixture(), domain), domain);
    const binding = bindings.find(item => (
      item.childTypeId === 'queue' && item.parentTypeId === 'project'
    ));
    expect(binding).toBeDefined();
    expect(binding.sourceProducerOutputId).toBe('project_source:entity');
  });

  it('compiles lineage bindings from a native producer-to-construct lineage socket', () => {
    const bindings = compileLineageBindings(nativeLineageFixture(), domain);

    expect(bindings).toEqual([{
      childTypeId: 'queue',
      parentTypeId: 'project',
      lineageKey: 'projectId',
      producerOutputId: 'create_queue:result',
      sourceProducerOutputId: 'project_source:result',
      sourceNode: 'project_source',
      sourceSocket: 'data:result',
      consumingNode: 'create_queue',
      consumingSocket: 'data:lineage.projectId'
    }]);
  });

  it('keeps separate native bindings per producer source of the same pair', () => {
    const definition = nativeLineageFixture();
    definition.processNodes.project_source_b = {
      ...definition.processNodes.project_source,
      id: 'project_source_b',
      producerOutputId: 'project_source_b:result'
    };
    definition.producerOutputs['project_source_b:result'] = {
      ...definition.producerOutputs['project_source:result'],
      producerOutputId: 'project_source_b:result',
      nodeId: 'project_source_b'
    };
    definition.graph.nodes.push({ id: 'project_source_b', type: 'processNode', data: { refId: 'project_source_b' } });
    definition.graph.edges.push({
      id: 'project-b-to-queue',
      source: 'project_source_b',
      sourceHandle: 'data:result',
      target: 'create_queue',
      targetHandle: 'data:lineage.projectId',
      role: 'data'
    });

    const bindings = compileLineageBindings(definition, domain);
    expect(bindings.map(binding => binding.sourceNode).sort()).toEqual(['project_source', 'project_source_b']);
    expect(new Set(bindings.map(binding => binding.sourceProducerOutputId))).toEqual(
      new Set(['project_source:result', 'project_source_b:result'])
    );
  });

  it('reports no diagnostics for a resolvable native lineage wiring', () => {
    expect(validateLineageBindingResolution(nativeLineageFixture(), domain)).toEqual([]);
  });

  it('names the edge and socket when a native lineage source node has no record', () => {
    const definition = nativeLineageFixture();
    delete definition.processNodes.project_source;

    const errors = validateLineageBindingResolution(definition, domain).map(diagnostic => diagnostic.message);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-queue cannot resolve lineage source node project_source for socket lineage.projectId on create_queue');
  });

  it('rejects organization as a native lineage ancestor', () => {
    const definition = nativeLineageFixture();
    definition.processNodes.project_source.typeId = 'organization';
    definition.producerOutputs['project_source:result'].typeId = 'organization';

    const errors = validateLineageBindingResolution(definition, domain).map(diagnostic => diagnostic.message);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Edge project-to-queue lineage socket lineage.projectId on create_queue cannot use organization as an ancestor');
  });

  it('accepts a native lineage source socket without a producer output record', () => {
    const definition = nativeLineageFixture();
    delete definition.producerOutputs['project_source:result'];
    definition.producerOutputs['project_source_b:result'] = {
      ...definition.producerOutputs['create_queue:result'],
      producerOutputId: 'project_source_b:result',
      nodeId: 'project_source_b',
      typeId: 'project'
    };
    definition.producerOutputs['project_source_c:result'] = {
      ...definition.producerOutputs['create_queue:result'],
      producerOutputId: 'project_source_c:result',
      nodeId: 'project_source_c',
      typeId: 'project'
    };

    const errors = validateLineageBindingResolution(definition, domain).map(diagnostic => diagnostic.message);
    expect(errors).toEqual([]);
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
          { id: 'sourceRef', path: 'sourceRef', type: 'entity', typeId: 'project', required: true, prompt: true }
        ]
      }
    };
    delete definition.processNodes.queue_lineage;
    definition.graph.nodes = definition.graph.nodes.filter(node => node.id !== 'queue_lineage');
    definition.graph.edges = [];

    const diagnostics = validateRequiredInputAvailability(definition, {
      ...domain,
      construction: {
        ...domain.construction,
        queue: {
          modes: ['typedQueue'],
          defaultMode: 'typedQueue',
          inputs: [
            { id: 'sourceRef', path: 'sourceRef', type: 'entity', typeId: 'project', required: true, prompt: true }
          ]
        }
      }
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('of producer output create_queue:entity');
    expect(diagnostics[0].message).toContain('Required input sourceRef');
    expect(diagnostics[0]).toMatchObject({ nodeId: 'create_queue', socketId: 'sourceRef', producerOutputId: 'create_queue:entity' });
  });
});
