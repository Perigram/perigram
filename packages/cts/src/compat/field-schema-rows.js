// Row <-> field-schema translation (SPEC §15 source flip, §19 seam; wire
// decision 2026-10-11: the instance wire speaks the stored §3 shape).
// Synthesis projects row fields onto their one wire home — the flat
// `fields` object — as `fields.<dotted.name>` paths. There is no slot
// convention and no reserved generic slot on the wire.
const LEGACY_UNIT_TO_CTS = Object.freeze({
  mm: 'mm', m: 'm', m2: 'm2', percent: 'percent', minute: 'min', degree: 'deg'
});
const CTS_UNIT_TO_LEGACY = Object.freeze({
  mm: 'mm', m: 'm', m2: 'm2', percent: 'percent', min: 'minute', deg: 'degree',
  currency: 'currency', count: 'count'
});

// Legacy field type -> CTS row descriptor (leaf level). '*' is the
// strangler wildcard for untyped entity references: legacy `entityRef`
// without `typeId` (any entity). It appears only on extracted rows and
// their synthesized projections; authored rows name their targets.
function leafDescriptor(type = {}) {
  const base = type.base;
  const nullable = type.nullable !== false ? { nullable: true } : {};
  if (base === 'entityRef') {
    return { base: 'ref', accepts: [type.typeId ? kebab(type.typeId) : '*'], ...nullable };
  }
  if (base === 'number' && type.unit && LEGACY_UNIT_TO_CTS[type.unit]) {
    return { base: 'quantity', unit: LEGACY_UNIT_TO_CTS[type.unit], ...nullable };
  }
  if (base === 'date' || base === 'dateTime') {
    return { base: 'instant', ...nullable };
  }
  if (base === 'array') {
    return { base: 'list', itemType: leafDescriptor(type.itemType || { base: 'json', nullable: true }), ...nullable };
  }
  if (['string', 'number', 'boolean', 'json'].includes(base)) {
    return { base, ...nullable };
  }
  return { base: 'json', nullable: true };
}

// CTS row descriptor -> legacy field type (leaf level).
function legacyType(descriptor = {}) {
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
      return { base: 'array', shape, nullable, itemType: legacyType(descriptor.itemType || { base: 'json', nullable: true }) };
    case 'string': case 'number': case 'boolean': case 'json':
      return { base: descriptor.base, shape, nullable };
    default:
      return { base: 'json', shape, nullable };
  }
}

function kebab(value = '') {
  return String(value).replace(/_/g, '-');
}

// Synthesis: normalized row fields -> field-schema entries on the flat
// `fields` home. Nested record fields flatten to dotted paths.
export function rowToFieldSchemas(row = {}) {
  const entries = [];
  for (const [name, descriptor] of Object.entries(row || {})) {
    if (descriptor.base === 'record') {
      for (const entry of rowToFieldSchemas(descriptor.fields || {})) {
        const suffix = entry.path.slice('fields.'.length);
        entries.push({
          ...entry,
          path: `fields.${name}.${suffix}`,
          // path-derived labels follow the path; explicit labels stay
          ...(entry.label === entry.path ? { label: `fields.${name}.${suffix}` } : {})
        });
      }
      if (descriptor.legacyJson) {
        const displaced = descriptor.legacyJson === true ? {} : descriptor.legacyJson;
        entries.push({
          path: `fields.${name}`,
          block: 'fields',
          label: displaced.label || descriptor.label || `fields.${name}`,
          type: legacyType(displaced.base ? displaced : { base: 'json', nullable: true }),
          writable: displaced.writable !== false && descriptor.writable !== false,
          constructible: displaced.constructible !== false && descriptor.constructible !== false
        });
      }
      continue;
    }
    entries.push({
      path: `fields.${name}`,
      block: 'fields',
      label: descriptor.label || `fields.${name}`,
      type: legacyType(descriptor),
      writable: descriptor.writable !== false,
      constructible: descriptor.constructible !== false,
      ...(descriptor.i18n ? { i18n: descriptor.i18n } : {}),
      ...(descriptor.display ? { display: descriptor.display } : {}),
      ...(descriptor.role ? { role: descriptor.role } : {})
    });
  }
  return entries;
}
