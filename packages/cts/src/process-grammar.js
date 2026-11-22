// The one CTS ⇄ process adapter (SPEC §2 grammar relation): every
// translation from CTS row descriptors onto a process dialect — socket
// types, legacy field-schema types, construction input kinds, unit
// spellings — lives here. Consumed by the projection, field schemas, and
// `packages/processes` (designer, node catalog).

// CTS unit id -> process-dialect spelling. `min` and `deg` are the two
// spellings that differ; everything else maps to itself.
export const CTS_UNIT_TO_LEGACY = Object.freeze({
  mm: 'mm', m: 'm', m2: 'm2', percent: 'percent', min: 'minute', deg: 'degree',
  currency: 'currency', count: 'count'
});

export function ctsFieldToProcessType(descriptor = {}) {
  switch (descriptor.base) {
    case 'string': return { base: 'string' };
    case 'number': return { base: 'number' };
    case 'boolean': return { base: 'boolean' };
    case 'instant': return { base: 'dateTime' };
    case 'id': return { base: 'id' };
    case 'json': return descriptor.kind
      ? { base: 'json', kind: String(descriptor.kind) }
      : { base: 'json' };
    case 'blob': return { base: 'attachmentRef' };
    case 'quantity': return { base: 'number', unit: CTS_UNIT_TO_LEGACY[descriptor.unit] || descriptor.unit };
    case 'ref': {
      const type = { base: 'entityRef' };
      if (descriptor.accepts?.length === 1) type.typeId = descriptor.accepts[0];
      else if (descriptor.accepts?.length) type.accepts = [...descriptor.accepts];
      return type;
    }
    case 'list': {
      const item = ctsFieldToProcessType(descriptor.itemType || {});
      if (!item) return { base: 'json', lossy: 'list item type has no process counterpart' };
      return { base: 'array', itemType: item };
    }
    case 'map': {
      const value = ctsFieldToProcessType(descriptor.itemType || {});
      if (!value) return { base: 'json', lossy: 'map value type has no process counterpart' };
      return { base: 'map', keyType: { base: 'string' }, valueType: value };
    }
    case 'enum': return { base: 'enum' };
    case 'record': return { base: 'record' };
    case 'variant': return { base: 'json', lossy: 'variants flatten to json at the process boundary' };
    default: return { base: 'json', lossy: `unknown CTS base ${descriptor.base}` };
  }
}

// CTS row descriptor -> legacy field-schema type (leaf level).
export function ctsFieldToLegacyType(descriptor = {}) {
  const nullable = descriptor.nullable === true;
  const shape = 'item';
  switch (descriptor.base) {
    case 'quantity':
      return { base: 'number', shape, nullable, unit: CTS_UNIT_TO_LEGACY[descriptor.unit] || descriptor.unit };
    case 'ref': {
      const target = descriptor.accepts?.[0];
      if (!target || target === '*') return { base: 'entityRef', shape, nullable };
      // The socket must carry the target's registry id verbatim (kebab):
      // the projected entity world is kebab-first, and a snake-cased id
      // matches no real entity output — ref fields would never wire.
      return { base: 'entityRef', shape, nullable, typeId: target };
    }
    case 'instant':
      return { base: 'dateTime', shape, nullable };
    case 'list':
      return { base: 'array', shape, nullable, itemType: ctsFieldToLegacyType(descriptor.itemType || { base: 'json', nullable: true }) };
    case 'string': case 'number': case 'boolean': case 'json':
      return { base: descriptor.base, shape, nullable };
    default:
      return { base: 'json', shape, nullable };
  }
}

// CTS row descriptor -> construction input kind (operator mode inputs,
// SPEC §13 `via`): ref accepts become typed entity constraints, quantity
// stays a unit-less number, structural bases ride as object payloads.
export function ctsFieldToConstructionInput(descriptor = {}) {
  if (descriptor.base === 'ref') {
    return { type: 'entity', ...typedConstraint(descriptor) };
  }
  if (descriptor.base === 'list' && descriptor.itemType?.base === 'ref') {
    return { type: 'typeList', ...typedConstraint(descriptor.itemType) };
  }
  if (descriptor.base === 'quantity') return { type: 'number' };
  if (descriptor.base === 'instant') return { type: 'date' };
  if (descriptor.base === 'blob') return { type: 'file' };
  if (['string', 'number', 'boolean'].includes(descriptor.base)) return { type: descriptor.base };
  return { type: 'object' };
}

// Legacy field-schema type -> construction input kind: entity refs carry
// their typed constraint, everything structural rides as an object payload.
export function legacyTypeToConstructionInput(type = {}) {
  if (type.base === 'array' && ['entityRef', 'entity'].includes(type.itemType?.base || '')) {
    return { type: 'typeList', ...(type.itemType.typeId ? { typeId: type.itemType.typeId } : {}) };
  }
  if (type.base === 'entityRef' || type.base === 'entity') {
    return { type: 'entity', ...(type.typeId ? { typeId: type.typeId } : {}) };
  }
  if (['string', 'boolean'].includes(type.base)) return { type: type.base };
  if (type.base === 'number') return { type: 'number', ...(type.unit ? { unit: type.unit } : {}) };
  if (type.base === 'dateTime' || type.base === 'date') return { type: 'dateTime' };
  return { type: 'object' };
}

function typedConstraint(descriptor = {}) {
  if (descriptor.accepts?.length === 1) return { typeId: descriptor.accepts[0] };
  if (descriptor.accepts?.length) return { accepts: [...descriptor.accepts] };
  return {};
}
