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

  it('refuses missing required graph inputs', async () => {
    await expect(evaluateProceduralGraph({
      graph: graph(),
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({ result: 0 })
    })).rejects.toThrow(/Required graph input number/);
  });

  it('refuses effectful nodes during preview', async () => {
    await expect(evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 1 },
      resolveNodeDefinition: () => ({ ...doubleDefinition, execution: { kind: 'effect' } }),
      executeNode: vi.fn()
    })).rejects.toThrow(/Preview cannot execute effect node/);
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
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({}),
      resolveGraph: () => recursive
    })).rejects.toThrow(/Recursive subgraph invocation/);
  });

  it('rejects an executor result with undeclared output ports', async () => {
    await expect(evaluateProceduralGraph({
      graph: graph(),
      inputBindings: { number: 1 },
      resolveNodeDefinition: () => doubleDefinition,
      executeNode: () => ({ result: 2, extra: 3 })
    })).rejects.toThrow(/undeclared output extra/);
  });
});
