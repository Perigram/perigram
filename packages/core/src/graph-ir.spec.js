import { describe, expect, it, vi } from 'vitest';
import {
  lowerGraphToTypedIR,
  validateTypedIR,
  TYPED_IR_FORMAT,
  TYPED_IR_VERSION
} from './graph-ir.js';
import { GRAPH_DOCUMENT_FORMAT } from './graph.js';

function graphDocument() {
  return {
    format: 'perigram.graph',
    version: 1,
    id: 'test-graph',
    revision: 'rev-1',
    name: 'Test',
    interface: {
      inputs: [{ id: 'source-text', label: 'Text', contract: { shape: 'item', semantic: { base: 'string' } }, required: true }],
      outputs: [{ id: 'result', label: 'Result', contract: { shape: 'item', semantic: { base: 'number' } }, required: true }]
    },
    nodes: [
      { id: 'in', operation: { provider: 'perigram.core', id: 'perigram.core.graph-input', version: '1' }, config: { interfaceId: 'source-text' } },
      { id: 'count', operation: { provider: 'test.provider', id: 'count-chars', version: '2' }, config: {} },
      { id: 'out', operation: { provider: 'perigram.core', id: 'perigram.core.graph-output', version: '1' }, config: { interfaceId: 'result' } }
    ],
    edges: [
      { id: 'e1', source: { node: 'in', port: 'value' }, target: { node: 'count', port: 'text' } },
      { id: 'e2', source: { node: 'count', port: 'length' }, target: { node: 'out', port: 'value' } }
    ]
  };
}

function countDefinition() {
  return {
    provider: 'test.provider',
    id: 'count-chars',
    version: '2',
    label: 'Count characters',
    inputs: [{ id: 'text', shape: 'item', semantic: { base: 'string' }, required: true }],
    outputs: [{ id: 'length', shape: 'item', semantic: { base: 'number' }, required: true }],
    execution: {
      kind: 'pure',
      targets: ['browser', 'server'],
      capabilities: ['test.read'],
      deterministic: true,
      idempotent: true
    },
    packagePin: { pluginId: 'test-plugin', version: '3', runtimeId: 'js', operationId: 'count-chars' }
  };
}

function interfacePort(id, base) {
  return { id, label: id, contract: { shape: 'item', semantic: { base } }, required: true };
}

function invokeNode(id, graphId, revision) {
  return {
    id,
    operation: { provider: 'perigram.core', id: 'perigram.core.use-graph', version: '1' },
    config: { graphId, revision }
  };
}

function childDocument({ id = 'child-graph', revision = 'child-rev-1' } = {}) {
  return {
    format: 'perigram.graph',
    version: 1,
    id,
    revision,
    name: 'Child',
    interface: {
      inputs: [interfacePort('text', 'string')],
      outputs: [interfacePort('count', 'number')]
    },
    nodes: [
      { id: 'child-in', operation: { provider: 'perigram.core', id: 'perigram.core.graph-input', version: '1' }, config: { interfaceId: 'text' } },
      { id: 'child-count', operation: { provider: 'test.provider', id: 'count-chars', version: '2' }, config: {} },
      { id: 'child-out', operation: { provider: 'perigram.core', id: 'perigram.core.graph-output', version: '1' }, config: { interfaceId: 'count' } }
    ],
    edges: [
      { id: 'c-e1', source: { node: 'child-in', port: 'value' }, target: { node: 'child-count', port: 'text' } },
      { id: 'c-e2', source: { node: 'child-count', port: 'length' }, target: { node: 'child-out', port: 'value' } }
    ]
  };
}

function chainDocument(id, child) {
  const nodes = [
    { id: `${id}-in`, operation: { provider: 'perigram.core', id: 'perigram.core.graph-input', version: '1' }, config: { interfaceId: 'text' } },
    { id: `${id}-out`, operation: { provider: 'perigram.core', id: 'perigram.core.graph-output', version: '1' }, config: { interfaceId: 'text' } }
  ];
  const edges = [];
  if (child) {
    nodes.splice(1, 0, invokeNode(`${id}-invoke`, child.id, child.revision));
    edges.push({ id: `${id}-e1`, source: { node: `${id}-in`, port: 'value' }, target: { node: `${id}-invoke`, port: 'text' } });
    edges.push({ id: `${id}-e2`, source: { node: `${id}-invoke`, port: 'text' }, target: { node: `${id}-out`, port: 'value' } });
  } else {
    edges.push({ id: `${id}-e1`, source: { node: `${id}-in`, port: 'value' }, target: { node: `${id}-out`, port: 'value' } });
  }
  return {
    format: 'perigram.graph',
    version: 1,
    id,
    revision: `${id}-rev-1`,
    name: id,
    interface: { inputs: [interfacePort('text', 'string')], outputs: [interfacePort('text', 'string')] },
    nodes,
    edges
  };
}

function lower(overrides = {}) {
  return lowerGraphToTypedIR({
    graph: graphDocument(),
    resolveNodeDefinition: () => countDefinition(),
    ...overrides
  });
}

describe('lowerGraphToTypedIR', () => {
  it('lowers a validated graph with pins, slots, and boundary mappings', async () => {
    const { ir, diagnostics } = await lower();
    expect(diagnostics).toEqual([]);
    expect(ir.format).toBe(TYPED_IR_FORMAT);
    expect(ir.version).toBe(TYPED_IR_VERSION);
    expect(ir.source).toEqual({ format: GRAPH_DOCUMENT_FORMAT, version: 1, id: 'test-graph', revision: 'rev-1' });
    expect(ir.executionTarget).toBe('browser');

    const boundary = ir.operations.find(op => op.nodeId === 'in');
    expect(boundary.boundary).toEqual({ direction: 'input', interfaceId: 'source-text' });
    expect(boundary.slots.outputs[0]).toMatchObject({ port: 'value', shape: 'item', semantic: { base: 'string' } });

    const operation = ir.operations.find(op => op.nodeId === 'count');
    expect(operation.operation).toEqual({ provider: 'test.provider', id: 'count-chars', version: '2' });
    expect(operation.pin).toEqual(countDefinition().packagePin);
    expect(operation.execution).toEqual({
      kind: 'pure', targets: ['browser', 'server'], capabilities: ['test.read'], deterministic: true, idempotent: true
    });
    expect(operation.slots.inputs[0]).toMatchObject({ port: 'text', semantic: { base: 'string' }, required: true });

    expect(ir.dependencies).toHaveLength(2);
    expect(ir.dependencies[0]).toMatchObject({ edgeId: 'e1', kind: 'data', decision: { status: 'exact', compatible: true } });
    expect(ir.capabilities).toEqual(['test.read']);
    expect(ir.executionKinds).toEqual(['pure']);
    expect(ir.interface.inputs[0]).toMatchObject({ port: 'source-text', shape: 'item', semantic: { base: 'string' }, required: true });
  });

  it('constructs deterministically from the same pinned inputs', async () => {
    const first = await lower();
    const second = await lower();
    expect(JSON.parse(JSON.stringify(second.ir))).toEqual(JSON.parse(JSON.stringify(first.ir)));
  });

  it('returns null IR with validation diagnostics for an invalid document', async () => {
    const graph = graphDocument();
    graph.edges.push({ id: 'broken', source: { node: 'ghost', port: 'value' }, target: { node: 'out', port: 'value' } });
    const { ir, diagnostics } = await lower({ graph });
    expect(ir).toBeNull();
    expect(diagnostics.every(item => item.phase === 'validation' && item.severity === 'error')).toBe(true);
    expect(diagnostics.some(item => item.message.includes('ghost'))).toBe(true);
  });

  it('reports unresolved operations as diagnostics', async () => {
    const { ir, diagnostics } = await lower({ resolveNodeDefinition: () => null });
    expect(diagnostics.some(item => item.phase === 'lowering' && item.nodeId === 'count')).toBe(true);
    expect(ir.operations.find(op => op.nodeId === 'count').unresolved).toBe(true);
  });

  it('records incompatible edge decisions with source mapping', async () => {
    const definition = countDefinition();
    definition.inputs = [{ id: 'text', shape: 'list', semantic: { base: 'string' }, required: true }];
    const { ir, diagnostics } = await lower({ resolveNodeDefinition: () => definition });
    const edge = ir.dependencies.find(dep => dep.edgeId === 'e1');
    expect(edge.decision).toMatchObject({ status: 'incompatible', compatible: false });
    expect(edge.decision.reason).toContain('list');
    const diagnostic = diagnostics.find(item => item.edgeId === 'e1');
    expect(diagnostic).toMatchObject({ nodeId: 'in', portId: 'value', severity: 'error' });
  });

  it('uses the host compatibility callback when provided', async () => {
    const definition = countDefinition();
    definition.inputs = [{ id: 'text', shape: 'list', semantic: { base: 'string', unit: 'mm' }, required: true }];
    const { ir } = await lower({
      resolveNodeDefinition: () => definition,
      resolveCompatibility: () => ({
        status: 'conversion-required',
        compatible: false,
        reason: 'unit mismatch',
        conversions: [{ id: 'mm-to-m', fidelity: 'lossless', deterministic: true }]
      })
    });
    expect(ir.dependencies[0].decision).toMatchObject({
      status: 'conversion-required',
      reason: 'unit mismatch',
      conversions: [{ id: 'mm-to-m', fidelity: 'lossless', deterministic: true }]
    });
  });

  it('records pinned subgraph invocations with their interface', async () => {
    const graph = graphDocument();
    graph.nodes.push(invokeNode('invoke', 'child-graph', 'child-rev-3'));
    const { ir, diagnostics } = await lower({
      graph,
      resolveGraph: () => childDocument({ revision: 'child-rev-3' })
    });
    expect(diagnostics).toEqual([]);
    const invocation = ir.operations.find(op => op.nodeId === 'invoke');
    expect(invocation.invocation).toMatchObject({ graphId: 'child-graph', revision: 'child-rev-3' });
    expect(invocation.invocation.interface.inputs[0]).toMatchObject({ port: 'text', shape: 'item' });
    expect(invocation.invocation.lowering).toEqual({ diagnostics: 0 });
  });

  it('reports use graph nodes when no resolver is provided', async () => {
    const graph = graphDocument();
    graph.nodes.push(invokeNode('invoke', 'child-graph', 'child-rev-3'));
    const { diagnostics } = await lower({ graph });
    expect(diagnostics.some(item => item.nodeId === 'invoke' && item.message.includes('resolveGraph'))).toBe(true);
  });

  it('reports nodes that do not support the requested target', async () => {
    const definition = countDefinition();
    definition.execution.targets = ['server'];
    const { diagnostics } = await lower({ resolveNodeDefinition: () => definition });
    expect(diagnostics.some(item => item.nodeId === 'count' && item.message.includes('browser'))).toBe(true);
  });

  it('produces a frozen, JSON-pure IR', async () => {
    const { ir } = await lower();
    expect(Object.isFrozen(ir)).toBe(true);
    expect(() => JSON.parse(JSON.stringify(ir))).not.toThrow();
    expect(() => { ir.executionTarget = 'server'; }).toThrow();
  });
});

describe('lowerGraphToTypedIR recursive subgraph preflight', () => {
  it('surfaces unresolved operations nested at depth 2 as error diagnostics', async () => {
    const graph = graphDocument();
    graph.nodes.push(invokeNode('invoke', 'child-graph', 'child-rev-1'));
    const { ir, diagnostics } = await lower({
      graph,
      resolveGraph: () => childDocument(),
      resolveNodeDefinition: async (operation, context) => (context.node.id === 'count' ? countDefinition() : null)
    });
    const errors = diagnostics.filter(item => item.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    const nested = errors.find(item => item.nodeId === 'child-count');
    expect(nested.invocationPath).toEqual(['test-graph@rev-1', 'child-graph@child-rev-1']);
    expect(nested.message).toContain('test-graph@rev-1 → child-graph@child-rev-1:');
    const invocation = ir.operations.find(op => op.nodeId === 'invoke');
    expect(invocation.invocation.lowering).toEqual({ diagnostics: 3 });
  });

  it('maps not-found and forbidden nested graph resolution to the invoking node without leaking details', async () => {
    for (const statusCode of [403, 404]) {
      const graph = graphDocument();
      graph.nodes.push(invokeNode('invoke', 'private-graph', 'private-rev'));
      const { diagnostics } = await lower({
        graph,
        resolveGraph: async () => {
          const error = new Error('private graph internals');
          error.statusCode = statusCode;
          throw error;
        }
      });
      const failure = diagnostics.find(item => item.nodeId === 'invoke');
      expect(failure).toMatchObject({ severity: 'error', phase: 'lowering', nodeId: 'invoke' });
      expect(failure.message).toContain('unavailable or inaccessible');
      expect(failure.message).not.toContain('private graph internals');
    }
  });

  it('maps unexpected nested graph resolver failures to the invoking node', async () => {
    const graph = graphDocument();
    graph.nodes.push(invokeNode('invoke', 'child-graph', 'child-rev-1'));
    const { diagnostics } = await lower({
      graph,
      resolveGraph: async () => { throw new Error('resolver database unavailable'); }
    });
    expect(diagnostics.find(item => item.nodeId === 'invoke')).toMatchObject({
      severity: 'error',
      phase: 'lowering',
      message: expect.stringContaining('resolver database unavailable')
    });
  });

  it('surfaces incompatible edges nested inside a pinned subgraph', async () => {
    const definition = countDefinition();
    definition.inputs = [{ id: 'text', shape: 'list', semantic: { base: 'string' }, required: true }];
    const graph = graphDocument();
    graph.nodes.push(invokeNode('invoke', 'child-graph', 'child-rev-1'));
    const { diagnostics } = await lower({
      graph,
      resolveGraph: () => childDocument(),
      resolveNodeDefinition: async (operation, context) => (context.node.id === 'count' ? countDefinition() : definition)
    });
    const nested = diagnostics.find(item => item.edgeId === 'c-e1');
    expect(nested).toMatchObject({ nodeId: 'child-in', portId: 'value', severity: 'error' });
    expect(nested.message).toContain('Transport shapes item and list differ');
    expect(nested.invocationPath).toEqual(['test-graph@rev-1', 'child-graph@child-rev-1']);
  });

  it('surfaces nested nodes that miss the execution target', async () => {
    const definition = countDefinition();
    definition.execution.targets = ['browser'];
    const graph = graphDocument();
    graph.nodes.push(invokeNode('invoke', 'child-graph', 'child-rev-1'));
    const { diagnostics } = await lower({
      graph,
      resolveGraph: () => childDocument(),
      resolveNodeDefinition: () => definition,
      executionTarget: 'server'
    });
    const nested = diagnostics.find(item => item.nodeId === 'child-count' && item.message.includes('server'));
    expect(nested.severity).toBe('error');
    expect(nested.invocationPath).toEqual(['test-graph@rev-1', 'child-graph@child-rev-1']);
  });

  it('lowers a shared pinned dependency once', async () => {
    const graph = graphDocument();
    graph.nodes.push(invokeNode('invoke-a', 'child-graph', 'child-rev-1'));
    graph.nodes.push(invokeNode('invoke-b', 'child-graph', 'child-rev-1'));
    const resolveNodeDefinition = vi.fn(() => countDefinition());
    const { ir, diagnostics } = await lower({ graph, resolveGraph: () => childDocument(), resolveNodeDefinition });
    expect(diagnostics).toEqual([]);
    const childResolutions = resolveNodeDefinition.mock.calls.filter(([, context]) => context.node.id === 'child-count');
    expect(childResolutions).toHaveLength(1);
    for (const nodeId of ['invoke-a', 'invoke-b']) {
      expect(ir.operations.find(op => op.nodeId === nodeId).invocation.lowering).toEqual({ diagnostics: 0 });
    }
    expect(validateTypedIR(ir)).toEqual([]);
  });

  it('reports invocation cycles with the full path and offending node', async () => {
    const a = chainDocument('a', { id: 'b', revision: 'b-rev-1' });
    const b = chainDocument('b', { id: 'a', revision: 'a-rev-1' });
    const { ir, diagnostics } = await lower({
      graph: a,
      resolveGraph: async graphId => (graphId === 'a' ? a : b)
    });
    const cycle = diagnostics.find(item => item.message.includes('Recursive subgraph invocation detected'));
    expect(cycle).toMatchObject({ severity: 'error', nodeId: 'b-invoke' });
    expect(cycle.invocationPath).toEqual(['a@a-rev-1', 'b@b-rev-1', 'a@a-rev-1']);
    expect(cycle.message).toContain('a@a-rev-1 → b@b-rev-1 → a@a-rev-1');
    expect(ir.operations.find(op => op.nodeId === 'a-invoke').invocation.lowering).toEqual({ diagnostics: 1 });
  });

  it('reports nesting beyond the maximum depth', async () => {
    const documents = {
      a: chainDocument('a', { id: 'c1', revision: 'c1-rev-1' }),
      c1: chainDocument('c1', { id: 'c2', revision: 'c2-rev-1' }),
      c2: chainDocument('c2', { id: 'c3', revision: 'c3-rev-1' }),
      c3: chainDocument('c3')
    };
    const resolveGraph = vi.fn(async graphId => documents[graphId]);
    const { diagnostics } = await lower({ graph: documents.a, resolveGraph, maxGraphDepth: 2 });
    const depth = diagnostics.find(item => item.message.includes('exceeds maximum depth'));
    expect(depth).toMatchObject({ severity: 'error', nodeId: 'c1-invoke' });
    expect(depth.message).toContain('Subgraph nesting exceeds maximum depth 2');
    expect(depth.invocationPath).toEqual(['a@a-rev-1', 'c1@c1-rev-1', 'c2@c2-rev-1']);
    expect(resolveGraph.mock.calls.filter(([graphId]) => graphId === 'c3')).toHaveLength(0);
  });
});

describe('validateTypedIR', () => {
  async function cleanIr() {
    const { ir } = await lower();
    return JSON.parse(JSON.stringify(ir));
  }

  async function mutated(mutate) {
    const ir = await cleanIr();
    mutate(ir);
    return validateTypedIR(ir);
  }

  it('accepts a lowered IR', async () => {
    const { ir } = await lower();
    expect(validateTypedIR(ir)).toEqual([]);
  });

  it('rejects foreign formats and versions', async () => {
    const { ir } = await lower();
    expect(validateTypedIR({ ...ir, format: 'other' })[0].code).toBe('unsupported-format');
    expect(validateTypedIR({ ...ir, version: 99 })[0].code).toBe('unsupported-version');
    expect(validateTypedIR(null)[0].code).toBe('invalid-ir');
  });

  it('rejects malformed slot contracts', async () => {
    expect(await mutated(ir => { ir.operations[1].slots.inputs[0].shape = 'blob'; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-port-shape', path: 'operations[1].slots.inputs[0].shape' }));
    expect(await mutated(ir => { ir.operations[1].slots.inputs.push({ ...ir.operations[1].slots.inputs[0] }); }))
      .toContainEqual(expect.objectContaining({ code: 'duplicate-slot-port', path: 'operations[1].slots.inputs[1].port' }));
    expect(await mutated(ir => { ir.operations[1].slots.inputs[0].semantic = 5; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-port-semantic', path: 'operations[1].slots.inputs[0].semantic' }));
  });

  it('rejects dangling dependency endpoints', async () => {
    expect(await mutated(ir => { ir.dependencies[0].source.node = 'ghost'; }))
      .toContainEqual(expect.objectContaining({ code: 'unknown-endpoint-operation', path: 'dependencies[0].source.node' }));
    expect(await mutated(ir => { ir.dependencies[0].target.port = 'nope'; }))
      .toContainEqual(expect.objectContaining({ code: 'unknown-endpoint-port', path: 'dependencies[0].target.port' }));
    expect(await mutated(ir => { ir.dependencies.push(JSON.parse(JSON.stringify(ir.dependencies[0]))); }))
      .toContainEqual(expect.objectContaining({ code: 'duplicate-edge-id', path: 'dependencies[2].edgeId' }));
  });

  it('rejects boundary mappings that miss the declared interface', async () => {
    expect(await mutated(ir => { ir.operations[0].boundary.interfaceId = 'missing'; }))
      .toContainEqual(expect.objectContaining({ code: 'unknown-boundary-port', path: 'operations[0].boundary.interfaceId' }));
    expect(await mutated(ir => { ir.operations[0].boundary.direction = 'output'; }))
      .toContainEqual(expect.objectContaining({ code: 'unknown-boundary-port' }));
    expect(await mutated(ir => { ir.interface.inputs.push({ port: 'extra', shape: null, semantic: null, required: true }); }))
      .toContainEqual(expect.objectContaining({ code: 'missing-boundary-operation', path: 'interface.inputs' }));
    expect(await mutated(ir => { ir.interface.outputs.push(JSON.parse(JSON.stringify(ir.interface.inputs[0]))); }))
      .toContainEqual(expect.objectContaining({ code: 'duplicate-interface-port' }));
  });

  it('rejects broken execution declarations and aggregates', async () => {
    expect(await mutated(ir => { ir.operations[1].execution.kind = 'magic'; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-execution-kind', path: 'operations[1].execution.kind' }));
    expect(await mutated(ir => { ir.operations[1].execution.capabilities = 'read'; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-execution-capabilities', path: 'operations[1].execution.capabilities' }));
    expect(await mutated(ir => { ir.operations[1].execution.deterministic = 'yes'; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-execution-flag', path: 'operations[1].execution.deterministic' }));
    expect(await mutated(ir => { ir.capabilities = ['z', 'a']; }))
      .toContainEqual(expect.objectContaining({ code: 'unsorted-capabilities', path: 'capabilities' }));
    expect(await mutated(ir => { ir.capabilities = [1]; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-capabilities', path: 'capabilities' }));
    expect(await mutated(ir => { ir.executionKinds = ['pure', 'pure']; }))
      .toContainEqual(expect.objectContaining({ code: 'unsorted-execution-kinds', path: 'executionKinds' }));
  });

  it('rejects inconsistent compatibility decisions', async () => {
    expect(await mutated(ir => { ir.dependencies[0].decision.compatible = false; }))
      .toContainEqual(expect.objectContaining({ code: 'inconsistent-decision', path: 'dependencies[0].decision.compatible' }));
    expect(await mutated(ir => { ir.dependencies[0].decision.status = 'maybe'; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-decision-status', path: 'dependencies[0].decision.status' }));
    expect(await mutated(ir => { ir.dependencies[0].decision.reason = 5; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-decision-reason', path: 'dependencies[0].decision.reason' }));
    expect(await mutated(ir => { ir.dependencies[0].decision.conversions = null; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-decision-conversions', path: 'dependencies[0].decision.conversions' }));
  });

  it('rejects duplicate node ids and missing operation identities', async () => {
    expect(await mutated(ir => { ir.operations.push(JSON.parse(JSON.stringify(ir.operations[1]))); }))
      .toContainEqual(expect.objectContaining({ code: 'duplicate-node-id', path: 'operations[3].nodeId' }));
    expect(await mutated(ir => { delete ir.operations[1].operation.provider; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-operation', path: 'operations[1].operation' }));
  });

  it('rejects invocation entries without pins and with duplicate interface ports', async () => {
    const graph = graphDocument();
    graph.nodes.push(invokeNode('invoke', 'child-graph', 'child-rev-1'));
    const { ir } = await lower({ graph, resolveGraph: () => childDocument() });
    const serialized = JSON.parse(JSON.stringify(ir));
    serialized.operations.find(op => op.nodeId === 'invoke').invocation.graphId = '';
    expect(validateTypedIR(serialized))
      .toContainEqual(expect.objectContaining({ code: 'invalid-invocation', path: 'operations[3].invocation' }));
    const duplicated = JSON.parse(JSON.stringify(ir));
    const invocation = duplicated.operations.find(op => op.nodeId === 'invoke').invocation;
    invocation.interface.inputs.push({ ...invocation.interface.inputs[0] });
    expect(validateTypedIR(duplicated))
      .toContainEqual(expect.objectContaining({ code: 'duplicate-slot-port', path: 'operations[3].invocation.interface.inputs[1].port' }));
  });

  it('rejects diagnostics entries without the reporting fields', async () => {
    expect(await mutated(ir => { ir.diagnostics = [{ code: 'x' }]; }))
      .toContainEqual(expect.objectContaining({ code: 'invalid-diagnostic', path: 'diagnostics[0]' }));
  });
});
