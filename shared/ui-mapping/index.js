// UI mapping contract (see README.md): one matcher table + one resolver per
// concern, total and deterministic. Pure functions over CTS descriptors,
// client-bundle type records, and compiled action records.
import { normalizeFilter, instanceMatchesFilter } from '#shared/instance-filters/index.js';
import {
  FIELD_EDIT_ENTRIES,
  FIELD_DISPLAY_ENTRIES,
  CHILDREN_TABS_AT,
  HEADER_ACTIONS_INLINE,
  LIST_LAYOUT_VALUES,
  SEARCH_AT,
  SURFACE_ROW_BUDGET,
  SMALL_LIST_AT,
  SPACING_SCALES,
  SPACING_STEPS,
  spacingClasses,
  TABLE_COLUMN_SCALE,
  TABLE_PAGE_ROWS,
  TABLE_PAGINATE_AT,
  TABLE_VIRTUALIZE_AT,
  CARD_FACT_SCALE,
  ROW_WEIGHT_BY_LAYOUT,
  SCALAR_BASES,
  SCREEN_DENSITY_AT,
  SURFACE_ENTRIES,
  PREVIEW_ENTRIES,
  RENDERABLE_PREVIEW_MODES,
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
  RENDERABLE_PREVIEW_MODES,
  LAYOUT,
  LIST_LAYOUT_VALUES,
  SEARCH_AT,
  SURFACE_ROW_BUDGET,
  SMALL_LIST_AT,
  SPACING_SCALES,
  SPACING_STEPS,
  spacingClasses,
  TABLE_COLUMN_SCALE,
  TABLE_PAGE_ROWS,
  TABLE_PAGINATE_AT,
  TABLE_VIRTUALIZE_AT,
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
  CHILDREN_TABS_AT,
  HEADER_ACTIONS_INLINE
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
  // An authored `control` on the descriptor pins the editor control
  // (edit variants only); display variants stay shape-derived projections.
  function resolveFieldControl(descriptor = {}, options = {}) {
    const variant = options.variant || 'detail';
    const edit = EDIT_VARIANTS.has(variant);
    const authored = edit && typeof descriptor.control === 'string' && descriptor.control
      ? descriptor.control
      : null;
    const entry = pickEntry(edit ? fieldEntries : fieldDisplayEntries, fieldCandidate(descriptor, variant));
    const props = { ...(entry.props || {}) };
    if (entry.unitSuffix && descriptor.unit) props.suffix = ` ${descriptor.unit}`;
    if (entry.filterable) props.filter = true;
    if (descriptor.base === 'enum' && edit) props.options = descriptor.values || [];
    if (descriptor.base === 'ref') props.accepts = descriptor.accepts || [];
    if (!edit) props.density = variant;
    return Object.freeze({ component: authored || entry.component, span: entry.span || 'half', props });
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
  // The preview mode is a payload trait (declared data, never guessed
  // from MIME or extension).
  function resolvePreview(typeRecord = {}) {
    const mode = typeRecord.payload?.preview
      || (typeRecord.payload ? 'attachment' : 'none');
    const entry = pickEntry(previewEntries, { preview: mode });
    return Object.freeze({
      component: entry.component,
      mode,
      mime: Object.freeze([...(typeRecord.payload?.mime || [])])
    });
  }

  // resolveActionButton(action, { type }) -> { component, tone, icon, confirm, hidden }
  // State-toned buttons read the target state's resolved display policy
  // from the bundle type record (`type.states.main.render[value]`).
  function resolveActionButton(action = {}, options = {}) {
    const stateTarget = action.state?.to ? true : null;
    const entry = pickEntry(actionEntries, {
      actionKind: action.actionKind || null,
      trigger: action.trigger?.mode || null,
      relation: action.relation ? true : null,
      stateTarget
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
    if (outcome.tone === 'state' && stateTarget) {
      const stateRender = options.type?.states?.main?.render?.[action.state.to];
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

  // resolveListLayout(typeRecord, { hierarchical, size }): shape-derived
  // only — the authored list-layout override channel is gone (display
  // derivation replaced it); the matcher table over `analyzeTypeShape`
  // decides.
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

// toolbarVisibleFor(node): the collection toolbar appears on list regions
// past SEARCH_AT, or whenever a multi-value enum facet exists. Title
// search always functions (instanceMatchesToolbar falls back to the id),
// so the bar is never gated on the descriptor vocabulary alone — a type
// with no enums and no identifier field still earns search on large
// collections, while a small enum-heavy collection still earns its facet
// selects.
export function toolbarVisibleFor(node = {}) {
  if (node.surfaceKind !== 'list') return false;
  const controls = node.listControls || {};
  const rows = Array.isArray(node.instances) ? node.instances.length : 0;
  if (rows > SEARCH_AT) return true;
  return (controls.facets || []).some(facet => (facet.values || []).length > 1);
}

// instanceMatchesToolbar(type, controls, instance, query, facetSelections):
// title-plus-fields substring match combined with facet value sets.
// Empty queries and empty selections are no-ops, so an untouched toolbar
// never filters anything out. The selection composes into the canonical
// instance-filter tree (see #shared/instance-filters) — an `or` of
// `contains` over the search keys plus the instance id (finding a row by
// its id stays functional even when the title never carries it) and one
// `in` predicate per facet (multi-select within a facet, conjunction
// across facets) — evaluated by the one matcher. Facet selections are
// value arrays; anything else drops as a no-op.
export function instanceMatchesToolbar(type = {}, controls = {}, instance = {}, query = '', facetSelections = {}) {
  const normalized = String(query || '').trim().toLowerCase();
  const search = normalized
    ? normalizeFilter({
      or: [
        ...((controls.searchKeys || []).map(key => ({ field: key, op: 'contains', value: normalized }))),
        { field: 'id', op: 'contains', value: normalized }
      ]
    })
    : null;
  const facets = normalizeFilter({
    and: Object.entries(facetSelections || {})
      .filter(([, values]) => Array.isArray(values) && values.length)
      .map(([name, values]) => ({ field: name, op: 'in', value: values }))
  });
  const filter = normalizeFilter({ and: [search, facets].filter(Boolean) });
  return instanceMatchesFilter(instance, filter);
}

// sortControlRows(rows, key, order): client-side ordering over the
// list-controls `sortKeys` shape (`{ name, base }`) — the same semantics
// for every surface that sorts without PrimeVue (cards, timelines):
// quantity rows order by their numeric `value`, numbers numerically,
// everything else by string comparison, absent values always last.
// Returns a new array; the input is never mutated.
export function sortControlRows(rows = [], key = {}, order = 1) {
  const direction = order < 0 ? -1 : 1;
  const read = key.base === 'quantity'
    ? row => row?.fields?.[key.name]?.value ?? null
    : row => row?.fields?.[key.name] ?? null;
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const left = read(a);
    const right = read(b);
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right)) * direction;
  });
}

// pageSlice(rows, first, rowsPerPage): the one paging cut for paged
// custom surfaces (timelines); DataTable/DataView page natively.
export function pageSlice(rows = [], first = 0, rowsPerPage = 10) {
  const list = Array.isArray(rows) ? rows : [];
  const start = Math.max(0, first || 0);
  const count = Math.max(1, rowsPerPage || 10);
  return list.slice(start, start + count);
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

// titleFor(record, typeView, { unnamedLabel }): the one record-title
// resolver — the value of the type's `identifier`-flagged field when
// non-empty, else the localized unnamed placeholder (default 'Unnamed';
// callers pass t('common.unnamed')). Never record ids, never slugs,
// never heuristics: a record without a declared title is unnamed.
export function titleFor(record = null, typeView = null, { unnamedLabel = 'Unnamed' } = {}) {
  const identifier = typeView?.identifier;
  const value = identifier ? record?.fields?.[identifier] : null;
  return typeof value === 'string' && value ? value : unnamedLabel;
}

// iconFor(typeView, record?): the one glyph resolver — the type's
// `glyph`, except that a given record with a non-empty `depiction.thumb`
// field value wins (the declared thumbnail is per-record data).
export function iconFor(typeView = null, record = null) {
  const thumbField = typeView?.depiction?.thumb;
  if (record && thumbField) {
    const value = record?.fields?.[thumbField];
    if (typeof value === 'string' && value) return value;
  }
  return typeView?.glyph || 'pi pi-circle';
}

const isFilled = value => !(value === null || value === undefined || value === ''
  || (Array.isArray(value) && !value.length));

// analyzeInstanceShape(type, instances): the value-aware second pass over
// the loaded instances — pure over the pool. Reports which fields actually
// carry data (column/facet materializations hide permanently empty ones)
// and the enum values present per field.
export function analyzeInstanceShape(typeRecord = {}, instances = []) {
  const rows = Array.isArray(instances) ? instances : [];
  const filledCounts = {};
  for (const instance of rows) {
    for (const [name, value] of Object.entries(instance?.fields || {})) {
      if (isFilled(value)) filledCounts[name] = (filledCounts[name] || 0) + 1;
    }
  }
  const enumValues = {};
  for (const [name, descriptor] of Object.entries(typeRecord.fields || {})) {
    if (descriptor.base !== 'enum') continue;
    const present = new Set();
    for (const instance of rows) {
      const value = instance?.fields?.[name];
      if (isFilled(value)) present.add(String(value));
    }
    enumValues[name] = Object.freeze([...present]);
  }
  const filledScalarNames = Object.keys(typeRecord.fields || {}).filter(name => filledCounts[name]);
  return Object.freeze({
    instanceCount: rows.length,
    filledScalarNames: Object.freeze(filledScalarNames),
    enumValues: Object.freeze(enumValues)
  });
}

// resolveListControls(type, instances): the compose-time list contract one
// collection surface consumes — search keys (the declared identifier
// field; the preferred-name and first-short-string heuristics are gone),
// filled scalar sort keys, enum facets over the values actually
// present, and the shared pagination budgets. Pure over the type record
// and the loaded instances. The authored default-sort override channel is
// gone (derivation replaced it): the first filled short scalar sorts by
// default.
export function resolveListControls(typeRecord = {}, instances = []) {
  const descriptors = typeRecord.fields || {};
  const shape = analyzeInstanceShape(typeRecord, instances);
  const sortKeys = shape.filledScalarNames
    .filter(name => {
      const descriptor = descriptors[name];
      if (!SCALAR_BASES.includes(descriptor.base)) return false;
      return !(descriptor.base === 'string' && (descriptor.multiline === true || (descriptor.max || 0) >= 120));
    })
    .map(name => ({ name, label: fieldLabel(name, descriptors[name]), base: descriptors[name].base }));
  const declaredIdentity = typeRecord.identifier;
  const shortStringNames = Object.entries(descriptors)
    .filter(([, descriptor]) => descriptor.base === 'string'
      && !(descriptor.multiline === true || (descriptor.max || 0) >= 120))
    .map(([name]) => name);
  const searchKeys = declaredIdentity && shortStringNames.includes(declaredIdentity)
    ? [declaredIdentity]
    : [];
  const facets = Object.entries(shape.enumValues)
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => ({ name, label: fieldLabel(name, descriptors[name]), values }));
  return Object.freeze({
    searchKeys: Object.freeze(searchKeys),
    sortKeys: Object.freeze(sortKeys.map(key => Object.freeze({ ...key }))),
    defaultSort: null,
    facets: Object.freeze(facets.map(facet => Object.freeze({ ...facet, values: Object.freeze([...facet.values]) }))),
    pagination: Object.freeze({
      paginateAt: TABLE_PAGINATE_AT,
      rows: TABLE_PAGE_ROWS,
      virtualizeAt: TABLE_VIRTUALIZE_AT
    })
  });
}

// builderFieldsForType(typeRecord, { bundle }): the filterable field list
// for one type — every scalar field (strings, enums, booleans, numbers,
// quantities, instants) plus one-hop traversal axes over the instance
// pool's addressing grammar (#shared/instance-filters): relation targets
// (`relations.<key>.<field>`), the lineage parent
// (`lineage.<lineageKey>.<field>`, derived from the parents' children
// edges — the child declaration carries no parent list), and children
// (`children.<type>.<field>` from the type's own edges). Labels read the
// authored vocabulary (relation key and type names start-cased, field
// labels through fieldLabel); JSON/blob/record/list fields are not
// filterable and never appear. Without a bundle only direct fields
// derive. Pure over the type record and bundle.
const BUILDER_FIELD_KINDS = Object.freeze({
  string: 'text', enum: 'enum', boolean: 'boolean',
  number: 'number', quantity: 'number', instant: 'instant'
});

function builderFieldOf(name, descriptor = {}, prefix = '', prefixLabel = '') {
  const kind = BUILDER_FIELD_KINDS[descriptor.base];
  if (!kind) return null;
  const label = fieldLabel(name, descriptor);
  return {
    name: `${prefix}${name}`,
    label: prefixLabel ? `${prefixLabel} → ${label}` : label,
    kind,
    ...(kind === 'enum' ? { values: Object.freeze([...(descriptor.values || [])]) } : {})
  };
}

function builderFieldsOfRecord(typeRecord = {}, prefix = '', prefixLabel = '') {
  return Object.entries(typeRecord.fields || {})
    .map(([name, descriptor]) => builderFieldOf(name, descriptor, prefix, prefixLabel))
    .filter(Boolean);
}

export function builderFieldsForType(typeRecord = {}, { bundle = null } = {}) {
  const typesById = new Map((bundle?.types || []).map(type => [type.id, type]));
  const target = typesById.get(typeRecord.id) || typeRecord;
  const fields = [...builderFieldsOfRecord(target)];
  for (const [key, edge] of Object.entries(target.edges?.relations || {})) {
    const related = typesById.get((edge?.types || [])[0]);
    if (!related) continue;
    fields.push(...builderFieldsOfRecord(related, `relations.${key}.`, startCaseKey(key)));
  }
  for (const edge of Object.values(target.edges?.children || {})) {
    for (const childId of edge?.types || []) {
      const child = typesById.get(childId);
      if (!child) continue;
      fields.push(...builderFieldsOfRecord(child, `children.${childId}.`, child.name || startCaseKey(childId)));
    }
  }
  for (const candidate of bundle?.types || []) {
    for (const [mapKey, edge] of Object.entries(candidate?.edges?.children || {})) {
      if (!(edge?.types || []).includes(target.id)) continue;
      const key = String(edge?.lineageKey || mapKey || '').trim();
      if (!key) continue;
      fields.push(...builderFieldsOfRecord(candidate, `lineage.${key}.`, candidate.name || 'Parent'));
    }
  }
  return Object.freeze(fields.map(field => Object.freeze(field)));
}

function startCaseKey(key = '') {
  return String(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

// The per-instance action kinds surface may offer without a
// form context: status transitions (updateInstance with a declared
// target), deletion, and instance-scoped commands. Plain updateInstance
// (the edit form), creates, relation link/unlink (owner-scoped), and
// event-triggered actions belong to their own surfaces.
const INSTANCE_ACTION_KINDS = Object.freeze(['updateInstance', 'deleteInstance', 'runCommand']);

// resolveInstanceActions(actions, typeId): the per-instance quick-action
// set for one collection type, from the compiled action map. Pure over
// the contract; the contract's own order wins (no re-sorting).
export function resolveInstanceActions(actions = {}, typeId = null) {
  if (!typeId) return [];
  return Object.values(actions).filter(action => action?.typeId === typeId
    && INSTANCE_ACTION_KINDS.includes(action?.actionKind)
    && action?.trigger?.mode === 'manual'
    && (action?.actionKind !== 'updateInstance' || action?.state?.to || action?.status?.to));
}

// planActionLaunch(action): how a screen launches one manual action —
// 'link' (the relation picker dialog), 'dialog' (the generated create
// dialog for any action carrying construction inputs), 'confirm' (the
// resolved action button's confirmation, i.e. the destructive kinds),
// else 'run'. The construction dialog wins over confirmation, and grant
// level is never a presentation signal: an admin-level create still opens
// its form instead of executing an empty draft behind a bare confirm.
export function planActionLaunch(action = {}) {
  if (action.actionKind === 'link') return 'link';
  if (action.construction?.inputs?.length) return 'dialog';
  return defaultMapping.resolveActionButton(action).confirm ? 'confirm' : 'run';
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
  // Rows grow with budgeted relation chips: the first declared relation's
  // refs across the loaded instances add wrapped chip rows to the weight.
  const relationKey = Object.keys(node.type?.edges?.relations || {})[0] || null;
  const relationRefs = relationKey
    ? (node.instances || []).reduce((sum, instance) => {
        const refs = instance.relations?.[relationKey];
        return sum + (Array.isArray(refs) ? refs.length : refs ? 1 : 0);
      }, 0)
    : 0;
  return 2 + (node.instances?.length || 0) * perRow + Math.ceil(relationRefs / 4);
}

// screenDensityFor(totalWeight, bias): density stays procedural — the
// global driver shifts the classification threshold (positive bias =
// relaxed, tolerates more weight before compacting), never overrides
// the outcome.
export function screenDensityFor(totalWeight = 0, bias = 0) {
  return totalWeight > SCREEN_DENSITY_AT + bias ? 'compact' : 'regular';
}

export function childrenModeFor(childRegions = [], level = 0) {
  if (childRegions.length < CHILDREN_TABS_AT) return 'stack';
  const weight = childRegions.reduce((sum, child) => sum + estimateRegionWeight(child), 0);
  if (weight > SURFACE_ROW_BUDGET && level === 0) return 'tabs';
  return 'stack';
}

// resolveFieldGroups(type): the derived-section projection — the bundle's
// `sections` (base-derived, total field assignment) with descriptor
// labels attached. Fields a stale bundle did not assign trail in an
// unlabeled default group so no field ever disappears.
export function resolveFieldGroups(type = {}) {
  const entries = Object.entries(type.fields || {})
    .map(([name, descriptor]) => ({ name, descriptor, label: fieldLabel(name, descriptor) }));
  const sections = Array.isArray(type.sections) ? type.sections : [];
  const assigned = new Set(sections.flatMap(section => section.fields || []));
  const groups = sections
    .map(section => ({
      id: section.id,
      label: null,
      fields: entries.filter(entry => (section.fields || []).includes(entry.name))
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

// Stable localization key derivation for generated surfaces: keys are
// deterministic per type/field/action id; locale files may define them,
// and materializations fall back to the resolver-derived label when a key
// is absent (localizedLabel). Keys carry no hand-authored vocabulary.
export function typeLabelKey(typeId) {
  return `uiMapping.types.${typeId}`;
}

export function fieldLabelKey(typeId, name) {
  return `uiMapping.fields.${typeId}.${name}`;
}

export function actionLabelKey(actionId) {
  return `uiMapping.actions.${actionId}`;
}

// localizedLabel(translator, key, fallback): translator is any
// `{ te, t }` pair (the vue-i18n instance/component scope). Absent keys
// fall back to the passed label; a missing translator is transparent.
export function localizedLabel(translator, key, fallback) {
  if (!translator || typeof translator.te !== 'function' || typeof translator.t !== 'function') return fallback;
  return translator.te(key) ? translator.t(key) : fallback;
}

// Create-dialog input resolution: compiled construction inputs are
// slot-qualified row paths ('data.note', 'specs.width'), the identity
// 'name', and lineage parent references ('lineage.<key>'), while the
// type's authored fields are bare row names. One resolver maps every
// input onto a dialog row: declared fields (matched by bare name or by
// slot-qualified path) render through their descriptor, the identity name
// renders as a plain string control, and a lineage input renders an
// instance picker over the parent types whose children edges declare that
// key for this type (reverse containment over the bundle). Inputs that
// resolve to nothing stay hidden — typed constructor inputs owned by
// editor surfaces keep their owners.
export function resolveCreateDialogInputs(action = {}, type = null, bundle = null) {
  const fields = type?.fields || {};
  const policyById = new Map((action.inputPolicy?.fields || []).map(field => [field?.id || field?.path, field]));
  const rows = [];
  for (const inputId of action.construction?.inputs || []) {
    const id = typeof inputId === 'string' ? inputId : String(inputId?.id || inputId?.path || '');
    if (!id) continue;
    const policy = policyById.get(id) || (typeof inputId === 'object' && inputId ? inputId : null);
    // SPEC §4 payload path: file inputs are protocol inputs, not row
    // fields — they ride the FileUpload control (accept policy comes
    // from the type's payload traits at render) instead of resolving
    // against declared fields.
    if (policy?.type === 'file' || policy?.base === 'blob' || policy?.base === 'file') {
      rows.push({ id, label: policy.label || fieldLabel(id), descriptor: { base: 'blob' }, span: 'full' });
      continue;
    }
    const fieldName = Object.hasOwn(fields, id)
      ? id
      : Object.keys(fields).find(name => id === `data.${name}` || id === `specs.${name}`);
    if (fieldName) {
      rows.push({
        id,
        label: fieldLabel(fieldName, fields[fieldName]),
        descriptor: fields[fieldName],
        span: 'half'
      });
      continue;
    }
    if (id === 'name') {
      rows.push({ id, label: fieldLabel('name'), descriptor: { base: 'string' }, span: 'half' });
      continue;
    }
    if (id.startsWith('lineage.')) {
      const key = id.slice('lineage.'.length);
      const accepts = parentTypesForChildrenKey(bundle, type?.id, key);
      if (accepts.length) {
        const parentLabel = (bundle?.types || []).find(candidate => candidate.id === accepts[0])?.name;
        rows.push({
          id,
          label: parentLabel || fieldLabel(key.replace(/Id$/, '')),
          lineage: { key, accepts },
          span: 'half'
        });
      }
    }
  }
  return Object.freeze(rows.map(row => Object.freeze(row)));
}

// The declared storage key of one children edge: the `lineageKey` the
// declaration carries (stamped at CTS edge normalize, SPEC §6), with the
// entry's map key as the raw-declaration fallback. Children instances
// store their parent under this key — matching by the map key alone reads
// an authoring identity no instance ever carries.
function lineageKeyOfEdge(edge = {}, mapKey = '') {
  return String(edge?.lineageKey || mapKey || '').trim();
}

// Reverse containment: the parent types whose children edges store
// `lineage.<key>` on `typeId`. The child's own declaration carries no
// parent list — the parents' edges are the declaration home; an edge
// matches when its DECLARED lineage key is the requested key.
function parentTypesForChildrenKey(bundle = null, typeId = '', key = '') {
  const parents = [];
  for (const candidate of bundle?.types || []) {
    for (const [mapKey, declaration] of Object.entries(candidate?.edges?.children || {})) {
      if (lineageKeyOfEdge(declaration, mapKey) !== key) continue;
      if ((declaration?.types || []).includes(typeId)) {
        parents.push(candidate.id);
        break;
      }
    }
  }
  return parents;
}

// Hierarchy materialization: the pool instances that are children of one
// parent instance through the type's declared children edges. Every edge
// contributes the instances of its declared child types whose
// `lineage[lineageKey]` resolves to the parent id. Pure over the bundle
// type record and pool — HierarchyTable and InstancePicker's hierarchical
// mode consume this one matcher so trees and pickers never disagree.
export function childrenOfParent(type = null, pool = {}, parentId = null) {
  const children = [];
  for (const declaration of Object.values(type?.edges?.children || {})) {
    for (const childTypeId of declaration?.types || []) {
      for (const instance of Object.values(pool[childTypeId] || {})) {
        if (instance.lineage?.[lineageKeyOfEdge(declaration)]?.id === parentId) {
          children.push(instance);
        }
      }
    }
  }
  return children;
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
