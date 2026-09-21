import { resolveProcessNodePorts } from './ports.js';

const RECORD_KEYS = {
  entity: 'producerOutputs',
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
        value = parseValue(record.value, record.valueType, record.structure);
      } else if (node.type === 'entity') {
        value = await options.resolveEntity?.(record.typeId, result.entities?.[record.typeId]);
        if (value == null) throw new Error(`Entity node ${record.id || node.id} could not resolve ${record.typeId}`);
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
    return executeNode(record, inputs, outputId, options);
  }
}

async function executeNode(record, inputs, outputId, options) {
  if (record.kind === 'entityQuery') {
    if (!options.queryEntities) throw new Error(`Process node ${record.id} requires entity query support`);
    return await options.queryEntities(record.typeId);
  }
  if (record.kind === 'entityDecompose') return mapStructured(inputs.entity, entity => readPath(entity, outputId));
  if (record.kind === 'entityField') return mapStructured(inputs.entity, entity => readPath(entity, record.path));
  if (record.kind === 'entityFilter') {
    if (!Array.isArray(inputs.entities)) throw new Error(`Process node ${record.id} requires an entity list`);
    return inputs.entities.filter(entity => evaluatePredicate(inputs.predicate, entity));
  }
  if (record.kind === 'entitySelect') {
    if (!Array.isArray(inputs.entities)) throw new Error(`Process node ${record.id} requires an entity list`);
    if (record.operation === 'last') return inputs.entities.at(-1);
    if (record.operation === 'index') {
      const index = Number(inputs.index);
      if (!Number.isInteger(index)) throw new Error(`Process node ${record.id} requires an integer index`);
      return inputs.entities.at(index);
    }
    return inputs.entities[0];
  }
  if (record.kind === 'entityCompose') {
    return Object.fromEntries(Object.entries(inputs).map(([block, value]) => [block, clone(value)]));
  }
  if (record.kind === 'entityModify') {
    return { ...clone(inputs.entity), [record.block]: clone(inputs.block) };
  }
  if (record.kind === 'blockRead') {
    return mapStructured(inputs.block, block => readPath(block, relativePath(record.block, record.path)));
  }
  if (record.kind === 'blockCompose') {
    const block = {};
    writePath(block, relativePath(record.block, record.path), inputs.value);
    return block;
  }
  if (record.kind === 'blockModify') {
    const block = clone(inputs.block);
    writePath(block, relativePath(record.block, record.path), inputs.value);
    return block;
  }
  if (record.kind === 'cast') return mapStructured(inputs.value, value => castValue(value, record.valueType));
  if (record.kind === 'fallback') return mapStructured(inputs.value, value => value ?? inputs.fallback);
  if (record.kind === 'stringOp') {
    return mapStructured(inputs.value, input => {
      const value = String(input ?? '');
      if (record.operation === 'concat') return `${value}${inputs.right ?? ''}`;
      if (record.operation === 'template') return String(record.template || '{value}').split('{value}').join(value);
      if (record.operation === 'replace') return value.split(String(inputs.search ?? '')).join(String(inputs.replacement ?? ''));
      if (record.operation === 'lower') return value.toLowerCase();
      if (record.operation === 'upper') return value.toUpperCase();
      if (record.operation === 'trim') return value.trim();
      throw new Error(`Process node ${record.id} uses unsupported string operation ${record.operation}`);
    });
  }
  if (record.kind === 'compare') {
    return mapStructured(inputs.left, left => compareValue(record.operation, left, inputs.right));
  }
  if (record.kind === 'logic') {
    if (record.operation === 'not') return mapStructured(inputs.left, value => !value);
    return combineStructured(inputs.left, inputs.right, (left, right) => {
      if (record.operation === 'and') return Boolean(left && right);
      if (record.operation === 'or') return Boolean(left || right);
      if (record.operation === 'xor') return Boolean(left) !== Boolean(right);
      throw new Error(`Process node ${record.id} uses unsupported logic operation ${record.operation}`);
    }, record.id);
  }
  if (record.kind === 'entityCondition') {
    return {
      kind: 'comparison',
      typeId: record.typeId,
      path: record.path,
      operation: record.operation,
      value: inputs.value
    };
  }
  if (record.kind === 'predicateLogic') {
    return {
      kind: 'logic',
      typeId: record.typeId,
      operation: record.operation,
      left: inputs.left,
      right: inputs.right
    };
  }
  if (record.kind === 'listLength') {
    if (!Array.isArray(inputs.items)) throw new Error(`Process node ${record.id} requires a list`);
    return inputs.items.length;
  }
  if (record.kind === 'entityRef') {
    if (record.mode === 'current') {
      const entity = await options.resolveEntity?.(record.typeId);
      if (entity == null) throw new Error(`Process node ${record.id} could not resolve ${record.typeId}`);
      return entity;
    }
    if (!options.resolveEntityReference) throw new Error(`Process node ${record.id} requires entity traversal support`);
    return await options.resolveEntityReference(record, inputs.entity);
  }
  throw new Error(`Process node ${record.id} uses unsupported operation ${record.kind}:${record.operation || record.mode || ''}`);
}

function bindActionInput(result, action, input, value) {
  if (input.kind === 'entity' || input.typeId) {
    const bound = entityReference(value, input.typeId);
    result.entities[input.typeId || input.id] = bound;
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
  if (Array.isArray(value)) return value.map(item => entityReference(item, fallbackType));
  if (!value || typeof value !== 'object') return value;
  if (value.type && value.id) return { ...value };
  const id = value.identity?.uid || value._id || value.id;
  return id ? { type: fallbackType || value.type || value.typeId || '', id: String(id) } : value;
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

function parseValue(value, kind, structure = 'item') {
  if (structure === 'list') {
    const values = Array.isArray(value) ? value : JSON.parse(String(value || '[]'));
    if (!Array.isArray(values)) throw new Error('List value must be a JSON array');
    return values.map(item => parseValue(item, kind));
  }
  return castValue(value, kind);
}

function castValue(value, kind) {
  if (kind === 'number') {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Cannot parse ${value} as number`);
    return parsed;
  }
  if (kind === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`Cannot parse ${value} as boolean`);
  }
  if (kind === 'json' || kind === 'object') return typeof value === 'string' ? JSON.parse(value) : clone(value);
  if (kind === 'date') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error(`Cannot parse ${value} as date`);
    return parsed.toISOString();
  }
  return value == null ? '' : String(value);
}

function compareValue(operation, left, right) {
  if (operation === 'exists') return left !== null && left !== undefined && left !== '';
  if (operation === 'eq') return left === right;
  if (operation === 'neq') return left !== right;
  if (operation === 'gt') return left > right;
  if (operation === 'gte') return left >= right;
  if (operation === 'lt') return left < right;
  if (operation === 'lte') return left <= right;
  if (operation === 'contains') return String(left).includes(String(right));
  throw new Error(`Unsupported comparison operation ${operation}`);
}

function mapStructured(value, mapper) {
  return Array.isArray(value) ? value.map(mapper) : mapper(value);
}

function combineStructured(left, right, mapper, nodeId) {
  if (!Array.isArray(left) && !Array.isArray(right)) return mapper(left, right);
  if (Array.isArray(left) && !Array.isArray(right)) return left.map(value => mapper(value, right));
  if (!Array.isArray(left) && Array.isArray(right)) return right.map(value => mapper(left, value));
  assertParallelLists(left, right, nodeId);
  return left.map((value, index) => mapper(value, right[index]));
}

function assertParallelLists(left, right, nodeId) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    throw new Error(`Process node ${nodeId} requires parallel lists with equal lengths`);
  }
}

function evaluatePredicate(predicate, entity) {
  if (!predicate || typeof predicate !== 'object') throw new Error('Entity filter requires a predicate');
  if (predicate.kind === 'comparison') {
    return compareValue(predicate.operation, readPath(entity, predicate.path), predicate.value);
  }
  if (predicate.kind === 'logic') {
    if (predicate.operation === 'not') return !evaluatePredicate(predicate.left, entity);
    const left = evaluatePredicate(predicate.left, entity);
    const right = evaluatePredicate(predicate.right, entity);
    if (predicate.operation === 'and') return left && right;
    if (predicate.operation === 'or') return left || right;
    if (predicate.operation === 'xor') return left !== right;
  }
  throw new Error(`Unsupported entity predicate ${predicate.kind}:${predicate.operation || ''}`);
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
