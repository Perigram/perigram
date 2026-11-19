import { isRecord, isJsonValue, cloneJson, deepFreeze } from './json.js';
import {
  CORE_GRAPH_PROVIDER,
  GRAPH_ID_PATTERN,
  GRAPH_TRANSPORT_SHAPES,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION
} from './graph.js';

// Schema law lives in packages/core/README.md §Authoring DSL.
export const AUTHORING_DOCUMENT_FORMAT = 'perigram.graph-authoring';
export const AUTHORING_DOCUMENT_VERSION = 1;

const TRANSPORT_SHAPES = new Set(GRAPH_TRANSPORT_SHAPES);
const RESERVED_OPERATION_IDS = new Set([GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION, GRAPH_INVOKE_OPERATION]);

const TOP_LEVEL_KEYS = ['format', 'version', 'id', 'revision', 'name', 'description', 'interface', 'nodes', 'edges', 'presentation'];
const INTERFACE_KEYS = ['inputs', 'outputs'];
const PORT_KEYS = ['id', 'label', 'contract', 'required', 'default'];
const CONTRACT_KEYS = ['shape', 'semantic'];
const NODE_KEYS = ['id', 'operation', 'invoke', 'config', 'capabilities', 'effects'];
const OPERATION_KEYS = ['provider', 'id', 'version'];
const INVOKE_KEYS = ['graphId', 'revision'];
const EDGE_KEYS = ['id', 'source', 'target', 'kind'];
const ENDPOINT_KEYS = ['node', 'port'];

export function normalizeAuthoringDocument(source = {}) {
  if (!isRecord(source)) throw new Error('Authoring document must be an object');
  const document = {
    format: source.format == null ? AUTHORING_DOCUMENT_FORMAT : String(source.format),
    version: Number(source.version ?? AUTHORING_DOCUMENT_VERSION),
    id: requiredString(source.id, 'Graph id'),
    revision: requiredString(source.revision, 'Graph revision'),
    interface: {
      inputs: normalizePorts(source.interface?.inputs, 'input'),
      outputs: normalizePorts(source.interface?.outputs, 'output')
    },
    nodes: Array.isArray(source.nodes) ? source.nodes.map(normalizeNode) : [],
    edges: Array.isArray(source.edges)
      ? source.edges.map((edge, index) => normalizeEdge(edge, index))
      : []
  };
  if (source.name) document.name = String(source.name);
  if (source.description != null) document.description = String(source.description);
  if (source.presentation != null) {
    if (!isRecord(source.presentation) || !isJsonValue(source.presentation)) {
      throw new Error('Presentation block must be a JSON object');
    }
    document.presentation = cloneJson(source.presentation);
  }
  return deepFreeze(document);
}

export function validateAuthoringDocument(source) {
  if (!isRecord(source)) return [problem('invalid-document', '$', 'Authoring document must be an object')];
  const problems = [];
  collectUnknownKeys(source, TOP_LEVEL_KEYS, '$', problems);
  const interfaceRecord = isRecord(source.interface) ? source.interface : {};
  collectUnknownKeys(interfaceRecord, INTERFACE_KEYS, 'interface', problems);
  for (const [key, ports] of [['inputs', interfaceRecord.inputs], ['outputs', interfaceRecord.outputs]]) {
    if (!Array.isArray(ports)) continue;
    ports.forEach((port, index) => {
      if (!isRecord(port)) return;
      const path = `interface.${key}[${index}]`;
      collectUnknownKeys(port, PORT_KEYS, path, problems);
      if (isRecord(port.contract)) collectUnknownKeys(port.contract, CONTRACT_KEYS, `${path}.contract`, problems);
    });
  }
  if (Array.isArray(source.nodes)) {
    source.nodes.forEach((node, index) => {
      if (!isRecord(node)) return;
      const path = `nodes[${index}]`;
      collectUnknownKeys(node, NODE_KEYS, path, problems);
      if (isRecord(node.operation)) collectUnknownKeys(node.operation, OPERATION_KEYS, `${path}.operation`, problems);
      if (isRecord(node.invoke)) collectUnknownKeys(node.invoke, INVOKE_KEYS, `${path}.invoke`, problems);
    });
  }
  if (Array.isArray(source.edges)) {
    source.edges.forEach((edge, index) => {
      if (!isRecord(edge)) return;
      const path = `edges[${index}]`;
      collectUnknownKeys(edge, EDGE_KEYS, path, problems);
      if (isRecord(edge.source)) collectUnknownKeys(edge.source, ENDPOINT_KEYS, `${path}.source`, problems);
      if (isRecord(edge.target)) collectUnknownKeys(edge.target, ENDPOINT_KEYS, `${path}.target`, problems);
    });
  }

  let document;
  try {
    document = normalizeAuthoringDocument(source);
  } catch (error) {
    return [problem('invalid-document', '$', error.message)];
  }

  if (document.format !== AUTHORING_DOCUMENT_FORMAT) {
    problems.push(problem('unsupported-format', 'format', `Unsupported authoring format ${document.format}`));
  }
  if (document.version !== AUTHORING_DOCUMENT_VERSION) {
    problems.push(problem('unsupported-version', 'version', `Unsupported authoring document version ${document.version}`));
  }
  if (!GRAPH_ID_PATTERN.test(document.id)) problems.push(problem('invalid-id', 'id', 'Graph id must be a stable identifier'));
  if (!document.revision) problems.push(problem('missing-revision', 'revision', 'Graph revision is required'));

  const portIds = new Set();
  for (const [key] of [['inputs'], ['outputs']]) {
    const seen = new Set();
    document.interface[key].forEach((port, index) => {
      const path = `interface.${key}[${index}]`;
      if (!GRAPH_ID_PATTERN.test(port.id)) problems.push(problem('invalid-interface-id', `${path}.id`, 'Interface port id must be a stable identifier'));
      if (seen.has(port.id)) problems.push(problem('duplicate-interface-id', `${path}.id`, `Duplicate interface port ${port.id}`));
      seen.add(port.id);
      if (portIds.has(port.id)) {
        problems.push(problem('interface-id-collision', `${path}.id`, `Interface port ${port.id} collides with a port in the other direction`));
      }
      portIds.add(port.id);
    });
  }

  const nodeIds = new Set();
  document.nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    if (!GRAPH_ID_PATTERN.test(node.id)) problems.push(problem('invalid-node-id', `${path}.id`, 'Node id must be a stable identifier'));
    if (nodeIds.has(node.id)) problems.push(problem('duplicate-node-id', `${path}.id`, `Duplicate node id ${node.id}`));
    nodeIds.add(node.id);
    if (portIds.has(node.id)) {
      problems.push(problem('boundary-id-collision', `${path}.id`, `Node id ${node.id} collides with the boundary node of interface port ${node.id}`));
    }
    if (node.operation && node.operation.provider === CORE_GRAPH_PROVIDER && RESERVED_OPERATION_IDS.has(node.operation.id)) {
      problems.push(problem('reserved-operation', `${path}.operation.id`, 'Core boundary and invocation operations are synthesized by lowering; author operation nodes or invoke nodes instead'));
    }
  });

  const edgeIds = new Set();
  const endpointNodes = new Set([...nodeIds, ...portIds]);
  document.edges.forEach((edge, index) => {
    const path = `edges[${index}]`;
    if (!GRAPH_ID_PATTERN.test(edge.id)) problems.push(problem('invalid-edge-id', `${path}.id`, 'Edge id must be a stable identifier'));
    if (edgeIds.has(edge.id)) problems.push(problem('duplicate-edge-id', `${path}.id`, `Duplicate edge id ${edge.id}`));
    edgeIds.add(edge.id);
    for (const [side, endpoint] of [['source', edge.source], ['target', edge.target]]) {
      if (!endpointNodes.has(endpoint.node)) {
        problems.push(problem('missing-edge-node', `${path}.${side}.node`, `Edge references missing node ${endpoint.node}`));
      }
      if (!endpoint.port) problems.push(problem('missing-edge-port', `${path}.${side}.port`, `Edge ${side} port is required`));
    }
  });

  return problems;
}

function collectUnknownKeys(record, knownKeys, path, problems) {
  for (const key of Object.keys(record)) {
    if (!knownKeys.includes(key)) {
      problems.push(problem('unknown-key', path === '$' ? key : `${path}.${key}`, `Unknown key ${key}`));
    }
  }
}

function normalizePorts(ports, direction) {
  if (ports == null) return [];
  if (!Array.isArray(ports)) throw new Error(`Authoring interface ${direction}s must be an array`);
  return ports.map(port => {
    if (!isRecord(port)) throw new Error(`Authoring interface ${direction} must contain objects`);
    const contract = isRecord(port.contract) ? port.contract : {};
    if (!TRANSPORT_SHAPES.has(contract.shape)) {
      throw new Error(`Interface port ${port.id || '(unnamed)'} requires a supported transport shape`);
    }
    if (!isRecord(contract.semantic) || !Object.keys(contract.semantic).length) {
      throw new Error(`Interface port ${port.id || '(unnamed)'} requires a semantic descriptor`);
    }
    const normalized = {
      id: requiredString(port.id, `Interface ${direction} id`),
      contract: deepFreeze({ shape: contract.shape, semantic: cloneJson(contract.semantic) }),
      required: port.required !== false
    };
    if (port.label != null) normalized.label = String(port.label);
    if (Object.hasOwn(port, 'default')) {
      if (!isJsonValue(port.default)) throw new Error(`Interface port ${normalized.id} default must be JSON-compatible`);
      normalized.default = cloneJson(port.default);
    }
    return deepFreeze(normalized);
  });
}

function normalizeNode(node) {
  if (!isRecord(node)) throw new Error('Authoring nodes must be objects');
  const hasOperation = node.operation != null;
  const hasInvoke = node.invoke != null;
  if (hasOperation === hasInvoke) {
    throw new Error(`Node ${node.id || '(unnamed)'} must declare exactly one of operation or invoke`);
  }
  const normalized = { id: requiredString(node.id, 'Node id') };
  if (hasOperation) {
    const operation = isRecord(node.operation) ? node.operation : {};
    normalized.operation = deepFreeze({
      provider: requiredString(operation.provider, 'Node operation provider'),
      id: requiredString(operation.id, 'Node operation id'),
      version: requiredString(operation.version, 'Node operation version')
    });
  } else {
    const invoke = isRecord(node.invoke) ? node.invoke : {};
    normalized.invoke = deepFreeze({
      graphId: requiredString(invoke.graphId, 'Node invocation graphId'),
      revision: requiredString(invoke.revision, 'Node invocation revision')
    });
  }
  if (node.config != null) {
    if (!isJsonValue(node.config)) throw new Error(`Node ${normalized.id} config must be JSON-compatible`);
    normalized.config = cloneJson(node.config);
  }
  normalized.capabilities = stringList(node.capabilities, `Node ${normalized.id} capabilities`);
  normalized.effects = stringList(node.effects, `Node ${normalized.id} effects`);
  return deepFreeze(normalized);
}

function stringList(values, label) {
  if (values == null) return [];
  if (!Array.isArray(values) || values.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  return values.map(item => item.trim());
}

function normalizeEdge(edge, index) {
  if (!isRecord(edge)) throw new Error('Authoring edges must be objects');
  const normalized = {
    id: edge.id == null ? `edge-${index + 1}` : requiredString(edge.id, 'Edge id'),
    source: normalizeEndpoint(edge.source, 'source'),
    target: normalizeEndpoint(edge.target, 'target')
  };
  if (edge.kind != null) normalized.kind = requiredString(edge.kind, 'Edge kind');
  return deepFreeze(normalized);
}

function normalizeEndpoint(endpoint, side) {
  const value = isRecord(endpoint) ? endpoint : {};
  return deepFreeze({
    node: requiredString(value.node, `Edge ${side} node`),
    port: requiredString(value.port, `Edge ${side} port`)
  });
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function problem(code, path, message) {
  return { code, path, message };
}
