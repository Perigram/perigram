import { describe, expect, it, vi } from 'vitest';
import {
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION
} from './graph.js';
import { evaluateProceduralGraph } from './procedural-evaluator.js';

const graph = ({
  id = 'graph.main',
  revision = 'rev-1',
  inputs = [{ id: 'number', contract: { shape: 'item', semantic: { base: 'number' } } }],
  outputs = [{ id: 'result', contract: { shape: 'item', semantic: { base: 'number' } } }],
  nodes = [
    { id: 'in', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'number' } },
    { id: 'double', operation: { provider: 'plugin.math', id: 'double', version: '1' }, config: {} },
    { id: 'out', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
  ],
  edges = [
    { id: 'e1', source: { node: 'in', port: 'value' }, target: { node: 'double', port: 'value' } },
    { id: 'e2', source: { node: 'double', port: 'result' }, target: { node: 'out', port: 'value' } }
  ]
} = {}) => ({
  format: 'perigram.graph',
  version: 1,
  id,
  revision,
  interface: { inputs, outputs },
  nodes,
  edges
});

const doubleDefinition = {
  provider: 'plugin.math',
  id: 'double',
  version: '1',
  inputs: [{ id: 'value', required: true }],
  outputs: [{ id: 'result', required: true }],
  execution: { kind: 'pure' }
};

describe('procedural graph preview evaluator', () => {
  it('evaluates a pure node between graph input and output boundaries', async () => {
    const result = await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 21 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(result.outputs).toEqual({ result: 42 });
    expect(result.nodeOutputs.double).toEqual({ result: 42 });
  });

  it('keeps independent outputs when another node fails', async () => {
    const document = graph({
      nodes: [
        { id: 'in', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'number' } },
        { id: 'double', operation: { provider: 'plugin.math', id: 'double', version: '1' }, config: {} },
        { id: 'broken', operation: { provider: 'plugin.documents', id: 'export-markdown-file', version: '1' }, config: {} },
        { id: 'out', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'e1', source: { node: 'in', port: 'value' }, target: { node: 'double', port: 'value' } },
        { id: 'e2', source: { node: 'double', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    const brokenDefinition = {
      provider: 'plugin.documents',
      id: 'export-markdown-file',
      version: '1',
      inputs: [{ id: 'document', required: true }],
      outputs: [{ id: 'value', required: true }],
      execution: { kind: 'pure' }
    };
    const result = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: 21 },
      resolveNodeDefinition: operation => (operation.id === 'double' ? doubleDefinition : brokenDefinition),
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(result.outputs).toEqual({ result: 42 });
    expect(result.nodeErrors.broken).toMatch(/missing required input document/);
    expect(result.nodeErrors.double).toBeUndefined();
  });

  it('reports a missing optional graph input on the consumer node', async () => {
    const document = graph({
      inputs: [{
        id: 'number',
        required: false,
        contract: { shape: 'item', semantic: { base: 'number' } }
      }]
    });
    const result = await evaluateProceduralGraph({
      graph: document,
      inputBindings: {},
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(result.nodeErrors.double).toMatch(/required input value received no value/);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ nodeId: 'double', phase: 'validate-inputs' }));
  });

  it('reports a null boundary value on the consumer node', async () => {
    const document = graph({
      inputs: [{
        id: 'number',
        contract: { shape: 'item', semantic: { base: 'number', nullable: true } }
      }]
    });
    const result = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: null },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(result.nodeErrors.double).toMatch(/input value does not accept null/);
  });

  it('reports null at a non-nullable graph input boundary', async () => {
    const document = graph({
      inputs: [{
        id: 'number',
        contract: { shape: 'item', semantic: { base: 'number' } }
      }]
    });
    const nullableDefinition = {
      ...doubleDefinition,
      inputs: [{ id: 'value', required: true, semantic: { base: 'number', nullable: true } }]
    };
    const result = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: null },
      resolveNodeDefinition: () => nullableDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(result.nodeErrors.in).toMatch(/input number does not accept null/);
  });

  it('validates primitive graph input values against the declared semantic base', async () => {
    const result = await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: '21' },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(result.nodeErrors.in).toMatch(/semantic base number/);
  });

  it('reports a value whose declared semantic kind differs from the port contract', async () => {
    const document = graph({
      inputs: [{
        id: 'number',
        contract: { shape: 'item', semantic: { base: 'json', kind: 'text.flow-document' } }
      }]
    });
    const rejected = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: { kind: 'text.other' } },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(rejected.nodeErrors.in).toMatch(/semantic kind .*text\.other.*text\.flow-document/);
    await expect(evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: { kind: 'text.flow-document' } },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: 1 })
    })).resolves.toMatchObject({ outputs: { result: 1 } });
  });

  it('reports an entity reference whose type differs from the declared typeId', async () => {
    const document = graph({
      inputs: [{
        id: 'number',
        contract: { shape: 'item', semantic: { base: 'entityRef', typeId: 'customer' } }
      }]
    });
    const rejected = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: { type: 'invoice', id: 'invoice-1' } },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(rejected.nodeErrors.in).toMatch(/semantic typeId .*invoice.*customer/);
    await expect(evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: { type: 'customer', id: 'customer-1' } },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: 1 })
    })).resolves.toMatchObject({ outputs: { result: 1 } });
  });

  it('enforces the runtime-checkable semantic constraint subset', async () => {
    const document = graph({
      inputs: [{
        id: 'number',
        contract: { shape: 'item', semantic: { base: 'number', constraints: { minimum: 5, maximum: 10 } } }
      }]
    });
    const rejected = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: 3 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(rejected.nodeErrors.in).toMatch(/semantic constraints .*below minimum 5/);
    await expect(evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: 6 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    })).resolves.toMatchObject({ outputs: { result: 12 } });
  });

  it('shares one execution id across every node in a graph preview', async () => {
    const document = graph({
      nodes: [
        { id: 'in', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'number' } },
        { id: 'first', operation: { provider: 'plugin.math', id: 'double', version: '1' }, config: {} },
        { id: 'second', operation: { provider: 'plugin.math', id: 'double', version: '1' }, config: {} },
        { id: 'out', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'e1', source: { node: 'in', port: 'value' }, target: { node: 'first', port: 'value' } },
        { id: 'e2', source: { node: 'first', port: 'result' }, target: { node: 'second', port: 'value' } },
        { id: 'e3', source: { node: 'second', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    const contexts = [];
    await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: 3 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs, context }) => {
        contexts.push(context);
        return { result: inputs.value * 2 };
      }
    });
    expect(contexts).toHaveLength(2);
    expect(contexts[0].executionId).toMatch(/^graph-preview-/);
    expect(contexts[1].executionId).toBe(contexts[0].executionId);
    expect(contexts[0].readSet).toBeTruthy();
  });

  it('finalizes plugin runtime sessions after graph preview evaluation', async () => {
    const finalizeExecution = vi.fn(async () => {});
    await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 3 },
      context: { finalizeExecution },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(finalizeExecution).toHaveBeenCalledTimes(1);
    expect(finalizeExecution).toHaveBeenCalledWith(expect.stringMatching(/^graph-preview-/));
  });

  it('preserves an execution id supplied by the graph host', async () => {
    let observed;
    await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 3 },
      context: { executionId: 'host-run-42' },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { context }) => {
        observed = context.executionId;
        return { result: 6 };
      }
    });
    expect(observed).toBe('host-run-42');
  });

  it('records authorized read dependencies emitted by read providers', async () => {
    const readDefinition = {
      provider: 'plugin.data',
      id: 'lookup',
      version: '1',
      inputs: [{ id: 'value', required: true }],
      outputs: [{ id: 'result', required: true }],
      execution: { kind: 'read' }
    };
    const document = graph({
      nodes: [
        { id: 'in', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'number' } },
        { id: 'lookup', operation: { provider: 'plugin.data', id: 'lookup', version: '1' }, config: {} },
        { id: 'out', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'lookup-in', source: { node: 'in', port: 'value' }, target: { node: 'lookup', port: 'value' } },
        { id: 'lookup-out', source: { node: 'lookup', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    const result = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: 1 },
      resolveNodeDefinition: () => readDefinition,
      executeNode: (_definition, { inputs, context }) => {
        context.readSet.recordInstance({
          typeId: 'part',
          instanceId: 'part-1',
          revision: 'revision-4',
          organizationId: 'org-1'
        });
        context.readSet.recordRelation({
          sourceTypeId: 'part',
          sourceId: 'part-1',
          key: 'material',
          targetTypeId: 'material',
          targetId: 'material-1'
        });
        context.readSet.recordQuery({
          typeId: 'part',
          organizationId: 'org-1',
          query: { filter: { active: true }, sort: [{ field: 'createdAt', direction: 'desc' }], limit: 10 },
          resultIds: ['part-1'],
          observedTotal: 1
        });
        return { result: inputs.value };
      }
    });
    expect(result.readSet.instances).toMatchObject([{ typeId: 'part', instanceId: 'part-1', revision: 'revision-4' }]);
    expect(result.readSet.relations).toMatchObject([{ sourceTypeId: 'part', targetId: 'material-1' }]);
    expect(result.readSet.queries).toMatchObject([{ typeId: 'part', resultIds: ['part-1'], observedTotal: 1 }]);
  });

  it('attaches read-set evidence to provider failures', async () => {
    const readDefinition = { ...doubleDefinition, execution: { kind: 'read' } };
    const result = await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 1 },
      resolveNodeDefinition: () => readDefinition,
      executeNode: (_definition, { context }) => {
        context.readSet.recordInstance({ typeId: 'part', instanceId: 'part-1' });
        throw new Error('read failed');
      }
    });
    expect(result.nodeErrors.double).toBe('read failed');
    expect(result.readSet.instances).toMatchObject([{ typeId: 'part', instanceId: 'part-1' }]);
  });


  it('refuses an already-aborted run and still finalizes it', async () => {
    const controller = new AbortController(); controller.abort('cancelled before start');
    const resolveNodeDefinition = vi.fn(); const finalizeExecution = vi.fn();
    await expect(evaluateProceduralGraph({ graph: graph(), context: { signal: controller.signal, finalizeExecution }, resolveNodeDefinition, executeNode: vi.fn() })).rejects.toMatchObject({ name: 'AbortError', code: 'GRAPH_EXECUTION_ABORTED' });
    expect(resolveNodeDefinition).not.toHaveBeenCalled(); expect(finalizeExecution).toHaveBeenCalledTimes(1);
  });

  it('interrupts a pending node executor and does not start later nodes', async () => {
    const controller = new AbortController(); let started; const entered = new Promise(resolve => { started = resolve; });
    const executeNode = vi.fn(() => { started(); return new Promise(() => {}); });
    const pending = evaluateProceduralGraph({ graph: graph(), inputBindings: { number: 2 }, context: { signal: controller.signal }, resolveNodeDefinition: () => doubleDefinition, executeNode });
    await entered; controller.abort('cancelled during execution');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError', code: 'GRAPH_EXECUTION_ABORTED' });
    expect(executeNode).toHaveBeenCalledTimes(1);
  });

  it('requires server target declarations and passes the selected target to the adapter', async () => {
    const executeNode = vi.fn((_definition, { inputs, target }) => { expect(target).toBe('server'); return { result: inputs.value * 2 }; });
    const refused = await evaluateProceduralGraph({ graph: graph(), inputBindings: { number: 2 }, executionTarget: 'server', resolveNodeDefinition: () => ({ ...doubleDefinition, execution: { kind: 'pure', targets: ['browser'] } }), executeNode });
    expect(refused.nodeErrors.double).toMatch(/does not support server execution/);
    expect(executeNode).not.toHaveBeenCalled();
    const result = await evaluateProceduralGraph({ graph: graph(), inputBindings: { number: 2 }, executionTarget: 'server', resolveNodeDefinition: () => ({ ...doubleDefinition, execution: { kind: 'pure', targets: ['server'] } }), executeNode });
    expect(result.outputs).toEqual({ result: 4 });
  });

  it('returns an empty diagnostics list on success', async () => {
    const result = await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 2 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('attaches node and phase diagnostics to provider failures', async () => {
    const result = await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 2 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => { throw new Error('provider exploded'); }
    });
    expect(result.nodeErrors.double).toBe('provider exploded');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'node-execution-failed',
      severity: 'error',
      phase: 'execute',
      graphId: 'graph.main',
      graphRevision: 'rev-1',
      nodeId: 'double',
      completedNodeIds: ['in']
    }));
  });

  it('attaches input diagnostics to the node whose input cannot be resolved', async () => {
    const document = graph({
      edges: [
        { id: 'e2', source: { node: 'double', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    const result = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: 2 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({ result: 4 })
    });
    expect(result.nodeErrors.double).toMatch(/missing required input value/);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'node-input-invalid',
      phase: 'validate-inputs',
      nodeId: 'double'
    }));
  });

  it('retains child diagnostics and adds the parent Use Graph node context', async () => {
    const child = graph({ id: 'graph.child', revision: 'rev-2' });
    const parent = graph({
      id: 'graph.parent',
      nodes: [
        { id: 'in', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'number' } },
        { id: 'use', operation: { provider: 'perigram.core', id: GRAPH_INVOKE_OPERATION, version: '1' }, config: { graphId: 'graph.child', revision: 'rev-2' } },
        { id: 'out', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'use-in', source: { node: 'in', port: 'value' }, target: { node: 'use', port: 'number' } },
        { id: 'use-out', source: { node: 'use', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    const result = await evaluateProceduralGraph({
      graph: parent,
      inputBindings: { number: 2 },
      resolveGraph: () => child,
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => { throw new Error('child failed'); }
    });
    expect(result.nodeErrors.use).toMatch(/child failed/);
    expect(result.diagnostics.slice(0, 2)).toEqual([
      expect.objectContaining({ nodeId: 'use', phase: 'execute-subgraph' }),
      expect.objectContaining({ nodeId: 'double', phase: 'execute' })
    ]);
  });

  it('fans multiple wires into list, tuple, tree, and map inputs deterministically', async () => {
    for (const shape of ['list', 'tuple', 'tree', 'map']) {
      const sourceNodes = ['a', 'b'].map(id => ({
        id,
        operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' },
        config: { interfaceId: id }
      }));
      const sourceEdges = ['a', 'b'].map(id => ({
        id: `wire-${id}`,
        source: { node: id, port: 'value' },
        target: { node: 'out', port: 'value' }
      }));
      const document = graph({
        inputs: ['a', 'b'].map(id => ({ id, contract: { shape: 'item', semantic: { base: 'number' } } })),
        outputs: [{ id: 'result', contract: { shape, semantic: { base: 'json' } } }],
        nodes: [...sourceNodes, {
          id: 'out',
          operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' },
          config: { interfaceId: 'result' }
        }],
        edges: sourceEdges
      });
      const result = await evaluateProceduralGraph({
        graph: document,
        inputBindings: { a: 10, b: 20 },
        resolveNodeDefinition: () => null,
        executeNode: () => ({})
      });
      if (shape === 'map') expect(result.outputs.result).toEqual({ 'a:value': 10, 'b:value': 20 });
      else expect(result.outputs.result).toEqual([10, 20]);
    }
  });

  it('reports multi-wire fan-in to item-shaped inputs', async () => {
    const document = graph({
      nodes: [
        { id: 'in', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'number' } },
        { id: 'double', operation: { provider: 'plugin.math', id: 'double', version: '1' }, config: {} },
        { id: 'out', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'e1', source: { node: 'in', port: 'value' }, target: { node: 'double', port: 'value' } },
        { id: 'e2', source: { node: 'in', port: 'value' }, target: { node: 'double', port: 'value' } },
        { id: 'e3', source: { node: 'double', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    const result = await evaluateProceduralGraph({
      graph: document,
      inputBindings: { number: 3 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({ result: 6 })
    });
    expect(result.nodeErrors.double).toMatch(/item input value has multiple incoming wires/);
  });

  it('does not invoke a provider for graph boundary nodes', async () => {
    const resolveNodeDefinition = vi.fn(() => doubleDefinition);
    await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 3 },
      resolveNodeDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 })
    });
    expect(resolveNodeDefinition).toHaveBeenCalledTimes(1);
    expect(resolveNodeDefinition).toHaveBeenCalledWith(
      { provider: 'plugin.math', id: 'double', version: '1' },
      expect.objectContaining({ node: expect.objectContaining({ id: 'double' }), config: {} })
    );
  });

  it('reports missing required graph inputs on the boundary node', async () => {
    const result = await evaluateProceduralGraph({
      graph: graph(),
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({ result: 0 })
    });
    expect(result.nodeErrors.in).toMatch(/Required graph input number/);
  });

  it('reports effectful nodes during preview', async () => {
    const result = await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 1 },
      resolveNodeDefinition: () => ({ ...doubleDefinition, execution: { kind: 'effect' } }),
      executeNode: vi.fn()
    });
    expect(result.nodeErrors.double).toMatch(/Preview cannot execute effect node/);
  });

  it('refuses a dependency cycle', async () => {
    const cyclic = graph({
      edges: [
        { id: 'e1', source: { node: 'in', port: 'value' }, target: { node: 'double', port: 'value' } },
        { id: 'e2', source: { node: 'double', port: 'result' }, target: { node: 'double', port: 'value' } },
        { id: 'e3', source: { node: 'double', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    await expect(evaluateProceduralGraph({
      graph: cyclic,
      inputBindings: { number: 1 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({ result: 1 })
    })).rejects.toThrow(/dependency cycle/);
  });

  it('invokes a pinned subgraph and maps its public interface', async () => {
    const parent = graph({
      nodes: [
        { id: 'in', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'number' } },
        { id: 'use', operation: { provider: 'perigram.core', id: GRAPH_INVOKE_OPERATION, version: '1' }, config: { graphId: 'graph.child', revision: 'rev-child' } },
        { id: 'out', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'e1', source: { node: 'in', port: 'value' }, target: { node: 'use', port: 'number' } },
        { id: 'e2', source: { node: 'use', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    const child = graph({ id: 'graph.child', revision: 'rev-child' });
    const result = await evaluateProceduralGraph({
      graph: parent,
      inputBindings: { number: 8 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: (_definition, { inputs }) => ({ result: inputs.value * 2 }),
      resolveGraph: (id, revision) => id === child.id && revision === child.revision ? child : null
    });
    expect(result.outputs).toEqual({ result: 16 });
  });

  it('rejects recursive pinned subgraph invocation', async () => {
    const recursive = graph({
      nodes: [
        { id: 'in', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'number' } },
        { id: 'use', operation: { provider: 'perigram.core', id: GRAPH_INVOKE_OPERATION, version: '1' }, config: { graphId: 'graph.main', revision: 'rev-1' } },
        { id: 'out', operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' }, config: { interfaceId: 'result' } }
      ],
      edges: [
        { id: 'e1', source: { node: 'in', port: 'value' }, target: { node: 'use', port: 'number' } },
        { id: 'e2', source: { node: 'use', port: 'result' }, target: { node: 'out', port: 'value' } }
      ]
    });
    await expect(evaluateProceduralGraph({
      graph: recursive,
      inputBindings: { number: 1 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({}),
      resolveGraph: () => recursive
    })).rejects.toThrow(/Recursive subgraph invocation/);
  });

  it('reports an executor result with undeclared output ports', async () => {
    const result = await evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 1 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({ result: 2, extra: 3 })
    });
    expect(result.nodeErrors.double).toMatch(/undeclared output extra/);
  });
});
