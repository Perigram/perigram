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
import { slotFor } from '#packages/cts/src/index.js';

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

// The one fact vocabulary: fact-row descriptors resolve from the compiled
// type view first — the served CTS client bundle's derived sections
// (`renderPolicyFor` output, cached by `useFileTypeView`) — with the
// residual legacy map (`ui-fields.js`, undeclared types only) and app
// extensions (`app-instance-surfaces.js`) composing on top of it. Section
// fields project as slot-qualified fact paths with descriptor labels and
// display kinds, so field-access filtering and the display policies read
// the same paths the old authored groups used. Callers pass the bundle
// `typeRecord`; without one, legacy content keeps feeding undeclared
// types unchanged.
function bundleFieldGroups(typeRecord) {
  const sections = typeRecord?.sections;
  if (!Array.isArray(sections) || !sections.length) return null;
  const descriptors = typeRecord?.fields || {};
  const fieldGroups = {};
  for (const section of sections) {
    fieldGroups[section.id] = (section.fields || [])
      .filter(fieldId => descriptors[fieldId])
      .map(fieldId => ({
        path: `${slotFor(descriptors[fieldId], typeRecord.class)}.${fieldId}`,
        label: descriptors[fieldId].label || fieldId,
        ...(descriptors[fieldId].display ? { display: descriptors[fieldId].display } : {})
      }));
  }
  return fieldGroups;
}

// Surface field-group synthesis — generic chrome policy over whatever
// groups resolved (moved from domain-cnc `ui-surfaces.js` so it runs over
// the merged bundle+legacy+extension map, not the static legacy table).
// Authored surface patches (app extensions, per-call overrides) name
// their groups explicitly and always win over synthesis.
const COMPACT_PRIMARY_ORDER = ['summary', 'stock', 'specs', 'relations'];
const CARD_GROUP_ORDER = ['summary', 'identity', 'specs', 'stock', 'geometry', 'relations'];
const CARD_GROUP_OVERRIDES = {
  queue: ['summary'],
  catalog: ['summary'],
  geometryCapture: ['summary'],
  warehouse: ['summary']
};
const DETAIL_GROUP_ORDER = ['identity', 'summary', 'specs', 'stock', 'geometry', 'production', 'relations', 'provenance'];
const DEFAULT_FIELD_LIMITS = { inline: 1, compact: 3 };

function synthesizedGroups({ key, surface, fieldGroups }) {
  const known = Object.keys(fieldGroups);
  if (!known.length) return [];
  if (surface === 'inline' || surface === 'compact' || surface === 'picker') {
    const primary = COMPACT_PRIMARY_ORDER.find(group => fieldGroups[group]);
    return primary ? [primary] : [];
  }
  if (surface === 'card' || surface === 'table') {
    if (CARD_GROUP_OVERRIDES[key]) return CARD_GROUP_OVERRIDES[key];
    const order = key === 'nestingRun'
      ? ['summary', 'production', ...CARD_GROUP_ORDER.slice(1)]
      : CARD_GROUP_ORDER;
    return order.filter(group => fieldGroups[group]);
  }
  if (surface === 'detail') {
    const ordered = DETAIL_GROUP_ORDER.filter(group => fieldGroups[group]);
    const trailing = known.filter(group => !DETAIL_GROUP_ORDER.includes(group));
    return [...ordered, ...trailing];
  }
  return [];
}

export function resolveInstanceDisplayContract({
  typeId,
  surface = DEFAULT_INSTANCE_SURFACE,
  variant = null,
  typeRecord = null,
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

  const bundleGroups = bundleFieldGroups(typeRecord);
  const mergedGroups = {
    ...(bundleGroups || cncInstanceFieldGroups[key] || {}),
    ...(extensions?.fieldGroups?.[key] || extensions?.fields?.[key] || {}),
    ...(fieldGroups || {})
  };

  const resolvedSurface = mergeSurface(
    coreContract.surfaces?.[requestedSurface],
    extensionContract.surfaces?.[requestedSurface],
    surfacePatch,
    overrides
  );

  // Authored group lists (extension contracts, per-call patches) win —
  // an explicitly named list, that is; synthesized contract lists that
  // emptied out when their type migrated to the bundle fall through to
  // synthesis over the resolved groups.
  const authoredGroups = resolvedSurface.fieldGroups;
  const groupNames = authoredGroups?.length
    ? authoredGroups
    : synthesizedGroups({ key, surface: requestedSurface, fieldGroups: mergedGroups });

  const resolvedFields = resolveDisplayFields({
    fieldGroups: mergedGroups,
    groupNames,
    fieldLimit: resolvedSurface.fieldLimit
  });

  return {
    key,
    typeId: coreContract.typeId || typeId,
    surface: requestedSurface,
    bundleResolved: Boolean(bundleGroups),
    fieldGroups: mergedGroups,
    surfaceContract: normalizeSurfaceContract(requestedSurface, resolvedSurface),
    fields: resolvedFields
  };
}

export function resolveInstanceDisplayFields(options = {}) {
  return resolveInstanceDisplayContract(options).fields;
}

// Identity chrome policy (Phase 6, replaces IdentityBlock): the compiled
// identity facet — name → slug, then the surrounding surface's type
// label, then the localized unnamed placeholder. Instance ids stay
// private display vocabulary: `uid` is a detail-surface fact row, never a
// title. `fields` names the meta facts rendered beside the label
// (slug/serial/reference).
export function instanceIdentityLabel(entity, { typeLabel = '', unnamedLabel = 'Unnamed' } = {}) {
  const identity = entity?.identity || {};
  return identity.name || identity.slug || typeLabel || unnamedLabel;
}

const IDENTITY_META_KEYS = ['uid', 'slug', 'serial', 'reference'];

export function instanceIdentityMeta(entity, fields = []) {
  const identity = entity?.identity || {};
  return fields
    .filter(field => IDENTITY_META_KEYS.includes(field))
    .map(field => ({ key: field, value: identity[field] }))
    .filter(item => item.value);
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

function normalizeSurfaceContract(surface = '', definition = {}) {
  return {
    preview: CNC_PREVIEW_MODES.includes(definition.preview) ? definition.preview : 'none',
    fieldGroups: Array.isArray(definition.fieldGroups) ? definition.fieldGroups : [],
    fieldLimit: Number.isFinite(definition.fieldLimit)
      ? definition.fieldLimit
      : DEFAULT_FIELD_LIMITS[surface] ?? null,
    dataDisplay: CNC_DATA_DISPLAYS.includes(definition.dataDisplay) ? definition.dataDisplay : 'grid',
    relations: CNC_RELATION_DISPLAYS.includes(definition.relations) ? definition.relations : 'none',
    actions: CNC_ACTION_DISPLAYS.includes(definition.actions) ? definition.actions : 'none',
    status: definition.status || 'hidden',
    trace: definition.trace || 'hidden'
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
