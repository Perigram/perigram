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
  processNodeConfigurationSchema,
  registerProcessProceduralNodes,
  registerProcessGraphNodes,
  PROCESS_PROCEDURAL_PROVIDER,
  PROCESS_PROCEDURAL_VERSION
} from './procedural-provider.js';
import { PROCESS_NODE_CATALOG } from './node-catalog.js';

describe('process procedural provider adapter', () => {

  it('declares authored configuration so the graph inspector renders node settings', () => {
    const literal = createProcessGraphNodeDefinition('source.literalItem');
    expect(literal.configuration.properties.value.semantic).toMatchObject({
      kind: 'perigram.typed-value',
      typeField: 'type',
      typeIdField: 'typeId'
    });
    expect(literal.configuration.properties.value.semantic.bases).toContain('entityRef');
    expect(literal.configuration.default).toMatchObject({
      kind: 'source.literalItem',
      type: { base: 'string', nullable: false },
      value: ''
    });
    expect(processNodeConfigurationSchema('value.format').properties).toMatchObject({
      sourceType: { semantic: { kind: 'perigram.value-base' } },
      outputType: { semantic: { kind: 'perigram.value-base' } }
    });

    const math = createProcessGraphNodeDefinition('value.math');
    expect(math.configuration.properties.operation.enum).toContain('add');
    expect(math.configuration.default).toMatchObject({ kind: 'value.math', operation: math.configuration.properties.operation.default });
    expect(math.configuration.default.operation).toBeTruthy();

    const sort = createProcessGraphNodeDefinition('collection.sort');
    expect(sort.configuration.properties.direction.enum).toEqual(['asc', 'desc']);
    expect(sort.configuration.properties.operation).toBeUndefined();

    expect(processNodeConfigurationSchema('value.convertUnit').properties).toMatchObject({
      fromUnit: { type: 'string' },
      toUnit: { type: 'string' }
    });
  });

  it('declares inspector settings for every cataloged process operation', () => {
    const kinds = PROCESS_NODE_CATALOG.map(catalog => catalog.kind);
    expect(kinds.length).toBeGreaterThan(60);
    for (const kind of kinds) {
      const definition = createProcessGraphNodeDefinition(kind);
      expect(definition.configuration.default).toMatchObject({ kind });
      expect(definition.configuration.properties).toBeTypeOf('object');
    }
    expect(createProcessGraphNodeDefinition('collection.join').configuration.properties).toMatchObject({
      leftKey: { type: 'string' }, rightKey: { type: 'string' }, matching: { type: 'string' },
      joinMode: { type: 'string', enum: ['inner', 'left'] }
    });
    expect(createProcessGraphNodeDefinition('collection.shift').configuration.properties.offset).toBeUndefined();
    expect(processNodeConfigurationSchema('collection.shift').properties.matching.enum).toEqual(['longest', 'shortest', 'cross']);
    expect(createProcessGraphNodeDefinition('cts.read').configuration.properties.select.enum).toContain('related');
    expect(createProcessGraphNodeDefinition('cts.transition').configuration.properties.guard).toMatchObject({ type: 'object' });
    expect(createProcessGraphNodeDefinition('record.construct').configuration.properties.fields.semantic.kind)
      .toBe('perigram.field-list');
    expect(createProcessGraphNodeDefinition('cts.construct').configuration.properties.typeId.semantic.kind)
      .toBe('perigram.entity-type');
    expect(createProcessGraphNodeDefinition('cts.construct').configuration.properties.trigger).toBeUndefined();
    expect(createProcessGraphNodeDefinition('cts.mutate').configuration.properties.trigger).toMatchObject({ type: 'object' });
  });

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
    expect(definitions.get(`${PROCESS_PROCEDURAL_PROVIDER}/collection.count@${PROCESS_PROCEDURAL_VERSION}`).inputs[0].compatibility)
      .toEqual({ profile: 'perigram.cts' });
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
