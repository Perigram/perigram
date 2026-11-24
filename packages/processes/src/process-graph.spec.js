import { describe, expect, it } from 'vitest';
import { GRAPH_DOCUMENT_FORMAT, validateGraphDocument } from '@perigram/core';
import {
  authoredProcessDataFromGraphDocument,
  createProcessGraphDocument,
  PROCESS_GRAPH_METADATA_KEY,
  PROCESS_GRAPH_PROVIDER
} from './process-graph.js';

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

describe('canonical process graph document', () => {
  it('emits canonical operations, endpoints, and process execution metadata', () => {
    const graph = createProcessGraphDocument(definition());
    expect(graph.format).toBe(GRAPH_DOCUMENT_FORMAT);
    expect(graph.nodes.map(node => node.operation)).toEqual([
      { provider: PROCESS_GRAPH_PROVIDER, id: 'collection.count', version: '1' },
      { provider: PROCESS_GRAPH_PROVIDER, id: 'cts.construct', version: '1' },
      { provider: PROCESS_GRAPH_PROVIDER, id: 'canvas-node.ctsClass', version: '1' }
    ]);
    expect(graph.edges[1]).toMatchObject({
      source: { node: 'class-node', port: 'type' },
      target: { node: 'effect-node', port: 'type' }
    });
    expect(graph.metadata[PROCESS_GRAPH_METADATA_KEY].dataflowVersion).toBe(4);
    expect(validateGraphDocument(graph)).toEqual([]);
  });

  it('creates deterministic revisions and changes them when authored semantics change', () => {
    const source = definition();
    const first = createProcessGraphDocument(source);
    expect(createProcessGraphDocument(source).revision).toBe(first.revision);
    source.processNodes.source.label = 'Changed';
    expect(createProcessGraphDocument(source).revision).not.toBe(first.revision);
  });

  it('canonicalizes control-socket wires as control edges', () => {
    const source = definition();
    source.graph.edges.push({
      id: 'control-wire', source: 'effect-node', target: 'source-node',
      sourceHandle: 'control:completed', targetHandle: 'control:in'
    });
    const graph = createProcessGraphDocument(source);
    expect(graph.edges.find(edge => edge.id === 'control-wire')).toMatchObject({
      kind: 'control',
      source: { node: 'effect-node', port: 'control:completed' },
      target: { node: 'source-node', port: 'control:in' }
    });
  });

  it('represents declaration relations without inventing process sockets', () => {
    const source = definition();
    source.graph.edges[1] = {
      id: 'decl:binds:class-effect',
      source: 'class-node',
      target: 'effect-node',
      label: 'declares',
      data: { relation: 'declares' }
    };
    const graph = createProcessGraphDocument(source);
    expect(graph.edges[1]).toMatchObject({
      source: { node: 'class-node', port: '$declaration' },
      target: { node: 'effect-node', port: '$declaration' },
      kind: 'type',
      metadata: { syntheticDeclarationPorts: true }
    });
  });

  it('rejects edges without endpoint identity', () => {
    const source = definition();
    source.graph.edges[0].sourceHandle = null;
    expect(() => createProcessGraphDocument(source)).toThrow(/no source or target port/);
  });

  it('keeps activation records top-level and out of authored source data', () => {
    const source = definition();
    const first = createProcessGraphDocument(source);
    const withActivationRecords = {
      ...source,
      history: [{ at: '2026-01-01T00:00:00.000Z', actor: 'u1', data: { processNodes: source.processNodes } }],
      activated: { processNodes: source.processNodes },
      compiled: { actions: {} }
    };
    const graph = createProcessGraphDocument(withActivationRecords);
    const sourceData = graph.metadata[PROCESS_GRAPH_METADATA_KEY].sourceData;
    expect(sourceData.history).toBeUndefined();
    expect(sourceData.activated).toBeUndefined();
    expect(sourceData.compiled).toBeUndefined();
    expect(graph.revision).toBe(first.revision);
    const restored = authoredProcessDataFromGraphDocument(graph);
    expect(restored.history).toBeUndefined();
    expect(restored.activated).toBeUndefined();
    expect(restored.compiled).toBeUndefined();
  });

  it('projects the canonical graph back to authored process data', () => {
    const source = definition();
    const restored = authoredProcessDataFromGraphDocument(createProcessGraphDocument(source));
    expect(restored.processNodes).toEqual(source.processNodes);
    expect(restored.ctsTypes).toEqual(source.ctsTypes);
    expect(restored.roleGrants).toEqual(source.roleGrants);
    expect(restored.screens).toEqual(source.screens);
    expect(restored.graph.nodes).toEqual(source.graph.nodes);
    expect(restored.graph.edges).toEqual(source.graph.edges);
    expect(restored.graph.viewport).toEqual(source.graph.viewport);
  });
});
