const detailActionSurfaceOwners = new Set(['cassette', 'queue', 'sheet_design']);

export function generatedEntityDetailOwnsActionSurface(entityType = '') {
  return detailActionSurfaceOwners.has(entityType);
}

export function generatedEntityDetailConsumesAction(entityType = '', action = {}) {
  if (action?.relationMutation) return false;
  return generatedEntityDetailOwnsActionSurface(entityType);
}
