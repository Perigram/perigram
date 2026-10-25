import {
  DESIGN_ACTION_DISPLAYS,
  DESIGN_DATA_DISPLAYS,
  DESIGN_PREVIEW_MODES,
  DESIGN_RELATION_DISPLAYS,
  DESIGN_SURFACES
} from './design-system-contract.js';

export const DEFAULT_INSTANCE_SURFACE = 'card';

export function normalizeInstanceSurface(surface, fallback = DEFAULT_INSTANCE_SURFACE) {
  return DESIGN_SURFACES.includes(surface) ? surface : fallback;
}

// The one fact vocabulary, bundle-only: `factsFor(typeView, surface)`
// projects the served CTS client bundle's derived `sections` plus the
// field descriptors into ordered fact rows for a surface. Section fields
// project as slot-qualified fact paths with descriptor labels and display
// kinds, so field-access filtering and the display policies read the same
// paths the old authored groups used. Group selection per surface is
// class-level generic policy over the derived sections; shared field
// limits (inline 1, compact 3) bound the row surfaces.
const COMPACT_PRIMARY_ORDER = ['summary', 'dimensions', 'media', 'relations', 'notes'];
const CARD_GROUP_ORDER = ['summary', 'dimensions', 'media', 'relations'];
const DEFAULT_FIELD_LIMITS = { inline: 1, compact: 3 };

export function factsFor(typeView = null, surface = DEFAULT_INSTANCE_SURFACE) {
  const requestedSurface = normalizeInstanceSurface(surface);
  const fieldGroups = bundleFieldGroups(typeView);
  const groupNames = synthesizedGroups({ surface: requestedSurface, fieldGroups });
  return resolveDisplayFields({
    fieldGroups,
    groupNames,
    fieldLimit: DEFAULT_FIELD_LIMITS[requestedSurface] ?? null
  });
}

function bundleFieldGroups(typeView) {
  const sections = Array.isArray(typeView?.sections) ? typeView.sections : [];
  if (!sections.length) return {};
  const descriptors = typeView?.fields || {};
  const fieldGroups = {};
  for (const section of sections) {
    fieldGroups[section.id] = (section.fields || [])
      .filter(fieldId => descriptors[fieldId])
      .map(fieldId => ({
        path: `fields.${fieldId}`,
        label: descriptors[fieldId].label || fieldId,
        ...(descriptors[fieldId].display ? { display: descriptors[fieldId].display } : {})
      }));
  }
  return fieldGroups;
}

// Surface group synthesis — class-level generic policy over whatever
// groups resolved (bundle sections, per-call groups). Compact/inline/
// picker surfaces carry the leading summary facts, cards
// are recognition surfaces (summary, dimensions, media, relation chips),
// detail carries every group in section order. Authored surface patches
// (per-call overrides) name their groups explicitly and
// always win over synthesis.
function synthesizedGroups({ surface, fieldGroups }) {
  const known = Object.keys(fieldGroups);
  if (!known.length) return [];
  if (surface === 'inline' || surface === 'compact' || surface === 'picker') {
    const primary = COMPACT_PRIMARY_ORDER.find(group => fieldGroups[group]);
    return primary ? [primary] : [];
  }
  if (surface === 'card' || surface === 'table') {
    return CARD_GROUP_ORDER.filter(group => fieldGroups[group]);
  }
  if (surface === 'detail') {
    return COMPACT_PRIMARY_ORDER.filter(group => fieldGroups[group]);
  }
  return [];
}

// Class-generic surface chrome derived from the type record alone: preview
// follows payload presence (files preview as attachments, detail surfaces
// hero) with the declared previewSource row as the payload-less channel,
// status follows the declared state axes, trace follows declared
// containment. Per-call patches compose on top.
function genericSurfaceFor(typeView, surface) {
  const hasPayload = Boolean(typeView?.payload);
  const hasDeclaredPreview = Boolean(typeView?.previewSource);
  const attachmentPreview = hasPayload ? 'attachment' : (hasDeclaredPreview ? 'canvas' : 'none');
  const detailPreview = hasPayload ? 'hero' : (hasDeclaredPreview ? 'canvas' : 'none');
  const hasStates = Boolean(typeView?.states?.main);
  const hasContainment = Boolean(Object.keys(typeView?.edges?.children || {}).length);
  if (surface === 'inline') {
    return { preview: 'none', fieldLimit: 1, dataDisplay: 'inline', relations: 'none', actions: 'none',
      status: hasStates ? 'readonly' : 'hidden', trace: 'hidden' };
  }
  if (surface === 'compact') {
    return { preview: attachmentPreview, fieldLimit: 3, dataDisplay: 'compact', relations: 'summary',
      actions: 'menu', status: hasStates ? 'interactive' : 'hidden', trace: 'hidden' };
  }
  if (surface === 'card' || surface === 'table') {
    return { preview: attachmentPreview, dataDisplay: 'grid', relations: 'inlineRefs',
      actions: 'footer', status: hasStates ? 'interactive' : 'hidden', trace: 'hidden' };
  }
  return { preview: detailPreview, dataDisplay: 'sectioned', relations: 'expanded',
    actions: 'toolbar', status: hasStates ? 'interactive' : 'hidden', trace: hasContainment ? 'full' : 'hidden' };
}

// The composing entry: bundle rows first (`factsFor` over the passed type
// record), per-call `fieldGroups`/`surfaces`/`overrides` last — they
// always win. There is no legacy residual map: an undeclared type resolves
// no fact rows and generic chrome.
export function resolveInstanceDisplayContract({
  typeId,
  surface = DEFAULT_INSTANCE_SURFACE,
  variant = null,
  typeRecord = null,
  fieldGroups = null,
  surfaces = null,
  overrides = null
} = {}) {
  const requestedSurface = normalizeInstanceSurface(surface || variant);
  const surfacePatch = surfaces?.[requestedSurface] || {};

  const bundleGroups = bundleFieldGroups(typeRecord);
  const mergedGroups = {
    ...bundleGroups,
    ...(fieldGroups || {})
  };

  const resolvedSurface = mergeSurface(
    genericSurfaceFor(typeRecord, requestedSurface),
    surfacePatch,
    overrides
  );

  // Authored group lists (per-call patches) win —
  // an explicitly named list, that is; everything else synthesizes over
  // the resolved groups.
  const authoredGroups = resolvedSurface.fieldGroups;
  const groupNames = authoredGroups?.length
    ? authoredGroups
    : synthesizedGroups({ surface: requestedSurface, fieldGroups: mergedGroups });

  const resolvedFields = resolveDisplayFields({
    fieldGroups: mergedGroups,
    groupNames,
    fieldLimit: resolvedSurface.fieldLimit
  });

  return {
    key: typeId,
    typeId,
    surface: requestedSurface,
    bundleResolved: Boolean(Object.keys(bundleGroups).length),
    fieldGroups: mergedGroups,
    surfaceContract: normalizeSurfaceContract(requestedSurface, resolvedSurface),
    fields: resolvedFields
  };
}

export function resolveInstanceDisplayFields(options = {}) {
  return resolveInstanceDisplayContract(options).fields;
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
    preview: DESIGN_PREVIEW_MODES.includes(definition.preview) ? definition.preview : 'none',
    fieldGroups: Array.isArray(definition.fieldGroups) ? definition.fieldGroups : [],
    fieldLimit: Number.isFinite(definition.fieldLimit)
      ? definition.fieldLimit
      : DEFAULT_FIELD_LIMITS[surface] ?? null,
    dataDisplay: DESIGN_DATA_DISPLAYS.includes(definition.dataDisplay)
      ? definition.dataDisplay
      : (surface === 'detail' ? 'sectioned' : surface === 'compact' ? 'compact' : surface === 'inline' ? 'inline' : 'grid'),
    relations: DESIGN_RELATION_DISPLAYS.includes(definition.relations) ? definition.relations : 'none',
    actions: DESIGN_ACTION_DISPLAYS.includes(definition.actions) ? definition.actions : 'none',
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
