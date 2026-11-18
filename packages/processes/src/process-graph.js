import {
  assertValidGraphDocument,
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION
} from '@perigram/core';
import { normalizeGraph } from './compiler-core.js';
import { PROCESS_DATAFLOW_VERSION } from './ports.js';

export const PROCESS_GRAPH_PROVIDER = 'perigram.processes';
export const PROCESS_GRAPH_NODE_VERSION = '1';
export const PROCESS_GRAPH_METADATA_KEY = 'perigram.process-definition';

const NODE_RECORD_COLLECTIONS = Object.freeze({
  entity: 'producerOutputs',
  action: 'actions',
  service: 'services',
  socket: 'sockets',
  stateDefinition: 'stateDefinitions',
  valueInput: 'valueInputs',
  processNode: 'processNodes'
});

/**
 * Lossless in-memory projection from the existing process-definition storage
 * shape to the canonical graph document. Referenced node records move onto
 * canonical node config; process-domain declarations and unreferenced records
 * remain in process metadata. Wires become canonical graph edges. This does
 * not rewrite persisted records: it is the compatibility boundary while the
 * stored process-definition format remains unchanged. Durable scheduling and
 * effects stay in the process execution profile; graph structure is canonical.
 */
export function processDefinitionToGraphDocument(definition = {}, options = {}) {
  const source = definition.data || definition;
  const legacy = normalizeGraph(source.graph || {});
  const sourceDataForRevision = cloneJson(Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== 'graph')
  ));
  const referencedRecords = Object.fromEntries(
    [...new Set(Object.values(NODE_RECORD_COLLECTIONS))].map(collection => [collection, new Set()])
  );
  for (const node of legacy.nodes) {
    const collection = NODE_RECORD_COLLECTIONS[node.type];
    const refId = String(node.data?.refId || node.id);
    if (collection && sourceDataForRevision[collection]?.[refId]) referencedRecords[collection].add(refId);
  }
  const preservedSourceData = cloneJson(Object.fromEntries(
    Object.entries(sourceDataForRevision)
      .filter(([key]) => key !== 'graph')
      .map(([key, value]) => {
        if (!referencedRecords[key]) return [key, value];
        const remaining = Object.fromEntries(
          Object.entries(value || {}).filter(([id]) => !referencedRecords[key].has(id))
        );
        return Object.keys(remaining).length ? [key, remaining] : null;
      })
      .filter(Boolean)
  ));
  const nodes = legacy.nodes.map(node => {
    const refId = String(node.data?.refId || node.id);
    const collection = NODE_RECORD_COLLECTIONS[node.type];
    const record = collection ? sourceDataForRevision[collection]?.[refId] : null;
    const operationId = node.type === 'processNode'
      ? requiredKind(record, refId)
      : 'canvas-node.' + String(node.type || 'default');
    return {
      id: node.id,
      operation: { provider: PROCESS_GRAPH_PROVIDER, id: operationId, version: PROCESS_GRAPH_NODE_VERSION },
      config: { refId, data: cloneJson(node.data || {}), ...(record ? { record: cloneJson(record) } : {}) },
      position: { x: Number(node.position?.x || 0), y: Number(node.position?.y || 0) }
    };
  });

  const edges = legacy.edges.map((edge, index) => {
    const sourceEdge = source.graph?.edges?.[index] || {};
    const declaredSourcePort = edge.sourceHandle || edge.data?.sourceHandle;
    const declaredTargetPort = edge.targetHandle || edge.data?.targetHandle;
    // CTS declaration relations are node-to-node semantic edges, not data
    // socket connections. The canonical graph envelope requires endpoint
    // ports, so give these relations a reserved synthetic endpoint and mark
    // it explicitly; the reverse adapter removes it rather than exposing a
    // fake socket to the process authoring model.
    const declarationEdge = !declaredSourcePort && !declaredTargetPort
      && (edge.role === 'type' || edge.role === 'declaration' || String(edge.id || '').startsWith('decl:'));
    if ((!declaredSourcePort || !declaredTargetPort) && !declarationEdge) {
      throw new Error('Process edge ' + edge.id + ' has no source or target port; refusing a lossy graph migration');
    }
    const sourcePort = declaredSourcePort || '$declaration';
    const targetPort = declaredTargetPort || '$declaration';
    return {
      id: edge.id,
      source: { node: edge.source, port: String(sourcePort) },
      target: { node: edge.target, port: String(targetPort) },
      kind: declarationEdge ? 'type' : (edge.role || 'data'),
      metadata: {
        ...(edge.label ? { label: edge.label } : {}),
        ...(Object.prototype.hasOwnProperty.call(sourceEdge, 'type') ? { type: edge.type } : {}),
        ...(declarationEdge ? { syntheticDeclarationPorts: true, originalRole: edge.role || null } : {}),
        data: cloneJson(edge.data || {})
      }
    };
  });

  const id = options.id || graphIdFor(definition, source);
  const revision = options.revision || 'legacy-' + hash(stableStringify({
    graph: legacy,
    sourceData: sourceDataForRevision,
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
        viewport: cloneJson(legacy.viewport),
        sourceData: preservedSourceData
      }
    }
  });
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
