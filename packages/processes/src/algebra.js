import { resolveProcessNodePorts } from './ports.js';

const RECORD_KEYS = {
  entity: 'entityProfiles',
  valueInput: 'valueInputs',
  processNode: 'processNodes'
};

export async function resolveProcessActionInputContext(definition = {}, actionId, context = {}, options = {}) {
  const process = definition?.data?.graph ? definition.data : definition;
  const graph = process.graph || { nodes: [], edges: [] };
  const nodes = new Map((graph.nodes || []).map(node => [String(node.id), node]));
  const actionNode = (graph.nodes || []).find(node => (
    node.type === 'action' && recordId(node) === String(actionId)
  ));
  const result = {
    data: clone(context.data || {}),
    parameters: clone(context.parameters || {}),
    entities: clone(context.entities || {})
  };
  if (!actionNode) return result;

  const action = process.actions?.[actionId] || process.compiled?.actions?.[actionId];
  if (!action) throw new Error(`Action ${actionId} is missing from the process definition`);
  const cache = new Map();
  const resolving = new Set();
  const connected = new Set();

  for (const edge of (graph.edges || []).filter(item => String(item.target) === String(actionNode.id))) {
    const targetPort = portId(edge.targetHandle, action.inputs || [], 'input');
    if (!targetPort || targetPort === 'trigger' || targetPort === 'status') continue;
    const sourceNode = nodes.get(String(edge.source));
    if (!['entity', 'valueInput', 'processNode'].includes(sourceNode?.type)) continue;
    if (connected.has(targetPort)) throw new Error(`Action ${actionId} input ${targetPort} has more than one connected value`);
    connected.add(targetPort);
    const input = (action.inputs || []).find(item => item.id === targetPort);
    if (!input) throw new Error(`Action ${actionId} has no input ${targetPort}`);
    const value = await evaluate(edge.source, edge.sourceHandle);
    bindActionInput(result, action, input, value);
  }
  return result;

  async function evaluate(nodeId, handle = '') {
    const node = nodes.get(String(nodeId));
    if (!node) throw new Error(`Process value source node ${nodeId} does not exist`);
    const record = recordForNode(process, node);
    if (!record) throw new Error(`Process value source node ${nodeId} has no semantic record`);
    const outputs = outputPorts(node, record);
    const outputId = portId(handle, outputs, 'output');
    const key = `${nodeId}:${outputId}`;
    if (cache.has(key)) return cache.get(key);
    if (resolving.has(key)) throw new Error(`Process value graph contains a cycle at node ${nodeId}`);
    resolving.add(key);
    try {
      let value;
      if (node.type === 'valueInput') {
        value = parseValue(record.value, record.valueType);
      } else if (node.type === 'entity') {
        value = await options.resolveEntity?.(record.entityType, result.entities?.[record.entityType]);
        if (value == null) throw new Error(`Entity node ${record.id || node.id} could not resolve ${record.entityType}`);
      } else if (node.type === 'processNode') {
        value = await evaluateProcessNode(node, record, outputId);
      } else {
        throw new Error(`Node ${nodeId} cannot provide process values`);
      }
      cache.set(key, value);
      return value;
    } finally {
      resolving.delete(key);
    }
  }

  async function evaluateProcessNode(node, record, outputId) {
    const contract = resolveProcessNodePorts(record);
    if (!contract.outputs.some(port => port.id === outputId)) {
      throw new Error(`Process node ${record.id || node.id} has no output ${outputId || '(empty)'}`);
    }
    const inputs = {};
    for (const edge of (graph.edges || []).filter(item => String(item.target) === String(node.id))) {
      const inputId = portId(edge.targetHandle, contract.inputs, 'input');
      if (!inputId) throw new Error(`Process node ${record.id || node.id} has an edge without an input port`);
      if (Object.prototype.hasOwnProperty.call(inputs, inputId)) {
        throw new Error(`Process node ${record.id || node.id} input ${inputId} has more than one connected value`);
      }
      inputs[inputId] = await evaluate(edge.source, edge.sourceHandle);
    }
    for (const input of contract.inputs) {
      if (input.required && !Object.prototype.hasOwnProperty.call(inputs, input.id)) {
        throw new Error(`Process node ${record.id || node.id} requires input ${input.id}`);
      }
    }
    return executeNode(record, inputs, outputId, options);
  }
}

async function executeNode(record, inputs, outputId, options) {
  if (record.kind === 'fieldRead') return readPath(inputs.entity, outputId);
  if (record.kind === 'blockRead') return readPath(inputs.block, relativePath(record.block, record.path));
  if (record.kind === 'blockCompose') {
    const block = clone(inputs.block || {});
    writePath(block, relativePath(record.block, record.path), inputs.value);
    return block;
  }
  if (record.kind === 'stringOp') {
    const value = String(inputs.value ?? '');
    if (record.operation === 'concat') return `${inputs.value ?? ''}${inputs.right ?? ''}`;
    if (record.operation === 'template') return String(record.template || '{value}').split('{value}').join(value);
    if (record.operation === 'replace') return value.split(String(inputs.search ?? '')).join(String(inputs.replacement ?? ''));
    if (record.operation === 'lower') return value.toLowerCase();
    if (record.operation === 'upper') return value.toUpperCase();
    if (record.operation === 'trim') return value.trim();
  }
  if (record.kind === 'compare') {
    if (record.operation === 'exists') return inputs.left !== null && inputs.left !== undefined && inputs.left !== '';
    if (record.operation === 'eq') return inputs.left === inputs.right;
    if (record.operation === 'neq') return inputs.left !== inputs.right;
    if (record.operation === 'gt') return inputs.left > inputs.right;
    if (record.operation === 'lt') return inputs.left < inputs.right;
    if (record.operation === 'contains') return String(inputs.left).includes(String(inputs.right));
  }
  if (record.kind === 'logic') {
    if (record.operation === 'and') return Boolean(inputs.left && inputs.right);
    if (record.operation === 'or') return Boolean(inputs.left || inputs.right);
    if (record.operation === 'not') return !inputs.left;
    if (record.operation === 'coalesce') return inputs.left ?? inputs.right;
  }
  if (record.kind === 'collection') {
    if (!Array.isArray(inputs.items)) throw new Error(`Process node ${record.id} requires an entity list`);
    return record.operation === 'count' ? inputs.items.length : inputs.items[0];
  }
  if (record.kind === 'entityRef') {
    if (record.mode === 'current') {
      const entity = await options.resolveEntity?.(record.entityType);
      if (entity == null) throw new Error(`Process node ${record.id} could not resolve ${record.entityType}`);
      return entity;
    }
    if (!options.resolveEntityReference) throw new Error(`Process node ${record.id} requires entity traversal support`);
    return await options.resolveEntityReference(record, inputs.entity);
  }
  throw new Error(`Process node ${record.id} uses unsupported operation ${record.kind}:${record.operation || record.mode || ''}`);
}

function bindActionInput(result, action, input, value) {
  if (input.kind === 'entity' || input.entityType) {
    const bound = entityReference(value, input.entityType);
    result.entities[input.entityType || input.id] = bound;
    if (input.id === 'entity' || input.id === 'parent') result.entities[input.id] = bound;
    return;
  }
  const path = input.dataPath || input.path || '';
  if (path.startsWith('parameters.')) {
    writePath(result.parameters, path.slice('parameters.'.length), value);
    return;
  }
  if (action.actionKind === 'runCommand') {
    result.parameters[input.name || input.id] = value;
    return;
  }
  writePath(result.data, path || input.id.replace(/^field:/, ''), value);
}

function entityReference(value, fallbackType = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (value.type && value.id) return { ...value };
  const id = value.identity?.uid || value._id || value.id;
  return id ? { type: fallbackType || value.type || value.entityType || '', id: String(id) } : value;
}

function outputPorts(node, record) {
  if (node.type === 'valueInput') return [{ id: 'value' }];
  if (node.type === 'entity') return [{ id: 'entity' }];
  return resolveProcessNodePorts(record).outputs;
}

function portId(handle, ports, direction) {
  const clean = String(handle || '').replace(/^(input|output|data):/, '');
  if (!clean || clean === direction) return ports.length === 1 ? ports[0].id : '';
  return ports.find(port => port.id === clean || port.dataPath === clean || port.block === clean)?.id || clean;
}

function recordForNode(process, node) {
  const key = RECORD_KEYS[node.type];
  return key ? process[key]?.[recordId(node)] : null;
}

function recordId(node) {
  return String(node?.data?.refId || node?.id || '');
}

function parseValue(value, kind) {
  if (kind === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Cannot parse ${value} as number`);
    return parsed;
  }
  if (kind === 'boolean') return value === true || value === 'true';
  if (kind === 'json' || kind === 'object') return typeof value === 'string' ? JSON.parse(value) : clone(value);
  return value == null ? '' : String(value);
}

function relativePath(block, path) {
  const prefix = `${block}.`;
  return String(path || '').startsWith(prefix) ? String(path).slice(prefix.length) : String(path || '');
}

function readPath(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function writePath(target, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (!keys.length) throw new Error('Cannot bind a process value without a target path');
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}
