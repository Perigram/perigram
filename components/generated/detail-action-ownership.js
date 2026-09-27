const detailActionSurfaceOwners = new Set(['cassette', 'queue', 'sheet_design']);

export function generatedInstanceDetailOwnsActionSurface(typeId = '') {
  return detailActionSurfaceOwners.has(typeId);
}

export function generatedInstanceDetailConsumesAction(typeId = '', action = {}) {
  if (action?.relationMutation) return false;
  return generatedInstanceDetailOwnsActionSurface(typeId);
}
