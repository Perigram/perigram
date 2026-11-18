import { describe, expect, it } from 'vitest';
import {
  GRAPH_OUTPUT_OPERATION,
  evaluateProceduralGraph
} from '@perigram/core';
import {
  createProcessProceduralExecutor,
  createProcessProceduralNodeDefinition,
  createProcessProceduralNodeResolver,
  createProcessGraphNodeResolver,
  createProcessGraphNodeDefinition,
  registerProcessProceduralNodes,
  registerProcessGraphNodes,
  PROCESS_PROCEDURAL_PROVIDER,
  PROCESS_PROCEDURAL_VERSION
} from './procedural-provider.js';

describe('process procedural provider adapter', () => {

  it('registers only preview-safe process nodes in the shared provider registry', () => {
    const definitions = new Map();
    const registry = {
      register(definition) {
        const key = `${definition.provider}/${definition.id}@${definition.version}`;
        if (definitions.has(key)) throw new Error(`duplicate ${key}`);
        definitions.set(key, definition);
        return definition;
      },
      resolve(provider, id, version) {
        return definitions.get(`${provider}/${id}@${version}`) || null;
      }
    };
    const registered = registerProcessProceduralNodes(registry);
    expect(registered.length).toBeGreaterThan(0);
    expect(registry.resolve(PROCESS_PROCEDURAL_PROVIDER, 'collection.count', PROCESS_PROCEDURAL_VERSION)).toMatchObject({
      provider: PROCESS_PROCEDURAL_PROVIDER,
      id: 'collection.count',
      execution: { kind: 'pure' }
    });
    expect(registry.resolve(PROCESS_PROCEDURAL_PROVIDER, 'cts.read', PROCESS_PROCEDURAL_VERSION)).toBeNull();
    expect(registry.resolve(PROCESS_PROCEDURAL_PROVIDER, 'control.if', PROCESS_PROCEDURAL_VERSION)).toBeNull();
  });

  it('registers the complete process catalog for shared graph authoring', () => {
    const definitions = new Map();
    const registry = {
      register(definition) {
        const key = `${definition.provider}/${definition.id}@${definition.version}`;
        if (definitions.has(key)) throw new Error(`duplicate ${key}`);
        definitions.set(key, definition);
        return definition;
      }
    };
    const registered = registerProcessGraphNodes(registry);
    expect(registered.length).toBeGreaterThan(registerProcessProceduralNodes({ register: value => value }).length);
    expect(definitions.get(`${PROCESS_PROCEDURAL_PROVIDER}/cts.read@${PROCESS_PROCEDURAL_VERSION}`)).toMatchObject({
      id: 'cts.read',
      execution: { kind: 'read' }
    });
    expect(definitions.get(`${PROCESS_PROCEDURAL_PROVIDER}/control.if@${PROCESS_PROCEDURAL_VERSION}`)).toMatchObject({
      id: 'control.if',
      execution: { kind: 'control' }
    });
  });

  it('resolves authored control and effect nodes to provider-neutral port contracts', () => {
    const definition = createProcessGraphNodeDefinition('control.if', { id: 'branch', kind: 'control.if' });
    expect(definition).toMatchObject({
      provider: PROCESS_PROCEDURAL_PROVIDER,
      id: 'control.if',
      execution: { kind: 'control' }
    });
    expect(definition.inputs.length + definition.outputs.length).toBeGreaterThan(0);
    expect(definition.inputs[0].semantic).toHaveProperty('role');
    expect(createProcessGraphNodeDefinition('cts.mutate', {
      id: 'mutation', kind: 'cts.mutate', typeId: 'type-a'
    }).execution.kind).toBe('proposal');
  });

  it('exposes pure process catalog nodes as provider-qualified contracts', () => {
    const definition = createProcessProceduralNodeDefinition('collection.count');
    expect(definition).toMatchObject({
      provider: PROCESS_PROCEDURAL_PROVIDER,
      id: 'collection.count',
      version: PROCESS_PROCEDURAL_VERSION,
      execution: { kind: 'pure' },
      inputs: [{ id: 'value', shape: 'list', semantic: { base: 'json' }, required: true }],
      outputs: [{ id: 'value', semantic: { base: 'integer' } }]
    });
  });

  it('does not expose control, effect, or CTS operations as pure procedural nodes', () => {
    expect(createProcessProceduralNodeDefinition('control.if')).toBeNull();
    expect(createProcessProceduralNodeDefinition('cts.mutate')).toBeNull();
    expect(createProcessProceduralNodeDefinition('cts.read')).toBeNull();
  });

  it('keeps durable control contracts out of the procedural execution resolver', () => {
    const operation = {
      provider: PROCESS_PROCEDURAL_PROVIDER,
      id: 'control.if',
      version: PROCESS_PROCEDURAL_VERSION
    };
    const invocation = { node: { id: 'branch' }, config: { kind: 'control.if' } };
    expect(createProcessGraphNodeResolver()(operation, invocation)).toMatchObject({
      id: 'control.if',
      execution: { kind: 'control' }
    });
    expect(createProcessProceduralNodeResolver()(operation, invocation)).toBeNull();
    expect(createProcessProceduralNodeResolver()({
      provider: PROCESS_PROCEDURAL_PROVIDER,
      id: 'cts.field',
      version: PROCESS_PROCEDURAL_VERSION
    }, { node: { id: 'field' }, config: { kind: 'cts.field' } })).toBeNull();
  });

  it('executes a process list operation through the canonical graph evaluator', async () => {
    const graph = {
      format: 'perigram.graph',
      version: 1,
      id: 'graph.process-adapter',
      revision: 'rev-1',
      interface: {
        inputs: [],
        outputs: [{ id: 'count', label: 'Count', contract: { shape: 'item', semantic: { base: 'integer' } } }]
      },
      nodes: [
        {
          id: 'source',
          operation: { provider: PROCESS_PROCEDURAL_PROVIDER, id: 'source.literalList', version: PROCESS_PROCEDURAL_VERSION },
          config: { value: [2, 3, 5], access: 'list' }
        },
        {
          id: 'count',
          operation: { provider: PROCESS_PROCEDURAL_PROVIDER, id: 'collection.count', version: PROCESS_PROCEDURAL_VERSION },
          config: {}
        },
        {
          id: 'output',
          operation: { provider: 'perigram.core', id: GRAPH_OUTPUT_OPERATION, version: '1' },
          config: { interfaceId: 'count' }
        }
      ],
      edges: [
        { id: 'source-count', source: { node: 'source', port: 'value' }, target: { node: 'count', port: 'value' } },
        { id: 'count-output', source: { node: 'count', port: 'value' }, target: { node: 'output', port: 'value' } }
      ]
    };
    const executeNode = createProcessProceduralExecutor();
    const resolveNodeDefinition = createProcessProceduralNodeResolver();
    const result = await evaluateProceduralGraph({
      graph,
      resolveNodeDefinition,
      executeNode
    });
    expect(result.outputs.count).toBe(3);
  });
});
