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

// Class-generic surface chrome derived from the type record alone: preview
// follows payload presence (files preview as attachments, detail surfaces
// hero) with the declared previewSource row as the payload-less channel,
// status follows the declared state axes, trace follows declared
// containment. Fact rows live in utils/fact-rows.js (the generated field
// vocabulary). Per-call patches compose on top.
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

/**
 * Surface chrome for shared instance primitives: preview treatment,
 * status/trace visibility, relation and action display per surface over
 * the served type record. Fact rows resolve through
 * utils/fact-rows.js (`instanceFactRows`).
 */
export function resolveInstanceDisplayContract({
  typeId = '',
  surface = DEFAULT_INSTANCE_SURFACE,
  variant = null,
  typeRecord = null,
  surfaces = null,
  overrides = null
} = {}) {
  const requestedSurface = normalizeInstanceSurface(surface || variant);
  const surfacePatch = surfaces?.[requestedSurface] || {};

  const resolvedSurface = mergeSurface(
    genericSurfaceFor(typeRecord, requestedSurface),
    surfacePatch,
    overrides
  );

  return {
    key: typeId,
    typeId,
    surface: requestedSurface,
    surfaceContract: normalizeSurfaceContract(requestedSurface, resolvedSurface)
  };
}

function mergeSurface(...surfaces) {
  return surfaces.filter(Boolean).reduce((merged, surface) => ({
    ...merged,
    ...surface
  }), {});
}

const DEFAULT_FIELD_LIMITS = { inline: 1, compact: 3 };

function normalizeSurfaceContract(surface = '', definition = {}) {
  return {
    preview: DESIGN_PREVIEW_MODES.includes(definition.preview) ? definition.preview : 'none',
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
