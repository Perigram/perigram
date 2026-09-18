// UI mapping contract (see README.md): one matcher table + one resolver per
// concern, total and deterministic. Pure functions over CTS descriptors,
// client-bundle type records, and compiled action records.
import {
  FIELD_EDIT_ENTRIES,
  FIELD_DISPLAY_ENTRIES,
  SURFACE_ENTRIES,
  PREVIEW_ENTRIES,
  ACTION_ENTRIES,
  SEVERITY_MAP,
  CHROME_ROLES,
  CHROME_TABLE,
  DEGRADE,
  EDIT_VARIANTS,
  VARIANTS
} from './tables.js';

export { VARIANTS, CHROME_ROLES } from './tables.js';

const ENUM_MANY_AT = 7;
const LONG_STRING_AT = 120;

export function createUiMapping(overrides = {}) {
  const fieldEntries = [...(overrides.fields || []), ...FIELD_EDIT_ENTRIES];
  const fieldDisplayEntries = [...(overrides.fieldDisplay || []), ...FIELD_DISPLAY_ENTRIES];
  const surfaceEntries = [...(overrides.surfaces || []), ...SURFACE_ENTRIES];
  const previewEntries = [...(overrides.previews || []), ...PREVIEW_ENTRIES];
  const actionEntries = [...(overrides.actions || []), ...ACTION_ENTRIES];

  function pickEntry(entries, candidate) {
    let best = null;
    let bestScore = -1;
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const match = entry.match || {};
      let score = 0;
      let matched = true;
      for (const [key, value] of Object.entries(match)) {
        if (candidate[key] === value) score += 1;
        else { matched = false; break; }
      }
      if (matched && score > bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    return best || entries[entries.length - 1];
  }

  function fieldCandidate(descriptor, variant) {
    const base = descriptor.base;
    const candidate = { type: descriptor.type || null, base: base || null, variant };
    if (base === 'string' && (descriptor.multiline === true
      || (Number.isFinite(descriptor.max) && descriptor.max >= LONG_STRING_AT))) {
      candidate.long = true;
    }
    if (base === 'enum') candidate.enumSize = (descriptor.values?.length || 0) > ENUM_MANY_AT ? 'many' : 'few';
    if (base === 'quantity') candidate.unit = descriptor.unit || null;
    if (base === 'ref') candidate.accepts = descriptor.accepts || null;
    return candidate;
  }

  // resolveFieldControl(descriptor, { variant }) -> { component, span, props }
  function resolveFieldControl(descriptor = {}, options = {}) {
    const variant = options.variant || 'detail';
    const edit = EDIT_VARIANTS.has(variant);
    const entry = pickEntry(edit ? fieldEntries : fieldDisplayEntries, fieldCandidate(descriptor, variant));
    const props = { ...(entry.props || {}) };
    if (entry.unitSuffix && descriptor.unit) props.suffix = ` ${descriptor.unit}`;
    if (entry.filterable) props.filter = true;
    if (descriptor.base === 'enum' && edit) props.options = descriptor.values || [];
    if (descriptor.base === 'ref') props.accepts = descriptor.accepts || [];
    if (!edit) props.density = variant;
    return Object.freeze({ component: entry.component, span: entry.span || 'half', props });
  }

  // resolveSurface(typeRecord, { variant }) -> { archetype, component, slots, budgets }
  function resolveSurface(typeRecord = {}, options = {}) {
    const variant = options.variant || 'detail';
    const entry = pickEntry(surfaceEntries, { type: typeRecord.id || null, class: typeRecord.class || null, variant });
    return Object.freeze({
      archetype: entry.archetype,
      component: entry.component,
      slots: Object.freeze([...(entry.slots || [])]),
      budgets: Object.freeze({ ...(entry.budgets || {}) })
    });
  }

  // resolvePreview(typeRecord) -> { component, mode, mime }
  function resolvePreview(typeRecord = {}) {
    const mode = typeRecord.render?.preview
      || typeRecord.payload?.preview
      || (typeRecord.payload ? 'attachment' : 'none');
    const entry = pickEntry(previewEntries, { preview: mode });
    return Object.freeze({
      component: entry.component,
      mode,
      mime: Object.freeze([...(typeRecord.payload?.mime || [])])
    });
  }

  // resolveActionButton(action, { render }) -> { component, tone, icon, confirm, hidden }
  function resolveActionButton(action = {}, options = {}) {
    const statusTarget = action.status?.to ? true : null;
    const entry = pickEntry(actionEntries, {
      actionKind: action.actionKind || null,
      trigger: action.trigger?.mode || null,
      relation: action.relation ? true : null,
      statusTarget
    });
    if (entry.hidden) {
      return Object.freeze({ component: null, tone: null, icon: null, confirm: false, hidden: true });
    }
    const outcome = {
      component: entry.component,
      tone: entry.tone,
      icon: entry.icon || null,
      confirm: entry.confirm === true,
      inline: entry.inline === true,
      hidden: false
    };
    if (outcome.tone === 'state' && statusTarget) {
      const stateRender = options.render?.states?.[action.status.to];
      outcome.severity = SEVERITY_MAP[stateRender?.severity] || 'secondary';
      outcome.icon = stateRender?.icon || outcome.icon;
      outcome.label = stateRender?.label || null;
    }
    return Object.freeze(outcome);
  }

  return {
    resolveFieldControl,
    resolveSurface,
    resolvePreview,
    resolveActionButton
  };
}

// Chrome: role + parent role -> token names. Same-role nesting degrades
// instead of painting the same surface twice.
export function resolveChrome(role = 'section', parentRole = null) {
  const table = CHROME_ROLES.includes(role) ? CHROME_TABLE[role] : CHROME_TABLE.section;
  if (parentRole && parentRole === role && DEGRADE[role]) {
    return Object.freeze({ role, flattened: true, ...DEGRADE[role] });
  }
  return Object.freeze({ role, flattened: false, surface: table.surface, padding: table.padding, border: table.border });
}

// Budgets: the container bounds unbounded slots; children never know.
export function applyBudget(items = [], budget = null) {
  if (!budget || !Number.isFinite(budget.max)) {
    return Object.freeze({
      mode: budget?.overflow === 'scroll' ? 'scroll' : 'all',
      visible: Object.freeze([...items]),
      hidden: 0
    });
  }
  const max = Math.max(0, budget.max);
  if (items.length <= max) {
    return Object.freeze({ mode: 'all', visible: Object.freeze([...items]), hidden: 0 });
  }
  return Object.freeze({
    mode: 'collapsed',
    visible: Object.freeze(items.slice(0, max)),
    hidden: items.length - max
  });
}

export const defaultMapping = createUiMapping();
export const resolveFieldControl = defaultMapping.resolveFieldControl;
export const resolveSurface = defaultMapping.resolveSurface;
export const resolvePreview = defaultMapping.resolvePreview;
export const resolveActionButton = defaultMapping.resolveActionButton;
