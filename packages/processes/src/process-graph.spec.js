import { describe, expect, it } from 'vitest';
import {
  GRAPH_DOCUMENT_FORMAT,
  validateGraphDocument
} from '@perigram/core';
import {
  graphDocumentToProcessDefinition,
  processDefinitionToGraphDocument,
  PROCESS_GRAPH_METADATA_KEY,
  PROCESS_GRAPH_PROVIDER
} from './process-graph.js';
import { normalizeGraph } from './graph-normalization.js';

const definition = () => ({
  id: 'order-flow',
  schemaVersion: 1,
  dataflowVersion: 4,
  roleGrants: { manager: { read: true } },
  processNodes: {
    source: { id: 'source', kind: 'collection.count', label: 'Count' },
    effect: { id: 'effect', kind: 'cts.construct', typeId: 'order' }
  },
  ctsTypes: { order: { id: 'order', kind: 'class', name: 'Order' } },
  screens: { home: { id: 'home', route: '/' } },
  graph: {
    nodes: [
      { id: 'source-node', type: 'processNode', position: { x: 10, y: 20 }, data: { refId: 'source' } },
      { id: 'effect-node', type: 'processNode', position: { x: 90, y: 120 }, data: { refId: 'effect' } },
      { id: 'class-node', type: 'ctsClass', position: { x: 300, y: 10 }, data: { refId: 'order', typeId: 'order' } }
    ],
    edges: [
      { id: 'data-wire', source: 'source-node', target: 'effect-node', sourceHandle: 'value', targetHandle: 'entity', type: 'default', data: { hint: 'data' } },
      { id: 'declaration-wire', source: 'class-node', target: 'effect-node', sourceHandle: 'type', targetHandle: 'type', role: 'type', label: 'declares', data: {} }
    ],
    viewport: { x: 12, y: -8, zoom: 1.25 }
  }
});

describe('canonical process graph migration bridge', () => {
  it('represents every legacy canvas node and edge in the canonical graph envelope', () => {
    const graph = processDefinitionToGraphDocument(definition());
    expect(graph.format).toBe(GRAPH_DOCUMENT_FORMAT);
    expect(graph.nodes.map(node => node.operation)).toEqual([
      { provider: PROCESS_GRAPH_PROVIDER, id: 'process-node.collection.count', version: '1' },
      { provider: PROCESS_GRAPH_PROVIDER, id: 'process-node.cts.construct', version: '1' },
      { provider: PROCESS_GRAPH_PROVIDER, id: 'canvas-node.ctsClass', version: '1' }
    ]);
    expect(graph.edges[1]).toMatchObject({
      source: { node: 'class-node', port: 'type' },
      target: { node: 'effect-node', port: 'type' }
    });
    expect(validateGraphDocument(graph)).toEqual([]);
  });

  it('round-trips process records, declaration wires, positions, and viewport without semantic loss', () => {
    const source = definition();
    const graph = processDefinitionToGraphDocument(source);
    const restored = graphDocumentToProcessDefinition(graph);
    expect(restored.processNodes).toEqual(source.processNodes);
    expect(restored.ctsTypes).toEqual(source.ctsTypes);
    expect(restored.roleGrants).toEqual(source.roleGrants);
    expect(restored.screens).toEqual(source.screens);
    expect(restored.graph).toEqual(normalizeGraph(source.graph));
    expect(graph.metadata[PROCESS_GRAPH_METADATA_KEY].dataflowVersion).toBe(4);
  });

  it('creates a deterministic immutable revision for unchanged source and a new revision after edits', () => {
    const source = definition();
    const first = processDefinitionToGraphDocument(source);
    expect(processDefinitionToGraphDocument(source).revision).toBe(first.revision);
    source.processNodes.source.label = 'Changed';
    expect(processDefinitionToGraphDocument(source).revision).not.toBe(first.revision);
  });

  it('refuses to migrate a wire whose port identity is missing', () => {
    const source = definition();
    source.graph.edges[0].sourceHandle = null;
    expect(() => processDefinitionToGraphDocument(source)).toThrow(/no source or target port/);
  });

  it('rejects a canonical graph without process migration metadata when reconstructing', () => {
    const graph = processDefinitionToGraphDocument(definition());
    delete graph.metadata[PROCESS_GRAPH_METADATA_KEY];
    expect(() => graphDocumentToProcessDefinition(graph)).toThrow(/does not contain Perigram process-definition metadata/);
  });
});
