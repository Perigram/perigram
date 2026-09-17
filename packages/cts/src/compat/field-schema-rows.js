// Row <-> legacy field-schema translation (SPEC §15 source flip, §19 seam).
// Extraction promotes legacy data/specs field schemas into real row
// descriptors; synthesis projects row fields back onto block paths for the
// compiler-consumable domain shape. The slot convention: extracted row
// fields carry their legacy block; org-authored fields default by class
// (item quantities -> specs, everything else -> data).
const LEGACY_UNIT_TO_CTS = Object.freeze({
  mm: 'mm', m: 'm', m2: 'm2', percent: 'percent', minute: 'min', degree: 'deg'
});
const CTS_UNIT_TO_LEGACY = Object.freeze({
  mm: 'mm', m: 'm', m2: 'm2', percent: 'percent', min: 'minute', deg: 'degree',
  currency: 'currency', count: 'count'
});
const ROW_BLOCKS = Object.freeze(['data', 'specs']);

function kebab(value = '') {
  return String(value).replace(/_/g, '-');
}

function snake(value = '') {
  return String(value).replace(/-/g, '_');
}

// Legacy field type -> CTS row descriptor (leaf level). '*' is the
// strangler wildcard for untyped entity references: legacy `entityRef`
// without `entityType` (any entity). It appears only on extracted rows and
// their synthesized projections; authored rows name their targets.
function leafDescriptor(type = {}) {
  const base = type.base;
  const nullable = type.nullable !== false ? { nullable: true } : {};
  if (base === 'entityRef') {
    return { base: 'ref', accepts: [type.entityType ? kebab(type.entityType) : '*'], ...nullable };
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
      return { base: 'entityRef', shape, nullable, entityType: snake(target) };
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

// Extraction: legacy field schemas of one entity -> row declaration.
// Only data/specs entries participate (the type-owned payload);
// `data.value` is the reserved generic slot and managed blocks
// (identity/origin/status/lineage/relations/provenance/summary) belong to
// their own facets, not the row.
export function extractRow(fieldSchemas = []) {
  const root = {};
  for (const schema of fieldSchemas) {
    if (!ROW_BLOCKS.includes(schema.block)) continue;
    if (schema.path === 'data.value') continue;
    const segments = String(schema.path).slice(schema.block.length + 1).split('.');
    const descriptor = leafDescriptor(schema.type);
    const extras = {
      slot: schema.block,
      ...(schema.writable === false ? { writable: false } : {}),
      ...(schema.constructible === false ? { constructible: false } : {}),
      ...(schema.label && schema.label !== schema.path ? { label: schema.label } : {}),
      ...(schema.i18n ? { i18n: schema.i18n } : {}),
      ...(schema.display ? { display: schema.display } : {}),
      ...(schema.role ? { role: schema.role } : {})
    };
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      if (node[segment] === undefined) {
        node[segment] = { base: 'record', fields: {} };
      } else if (node[segment].base !== 'record') {
        // Collision: the legacy schema has BOTH a leaf and nested children at
        // one path (e.g. data.parts json next to data.parts.length). The
        // record owns the structure and keeps the displaced leaf as
        // legacyJson so synthesis re-emits it at the record's own path;
        // shrinks when these payloads are fully typed.
        node[segment] = { base: 'record', fields: {}, legacyJson: node[segment] };
      }
      node = node[segment].fields;
    }
    const leaf = segments[segments.length - 1];
    if (node[leaf]?.base === 'record') {
      node[leaf] = { ...node[leaf], legacyJson: { ...descriptor, ...extras } };
    } else {
      node[leaf] = { ...descriptor, ...extras };
    }
  }
  return root;
}

// Slot resolution for synthesis: extracted fields keep their slot; org
// defaults follow the class convention (item quantities -> specs).
export function slotFor(descriptor = {}, classOf = '') {
  if (descriptor.slot) return descriptor.slot;
  return classOf === 'item' && descriptor.base === 'quantity' ? 'specs' : 'data';
}

// Synthesis: normalized row fields -> legacy field-schema entries. Nested
// record fields flatten back to dotted paths.
export function rowToFieldSchemas(row = {}, classOf = '', rootSlot = null) {
  const entries = [];
  for (const [name, descriptor] of Object.entries(row || {})) {
    const slot = rootSlot || slotFor(descriptor, classOf);
    if (descriptor.base === 'record') {
      const nested = rowToFieldSchemas(descriptor.fields || {}, classOf, slot);
      for (const entry of nested) {
        const suffix = entry.path.slice(slot.length + 1);
        const path = `${slot}.${name}.${suffix}`;
        entries.push({
          ...entry,
          path,
          // path-derived labels follow the path; explicit labels stay
          ...(entry.label === entry.path ? { label: path } : {})
        });
      }
      if (descriptor.legacyJson) {
        const displaced = descriptor.legacyJson === true ? {} : descriptor.legacyJson;
        entries.push({
          path: `${slot}.${name}`,
          block: slot,
          label: displaced.label || descriptor.label || `${slot}.${name}`,
          type: legacyType(displaced.base ? displaced : { base: 'json', nullable: true }),
          writable: displaced.writable !== false && descriptor.writable !== false,
          constructible: displaced.constructible !== false && descriptor.constructible !== false
        });
      }
      continue;
    }
    entries.push({
      path: `${slot}.${name}`,
      block: slot,
      label: descriptor.label || `${slot}.${name}`,
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
