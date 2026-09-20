// Class identity: the authored NAME is the label authors see and rename
// freely; the registry id is an invisible, stable identifier derived ONCE
// from the first non-empty name (slugified, deduplicated) and frozen after
// that. Renaming never changes the id — persisted instances, posted org
// types, producer outputs, and relation references keep resolving.

export function slugifyTypeName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^([0-9])/, 't-$1');
}

// Placeholder ids are the generated `type-N` seeds a fresh class carries
// before its first name. They are the only ids derivation may replace.
export function isPlaceholderTypeId(id = '') {
  return /^type-\d+$/.test(String(id || ''));
}

// Derive-once semantics: while the class still carries its placeholder id,
// the first non-empty name seals the id to its slug (deduplicated against
// the registry and sibling classes). Once sealed — or when the name is
// empty — the id never changes.
export function derivedTypeId({ name = '', currentId = '', taken = [] } = {}) {
  const slug = slugifyTypeName(name);
  if (!slug || !isPlaceholderTypeId(currentId)) return currentId;
  const occupied = new Set([...(Array.isArray(taken) ? taken : [])]);
  occupied.delete(currentId);
  if (!occupied.has(slug)) return slug;
  let index = 2;
  while (occupied.has(`${slug}-${index}`)) index += 1;
  return `${slug}-${index}`;
}
