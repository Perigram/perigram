const PUBLIC_READ_ENTITY_TYPES = new Set([
  'material',
  'materials',
  'layerStandard',
  'layer_standard',
  'layer_standards',
  'penTemplate',
  'pen_template',
  'pen_templates',
  'toolProfile',
  'tool_profile',
  'tool_profiles'
]);

const PUBLIC_READ_FEATURES = new Set([
  'materials',
  'layer_standards'
]);

export function isPublicReadEntity({ entity = null, entityType = '', feature = '' } = {}) {
  if (!entity) return false;
  if (!PUBLIC_READ_ENTITY_TYPES.has(entityType) && !PUBLIC_READ_FEATURES.has(feature)) return false;
  if (entity.data?.visibility?.public === true || entity.lineage?.public === true) return true;
  return entity.lineage?.scope === 'system';
}

export function markPublicSystemData(data = {}) {
  return {
    ...data,
    lineage: {
      ...(data.lineage || {}),
      scope: 'system',
      public: true
    },
    data: {
      ...(data.data || {}),
      visibility: {
        ...(data.data?.visibility || {}),
        public: true
      }
    }
  };
}
