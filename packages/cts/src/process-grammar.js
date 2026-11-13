// CTS ⇄ PROCESS_BASE_TYPES adapter for the declaration subset (SPEC §2;
// contract: README Modules entry).

const PROCESS_ONLY_BASES = Object.freeze([
  'entity', 'revisionRef', 'block', 'status', 'predicate', 'patch', 'event',
  'taskRef', 'error', 'void', 'opaque', 'duration', 'integer'
]);

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
    case 'quantity': return { base: 'number', unit: descriptor.unit };
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

export function processTypeToCtsField(type = {}) {
  switch (type.base) {
    case 'string': return { base: 'string' };
    case 'number': return type.unit ? { base: 'quantity', unit: type.unit } : { base: 'number' };
    case 'integer': return { base: 'number', lossy: 'integer widens to number' };
    case 'boolean': return { base: 'boolean' };
    case 'dateTime': case 'date': return { base: 'instant' };
    case 'duration': return null;
    case 'id': return { base: 'id' };
    case 'json': return type.kind
      ? { base: 'json', kind: String(type.kind) }
      : { base: 'json' };
    case 'attachmentRef': return { base: 'blob' };
    case 'enum': return { base: 'enum' };
    case 'entityRef': case 'entity': {
      if (type.typeId) return { base: 'ref', accepts: [type.typeId] };
      if (type.accepts?.length) return { base: 'ref', accepts: [...type.accepts] };
      return { base: 'ref', accepts: [] };
    }
    case 'revisionRef': return null;
    case 'array': {
      const item = processTypeToCtsField(type.itemType || {});
      return item ? { base: 'list', itemType: item } : null;
    }
    case 'map': {
      const value = processTypeToCtsField(type.valueType || {});
      return value ? { base: 'map', itemType: value } : null;
    }
    case 'record': return { base: 'record' };
    default: return null;
  }
}

export function isProcessOnlyBase(base = '') {
  return PROCESS_ONLY_BASES.includes(base);
}

// Enum registry derivation: inline enum fields get a process-grammar id
// (`typeId#field`). State vocabularies are draft authoring (SPEC §7) and
// never project here.
export function enumRegistryForType(type = {}) {
  const registry = {};
  for (const [fieldName, descriptor] of Object.entries(type.fields || {})) {
    if (descriptor.base === 'enum') registry[`${type.id}#${fieldName}`] = [...(descriptor.values || [])];
  }
  return registry;
}

export function enumRegistryForView(types = []) {
  return Object.assign({}, ...types.map(enumRegistryForType));
}

// Species classification of the effect node family (SPEC §8): metadata over
// `packages/processes` node kinds, not new machinery.
export const SPECIES_BY_EFFECT_KIND = Object.freeze({
  'effect.createEntity': 'construct',
  'effect.runProducer': 'construct',
  'effect.updateEntity': 'mutate',
  'effect.changeStatus': 'transition',
  'effect.archiveEntity': 'transition',
  'effect.deleteEntity': 'remove',
  'effect.runCommand': 'command',
  'effect.sendEntity': 'command',
  'effect.generateAttachment': 'conversion'
});
