import { describe, expect, it } from 'vitest';
import {
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_INVOKE_OPERATION,
  assertValidGraphDocument,
  normalizeGraphDocument,
  validateGraphDocument
} from './graph.js';

const validGraph = () => ({
  format: GRAPH_DOCUMENT_FORMAT,
  version: GRAPH_DOCUMENT_VERSION,
  id: 'graph.document',
  revision: 'rev-01',
  name: 'Document graph',
  interface: {
    inputs: [{ id: 'source', label: 'Source', contract: { shape: 'item', semantic: { base: 'entityRef' } } }],
    outputs: [{ id: 'document', label: 'Document', contract: { shape: 'item', semantic: { base: 'document' } } }]
  },
  nodes: [
    { id: 'input-1', operation: { provider: 'perigram.core', id: GRAPH_INPUT_OPERATION, version: '1' }, config: { interfaceId: 'source' } },
    { id: 'format-1', operation: { provider: 'plugin.documents', id: 'document.compose', version: '3' }, config: { template: 'brief' }, position: { x: 20, y: 40 } }
  ],
  edges: [{ id: 'edge-1', source: { node: 'input-1', port: 'value' }, target: { node: 'format-1', port: 'source' } }]
});

describe('canonical graph document', () => {
  it('normalizes a versioned graph while retaining provider-qualified operations and opaque config', () => {
    const graph = normalizeGraphDocument(validGraph());
    expect(graph.format).toBe('perigram.graph');
    expect(graph.nodes[1].operation).toEqual({ provider: 'plugin.documents', id: 'document.compose', version: '3' });
    expect(graph.nodes[1].config).toEqual({ template: 'brief' });
    expect(graph.edges[0].source).toEqual({ node: 'input-1', port: 'value' });
  });

  it('accepts a valid graph and returns its canonical normalized form', () => {
    expect(validateGraphDocument(validGraph())).toEqual([]);
    expect(assertValidGraphDocument(validGraph()).id).toBe('graph.document');
  });

  it('rejects duplicate node and edge identities and dangling endpoints', () => {
    const graph = validGraph();
    graph.nodes.push({ ...graph.nodes[0] });
    graph.edges.push({ ...graph.edges[0], id: 'edge-2', target: { node: 'missing', port: 'input' } });
    expect(validateGraphDocument(graph).map(problem => problem.code)).toEqual(
      expect.arrayContaining(['duplicate-node-id', 'missing-edge-node'])
    );
  });

  it('requires every operation to pin a provider-qualified definition version', () => {
    const graph = validGraph();
    graph.nodes[1].operation.version = '';
    expect(validateGraphDocument(graph).some(problem => problem.code === 'invalid-operation')).toBe(true);
  });

  it('rejects floating Use Graph references', () => {
    const graph = validGraph();
    graph.nodes.push({
      id: 'subgraph',
      operation: { provider: 'perigram.core', id: GRAPH_INVOKE_OPERATION, version: '1' },
      config: { graphId: 'graph.child' }
    });
    expect(validateGraphDocument(graph).some(problem => problem.code === 'unpinned-subgraph')).toBe(true);
  });

  it('rejects non-JSON runtime values in node configuration', () => {
    const graph = validGraph();
    graph.nodes[1].config = { callback() {} };
    expect(validateGraphDocument(graph)[0].code).toBe('invalid-document');
  });

  it('rejects unsupported document versions', () => {
    const graph = validGraph();
    graph.version = 99;
    expect(validateGraphDocument(graph).map(problem => problem.code)).toContain('unsupported-version');
  });

  it('does not mutate authored input', () => {
    const graph = validGraph();
    const before = JSON.stringify(graph);
    normalizeGraphDocument(graph);
    expect(JSON.stringify(graph)).toBe(before);
  });
});
