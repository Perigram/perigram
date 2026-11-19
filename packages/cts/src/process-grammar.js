// CTS ⇄ PROCESS_BASE_TYPES adapter for the declaration subset (SPEC §2;
// contract: README Modules entry).

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
