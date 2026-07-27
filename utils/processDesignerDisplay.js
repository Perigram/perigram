export function normalizeProcessDisplayName(value) {
  return String(value || '')
    .replace(/(?:\s+draft)+$/i, '')
    .trim();
}

export function normalizePersistedProcessName(value) {
  const name = String(value || '').trim();
  if (!/(?:\s+draft)+$/i.test(name)) return name;
  return `${normalizeProcessDisplayName(name)} draft`;
}

export function processDisplayEntity(entity = {}) {
  const name = normalizeProcessDisplayName(entity.identity?.name);
  if (!name || name === entity.identity?.name) return entity;
  return {
    ...entity,
    identity: {
      ...(entity.identity || {}),
      name
    }
  };
}
