import {
  CNC_ACTION_DISPLAYS,
  CNC_DATA_DISPLAYS,
  CNC_PREVIEW_MODES,
  CNC_RELATION_DISPLAYS,
  CNC_SURFACES,
  cncInstanceFieldGroups,
  cncInstanceSurfaceContracts,
  cncDesignSystemInstanceContracts
} from '@cutkit/domain-cnc';

export const DEFAULT_INSTANCE_SURFACE = 'card';

const INSTANCE_KEY_BY_TYPE = Object.fromEntries(cncDesignSystemInstanceContracts.flatMap(entry => [
  [entry.key, entry.key],
  [entry.typeId, entry.key]
]));

export function normalizeInstanceSurface(surface, fallback = DEFAULT_INSTANCE_SURFACE) {
  return CNC_SURFACES.includes(surface) ? surface : fallback;
}

export function instanceKeyForDisplay(typeId) {
  return INSTANCE_KEY_BY_TYPE[typeId] || typeId;
}

export function getCoreFieldGroups(typeId) {
  return cncInstanceFieldGroups[instanceKeyForDisplay(typeId)] || {};
}

export function getCoreSurfaceContract(typeId) {
  return cncInstanceSurfaceContracts[instanceKeyForDisplay(typeId)] || null;
}

export function resolveInstanceDisplayContract({
  typeId,
  surface = DEFAULT_INSTANCE_SURFACE,
  variant = null,
  fieldGroups = null,
  surfaces = null,
  extensions = null,
  overrides = null
} = {}) {
  const key = instanceKeyForDisplay(typeId);
  const requestedSurface = normalizeInstanceSurface(surface || variant);
  const coreContract = cncInstanceSurfaceContracts[key] || { key, typeId, surfaces: {} };
  const extensionContract = extensions?.surfaces?.[key] || extensions?.[key] || {};
  const surfacePatch = surfaces?.[requestedSurface] || {};

  const mergedGroups = {
    ...(cncInstanceFieldGroups[key] || {}),
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
    typeId: coreContract.typeId || typeId,
    surface: requestedSurface,
    fieldGroups: mergedGroups,
    surfaceContract: normalizeSurfaceContract(resolvedSurface),
    fields: resolvedFields
  };
}

export function resolveInstanceDisplayFields(options = {}) {
  return resolveInstanceDisplayContract(options).fields;
}

export function validateInstanceDisplayContracts({
  contracts = cncInstanceSurfaceContracts,
  fieldGroups = cncInstanceFieldGroups,
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
            if (!fieldPolicyResolver(contract.typeId || key, path, field)) {
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
