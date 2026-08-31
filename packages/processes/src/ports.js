import { CANONICAL_ENTITY_BLOCKS } from '../../core/src/index.js';
import { PROCESS_PROTOCOL_VERSION } from './types.js';

const HANDLE_PREFIXES = ['input:', 'output:', 'data:'];
export const PROCESS_SCALAR_KINDS = Object.freeze(['string', 'number', 'boolean', 'json', 'date']);
export const PROCESS_STRUCTURES = Object.freeze(['item', 'list', 'tree']);
export const PROCESS_DATAFLOW_VERSION = PROCESS_PROTOCOL_VERSION;

export function normalizePortSpec(io = {}, fallback = {}) {
  const source = io && typeof io === 'object' ? io : {};
  const typed = structuredPortType(source.type);
  const normalizedSource = { ...typed, ...source };
  const kind = normalizePortKind(source.kind || typed.kind, normalizedSource, fallback);
  const entityType = source.entityType || typed.entityType || fallback.entityType || '';
  const multiple = Boolean(source.multiple || typed.multiple || kind === 'entity_list');
  return {
    id: String(source.id || fallback.id || ''),
    label: source.label || source.entityType || source.kind || fallback.label || source.id || fallback.id || '',
    kind: multiple && kind === 'entity' ? 'entity_list' : kind,
    entityType,
    block: source.block || typed.block || fallback.block || '',
    dataPath: source.dataPath || source.path || fallback.dataPath || '',
    capability: source.capability || fallback.capability || '',
    accepts: Array.isArray(source.accepts) ? [...source.accepts] : [],
    multiple,
    optional: Boolean(source.optional || source.required === false || fallback.optional),
    required: Boolean(source.required === true || (source.required == null && fallback.required === true)),
    projection: Boolean(source.projection || kind === 'projection')
  };
}

function structuredPortType(type) {
  if (!type || typeof type !== 'object') return {};
  if (type.base === 'array') {
    const item = type.itemType || {};
    if (['entity', 'entityRef'].includes(item.base)) {
      return { kind: 'entity_list', entityType: item.entityType || '', multiple: true };
    }
    return { kind: 'list', multiple: true };
  }
  if (['entity', 'entityRef'].includes(type.base)) {
    return { kind: 'entity', entityType: type.entityType || '', multiple: false };
  }
  if (type.base === 'block') return { kind: 'block', block: type.block || '', multiple: false };
  if (['status', 'predicate', 'event'].includes(type.base)) {
    return { kind: type.base, entityType: type.entityType || '' };
  }
  if (type.base === 'attachmentRef') return { kind: 'attachment' };
  if (type.base === 'taskRef') return { kind: 'task' };
  if (type.base === 'dateTime') return { kind: 'date' };
  return { kind: PROCESS_SCALAR_KINDS.includes(type.base) ? type.base : 'data' };
}

export function portSpecsCompatible(source = {}, target = {}) {
  const sourceSpec = normalizePortSpec(source);
  const targetSpec = normalizePortSpec(target);
  if (!sourceSpec.kind || !targetSpec.kind) return { ok: true };

  if (targetSpec.kind === 'list') return isListKind(sourceSpec.kind) ? { ok: true } : incompatible(sourceSpec, targetSpec);
  if (targetSpec.kind === 'data') return dataCompatible(sourceSpec, targetSpec);
  if (sourceSpec.kind === 'data') return dataCompatible(sourceSpec, targetSpec);
  if (sourceSpec.kind === 'projection' || targetSpec.kind === 'projection') {
    return sourceSpec.kind === targetSpec.kind
      ? entityLikeCompatible(sourceSpec, targetSpec)
      : incompatible(sourceSpec, targetSpec);
  }
  if (sourceSpec.kind === 'event' || targetSpec.kind === 'event') {
    return sourceSpec.kind === 'event' && targetSpec.kind === 'event'
      ? { ok: true }
      : incompatible(sourceSpec, targetSpec);
  }
  if (sourceSpec.kind === 'status' || targetSpec.kind === 'status') {
    return sourceSpec.kind === 'status' && targetSpec.kind === 'status'
      ? { ok: true }
      : incompatible(sourceSpec, targetSpec);
  }
  if (sourceSpec.kind === 'predicate' || targetSpec.kind === 'predicate') {
    return sourceSpec.kind === 'predicate' && targetSpec.kind === 'predicate'
      ? entityTypeCompatible(sourceSpec, targetSpec)
      : incompatible(sourceSpec, targetSpec);
  }
  if (['block', 'block_list'].includes(sourceSpec.kind) || ['block', 'block_list'].includes(targetSpec.kind)) {
    return sourceSpec.kind === targetSpec.kind
      ? blockCompatible(sourceSpec, targetSpec)
      : incompatible(sourceSpec, targetSpec);
  }
  if (['entity', 'entity_list'].includes(sourceSpec.kind) || ['entity', 'entity_list'].includes(targetSpec.kind)) {
    return entityLikeCompatible(sourceSpec, targetSpec);
  }
  if (sourceSpec.kind === targetSpec.kind) return { ok: true };
  return incompatible(sourceSpec, targetSpec);
}

export function validateProcessEdges(process = {}) {
  const errors = [];
  const nodesById = new Map((process.graph?.nodes || []).map(node => [String(node.id), node]));
  for (const edge of process.graph?.edges || []) {
    const sourceNode = nodesById.get(String(edge.source));
    const targetNode = nodesById.get(String(edge.target));
    if (!sourceNode || !targetNode) continue;
    const source = resolveNodePort(process, sourceNode, edge.sourceHandle, 'output');
    const target = resolveNodePort(process, targetNode, edge.targetHandle, 'input');
    if (!source || !target) continue;
    const result = portSpecsCompatible(source, target);
    if (!result.ok) {
      errors.push(`Edge ${edge.id || `${edge.source}-${edge.target}`} connects incompatible ports ${portLabel(source)} -> ${portLabel(target)}`);
    }
  }
  return errors;
}

export function inferProcessDataflowContracts(process = {}) {
  const inferred = {
    ...process,
    processNodes: Object.fromEntries(Object.entries(process.processNodes || {})
      .map(([id, record]) => [id, { ...record }]))
  };
  const graphNodes = new Map((inferred.graph?.nodes || []).map(node => [String(node.id), node]));
  const processNodeIds = new Map((inferred.graph?.nodes || [])
    .filter(node => node.type === 'processNode')
    .map(node => [String(node.id), String(node.data?.refId || node.id)]));
  const passes = Math.max(1, processNodeIds.size);

  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false;
    for (const [graphNodeId, recordId] of processNodeIds) {
      const record = inferred.processNodes[recordId];
      if (!record) continue;
      const incoming = incomingContracts(inferred, graphNodeId, graphNodes);
      const next = inferRecordContract(record, incoming);
      if (JSON.stringify(next) !== JSON.stringify(record)) {
        inferred.processNodes[recordId] = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return inferred;
}

export function resolveProcessNodePorts(record = {}) {
  return {
    inputs: processNodeInputPorts(record),
    outputs: processNodeOutputPorts(record)
  };
}

function incomingContracts(process, targetNodeId, graphNodes) {
  const contracts = {};
  for (const edge of process.graph?.edges || []) {
    if (String(edge.target) !== String(targetNodeId)) continue;
    const sourceNode = graphNodes.get(String(edge.source));
    if (!sourceNode) continue;
    const sourceRecord = recordForNode(process, sourceNode);
    const sourceType = sourceRecord?.type;
      const inferredSource = sourceRecord?.kind?.startsWith('source.') && sourceType?.base
      ? normalizePortSpec({
          id: normalizeHandleId(edge.sourceHandle, 'output') || 'value',
          label: sourceRecord.label || sourceRecord.id || 'value',
          kind: sourceType.base,
          entityType: sourceType.entityType,
          multiple: false
        })
      : resolveNodePort(process, sourceNode, edge.sourceHandle, 'output');
    if (!inferredSource) continue;
    const inputId = normalizeHandleId(edge.targetHandle, 'input') || 'input';
    contracts[inputId] = inferredSource;
  }
  return contracts;
}

function inferRecordContract(record, incoming) {
  const next = { ...record };
  const primaryId = {
    entityDecompose: 'entity',
    entityField: 'entity',
    entityFilter: 'entities',
    entitySelect: 'entities',
    entityModify: 'entity',
    blockRead: 'block',
    blockModify: 'block',
    cast: 'value',
    fallback: 'value',
    stringOp: 'value',
    compare: 'left',
    logic: 'left',
    predicateLogic: 'left',
    listLength: 'items'
  }[record.kind];
  const primary = incoming[primaryId] || (Object.keys(incoming).length === 1 ? Object.values(incoming)[0] : null);
  if (!primary) {
    if ([
      'entityDecompose', 'entityField', 'blockRead', 'cast', 'fallback',
      'stringOp', 'compare', 'logic'
    ].includes(record.kind)) next.structure = 'item';
    return next;
  }

  if ([
    'entityDecompose', 'entityField', 'blockRead', 'cast', 'fallback',
    'stringOp', 'compare', 'logic'
  ].includes(record.kind)) {
    next.structure = isListKind(primary.kind) ? 'list' : 'item';
  }
  if (['fallback', 'compare'].includes(record.kind)) {
    const valueType = scalarKindForPort(primary.kind);
    if (valueType) next.valueType = valueType;
  }
  if (['entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityModify'].includes(record.kind)
    && primary.entityType) {
    next.entityType = primary.entityType;
  }
  if (record.kind === 'predicateLogic' && primary.entityType) next.entityType = primary.entityType;
  if (record.kind === 'blockRead' && primary.block) next.block = primary.block;
  return next;
}

export function resolveNodePort(process = {}, node = {}, handle = '', direction = 'output') {
  const record = recordForNode(process, node);
  if (!record) return null;
  const handleId = normalizeHandleId(handle, direction);
  if (node.type === 'action' && direction === 'input' && handleId === 'trigger') {
    return normalizePortSpec({ id: 'trigger', label: 'event', kind: 'event' });
  }
  if (node.type === 'action' && direction === 'output' && handleId === 'event') {
    return normalizePortSpec({ id: 'event', label: 'event', kind: 'event' });
  }
  if (node.type === 'action' && direction === 'input' && record.actionKind === 'createEntity' && handleId === 'parent') {
    return normalizePortSpec({ id: 'parent', label: 'Parent entity', kind: 'entity', optional: true });
  }
  if (node.type === 'action' && direction === 'input' && record.actionKind === 'updateEntity' && handleId === 'entity') {
    const entityInput = (record.inputs || []).find(port => port.id === 'entity' || port.entityType);
    return normalizePortSpec(entityInput || { id: 'entity', kind: 'entity' });
  }
  if (node.type === 'statusDefinition' && direction === 'output') {
    return normalizePortSpec({ id: 'status', label: record.label || record.statusId || 'status', kind: 'status' });
  }
  if (node.type === 'valueInput' && direction === 'output') {
    return normalizePortSpec({
      id: 'value',
      label: record.label || record.path || record.id,
      kind: valueInputKind(record),
      block: record.block,
      dataPath: record.path
    });
  }
  const ports = direction === 'input'
    ? inputPortsForRecord(node.type, record)
    : outputPortsForRecord(node.type, record);
  if (!ports.length) return null;
  return findPortForHandle(ports, handle, direction) || null;
}

function inputPortsForRecord(type, record = {}) {
  if (Array.isArray(record.inputs) && record.inputs.length) return record.inputs.map(port => normalizePortSpec(port));
  if (type === 'entity') {
    return [
      normalizePortSpec({ id: 'status', kind: 'status' }),
      normalizePortSpec({ id: 'data', kind: 'data' }),
      normalizePortSpec({ id: 'block', kind: 'block' })
    ];
  }
  if (type === 'action' && record.actionKind === 'createEntity') {
    return [
      normalizePortSpec({ id: 'parent', kind: 'entity', entityType: record.parentEntityType || '', optional: true }),
      normalizePortSpec({ id: 'status', kind: 'status' })
    ];
  }
  if (type === 'processNode') return processNodeInputPorts(record);
  return [];
}

function outputPortsForRecord(type, record = {}) {
  if (Array.isArray(record.outputs) && record.outputs.length) return record.outputs.map(port => normalizePortSpec(port));
  if (type === 'processNode') return processNodeOutputPorts(record);
  if (type === 'action') {
    return [
      ...(record.outputs || []).map(port => normalizePortSpec(port)),
      ...(record.events || []).map(port => normalizePortSpec({ ...port, kind: 'event' }))
    ];
  }
  if (type === 'entity') {
    return [
      normalizePortSpec({ id: 'entity', kind: 'entity', entityType: record.entityType || '' }),
      normalizePortSpec({ id: 'data', kind: 'data' }),
      normalizePortSpec({ id: 'block', kind: 'block' })
    ];
  }
  if (type === 'socket' && record.direction === 'inbound') {
    return [normalizePortSpec({ id: 'received', kind: 'entity', entityType: record.entityType || '' })];
  }
  if (type === 'socket') {
    return [normalizePortSpec({ id: 'projection', kind: 'projection', entityType: record.entityType || '', projection: true })];
  }
  return [];
}

function processNodeInputPorts(record = {}) {
  if (record.kind === 'entityRef' && ['parent', 'children', 'related'].includes(record.mode)) {
    return [normalizePortSpec({ id: 'entity', label: record.entityType || 'entity', kind: 'entity', entityType: record.entityType || '', required: true })];
  }
  if (record.kind === 'entityDecompose' || record.kind === 'entityField') {
    return [normalizePortSpec({
      id: 'entity',
      label: record.entityType || 'entity',
      kind: structureKind('entity', record.structure),
      entityType: record.entityType || '',
      required: true
    })];
  }
  if (record.kind === 'entityFilter') {
    return [
      normalizePortSpec({ id: 'entities', label: record.entityType || 'entities', kind: 'entity_list', entityType: record.entityType || '', required: true }),
      normalizePortSpec({ id: 'predicate', label: 'where', kind: 'predicate', entityType: record.entityType || '', required: true })
    ];
  }
  if (record.kind === 'entitySelect') {
    return [
      normalizePortSpec({ id: 'entities', label: record.entityType || 'entities', kind: 'entity_list', entityType: record.entityType || '', required: true }),
      ...(record.operation === 'index' ? [normalizePortSpec({ id: 'index', label: 'index', kind: 'number', required: true })] : [])
    ];
  }
  if (record.kind === 'entityCompose') {
    const declaredBlocks = (record.inputs || []).filter(port => ['block', 'block_list'].includes(port.kind) && port.block);
    if (declaredBlocks.length) return declaredBlocks.map(port => normalizePortSpec({ ...port, required: false }));
    return processBlockPorts(record.entityType, 'item').map(port => normalizePortSpec({ ...port, required: false }));
  }
  if (record.kind === 'entityModify') {
    return [
      normalizePortSpec({ id: 'entity', label: record.entityType || 'entity', kind: 'entity', entityType: record.entityType || '', required: true }),
      normalizePortSpec({ id: 'block', label: record.block || 'block', kind: 'block', block: record.block || '', required: true })
    ];
  }
  if (record.kind === 'blockRead') {
    return [normalizePortSpec({ id: 'block', label: record.block || 'block', kind: structureKind('block', record.structure), block: record.block || '', required: true })];
  }
  if (record.kind === 'blockCompose') {
    return [normalizePortSpec({ id: 'value', label: record.path || 'value', kind: scalarValueKind(record), dataPath: record.path || '', required: true })];
  }
  if (record.kind === 'blockModify') {
    return [
      normalizePortSpec({ id: 'block', label: record.block || 'block', kind: 'block', block: record.block || '', required: true }),
      normalizePortSpec({ id: 'value', label: record.path || 'value', kind: scalarValueKind(record), dataPath: record.path || '', required: true })
    ];
  }
  if (record.kind === 'cast') {
    return [normalizePortSpec({ id: 'value', label: 'value', kind: 'data', required: true })];
  }
  if (record.kind === 'fallback') {
    return [
      normalizePortSpec({ id: 'value', label: 'value', kind: structureKind(scalarValueKind(record), record.structure), required: true }),
      normalizePortSpec({ id: 'fallback', label: 'fallback', kind: scalarValueKind(record), required: true })
    ];
  }
  if (record.kind === 'stringOp') {
    const inputKind = structureKind('string', record.structure);
    if (record.operation === 'concat') {
      return [
        normalizePortSpec({ id: 'value', label: 'left', kind: inputKind, required: true }),
        normalizePortSpec({ id: 'right', label: 'right', kind: 'string', required: true })
      ];
    }
    if (record.operation === 'replace') {
      return [
        normalizePortSpec({ id: 'value', label: 'value', kind: inputKind, required: true }),
        ...scalarPorts(['search', 'replacement'], 'string')
      ];
    }
    return [normalizePortSpec({ id: 'value', label: 'value', kind: inputKind, required: true })];
  }
  if (record.kind === 'compare') {
    const leftKind = structureKind(scalarValueKind(record), record.structure);
    if (record.operation === 'exists') {
      return [normalizePortSpec({ id: 'left', label: 'value', kind: leftKind, required: true })];
    }
    const kind = ['gt', 'gte', 'lt', 'lte'].includes(record.operation)
      ? 'number'
      : record.operation === 'contains' ? 'string' : scalarValueKind(record);
    return [
      normalizePortSpec({ id: 'left', label: 'left', kind: structureKind(kind, record.structure), required: true }),
      normalizePortSpec({ id: 'right', label: 'right', kind, required: true })
    ];
  }
  if (record.kind === 'logic') {
    if (record.operation === 'not') {
      return [normalizePortSpec({ id: 'left', label: 'value', kind: structureKind('boolean', record.structure), required: true })];
    }
    return [
      normalizePortSpec({ id: 'left', label: 'left', kind: structureKind('boolean', record.structure), required: true }),
      normalizePortSpec({ id: 'right', label: 'right', kind: structureKind('boolean', record.structure), required: true })
    ];
  }
  if (record.kind === 'entityCondition') {
    const kind = record.operation === 'contains' ? 'string' : scalarValueKind(record);
    return record.operation === 'exists'
      ? []
      : [normalizePortSpec({ id: 'value', label: 'value', kind, required: true })];
  }
  if (record.kind === 'predicateLogic') {
    if (record.operation === 'not') {
      return [normalizePortSpec({ id: 'left', label: 'predicate', kind: 'predicate', entityType: record.entityType || '', required: true })];
    }
    return [
      normalizePortSpec({ id: 'left', label: 'left', kind: 'predicate', entityType: record.entityType || '', required: true }),
      normalizePortSpec({ id: 'right', label: 'right', kind: 'predicate', entityType: record.entityType || '', required: true })
    ];
  }
  if (record.kind === 'listLength') {
    return [normalizePortSpec({ id: 'items', label: 'items', kind: 'list', required: true })];
  }
  return [];
}

function processNodeOutputPorts(record = {}) {
  if (record.kind === 'entityQuery') {
    return [normalizePortSpec({ id: 'entities', label: record.entityType || 'entities', kind: 'entity_list', entityType: record.entityType || '' })];
  }
  if (record.kind === 'entityRef') {
    const outputType = ['children', 'related'].includes(record.mode) ? 'entity_list' : 'entity';
    const entityType = record.relationEntityType || record.entityType || '';
    return [normalizePortSpec({ id: 'entity', label: entityType || outputType, kind: outputType, entityType })];
  }
  if (record.kind === 'entityDecompose') {
    const declaredBlocks = (record.outputs || []).filter(port => ['block', 'block_list'].includes(port.kind) && port.block);
    if (declaredBlocks.length) return declaredBlocks.map(port => normalizePortSpec(port));
    return processBlockPorts(record.entityType, record.structure);
  }
  if (record.kind === 'entityField') {
    return [normalizePortSpec({ id: 'value', label: record.path || 'value', kind: structureKind(scalarValueKind(record), record.structure), dataPath: record.path || '' })];
  }
  if (record.kind === 'entityFilter') {
    return [normalizePortSpec({ id: 'entities', label: record.entityType || 'entities', kind: 'entity_list', entityType: record.entityType || '' })];
  }
  if (record.kind === 'entityCondition' || record.kind === 'predicateLogic') {
    return [normalizePortSpec({ id: 'predicate', label: 'predicate', kind: 'predicate', entityType: record.entityType || '' })];
  }
  if (record.kind === 'entitySelect') {
    return [normalizePortSpec({ id: 'entity', label: record.entityType || 'entity', kind: 'entity', entityType: record.entityType || '' })];
  }
  if (record.kind === 'entityCompose' || record.kind === 'entityModify') {
    return [normalizePortSpec({ id: 'entity', label: record.entityType || 'entity', kind: 'entity', entityType: record.entityType || '' })];
  }
  if (record.kind === 'blockRead') {
    return [normalizePortSpec({ id: 'value', label: record.path || 'value', kind: structureKind(scalarValueKind(record), record.structure), block: record.block || '', dataPath: record.path || '' })];
  }
  if (record.kind === 'blockCompose' || record.kind === 'blockModify') {
    return [normalizePortSpec({ id: 'block', label: record.block || 'block', kind: 'block', block: record.block || '', dataPath: record.path || '' })];
  }
  if (record.kind === 'cast') {
    return [normalizePortSpec({ id: 'value', label: record.valueType || 'value', kind: structureKind(scalarValueKind(record), record.structure) })];
  }
  if (record.kind === 'fallback') {
    return [normalizePortSpec({ id: 'value', label: record.valueType || 'value', kind: structureKind(scalarValueKind(record), record.structure) })];
  }
  if (record.kind === 'listLength') {
    return [normalizePortSpec({ id: 'count', label: 'count', kind: 'number' })];
  }
  if (record.kind === 'compare' || record.kind === 'logic') {
    return [normalizePortSpec({ id: 'result', label: 'result', kind: structureKind('boolean', record.structure) })];
  }
  if (record.kind === 'stringOp') {
    return [normalizePortSpec({ id: 'value', label: 'value', kind: structureKind('string', record.structure) })];
  }
  return [];
}

function processBlockPorts(entityType = '', structure = 'item') {
  return CANONICAL_ENTITY_BLOCKS
    .map(block => normalizePortSpec({ id: block, label: block, kind: structureKind('block', structure), block, entityType }));
}

function findPortForHandle(ports = [], handle = '', direction = 'output') {
  if (ports.length === 1 && (!handle || handle === direction)) return ports[0];
  const id = normalizeHandleId(handle, direction);
  if (!id && ports.length === 1) return ports[0];
  if (id === 'entity') {
    return ports.find(port => ['entity', 'entity_list'].includes(port.kind)) || null;
  }
  return ports.find(port => port.id === id || port.dataPath === id || port.block === id)
    || (ports.length === 1 && !id ? ports[0] : null);
}

function normalizeHandleId(handle = '', direction = 'output') {
  let value = String(handle || '');
  if (!value || value === direction) return '';
  for (const prefix of HANDLE_PREFIXES) {
    if (value.startsWith(prefix)) value = value.slice(prefix.length);
  }
  return value;
}

function recordForNode(process = {}, node = {}) {
  const refId = String(node.data?.refId || node.id || '');
  const key = {
    entity: 'producerOutputs',
    action: 'actions',
    service: 'services',
    socket: 'sockets',
    statusDefinition: 'statusDefinitions',
    valueInput: 'valueInputs',
    processNode: 'processNodes'
  }[node.type];
  return key ? process[key]?.[refId] : null;
}

function normalizePortKind(kind = '', io = {}, fallback = {}) {
  if (['entity_list', 'entity', 'block', 'block_list', 'data', 'list', 'predicate', 'status', 'event', 'projection', 'attachment', 'task', ...PROCESS_SCALAR_KINDS, ...PROCESS_SCALAR_KINDS.map(value => `${value}_list`)].includes(kind)) return kind;
  if (io.projection) return 'projection';
  if (io.block) return 'block';
  if (io.entityType) return io.multiple ? 'entity_list' : 'entity';
  if (kind === 'object') return 'data';
  if (io.dataPath || io.path) return 'data';
  if (fallback.kind) return fallback.kind;
  return '';
}

function valueInputKind(input = {}) {
  const kind = input.valueType === 'object' ? 'json' : scalarValueKind(input);
  return structureKind(kind, input.structure);
}

function dataCompatible(source, target) {
  if (target.kind === 'data' && ['data', ...PROCESS_SCALAR_KINDS, ...PROCESS_SCALAR_KINDS.map(value => `${value}_list`)].includes(source.kind)) return { ok: true };
  if (source.kind === 'data' && target.kind === 'data') return { ok: true };
  if (source.kind === 'block' && ['data', 'block'].includes(target.kind)) return blockCompatible(source, target);
  return incompatible(source, target);
}

function scalarPorts(ids = [], kind = 'string') {
  return ids.map(id => normalizePortSpec({ id, label: id, kind, required: true }));
}

function scalarValueKind(record = {}) {
  return PROCESS_SCALAR_KINDS.includes(record.valueType)
    ? record.valueType
    : 'string';
}

function structureKind(kind = 'string', structure = 'item') {
  if (structure !== 'list') return kind;
  if (kind === 'entity') return 'entity_list';
  if (kind === 'block') return 'block_list';
  return `${kind}_list`;
}

function isListKind(kind = '') {
  return kind === 'list' || kind === 'entity_list' || kind === 'block_list' || kind.endsWith('_list');
}

function scalarKindForPort(kind = '') {
  const scalar = kind.endsWith('_list') ? kind.slice(0, -5) : kind;
  return PROCESS_SCALAR_KINDS.includes(scalar) ? scalar : '';
}

function blockCompatible(source, target) {
  if (!target.block && !target.dataPath) return { ok: true };
  if (source.block && target.block && source.block !== target.block) return incompatible(source, target);
  return { ok: true };
}

function entityLikeCompatible(source, target) {
  if (target.id === 'parent') return { ok: true };
  if (source.kind === 'entity_list' && target.kind === 'entity') {
    return entityTypeCompatible(source, target);
  }
  if (source.kind !== target.kind) return incompatible(source, target);
  return entityTypeCompatible(source, target);
}

function entityTypeCompatible(source, target) {
  if (target.accepts.length) {
    if (!source.entityType || target.accepts.includes(source.entityType) || target.accepts.includes(source.capability)) return { ok: true };
    return incompatible(source, target);
  }
  if (target.capability && source.capability && target.capability !== source.capability) return incompatible(source, target);
  if (!source.entityType || !target.entityType || source.entityType === target.entityType) return { ok: true };
  return incompatible(source, target);
}

function incompatible(source, target) {
  return { ok: false, source, target };
}

function portLabel(port = {}) {
  return port.label || [port.kind, port.entityType || port.block || port.dataPath || port.id].filter(Boolean).join(':') || 'port';
}
