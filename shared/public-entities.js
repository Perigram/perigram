const PUBLIC_READ_ENTITY_TYPES = new Set([
  'layerStandard',
  'layer_standard',
  'layer_standards',
  'penTemplate',
  'pen_template',
  'pen_templates'
]);

const PUBLIC_READ_FEATURES = new Set([
  'layer_standards'
]);

export function isPublicReadEntity({ entity = null, typeId = '', feature = '' } = {}) {
  if (!entity) return false;
  if (!PUBLIC_READ_ENTITY_TYPES.has(typeId) && !PUBLIC_READ_FEATURES.has(feature)) return false;
  if (entity.data?.visibility?.public === true || entity.lineage?.public === true) return true;
  return entity.lineage?.scope === 'system';
}

