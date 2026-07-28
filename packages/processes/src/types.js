export const PROCESS_PROTOCOL_VERSION = 3;

export const PROCESS_OPERATION_LEVELS = Object.freeze([
  'definition',
  'data',
  'read',
  'effect',
  'control'
]);

export const PROCESS_BASE_TYPES = Object.freeze([
  'null',
  'boolean',
  'integer',
  'number',
  'string',
  'date',
  'dateTime',
  'duration',
  'enum',
  'id',
  'json',
  'record',
  'map',
  'entity',
  'entityRef',
  'revisionRef',
  'block',
  'status',
  'attachmentRef',
  'predicate',
  'patch',
  'event',
  'taskRef',
  'error',
  'void',
  'opaque'
]);

export const PROCESS_DATA_SHAPES = Object.freeze(['item', 'list', 'tree']);
export const PROCESS_SOCKET_ROLES = Object.freeze(['data', 'control', 'success', 'failure']);

export function processType(base = 'json', options = {}) {
  return normalizeProcessType({ base, ...options });
}

export function normalizeProcessType(type = {}) {
  if (!type || typeof type !== 'object' || Array.isArray(type)) {
    throw new Error('Process type must be a structured object');
  }
  const base = PROCESS_BASE_TYPES.includes(type.base) ? type.base : '';
  if (!base) throw new Error(`Unknown process base type ${type.base || '(empty)'}`);
  const shape = PROCESS_DATA_SHAPES.includes(type.shape) ? type.shape : 'item';
  const normalized = {
    base,
    shape,
    nullable: Boolean(type.nullable)
  };
  for (const key of [
    'schema',
    'entityType',
    'block',
    'unit',
    'enumId',
    'opaqueType',
    'attachmentKind',
    'eventType',
    'taskType',
    'capability'
  ]) {
    if (type[key]) normalized[key] = String(type[key]);
  }
  if (Array.isArray(type.accepts) && type.accepts.length) {
    normalized.accepts = [...new Set(type.accepts.map(String))];
  }
  if (type.itemType) normalized.itemType = normalizeProcessType(type.itemType);
  if (type.keyType) normalized.keyType = normalizeProcessType(type.keyType);
  if (type.valueType) normalized.valueType = normalizeProcessType(type.valueType);
  return normalized;
}

export function normalizeProcessSocket(socket = {}, fallback = {}) {
  const source = socket && typeof socket === 'object' ? socket : {};
  const type = source.type || fallback.type;
  if (!type) throw new Error(`Process socket ${source.id || fallback.id || '(unnamed)'} requires a type`);
  const role = PROCESS_SOCKET_ROLES.includes(source.role)
    ? source.role
    : (PROCESS_SOCKET_ROLES.includes(fallback.role) ? fallback.role : 'data');
  return {
    id: String(source.id || fallback.id || ''),
    label: source.label || fallback.label || source.id || fallback.id || '',
    type: normalizeProcessType(type),
    role,
    required: source.required === true || (source.required == null && fallback.required === true),
    multiple: Boolean(source.multiple),
    path: source.path || source.dataPath || fallback.path || '',
    description: source.description || fallback.description || ''
  };
}

export function processTypesCompatible(sourceType, targetType) {
  const source = normalizeProcessType(sourceType);
  const target = normalizeProcessType(targetType);
  const shape = shapeCompatibility(source.shape, target.shape);
  if (!shape.ok) return incompatible(shape.reason, source, target);
  if (source.nullable && !target.nullable) {
    return convertible('value.required', 'Nullable values require an explicit required/coalesce conversion', source, target);
  }
  if (sameQualifiedType(source, target)) {
    return { ok: true, implicit: true, source, target, broadcast: shape.broadcast };
  }
  if (source.base === 'integer' && target.base === 'number') {
    return convertible('value.cast', 'Integer to number conversion must remain visible', source, target);
  }
  if (source.base === 'entity' && target.base === 'entityRef' && sameEntityType(source, target)) {
    return convertible('value.toEntityRef', 'Entity to reference conversion must remain visible', source, target);
  }
  if (source.base === 'date' && target.base === 'dateTime') {
    return convertible('value.cast', 'Date to date-time conversion must remain visible', source, target);
  }
  if (source.base === 'number' && target.base === 'number' && source.unit && target.unit && source.unit !== target.unit) {
    return convertible('value.convertUnit', `Unit conversion ${source.unit} → ${target.unit} must remain visible`, source, target);
  }
  if (target.base === 'json') {
    return convertible('value.toJson', 'Structured values require a visible JSON conversion', source, target);
  }
  return incompatible(`Expected ${formatProcessType(target)}, received ${formatProcessType(source)}`, source, target);
}

export function processSocketsCompatible(sourceSocket, targetSocket) {
  const source = normalizeProcessSocket(sourceSocket);
  const target = normalizeProcessSocket(targetSocket);
  if (source.role !== target.role && !(source.role === 'success' && target.role === 'control')) {
    return {
      ok: false,
      source,
      target,
      reason: `Cannot connect ${source.role} flow to ${target.role} flow`
    };
  }
  if (source.role !== 'data') return { ok: true, implicit: true, source, target };
  return {
    ...processTypesCompatible(source.type, target.type),
    source,
    target
  };
}

export function formatProcessType(type = {}) {
  const normalized = normalizeProcessType(type);
  const qualifier = normalized.entityType
    || normalized.block
    || normalized.schema
    || normalized.enumId
    || normalized.opaqueType
    || normalized.attachmentKind
    || normalized.eventType
    || normalized.taskType
    || '';
  const base = qualifier ? `${normalized.base}<${qualifier}>` : normalized.base;
  const unit = normalized.unit ? ` ${normalized.unit}` : '';
  const nullable = normalized.nullable ? '?' : '';
  const shape = normalized.shape === 'item' ? '' : normalized.shape === 'list' ? '[]' : '{}';
  return `${base}${unit}${nullable}${shape}`;
}

export function withProcessShape(type, shape) {
  return normalizeProcessType({ ...normalizeProcessType(type), shape });
}

export function legacyProcessType(kind = 'data', metadata = {}) {
  let clean = String(kind || 'data');
  let shape = metadata.multiple ? 'list' : 'item';
  if (clean.endsWith('_list')) {
    clean = clean.slice(0, -5);
    shape = 'list';
  }
  if (clean === 'entityList') {
    clean = 'entity';
    shape = 'list';
  }
  const base = ({
    object: 'json',
    data: 'json',
    list: 'json',
    projection: 'entity',
    attachment: 'attachmentRef',
    task: 'taskRef'
  })[clean] || clean;
  const supported = PROCESS_BASE_TYPES.includes(base) ? base : 'opaque';
  return normalizeProcessType({
    base: supported,
    shape,
    nullable: Boolean(metadata.optional),
    entityType: metadata.entityType,
    block: metadata.block,
    capability: metadata.capability,
    accepts: metadata.accepts,
    opaqueType: supported === 'opaque' ? clean : undefined
  });
}

function shapeCompatibility(source, target) {
  if (source === target) return { ok: true, broadcast: false };
  if (source === 'item' && ['list', 'tree'].includes(target)) return { ok: true, broadcast: true };
  return { ok: false, reason: `Cannot implicitly narrow or restructure ${source} data as ${target}` };
}

function sameQualifiedType(source, target) {
  if (source.base !== target.base) return false;
  for (const qualifier of ['unit', 'enumId', 'schema', 'block', 'opaqueType', 'attachmentKind', 'eventType', 'taskType']) {
    if (target[qualifier] && source[qualifier] !== target[qualifier]) return false;
  }
  if (['entity', 'entityRef', 'revisionRef', 'predicate', 'patch', 'status'].includes(source.base)) {
    return sameEntityType(source, target);
  }
  return true;
}

function sameEntityType(source, target) {
  if (target.accepts?.length) {
    return !source.entityType
      || target.accepts.includes(source.entityType)
      || (source.capability && target.accepts.includes(source.capability));
  }
  return !source.entityType || !target.entityType || source.entityType === target.entityType;
}

function convertible(nodeKind, reason, source, target) {
  return {
    ok: false,
    convertible: true,
    conversion: { nodeKind, sourceType: source, targetType: target },
    reason,
    source,
    target
  };
}

function incompatible(reason, source, target) {
  return { ok: false, convertible: false, reason, source, target };
}
