export const PROCESS_PROTOCOL_VERSION = 4;

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
  'array',
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

export const PROCESS_DATA_ACCESS = Object.freeze(['item', 'list', 'tree']);
export const PROCESS_SOCKET_ROLES = Object.freeze(['data', 'control', 'success', 'failure']);

export function mapDomainInputType(kind = 'json', metadata = {}) {
  let clean = String(kind || 'json');
  if (clean.endsWith('_list')) {
    clean = clean.slice(0, -5);
  }
  if (clean === 'typeList') {
    clean = 'entity';
  }
  const base = ({
    object: 'json',
    data: 'json',
    list: 'json',
    projection: 'entity',
    entity: 'entityRef',
    attachment: 'attachmentRef',
    task: 'taskRef'
  })[clean] || clean;
  const supported = PROCESS_BASE_TYPES.includes(base) ? base : 'opaque';
  const supportsTypeId = ['entity', 'entityRef', 'revisionRef', 'predicate', 'patch', 'status'].includes(supported);
  return normalizeProcessType({
    base: supported,
    nullable: Boolean(metadata.optional),
    typeId: supportsTypeId ? metadata.typeId : undefined,
    unit: supported === 'number' ? metadata.unit : undefined,
    block: supported === 'block' ? metadata.block : undefined,
    capability: metadata.capability,
    accepts: metadata.accepts,
    opaqueType: supported === 'opaque' ? clean : undefined
  });
}

export function processType(base = 'json', options = {}) {
  return normalizeProcessType({ base, ...options });
}

const ENTITY_TYPE_BASES = new Set(['entity', 'entityRef', 'revisionRef', 'predicate', 'patch', 'status']);

/**
 * Sanitizes a stored process type by dropping qualifiers that the base type
 * cannot legally carry (for example `typeId` on a `json` base). Stored
 * process definitions compiled by older compiler versions may carry redundant
 * qualifiers; sanitizing keeps recompilation idempotent without weakening
 * strict validation of freshly authored types.
 */
export function sanitizeProcessType(type = {}) {
  if (!type || typeof type !== 'object' || Array.isArray(type) || !type.base) return type;
  const clean = { ...type };
  if (clean.typeId && !ENTITY_TYPE_BASES.has(clean.base)) delete clean.typeId;
  if (clean.accepts && !ENTITY_TYPE_BASES.has(clean.base)) delete clean.accepts;
  if (clean.block && clean.base !== 'block') delete clean.block;
  return clean;
}

export function normalizeProcessType(type = {}) {
  if (!type || typeof type !== 'object' || Array.isArray(type)) {
    throw new Error('Process type must be a structured object');
  }
  const base = PROCESS_BASE_TYPES.includes(type.base) ? type.base : '';
  if (!base) throw new Error(`Unknown process base type ${type.base || '(empty)'}`);
  const normalized = {
    base,
    nullable: Boolean(type.nullable)
  };
  for (const key of [
    'schema',
    'typeId',
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
  validateTypeQualifiers(normalized);
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
    type: normalizeProcessType(sanitizeProcessType(type)),
    role,
    required: source.required === true || (source.required == null && fallback.required === true),
    access: PROCESS_DATA_ACCESS.includes(source.access)
      ? source.access
      : (PROCESS_DATA_ACCESS.includes(fallback.access) ? fallback.access : 'item'),
    path: source.path || source.dataPath || fallback.path || '',
    description: source.description || fallback.description || '',
    ...(source.plane || fallback.plane ? { plane: source.plane || fallback.plane } : {}),
    multiple: source.multiple === true || fallback.multiple === true
  };
}

export function processTypesCompatible(sourceType, targetType) {
  const source = normalizeProcessType(sourceType);
  const target = normalizeProcessType(targetType);
  if (source.nullable && !target.nullable) {
    return incompatible('A nullable value cannot satisfy a required socket; handle the empty case first', source, target);
  }
  if (sameQualifiedType(source, target)) {
    return { ok: true, implicit: true, source, target };
  }
  if (source.base === 'integer' && target.base === 'number') {
    return { ok: true, implicit: true, source, target, coercion: 'integerToNumber' };
  }
  // An instance is an instance (SPEC §20 socket algebra): entity and
  // entityRef are one object at the wire level — references resolve where
  // consumed, so both directions connect under the same type-scope rule.
  if (['entity', 'entityRef'].includes(source.base) && ['entity', 'entityRef'].includes(target.base) && sameTypeId(source, target)) {
    return {
      ok: true,
      implicit: true,
      source,
      target,
      ...(source.base !== target.base ? { coercion: 'entityToReference' } : {})
    };
  }
  if (source.base === 'date' && target.base === 'dateTime') {
    return { ok: true, implicit: true, source, target, coercion: 'dateToDateTime' };
  }
  if (['date', 'dateTime'].includes(source.base) && target.base === 'string') {
    return { ok: true, implicit: true, source, target, coercion: 'temporalToString' };
  }
  if (source.base === 'number' && target.base === 'number' && source.unit && target.unit && source.unit !== target.unit) {
    return convertible('value.convertUnit', `Unit conversion ${source.unit} → ${target.unit} must remain visible`, source, target);
  }
  // A unit-less number adopts the socket's declared unit: the unit is the
  // field's metadata, not a distinct transport type — literals and other
  // raw number sources stay wireable into quantity fields. Only
  // unit -> different-unit conversion stays explicit.
  if (source.base === 'number' && target.base === 'number' && !source.unit && target.unit) {
    return { ok: true, implicit: true, source, target, coercion: 'adoptsUnit' };
  }
  if (target.base === 'json') {
    return { ok: true, implicit: true, source, target, coercion: 'toJson' };
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
  const qualifier = normalized.typeId
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
  return `${base}${unit}${nullable}`;
}

function sameQualifiedType(source, target) {
  if (source.base !== target.base) return false;
  for (const qualifier of ['unit', 'enumId', 'schema', 'block', 'opaqueType', 'attachmentKind', 'eventType', 'taskType']) {
    if (target[qualifier] && source[qualifier] !== target[qualifier]) return false;
  }
  if (['entity', 'entityRef', 'revisionRef', 'predicate', 'patch', 'status'].includes(source.base)) {
    if (!sameTypeId(source, target)) return false;
  }
  if (source.base === 'array') return nestedTypeMatches(source.itemType, target.itemType);
  if (source.base === 'map') {
    return nestedTypeMatches(source.keyType, target.keyType)
      && nestedTypeMatches(source.valueType, target.valueType);
  }
  return true;
}

function nestedTypeMatches(source, target) {
  if (!target) return true;
  if (!source) return false;
  return processTypesCompatible(source, target).ok;
}

function validateTypeQualifiers(type) {
  const entityBases = new Set(['entity', 'entityRef', 'revisionRef', 'predicate', 'patch', 'status']);
  if (type.typeId && !entityBases.has(type.base)) {
    throw new Error(`Process type ${type.base} cannot carry typeId`);
  }
  if (type.block && type.base !== 'block') {
    throw new Error(`Process type ${type.base} cannot carry block`);
  }
  if (type.base === 'array' && !type.itemType) {
    throw new Error('Process array type requires itemType');
  }
  if (type.base === 'map' && (!type.keyType || !type.valueType)) {
    throw new Error('Process map type requires keyType and valueType');
  }
}

function sameTypeId(source, target) {
  if (target.accepts?.length) {
    return !source.typeId
      || target.accepts.includes(source.typeId)
      || (source.capability && target.accepts.includes(source.capability));
  }
  return !source.typeId || !target.typeId || source.typeId === target.typeId;
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
