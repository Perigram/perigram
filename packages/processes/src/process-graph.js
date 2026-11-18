import {
  assertValidGraphDocument,
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION
} from '@perigram/core';
import { normalizeGraph } from './graph-normalization.js';
import { PROCESS_DATAFLOW_VERSION } from './ports.js';

export const PROCESS_GRAPH_PROVIDER = 'perigram.processes';
export const PROCESS_GRAPH_NODE_VERSION = '1';
export const PROCESS_GRAPH_METADATA_KEY = 'perigram.process-definition';

/**
 * Lossless bridge from the legacy process-definition canvas into the
 * platform graph document envelope. Domain records remain process metadata;
 * canvas nodes and wires become provider-qualified operations and graph edges.
 *
 * This does not execute a process. Durable scheduling/effects remain the
 * process execution profile until the scheduler consumes this representation.
 */
export function processDefinitionToGraphDocument(definition = {}, options = {}) {
  const source = definition.data || definition;
  const legacy = normalizeGraph(source.graph || {});
  const { graph: ignoredGraph, ...sourceData } = source;
  const preservedSourceData = cloneJson(sourceData);
  const nodeKinds = {};
  const nodes = legacy.nodes.map(node => {
    const refId = String(node.data?.refId || node.id);
    const record = preservedSourceData.processNodes?.[refId];
    const operationId = node.type === 'processNode'
      ? 'process-node.' + requiredKind(record, refId)
      : 'canvas-node.' + String(node.type || 'default');
    nodeKinds[node.id] = node.type || 'default';
    return {
      id: node.id,
      operation: { provider: PROCESS_GRAPH_PROVIDER, id: operationId, version: PROCESS_GRAPH_NODE_VERSION },
      config: { refId, data: cloneJson(node.data || {}) },
      position: { x: Number(node.position?.x || 0), y: Number(node.position?.y || 0) }
    };
  });

  const edgeMetadata = {};
  const edges = legacy.edges.map(edge => {
    const sourcePort = edge.sourceHandle || edge.data?.sourceHandle;
    const targetPort = edge.targetHandle || edge.data?.targetHandle;
    if (!sourcePort || !targetPort) {
      throw new Error('Process edge ' + edge.id + ' has no source or target port; refusing a lossy graph migration');
    }
    edgeMetadata[edge.id] = {
      ...(edge.role ? { role: edge.role } : {}),
      ...(edge.label ? { label: edge.label } : {}),
      ...(edge.type ? { type: edge.type } : {}),
      data: cloneJson(edge.data || {})
    };
    return {
      id: edge.id,
      source: { node: edge.source, port: String(sourcePort) },
      target: { node: edge.target, port: String(targetPort) }
    };
  });

  const id = options.id || graphIdFor(definition, source);
  const revision = options.revision || 'legacy-' + hash(stableStringify({
    graph: legacy,
    sourceData: preservedSourceData,
    dataflowVersion: source.dataflowVersion ?? PROCESS_DATAFLOW_VERSION
  }));
  return assertValidGraphDocument({
    format: GRAPH_DOCUMENT_FORMAT,
    version: GRAPH_DOCUMENT_VERSION,
    id,
    revision,
    name: String(options.name || definition.name || source.name || 'Process graph'),
    interface: { inputs: [], outputs: [] },
    nodes,
    edges,
    metadata: {
      [PROCESS_GRAPH_METADATA_KEY]: {
        schemaVersion: Number(source.schemaVersion || 1),
        dataflowVersion: Number(source.dataflowVersion || PROCESS_DATAFLOW_VERSION),
        nodeKinds,
        edgeMetadata,
        viewport: cloneJson(legacy.viewport),
        sourceData: preservedSourceData
      }
    }
  });
}

/** Reconstruct the legacy process-definition shape during compatibility migration reads. */
export function graphDocumentToProcessDefinition(graphSource) {
  const graph = assertValidGraphDocument(graphSource);
  const metadata = graph.metadata?.[PROCESS_GRAPH_METADATA_KEY];
  if (!metadata || !metadata.sourceData || !metadata.nodeKinds) {
    throw new Error('Graph document does not contain Perigram process-definition metadata');
  }
  const nodes = graph.nodes.map(node => ({
    id: node.id,
    type: metadata.nodeKinds[node.id] || node.operation.id.replace(/^canvas-node\./, ''),
    position: { ...(node.position || { x: 0, y: 0 }) },
    data: cloneJson(node.config?.data || {})
  }));
  const edges = graph.edges.map(edge => {
    const annotation = metadata.edgeMetadata?.[edge.id] || {};
    return {
      id: edge.id,
      source: edge.source.node,
      sourceHandle: edge.source.port,
      target: edge.target.node,
      targetHandle: edge.target.port,
      ...(annotation.type ? { type: annotation.type } : {}),
      ...(annotation.role ? { role: annotation.role } : {}),
      ...(annotation.label ? { label: annotation.label } : {}),
      data: cloneJson(annotation.data || {})
    };
  });
  return {
    ...cloneJson(metadata.sourceData),
    schemaVersion: metadata.schemaVersion || 1,
    dataflowVersion: metadata.dataflowVersion || PROCESS_DATAFLOW_VERSION,
    graph: {
      nodes,
      edges,
      viewport: cloneJson(metadata.viewport || { x: 0, y: 0, zoom: 1 })
    }
  };
}

function requiredKind(record, refId) {
  const kind = String(record?.kind || '');
  if (!kind) throw new Error('Process node record ' + refId + ' has no operation kind');
  return kind;
}

function graphIdFor(definition, source) {
  const raw = String(definition._id || definition.id || source.id || 'process');
  const safe = raw.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 100) || 'process';
  return 'process.' + safe;
}

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}
