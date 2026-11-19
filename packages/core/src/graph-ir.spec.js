import { describe, expect, it } from 'vitest';
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
    graph.nodes.push({
      id: 'invoke',
      operation: { provider: 'perigram.core', id: 'perigram.core.use-graph', version: '1' },
      config: { graphId: 'child-graph', revision: 'child-rev-3' }
    });
    const { ir, diagnostics } = await lower({
      graph,
      resolveGraph: () => ({
        format: 'perigram.graph',
        version: 1,
        id: 'child-graph',
        revision: 'child-rev-3',
        name: 'Child',
        interface: {
          inputs: [{ id: 'text', contract: { shape: 'item', semantic: { base: 'string' } }, required: true }],
          outputs: [{ id: 'count', contract: { shape: 'item', semantic: { base: 'number' } }, required: true }]
        },
        nodes: [
          { id: 'child-in', operation: { provider: 'perigram.core', id: 'perigram.core.graph-input', version: '1' }, config: { interfaceId: 'text' } },
          { id: 'child-out', operation: { provider: 'perigram.core', id: 'perigram.core.graph-output', version: '1' }, config: { interfaceId: 'count' } }
        ],
        edges: [
          { id: 'child-e1', source: { node: 'child-in', port: 'value' }, target: { node: 'child-out', port: 'value' } }
        ]
      })
    });
    expect(diagnostics).toEqual([]);
    const invocation = ir.operations.find(op => op.nodeId === 'invoke');
    expect(invocation.invocation).toMatchObject({ graphId: 'child-graph', revision: 'child-rev-3' });
    expect(invocation.invocation.interface.inputs[0]).toMatchObject({ port: 'text', shape: 'item' });
  });

  it('reports use graph nodes when no resolver is provided', async () => {
    const graph = graphDocument();
    graph.nodes.push({
      id: 'invoke',
      operation: { provider: 'perigram.core', id: 'perigram.core.use-graph', version: '1' },
      config: { graphId: 'child-graph', revision: 'child-rev-3' }
    });
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

describe('validateTypedIR', () => {
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
});
