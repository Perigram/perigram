import { isRecord, isJsonValue, cloneJson } from './json.js';
const FORMAT = 'perigram.graph';
export const GRAPH_DOCUMENT_FORMAT = FORMAT;
export const GRAPH_DOCUMENT_VERSION = 1;
export const CORE_GRAPH_PROVIDER = 'perigram.core';
export const GRAPH_INPUT_OPERATION = 'perigram.core.graph-input';
export const GRAPH_OUTPUT_OPERATION = 'perigram.core.graph-output';
export const GRAPH_INVOKE_OPERATION = 'perigram.core.use-graph';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRANSPORT_SHAPES = new Set(['item', 'list', 'tree', 'map', 'tuple', 'stream']);

export function normalizeGraphDocument(source = {}) {
  if (!isRecord(source)) throw new Error('Graph document must be an object');
  const document = {
    format: source.format == null ? FORMAT : String(source.format),
    version: Number(source.version ?? GRAPH_DOCUMENT_VERSION),
    id: requiredString(source.id, 'Graph id'),
    revision: requiredString(source.revision, 'Graph revision'),
    name: String(source.name || ''),
    interface: {
      inputs: normalizeInterfacePorts(source.interface?.inputs, 'input'),
      outputs: normalizeInterfacePorts(source.interface?.outputs, 'output')
    },
    nodes: Array.isArray(source.nodes) ? source.nodes.map(normalizeGraphNode) : [],
    edges: Array.isArray(source.edges) ? source.edges.map(normalizeGraphEdge) : []
  };
  if (source.description != null) document.description = String(source.description);
  if (source.metadata != null) {
    if (!isJsonValue(source.metadata)) throw new Error('Graph metadata must be JSON-compatible');
    document.metadata = cloneJson(source.metadata);
  }
  return document;
}

export function validateGraphDocument(source) {
  const problems = [];
  let graph;
  try {
    graph = normalizeGraphDocument(source);
  } catch (error) {
    return [{ code: 'invalid-document', path: '$', message: error.message }];
  }

  if (graph.format !== FORMAT) problems.push(problem('unsupported-format', 'format', `Unsupported graph format ${graph.format}`));
  if (graph.version !== GRAPH_DOCUMENT_VERSION) {
    problems.push(problem('unsupported-version', 'version', `Unsupported graph document version ${graph.version}`));
  }
  if (!ID_PATTERN.test(graph.id)) problems.push(problem('invalid-id', 'id', 'Graph id must be a stable identifier'));
  if (!graph.revision) problems.push(problem('missing-revision', 'revision', 'Graph revision is required'));

  validateInterface(graph.interface.inputs, 'interface.inputs', problems);
  validateInterface(graph.interface.outputs, 'interface.outputs', problems);

  const nodeIds = new Set();
  const inputBoundaries = new Map();
  const outputBoundaries = new Map();
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index];
    const path = `nodes[${index}]`;
    if (!ID_PATTERN.test(node.id)) problems.push(problem('invalid-node-id', `${path}.id`, 'Node id must be a stable identifier'));
    if (nodeIds.has(node.id)) problems.push(problem('duplicate-node-id', `${path}.id`, `Duplicate node id ${node.id}`));
    nodeIds.add(node.id);
    if (!node.operation.provider || !node.operation.id || !node.operation.version) {
      problems.push(problem('invalid-operation', `${path}.operation`, 'Node operation requires provider, id, and pinned version'));
    }
    if (!isJsonValue(node.config)) problems.push(problem('invalid-config', `${path}.config`, 'Node config must be JSON-compatible'));
    if ([GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION, GRAPH_INVOKE_OPERATION].includes(node.operation.id)
      && node.operation.provider !== CORE_GRAPH_PROVIDER) {
      problems.push(problem('invalid-core-operation-provider', `${path}.operation.provider`, 'Built-in graph boundary and invocation operations must use the perigram.core provider'));
    }
    if (node.operation.id === GRAPH_INPUT_OPERATION || node.operation.id === GRAPH_OUTPUT_OPERATION) {
      const collection = node.operation.id === GRAPH_INPUT_OPERATION ? inputBoundaries : outputBoundaries;
      const interfaceId = node.config.interfaceId;
      if (typeof interfaceId !== 'string' || !interfaceId) {
        problems.push(problem('missing-interface-binding', `${path}.config.interfaceId`, 'Graph boundary node requires an interfaceId'));
      } else if (collection.has(interfaceId)) {
        problems.push(problem('duplicate-interface-binding', `${path}.config.interfaceId`, `Multiple boundary nodes reference interface port ${interfaceId}`));
      } else {
        collection.set(interfaceId, node.id);
      }
    }
    if (node.operation.id === GRAPH_INVOKE_OPERATION) {
      if (!node.config.graphId || !node.config.revision) {
        problems.push(problem('unpinned-subgraph', `${path}.config`, 'Use Graph must reference an exact graph id and immutable revision'));
      }
    }
  }

  for (const port of graph.interface.inputs) {
    if (!inputBoundaries.has(port.id)) problems.push(problem('missing-input-boundary', 'interface.inputs', `Graph input ${port.id} has no Graph Input node`));
  }
  for (const port of graph.interface.outputs) {
    if (!outputBoundaries.has(port.id)) problems.push(problem('missing-output-boundary', 'interface.outputs', `Graph output ${port.id} has no Graph Output node`));
  }
  for (const id of inputBoundaries.keys()) {
    if (!graph.interface.inputs.some(port => port.id === id)) problems.push(problem('unknown-input-boundary', 'nodes', `Graph Input node references undeclared input ${id}`));
  }
  for (const id of outputBoundaries.keys()) {
    if (!graph.interface.outputs.some(port => port.id === id)) problems.push(problem('unknown-output-boundary', 'nodes', `Graph Output node references undeclared output ${id}`));
  }

  const edgeIds = new Set();
  for (let index = 0; index < graph.edges.length; index += 1) {
    const edge = graph.edges[index];
    const path = `edges[${index}]`;
    if (!ID_PATTERN.test(edge.id)) problems.push(problem('invalid-edge-id', `${path}.id`, 'Edge id must be a stable identifier'));
    if (edgeIds.has(edge.id)) problems.push(problem('duplicate-edge-id', `${path}.id`, `Duplicate edge id ${edge.id}`));
    edgeIds.add(edge.id);
    for (const [side, endpoint] of [['source', edge.source], ['target', edge.target]]) {
      if (!nodeIds.has(endpoint.node)) {
        problems.push(problem('missing-edge-node', `${path}.${side}.node`, `Edge references missing node ${endpoint.node}`));
      }
      if (!endpoint.port) problems.push(problem('missing-edge-port', `${path}.${side}.port`, `Edge ${side} port is required`));
    }
  }

  return problems;
}

export function assertValidGraphDocument(source) {
  const problems = validateGraphDocument(source);
  if (problems.length) {
    const error = new Error(`Invalid graph document: ${problems.map(item => item.message).join('; ')}`);
    error.problems = problems;
    throw error;
  }
  return normalizeGraphDocument(source);
}

function normalizeGraphNode(node = {}) {
  if (!isRecord(node)) throw new Error('Graph nodes must be objects');
  const operation = isRecord(node.operation) ? node.operation : {};
  const config = node.config == null ? {} : node.config;
  if (!isJsonValue(config)) throw new Error(`Node ${node.id || '(unnamed)'} config must be JSON-compatible`);
  const normalized = {
    id: requiredString(node.id, 'Node id'),
    operation: {
      provider: String(operation.provider || '').trim(),
      id: String(operation.id || '').trim(),
      version: String(operation.version || '').trim()
    },
    config: cloneJson(config)
  };
  if (node.position != null) {
    if (!isRecord(node.position) || !Number.isFinite(Number(node.position.x)) || !Number.isFinite(Number(node.position.y))) {
      throw new Error(`Node ${normalized.id} position must contain finite x and y coordinates`);
    }
    normalized.position = { x: Number(node.position.x), y: Number(node.position.y) };
  }
  return normalized;
}

function normalizeGraphEdge(edge = {}) {
  if (!isRecord(edge)) throw new Error('Graph edges must be objects');
  const source = isRecord(edge.source) ? edge.source : {};
  const target = isRecord(edge.target) ? edge.target : {};
  const normalized = {
    id: requiredString(edge.id, 'Edge id'),
    source: { node: requiredString(source.node, 'Edge source node'), port: requiredString(source.port, 'Edge source port') },
    target: { node: requiredString(target.node, 'Edge target node'), port: requiredString(target.port, 'Edge target port') }
  };
  if (edge.kind != null) {
    normalized.kind = requiredString(edge.kind, 'Edge kind');
  }
  if (edge.metadata != null) {
    if (!isJsonValue(edge.metadata) || !isRecord(edge.metadata)) {
      throw new Error(`Edge ${normalized.id} metadata must be a JSON object`);
    }
    normalized.metadata = cloneJson(edge.metadata);
  }
  return normalized;
}

function normalizeInterfacePorts(ports, direction) {
  if (ports == null) return [];
  if (!Array.isArray(ports)) throw new Error(`Graph interface ${direction}s must be an array`);
  return ports.map(port => {
    if (!isRecord(port)) throw new Error(`Graph interface ${direction} must contain objects`);
    if (!isRecord(port.contract) || !isJsonValue(port.contract)) throw new Error(`Graph interface port ${port.id || '(unnamed)'} contract must be an object`);
    if (!TRANSPORT_SHAPES.has(port.contract.shape)) throw new Error(`Graph interface port ${port.id || '(unnamed)'} requires a supported transport shape`);
    if (!isRecord(port.contract.semantic) || !Object.keys(port.contract.semantic).length) throw new Error(`Graph interface port ${port.id || '(unnamed)'} requires a semantic descriptor`);
    if (Object.hasOwn(port, 'default') && !isJsonValue(port.default)) throw new Error(`Graph interface port ${port.id || '(unnamed)'} default must be JSON-compatible`);
    return {
      id: requiredString(port.id, `Graph ${direction} id`),
      label: String(port.label || port.id || ''),
      contract: cloneJson(port.contract),
      required: port.required !== false,
      ...(Object.hasOwn(port, 'default') ? { default: cloneJson(port.default) } : {})
    };
  });
}

function validateInterface(ports, path, problems) {
  const seen = new Set();
  ports.forEach((port, index) => {
    if (!ID_PATTERN.test(port.id)) problems.push(problem('invalid-interface-id', `${path}[${index}].id`, 'Interface port id must be a stable identifier'));
    if (seen.has(port.id)) problems.push(problem('duplicate-interface-id', `${path}[${index}].id`, `Duplicate interface port ${port.id}`));
    seen.add(port.id);
  });
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}




function problem(code, path, message) {
  return { code, path, message };
}
