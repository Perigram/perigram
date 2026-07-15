const HANDLE_PREFIXES = ['input:', 'output:', 'data:'];

export function normalizePortSpec(io = {}, fallback = {}) {
  const source = io && typeof io === 'object' ? io : {};
  const kind = normalizePortKind(source.kind, source, fallback);
  const entityType = source.entityType || fallback.entityType || '';
  const multiple = Boolean(source.multiple || kind === 'entity_list');
  return {
    id: String(source.id || fallback.id || ''),
    label: source.label || source.entityType || source.kind || fallback.label || source.id || fallback.id || '',
    kind: multiple && kind === 'entity' ? 'entity_list' : kind,
    entityType,
    block: source.block || fallback.block || '',
    dataPath: source.dataPath || source.path || fallback.dataPath || '',
    capability: source.capability || fallback.capability || '',
    accepts: Array.isArray(source.accepts) ? [...source.accepts] : [],
    multiple,
    optional: Boolean(source.optional || source.required === false || fallback.optional),
    required: Boolean(source.required),
    projection: Boolean(source.projection || kind === 'projection')
  };
}

export function portSpecsCompatible(source = {}, target = {}) {
  const sourceSpec = normalizePortSpec(source);
  const targetSpec = normalizePortSpec(target);
  if (!sourceSpec.kind || !targetSpec.kind) return { ok: true };

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
  if (node.type === 'action' && direction === 'input' && ['changeStatus', 'updateEntity'].includes(record.actionKind) && handleId === 'entity') {
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
  if (type === 'processNode') return processNodeOutputPorts(record);
  if (type === 'action') {
    return [
      ...(record.outputs || []).map(port => normalizePortSpec(port)),
      ...(record.events || []).map(port => normalizePortSpec({ ...port, kind: 'event' }))
    ];
  }
  if (Array.isArray(record.outputs) && record.outputs.length) return record.outputs.map(port => normalizePortSpec(port));
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
  if (Array.isArray(record.inputs) && record.inputs.length) return record.inputs.map(port => normalizePortSpec(port));
  if (record.kind === 'entityRef' && ['parent', 'children', 'related'].includes(record.mode)) {
    return [normalizePortSpec({ id: 'entity', label: record.entityType || 'entity', kind: 'entity', entityType: record.entityType || '' })];
  }
  if (record.kind === 'fieldRead') {
    return [normalizePortSpec({ id: 'entity', label: record.entityType || 'entity', kind: 'entity', entityType: record.entityType || '' })];
  }
  if (record.kind === 'blockRead') {
    return [normalizePortSpec({ id: 'block', label: record.block || 'block', kind: 'block', block: record.block || '' })];
  }
  if (record.kind === 'stringOp') {
    return [normalizePortSpec({ id: 'value', label: 'value', kind: 'data' })];
  }
  if (record.kind === 'compare') {
    return [
      normalizePortSpec({ id: 'left', label: 'left', kind: 'data' }),
      normalizePortSpec({ id: 'right', label: 'right', kind: 'data', optional: true })
    ];
  }
  if (record.kind === 'logic') {
    return [
      normalizePortSpec({ id: 'left', label: 'left', kind: 'data' }),
      normalizePortSpec({ id: 'right', label: 'right', kind: 'data', optional: record.operation === 'not' })
    ];
  }
  if (record.kind === 'collection') {
    return [normalizePortSpec({ id: 'items', label: record.entityType || 'items', kind: 'entity_list', entityType: record.entityType || '' })];
  }
  return [];
}

function processNodeOutputPorts(record = {}) {
  if (Array.isArray(record.outputs) && record.outputs.length) return record.outputs.map(port => normalizePortSpec(port));
  if (record.kind === 'entityRef') {
    const outputType = record.mode === 'children' || record.mode === 'related' ? 'entity_list' : 'entity';
    const entityType = record.relationEntityType || record.entityType || '';
    return [normalizePortSpec({ id: 'entity', label: entityType || outputType, kind: outputType, entityType })];
  }
  if (record.kind === 'fieldRead') {
    return processBlockPorts();
  }
  if (record.kind === 'blockRead') {
    return [normalizePortSpec({ id: 'value', label: record.path || 'value', kind: record.valueType || 'data', block: record.block || '', dataPath: record.path || '' })];
  }
  if (record.kind === 'collection' && record.operation === 'first') {
    return [normalizePortSpec({ id: 'entity', label: record.entityType || 'entity', kind: 'entity', entityType: record.entityType || '' })];
  }
  if (record.kind === 'collection' && record.operation === 'count') {
    return [normalizePortSpec({ id: 'count', label: 'count', kind: 'number' })];
  }
  if (record.kind === 'compare' || record.kind === 'logic') {
    return [normalizePortSpec({ id: 'result', label: 'result', kind: 'boolean' })];
  }
  if (record.kind === 'stringOp') {
    return [normalizePortSpec({ id: 'value', label: 'value', kind: 'string' })];
  }
  return [];
}

function processBlockPorts() {
  return ['identity', 'status', 'lineage', 'data', 'specs', 'summary', 'attachments']
    .map(block => normalizePortSpec({ id: block, label: block, kind: 'block', block }));
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
    entity: 'entityProfiles',
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
  if (['entity_list', 'entity', 'block', 'data', 'status', 'event', 'projection', 'attachment', 'task'].includes(kind)) return kind;
  if (io.projection) return 'projection';
  if (io.block) return 'block';
  if (io.entityType) return io.multiple ? 'entity_list' : 'entity';
  if (kind === 'object') return 'data';
  if (['string', 'number', 'boolean', 'json'].includes(kind)) return 'data';
  if (io.dataPath || io.path) return 'data';
  if (fallback.kind) return fallback.kind;
  return '';
}

function valueInputKind(input = {}) {
  if (input.block) return input.block === 'statusMeta' ? 'data' : 'block';
  if (['string', 'number', 'boolean', 'object', 'json'].includes(input.valueType)) return 'data';
  return input.valueType || 'data';
}

function dataCompatible(source, target) {
  if (source.kind === 'data' && ['data', 'block'].includes(target.kind)) return { ok: true };
  if (source.kind === 'block' && ['data', 'block'].includes(target.kind)) return blockCompatible(source, target);
  return incompatible(source, target);
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
