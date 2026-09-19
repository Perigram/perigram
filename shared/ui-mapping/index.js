// UI mapping contract (see README.md): one matcher table + one resolver per
// concern, total and deterministic. Pure functions over CTS descriptors,
// client-bundle type records, and compiled action records.
import {
  FIELD_EDIT_ENTRIES,
  FIELD_DISPLAY_ENTRIES,
  CHILDREN_TABS_AT,
  SURFACE_ROW_BUDGET,
  SMALL_LIST_AT,
  TABLE_COLUMN_SCALE,
  CARD_FACT_SCALE,
  ROW_WEIGHT_BY_LAYOUT,
  SCALAR_BASES,
  SCREEN_DENSITY_AT,
  SURFACE_ENTRIES,
  PREVIEW_ENTRIES,
  ACTION_ENTRIES,
  LIST_LAYOUT_ENTRIES,
  SEVERITY_MAP,
  CHROME_ROLES,
  CHROME_TABLE,
  DEGRADE,
  EDIT_VARIANTS,
  VARIANTS
} from './tables.js';

export {
  VARIANTS,
  CHROME_ROLES,
  SEVERITY_MAP,
  ROW_FIELD_BUDGET,
  LAYOUT,
  SURFACE_ROW_BUDGET,
  SMALL_LIST_AT,
  TABLE_COLUMN_SCALE,
  CARD_FACT_SCALE,
  ROW_WEIGHT_BY_LAYOUT,
  SCREEN_DENSITY_AT,
  DENSITY,
  GAP_BY_LEVEL,
  TYPE_BY_LEVEL,
  DETAIL_FACT_BUDGET,
  SCALAR_BASES,
  CHIP_BUDGET,
  SUMMARY_BUDGET,
  ROW_RELATION_BUDGET,
  CHILDREN_TABS_AT
} from './tables.js';

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

const ENUM_MANY_AT = 7;
const LONG_STRING_AT = 120;

export function createUiMapping(overrides = {}) {
  const fieldEntries = [...(overrides.fields || []), ...FIELD_EDIT_ENTRIES];
  const fieldDisplayEntries = [...(overrides.fieldDisplay || []), ...FIELD_DISPLAY_ENTRIES];
  const surfaceEntries = [...(overrides.surfaces || []), ...SURFACE_ENTRIES];
  const previewEntries = [...(overrides.previews || []), ...PREVIEW_ENTRIES];
  const actionEntries = [...(overrides.actions || []), ...ACTION_ENTRIES];
  const listLayoutEntries = [...(overrides.listLayouts || []), ...LIST_LAYOUT_ENTRIES];

  function fieldCandidate(descriptor, variant) {
    const base = descriptor.base;
    const candidate = { type: descriptor.type || null, base: base || null, variant };
    if (base === 'string' && (descriptor.multiline === true
      || (Number.isFinite(descriptor.max) && descriptor.max >= LONG_STRING_AT))) {
      candidate.long = true;
    }
    if ((base === 'number' || base === 'quantity')
      && Number.isFinite(descriptor.min) && Number.isFinite(descriptor.max)) {
      candidate.bounded = true;
    }
    if ((base === 'list' || base === 'map') && descriptor.itemType?.base === 'quantity') {
      candidate.itemUnit = descriptor.itemType.unit || null;
    }
    if (base === 'enum') {
      candidate.enumSize = (descriptor.values?.length || 0) > ENUM_MANY_AT ? 'many' : 'few';
      const values = descriptor.values || [];
      candidate.ordinal = values.length >= 3
        && values.every(value => /^(?:p|v|t|tier|level|grade|rank|s)?\d+$/i.test(String(value))) ? true : null;
    }
    if (base === 'quantity') candidate.unit = descriptor.unit || null;
    if (base === 'ref') candidate.accepts = descriptor.accepts || null;
    if (base === 'list' || base === 'map') candidate.itemBase = descriptor.itemType?.base || null;
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

  const isLongText = descriptor => descriptor?.base === 'string'
    && (descriptor.multiline === true || (descriptor.max || 0) >= 120);

  // analyzeTypeShape(type): the shape signals that pick presentations —
  // a chronological type is prose-or-instant dominant (timeline), a
  // statlike type carries mostly percent/quantity scalars (stat cards),
  // media types have payloads, wide types have many scalar fields.
  function analyzeTypeShape(typeRecord = {}) {
    const fields = Object.values(typeRecord.fields || {});
    const scalars = fields.filter(descriptor => SCALAR_BASES.includes(descriptor.base) && !isLongText(descriptor));
    const longTexts = fields.filter(isLongText);
    const percents = scalars.filter(descriptor => descriptor.base === 'quantity' && descriptor.unit === 'percent');
    const quantities = scalars.filter(descriptor => descriptor.base === 'quantity' || descriptor.base === 'number');
    const chronologySignal = typeRecord.states?.main ? 0 : 1;
    return Object.freeze({
      fieldCount: fields.length,
      scalarCount: scalars.length,
      hasMedia: Boolean(typeRecord.payload),
      chronological: longTexts.length >= 1 && scalars.length <= 3 + chronologySignal,
      statlike: !typeRecord.payload && scalars.length >= 2
        && percents.length + quantities.length >= Math.max(2, scalars.length - 1),
      metricField: Object.entries(typeRecord.fields || {}).find(([, descriptor]) => descriptor.base === 'quantity' && descriptor.unit === 'percent')?.[0]
        || Object.entries(typeRecord.fields || {}).find(([, descriptor]) => descriptor.base === 'quantity')?.[0]
        || null
    });
  }

  // resolveListLayout(typeRecord, { hierarchical, size })
  function resolveListLayout(typeRecord = {}, options = {}) {
    const shape = analyzeTypeShape(typeRecord);
    const entry = pickEntry(listLayoutEntries, {
      type: typeRecord.id || null,
      class: typeRecord.class || null,
      shape: shape.chronological ? 'chronological' : shape.statlike ? 'statlike' : null,
      hierarchical: options.hierarchical === true ? true : null,
      size: options.size === 'small' ? 'small' : options.size === 'large' ? 'large' : null
    });
    return entry.layout;
  }

  function cardVariantFor(typeRecord = {}) {
    const shape = analyzeTypeShape(typeRecord);
    if (shape.hasMedia) return 'media';
    if (shape.statlike) return 'stat';
    return 'text';
  }

  function scaledBudget(scale, available, compact = false) {
    const cap = compact ? Math.max(2, scale[0].columns - 1) : Infinity;
    for (const step of scale) {
      if (available >= step.at) {
        const value = 'columns' in step ? step.columns : step.facts;
        return Math.min(available, compact ? Math.min(value, cap) : value);
      }
    }
    return scale[scale.length - 1].columns || scale[scale.length - 1].facts;
  }

  function tableColumnCount(typeRecord = {}, compact = false) {
    const shape = analyzeTypeShape(typeRecord);
    return scaledBudget(TABLE_COLUMN_SCALE, shape.scalarCount, compact);
  }

  function cardFactCount(typeRecord = {}) {
    const shape = analyzeTypeShape(typeRecord);
    return scaledBudget(CARD_FACT_SCALE, shape.scalarCount);
  }

  return {
    resolveFieldControl,
    resolveSurface,
    resolvePreview,
    resolveActionButton,
    resolveListLayout,
    analyzeTypeShape,
    cardVariantFor,
    tableColumnCount,
    cardFactCount
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

const UNIT_SYMBOLS = Object.freeze({
  mm: 'mm', m2: 'm²', min: 'min', deg: '°', percent: '%', currency: '', count: ''
});

export function formatQuantity(quantity) {
  if (!quantity || !Number.isFinite(quantity.value)) return '—';
  const suffix = UNIT_SYMBOLS[quantity.unit];
  if (suffix === undefined) return `${quantity.value} ${quantity.unit}`;
  const value = quantity.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return suffix ? `${value} ${suffix}` : value;
}

export function instanceIdentity(type, instance) {
  if (!instance) return '?';
  const fields = instance.fields || {};
  const declared = type?.render?.identityField;
  if (declared && typeof fields[declared] === 'string' && fields[declared]) return fields[declared];
  const preferred = ['serial', 'designation', 'title', 'grade', 'name', 'summary'];
  for (const key of preferred) {
    if (typeof fields[key] === 'string' && fields[key]) return fields[key];
  }
  const descriptors = type?.fields || {};
  const firstShortString = Object.entries(descriptors).find(([name, descriptor]) => descriptor.base === 'string'
    && !(descriptor.multiline === true || (descriptor.max || 0) >= 120)
    && typeof fields[name] === 'string'
    && fields[name]);
  return firstShortString ? firstShortString[1] : instance.id;
}

const VALUE_FALLBACK = '—';

export function formatValue(descriptor = {}, value) {
  if (value === null || value === undefined || value === '') return VALUE_FALLBACK;
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (Number.isFinite(value.value)) return formatQuantity(value);
    if (value.tag) return String(value.tag);
    if (value.id) return String(value.id);
    if (value.fileId) return String(value.fileId);
    return VALUE_FALLBACK;
  }
  if (Array.isArray(value)) return `${value.length}`;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value).toLocaleDateString();
  }
  switch (descriptor.base) {
    case 'quantity':
      return formatQuantity(value);
    case 'instant':
      return new Date(value).toLocaleDateString();
    case 'boolean':
      return value ? '✓' : '—';
    case 'enum':
      return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
    case 'ref':
      return value.id;
    case 'list':
      return Array.isArray(value) ? `${value.length}` : VALUE_FALLBACK;
    default:
      return typeof value === 'object' ? VALUE_FALLBACK : String(value);
  }
}

export function estimateRegionWeight(node = {}) {
  if (node.surfaceKind !== 'list') {
    const groups = node.groups || resolveFieldGroups(node.type || {});
    const facts = groups.reduce((sum, group) => sum + group.fields.length, 0);
    const structural = groups.reduce((sum, group) => sum
      + group.fields.filter(field => !SCALAR_BASES.includes(field.descriptor.base)).length, 0);
    const relationRefs = Object.values(node.instances?.[0]?.relations || {})
      .reduce((sum, refs) => sum + (Array.isArray(refs) ? refs.length : refs ? 1 : 0), 0);
    return facts + structural * 2 + Math.ceil(relationRefs / 4);
  }
  const layout = resolveListLayout(node.type || {}, {
    hierarchical: Boolean(Object.keys(node.type?.edges?.children || {}).length)
  });
  const perRow = ROW_WEIGHT_BY_LAYOUT[layout] || 1;
  return 2 + (node.instances?.length || 0) * perRow;
}

export function screenDensityFor(totalWeight = 0) {
  return totalWeight > SCREEN_DENSITY_AT ? 'compact' : 'regular';
}

export function childrenModeFor(childRegions = [], level = 0) {
  if (childRegions.length < CHILDREN_TABS_AT) return 'stack';
  const weight = childRegions.reduce((sum, child) => sum + estimateRegionWeight(child), 0);
  if (weight > SURFACE_ROW_BUDGET && level === 0) return 'tabs';
  return 'stack';
}

export function resolveFieldGroups(type = {}) {
  const declared = type.render?.groups || [];
  const entries = Object.entries(type.fields || {})
    .map(([name, descriptor]) => ({ name, descriptor, label: fieldLabel(name, descriptor) }));
  const assigned = new Set(declared.flatMap(group => group.fields || []));
  const groups = declared
    .map(group => ({
      id: group.id,
      label: group.label || String(group.id).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase()),
      fields: entries.filter(entry => (group.fields || []).includes(entry.name))
    }))
    .filter(group => group.fields.length);
  const rest = entries.filter(entry => !assigned.has(entry.name));
  if (rest.length) groups.push({ id: 'default', label: null, fields: rest });
  return Object.freeze(groups.map(group => Object.freeze({ ...group, fields: Object.freeze(group.fields) })));
}

export function fieldLabel(name, descriptor = {}) {
  if (descriptor.label) return descriptor.label;
  return String(name).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

export const defaultMapping = createUiMapping();
export const resolveFieldControl = defaultMapping.resolveFieldControl;
export const resolveSurface = defaultMapping.resolveSurface;
export const resolvePreview = defaultMapping.resolvePreview;
export const resolveActionButton = defaultMapping.resolveActionButton;
export const resolveListLayout = defaultMapping.resolveListLayout;
export const analyzeTypeShape = defaultMapping.analyzeTypeShape;
export const cardVariantFor = defaultMapping.cardVariantFor;
export const tableColumnCount = defaultMapping.tableColumnCount;
export const cardFactCount = defaultMapping.cardFactCount;
export { composeScreen, buildInstancePool } from './screen.js';
