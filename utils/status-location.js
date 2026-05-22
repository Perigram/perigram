export const STATUS_LOCATION_TYPES = ['warehouse', 'coordinates', 'address'];

export function normalizeStatusLocation(statusOrEntity = null) {
  const raw = statusOrEntity?.status?.lifecycle?.data?.location ||
    statusOrEntity?.lifecycle?.data?.location ||
    statusOrEntity?.data?.location ||
    null;
  if (!raw || typeof raw !== 'object') return null;

  const type = STATUS_LOCATION_TYPES.includes(raw.type) ? raw.type : null;
  if (!type) return null;

  if (type === 'warehouse') {
    const id = raw.warehouseId || raw.id;
    if (!id) return null;
    return { type, id, label: raw.label || raw.name || '' };
  }

  if (type === 'coordinates') {
    const coordinates = raw.coordinates || raw;
    const values = ['x', 'y', 'z', 'lat', 'lng']
      .filter(key => coordinates[key] !== undefined && coordinates[key] !== null)
      .map(key => `${key}: ${coordinates[key]}`);
    if (values.length === 0) return null;
    return { type, label: raw.label || values.join(', ') };
  }

  if (type === 'address') {
    const label = raw.label || raw.address;
    if (!label) return null;
    return { type, label };
  }

  return null;
}
