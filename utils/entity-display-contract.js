import {
  CNC_ACTION_DISPLAYS,
  CNC_DATA_DISPLAYS,
  CNC_PREVIEW_MODES,
  CNC_RELATION_DISPLAYS,
  CNC_SURFACES,
  cncEntityFieldGroups,
  cncEntitySurfaceContracts,
  cncDesignSystemEntityContracts
} from '@cutkit/domain-cnc';

export const DEFAULT_ENTITY_SURFACE = 'card';

const ENTITY_KEY_BY_TYPE = Object.fromEntries(cncDesignSystemEntityContracts.flatMap(entry => [
  [entry.key, entry.key],
  [entry.entityType, entry.key]
]));

export function normalizeEntitySurface(surface, fallback = DEFAULT_ENTITY_SURFACE) {
  return CNC_SURFACES.includes(surface) ? surface : fallback;
}

export function entityKeyForDisplay(entityType) {
  return ENTITY_KEY_BY_TYPE[entityType] || entityType;
}

export function getCoreFieldGroups(entityType) {
  return cncEntityFieldGroups[entityKeyForDisplay(entityType)] || {};
}

export function getCoreSurfaceContract(entityType) {
  return cncEntitySurfaceContracts[entityKeyForDisplay(entityType)] || null;
}

export function resolveEntityDisplayContract({
  entityType,
  surface = DEFAULT_ENTITY_SURFACE,
  variant = null,
  fieldGroups = null,
  surfaces = null,
  extensions = null,
  overrides = null
} = {}) {
  const key = entityKeyForDisplay(entityType);
  const requestedSurface = normalizeEntitySurface(surface || variant);
  const coreContract = cncEntitySurfaceContracts[key] || { key, entityType, surfaces: {} };
  const extensionContract = extensions?.surfaces?.[key] || extensions?.[key] || {};
  const surfacePatch = surfaces?.[requestedSurface] || {};

  const mergedGroups = {
    ...(cncEntityFieldGroups[key] || {}),
    ...(extensions?.fieldGroups?.[key] || extensions?.fields?.[key] || {}),
    ...(fieldGroups || {})
  };

  const resolvedSurface = mergeSurface(
    coreContract.surfaces?.[requestedSurface],
    extensionContract.surfaces?.[requestedSurface],
    surfacePatch,
    overrides
  );

  const resolvedFields = resolveDisplayFields({
    fieldGroups: mergedGroups,
    groupNames: resolvedSurface.fieldGroups,
    fieldLimit: resolvedSurface.fieldLimit
  });

  return {
    key,
    entityType: coreContract.entityType || entityType,
    surface: requestedSurface,
    fieldGroups: mergedGroups,
    surfaceContract: normalizeSurfaceContract(resolvedSurface),
    fields: resolvedFields
  };
}

export function resolveEntityDisplayFields(options = {}) {
  return resolveEntityDisplayContract(options).fields;
}

export function validateEntityDisplayContracts({
  contracts = cncEntitySurfaceContracts,
  fieldGroups = cncEntityFieldGroups,
  fieldPolicyResolver = null
} = {}) {
  const issues = [];
  for (const [key, contract] of Object.entries(contracts || {})) {
    for (const surface of ['inline', 'compact', 'card', 'detail']) {
      if (!contract.surfaces?.[surface]) issues.push({ key, surface, issue: 'missing required surface' });
    }

    for (const [surface, definition] of Object.entries(contract.surfaces || {})) {
      if (!CNC_SURFACES.includes(surface)) issues.push({ key, surface, issue: 'invalid surface' });
      if (!CNC_PREVIEW_MODES.includes(definition.preview || 'none')) issues.push({ key, surface, issue: 'invalid preview' });
      if (!CNC_DATA_DISPLAYS.includes(definition.dataDisplay || 'grid')) issues.push({ key, surface, issue: 'invalid data display' });
      if (!CNC_RELATION_DISPLAYS.includes(definition.relations || 'none')) issues.push({ key, surface, issue: 'invalid relation display' });
      if (!CNC_ACTION_DISPLAYS.includes(definition.actions || 'none')) issues.push({ key, surface, issue: 'invalid action display' });

      for (const groupName of definition.fieldGroups || []) {
        if (!fieldGroups[key]?.[groupName]) {
          issues.push({ key, surface, group: groupName, issue: 'missing field group' });
          continue;
        }
        if (!fieldPolicyResolver) continue;
        for (const field of fieldGroups[key][groupName] || []) {
          const paths = [field.path, ...(field.fallbackPaths || [])].filter(Boolean);
          for (const path of paths) {
            if (!fieldPolicyResolver(contract.entityType || key, path, field)) {
              issues.push({ key, surface, group: groupName, path, issue: 'field path missing access policy' });
            }
          }
        }
      }
    }
  }
  return issues;
}

function mergeSurface(...surfaces) {
  return surfaces.filter(Boolean).reduce((merged, surface) => ({
    ...merged,
    ...surface,
    fieldGroups: surface.fieldGroups || merged.fieldGroups
  }), {});
}

function normalizeSurfaceContract(surface = {}) {
  return {
    preview: CNC_PREVIEW_MODES.includes(surface.preview) ? surface.preview : 'none',
    fieldGroups: Array.isArray(surface.fieldGroups) ? surface.fieldGroups : [],
    fieldLimit: Number.isFinite(surface.fieldLimit) ? surface.fieldLimit : null,
    dataDisplay: CNC_DATA_DISPLAYS.includes(surface.dataDisplay) ? surface.dataDisplay : 'grid',
    relations: CNC_RELATION_DISPLAYS.includes(surface.relations) ? surface.relations : 'none',
    actions: CNC_ACTION_DISPLAYS.includes(surface.actions) ? surface.actions : 'none',
    status: surface.status || 'hidden',
    trace: surface.trace || 'hidden'
  };
}

function resolveDisplayFields({ fieldGroups = {}, groupNames = [], fieldLimit = null } = {}) {
  const fields = groupNames.flatMap(groupName =>
    (fieldGroups[groupName] || []).map(field => ({ ...field, group: groupName }))
  );

  const ordered = fields
    .filter(field => field?.path)
    .sort((a, b) => (a.priority || 100) - (b.priority || 100));

  return Number.isFinite(fieldLimit) ? ordered.slice(0, fieldLimit) : ordered;
}
