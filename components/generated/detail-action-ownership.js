const detailActionSurfaceOwners = new Set(['cassette', 'queue', 'sheet_design']);

export function generatedEntityDetailOwnsActionSurface(typeId = '') {
  return detailActionSurfaceOwners.has(typeId);
}

export function generatedEntityDetailConsumesAction(typeId = '', action = {}) {
  if (action?.relationMutation) return false;
  return generatedEntityDetailOwnsActionSurface(typeId);
}
