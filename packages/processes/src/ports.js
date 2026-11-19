import { CANONICAL_ENTITY_BLOCKS } from '@perigram/core';
import { PROCESS_PROTOCOL_VERSION, processTypesCompatible, formatProcessType } from './types.js';

const HANDLE_PREFIXES = ['input:', 'output:', 'data:', 'control:'];
export const PROCESS_SCALAR_KINDS = Object.freeze(['string', 'number', 'boolean', 'json', 'date']);
export const PROCESS_STRUCTURES = Object.freeze(['item', 'list', 'tree']);
export const PROCESS_DATAFLOW_VERSION = PROCESS_PROTOCOL_VERSION;

// Socket-handle vocabulary — the single home for minting and parsing
// canvas socket handles. A process socket's handle is `data:<id>` or
// `control:<id>` by port role; the parse side also strips the legacy
// `input:`/`output:` spellings older drafts persisted, so those edges keep
// resolving to their ports. Nothing else should regex a handle.
export function mintProcessSocketHandle(item = {}) {
  return `${item.role === 'data' ? 'data' : 'control'}:${item.id}`;
}

export function parseProcessSocketHandleId(handle = '') {
  return normalizeHandleId(handle, '');
}

export function isControlProcessSocketHandle(handle = '') {
  return String(handle || '').startsWith('control:');
}

// An edge is a data-input edge iff its target handle carries a data-plane
// prefix (`data:` today, `input:` in older drafts). Bare and `control:`
// handles are not data inputs.
export function isProcessDataHandle(handle = '') {
  const value = String(handle || '');
  return value.startsWith('data:') || value.startsWith('input:');
}

export function normalizePortSpec(io = {}, fallback = {}) {
  const source = io && typeof io === 'object' ? io : {};
  const typed = structuredPortType(source.type);
  const normalizedSource = { ...typed, ...source };
  let kind = normalizePortKind(source.kind || typed.kind, normalizedSource, fallback);
  // Access is the socket's consumption contract (Item/List/Tree): a
  // list-access data or scalar socket IS a list port. The kind model
  // predates the access qualifier; without this read, activation's edge
  // gate and the canvas gate disagree about the same wire.
  if (source.access === 'list' && kind !== 'list'
    && !['entity', 'entity_list', 'block', 'block_list', 'status', 'predicate', 'event', 'attachment', 'task', 'projection'].includes(kind)) {
    kind = 'list';
  }
  const typeId = source.typeId || typed.typeId || fallback.typeId || '';
  const multiple = Boolean(source.multiple || typed.multiple || kind === 'entity_list');
  return {
    id: String(source.id || fallback.id || ''),
    label: source.label || source.typeId || source.kind || fallback.label || source.id || fallback.id || '',
    kind: multiple && kind === 'entity' ? 'entity_list' : kind,
    ...(typed.base ? { base: typed.base } : {}),
    ...(source.type ? { type: source.type } : {}),
    typeId,
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
      return { kind: 'entity_list', base: type.base, typeId: item.typeId || '', multiple: true };
    }
    return { kind: 'list', base: type.base, multiple: true };
  }
  if (['entity', 'entityRef'].includes(type.base)) {
    return { kind: 'entity', base: type.base, typeId: type.typeId || '', multiple: false };
  }
  if (type.base === 'block') return { kind: 'block', base: type.base, block: type.block || '', multiple: false };
  if (['status', 'predicate', 'event'].includes(type.base)) {
    return { kind: type.base, base: type.base, typeId: type.typeId || '' };
  }
  if (type.base === 'attachmentRef') return { kind: 'attachment', base: type.base };
  if (type.base === 'taskRef') return { kind: 'task', base: type.base };
  if (type.base === 'dateTime') return { kind: 'date', base: type.base };
  return { kind: PROCESS_SCALAR_KINDS.includes(type.base) ? type.base : 'data', base: type.base };
}

const VALUE_PLANE_KINDS = new Set(['data', 'list', ...PROCESS_SCALAR_KINDS, ...PROCESS_SCALAR_KINDS.map(kind => `${kind}_list`)]);
const baseOfPort = spec => spec.type?.base || spec.base
  || (PROCESS_SCALAR_KINDS.includes(spec.kind) ? spec.kind : '');

// One coercion law for both gates (SPEC §20 wire law): when the kind
// lattice would refuse a value-plane pair, the base lattice decides —
// the canvas connect gate and edge validation accept the same wires.
function valuePlaneCompatible(source, target) {
  if (!VALUE_PLANE_KINDS.has(source.kind) || !VALUE_PLANE_KINDS.has(target.kind)) return { ok: false };
  const sourceBase = baseOfPort(source);
  const targetBase = baseOfPort(target);
  if (!sourceBase || !targetBase) return { ok: false };
  return processTypesCompatible(latticeType(source, sourceBase), latticeType(target, targetBase));
}

// The port's structured type is the lattice type: its qualifiers (unit,
// enum, schema, value kind) ride it whole.
function latticeType(spec, base) {
  return spec.type?.base ? spec.type : { base, ...(spec.typeId ? { typeId: spec.typeId } : {}) };
}

export function portSpecsCompatible(source = {}, target = {}) {
  const sourceSpec = normalizePortSpec(source);
  const targetSpec = normalizePortSpec(target);
  if (!sourceSpec.kind || !targetSpec.kind) return { ok: true };

  if (targetSpec.kind === 'list') {
    // A list socket consumes list sources and item broadcasts (the
    // access contract's broadcast rule: one item becomes one packet
    // item) — data, scalars, and entity items all broadcast.
    return isListKind(sourceSpec.kind) || ['data', 'entity', ...PROCESS_SCALAR_KINDS].includes(sourceSpec.kind)
      ? { ok: true }
      : incompatible(sourceSpec, targetSpec);
  }
  if (targetSpec.kind === 'data') return dataCompatible(sourceSpec, targetSpec);
  if (targetSpec.kind === 'json' && !targetSpec.type?.kind && ['data', 'list', ...PROCESS_SCALAR_KINDS, ...PROCESS_SCALAR_KINDS.map(value => `${value}_list`)].includes(sourceSpec.kind)) {
    // An unkinded json socket is the value escape: any data-shaped
    // source fits (the same json coercion the socket-contract gate
    // applies).
    return { ok: true };
  }
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
      ? typeIdCompatible(sourceSpec, targetSpec)
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
  if (sourceSpec.kind === targetSpec.kind) {
    // Qualifiers (unit, value kind) are lattice semantics; a typed
    // same-kind pair passes through it.
    if (!VALUE_PLANE_KINDS.has(sourceSpec.kind) || !sourceSpec.type?.base || !targetSpec.type?.base) return { ok: true };
  }
  const coerced = valuePlaneCompatible(sourceSpec, targetSpec);
  if (coerced.ok || coerced.convertible || coerced.reason) return coerced;
  return incompatible(sourceSpec, targetSpec);
}

export function validateProcessEdges(process = {}) {
  const diagnostics = [];
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
      // Anchored like every other graph diagnostic (SPEC §20): the
      // designer focuses the responsible edge from these ids.
      diagnostics.push({
        message: `Edge ${edge.id || `${edge.source}-${edge.target}`} connects incompatible ports ${portLabel(source)} -> ${portLabel(target)}: expected ${portTypeLabel(target)}, received ${portTypeLabel(source)}`,
        edgeId: edge.id || `${edge.source}-${edge.target}`,
        nodeId: String(edge.target),
        socketId: parseProcessSocketHandleId(edge.targetHandle)
      });
    }
  }
  return diagnostics;
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
          typeId: sourceType.typeId,
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
    && primary.typeId) {
    next.typeId = primary.typeId;
  }
  if (record.kind === 'predicateLogic' && primary.typeId) next.typeId = primary.typeId;
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
    const entityInput = (record.inputs || []).find(port => port.id === 'entity' || port.typeId);
    return normalizePortSpec(entityInput || { id: 'entity', kind: 'entity' });
  }
  if (node.type === 'stateDefinition' && direction === 'output') {
    return normalizePortSpec({ id: 'status', label: record.label || record.stateId || 'status', kind: 'status' });
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
      normalizePortSpec({ id: 'parent', kind: 'entity', typeId: record.parentTypeId || '', optional: true }),
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
      normalizePortSpec({ id: 'entity', kind: 'entity', typeId: record.typeId || '' }),
      normalizePortSpec({ id: 'data', kind: 'data' }),
      normalizePortSpec({ id: 'block', kind: 'block' })
    ];
  }
  if (type === 'socket' && record.direction === 'inbound') {
    return [normalizePortSpec({ id: 'received', kind: 'entity', typeId: record.typeId || '' })];
  }
  if (type === 'socket') {
    return [normalizePortSpec({ id: 'projection', kind: 'projection', typeId: record.typeId || '', projection: true })];
  }
  return [];
}

function processNodeInputPorts(record = {}) {
  if (record.kind === 'entityRef' && ['parent', 'children', 'related'].includes(record.mode)) {
    return [normalizePortSpec({ id: 'entity', label: record.typeId || 'entity', kind: 'entity', typeId: record.typeId || '', required: true })];
  }
  if (record.kind === 'entityDecompose' || record.kind === 'entityField') {
    return [normalizePortSpec({
      id: 'entity',
      label: record.typeId || 'entity',
      kind: structureKind('entity', record.structure),
      typeId: record.typeId || '',
      required: true
    })];
  }
  if (record.kind === 'entityFilter') {
    return [
      normalizePortSpec({ id: 'entities', label: record.typeId || 'entities', kind: 'entity_list', typeId: record.typeId || '', required: true }),
      normalizePortSpec({ id: 'predicate', label: 'where', kind: 'predicate', typeId: record.typeId || '', required: true })
    ];
  }
  if (record.kind === 'entitySelect') {
    return [
      normalizePortSpec({ id: 'entities', label: record.typeId || 'entities', kind: 'entity_list', typeId: record.typeId || '', required: true }),
      ...(record.operation === 'index' ? [normalizePortSpec({ id: 'index', label: 'index', kind: 'number', required: true })] : [])
    ];
  }
  if (record.kind === 'entityCompose') {
    const declaredBlocks = (record.inputs || []).filter(port => ['block', 'block_list'].includes(port.kind) && port.block);
    if (declaredBlocks.length) return declaredBlocks.map(port => normalizePortSpec({ ...port, required: false }));
    return processBlockPorts(record.typeId, 'item').map(port => normalizePortSpec({ ...port, required: false }));
  }
  if (record.kind === 'entityModify') {
    return [
      normalizePortSpec({ id: 'entity', label: record.typeId || 'entity', kind: 'entity', typeId: record.typeId || '', required: true }),
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
      return [normalizePortSpec({ id: 'left', label: 'predicate', kind: 'predicate', typeId: record.typeId || '', required: true })];
    }
    return [
      normalizePortSpec({ id: 'left', label: 'left', kind: 'predicate', typeId: record.typeId || '', required: true }),
      normalizePortSpec({ id: 'right', label: 'right', kind: 'predicate', typeId: record.typeId || '', required: true })
    ];
  }
  if (record.kind === 'listLength') {
    return [normalizePortSpec({ id: 'items', label: 'items', kind: 'list', required: true })];
  }
  return [];
}

function processNodeOutputPorts(record = {}) {
  if (record.kind === 'entityQuery') {
    return [normalizePortSpec({ id: 'entities', label: record.typeId || 'entities', kind: 'entity_list', typeId: record.typeId || '' })];
  }
  if (record.kind === 'entityRef') {
    const outputType = ['children', 'related'].includes(record.mode) ? 'entity_list' : 'entity';
    const typeId = record.relationTypeId || record.typeId || '';
    return [normalizePortSpec({ id: 'entity', label: typeId || outputType, kind: outputType, typeId })];
  }
  if (record.kind === 'entityDecompose') {
    const declaredBlocks = (record.outputs || []).filter(port => ['block', 'block_list'].includes(port.kind) && port.block);
    if (declaredBlocks.length) return declaredBlocks.map(port => normalizePortSpec(port));
    return processBlockPorts(record.typeId, record.structure);
  }
  if (record.kind === 'entityField') {
    return [normalizePortSpec({ id: 'value', label: record.path || 'value', kind: structureKind(scalarValueKind(record), record.structure), dataPath: record.path || '' })];
  }
  if (record.kind === 'entityFilter') {
    return [normalizePortSpec({ id: 'entities', label: record.typeId || 'entities', kind: 'entity_list', typeId: record.typeId || '' })];
  }
  if (record.kind === 'entityCondition' || record.kind === 'predicateLogic') {
    return [normalizePortSpec({ id: 'predicate', label: 'predicate', kind: 'predicate', typeId: record.typeId || '' })];
  }
  if (record.kind === 'entitySelect') {
    return [normalizePortSpec({ id: 'entity', label: record.typeId || 'entity', kind: 'entity', typeId: record.typeId || '' })];
  }
  if (record.kind === 'entityCompose' || record.kind === 'entityModify') {
    return [normalizePortSpec({ id: 'entity', label: record.typeId || 'entity', kind: 'entity', typeId: record.typeId || '' })];
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

function processBlockPorts(typeId = '', structure = 'item') {
  return CANONICAL_ENTITY_BLOCKS
    .map(block => normalizePortSpec({ id: block, label: block, kind: structureKind('block', structure), block, typeId }));
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
    stateDefinition: 'stateDefinitions',
    valueInput: 'valueInputs',
    processNode: 'processNodes'
  }[node.type];
  return key ? process[key]?.[refId] : null;
}

function normalizePortKind(kind = '', io = {}, fallback = {}) {
  if (['entity_list', 'entity', 'block', 'block_list', 'data', 'list', 'predicate', 'status', 'event', 'projection', 'attachment', 'task', ...PROCESS_SCALAR_KINDS, ...PROCESS_SCALAR_KINDS.map(value => `${value}_list`)].includes(kind)) return kind;
  if (io.projection) return 'projection';
  if (io.block) return 'block';
  if (io.typeId) return io.multiple ? 'entity_list' : 'entity';
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
  // A generic data socket accepts every data-shaped source, lists
  // included: the value's structure is the runtime mapper's concern
  // (access + matching), not a kind mismatch.
  if (target.kind === 'data' && ['data', 'list', ...PROCESS_SCALAR_KINDS, ...PROCESS_SCALAR_KINDS.map(value => `${value}_list`)].includes(source.kind)) return { ok: true };
  if (source.kind === 'data' && target.kind === 'data') return { ok: true };
  if (source.kind === 'block' && ['data', 'block'].includes(target.kind)) return blockCompatible(source, target);
  const coerced = valuePlaneCompatible(source, target);
  return coerced.ok || coerced.convertible || coerced.reason ? coerced : incompatible(source, target);
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
  // Item sources broadcast into collection sockets (the shared effect
  // mapper's broadcast rule): entity -> entity_list is the same wire as
  // entity_list -> entity, typed by the element contract.
  if (source.kind !== target.kind && ['entity', 'entity_list'].includes(source.kind)
    && ['entity', 'entity_list'].includes(target.kind)) {
    return typeIdCompatible(source, target);
  }
  if (source.kind !== target.kind) return incompatible(source, target);
  return typeIdCompatible(source, target);
}

function typeIdCompatible(source, target) {
  if (target.accepts.length) {
    if (!source.typeId || target.accepts.includes(source.typeId) || target.accepts.includes(source.capability)) return { ok: true };
    return incompatible(source, target);
  }
  if (target.capability && source.capability && target.capability !== source.capability) return incompatible(source, target);
  if (!source.typeId || !target.typeId || source.typeId === target.typeId) return { ok: true };
  return incompatible(source, target);
}

function incompatible(source, target) {
  return { ok: false, source, target };
}

function portLabel(port = {}) {
  return port.label || [port.kind, port.typeId || port.block || port.dataPath || port.id].filter(Boolean).join(':') || 'port';
}

function portTypeLabel(port = {}) {
  const base = baseOfPort(port);
  if (!base) return port.kind || 'value';
  return formatProcessType({ base, typeId: port.typeId, unit: port.type?.unit });
}
