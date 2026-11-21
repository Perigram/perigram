// UI mapping contract: one matcher table + one resolver per
// concern, total and deterministic. Pure functions over CTS descriptors,
// client-bundle type records, and compiled action records.
import { normalizeFilter, instanceMatchesFilter } from '#shared/instance-filters/index.js';
import {
  FIELD_EDIT_ENTRIES,
  FIELD_DISPLAY_ENTRIES,
  CHILDREN_TABS_AT,
  HEADER_ACTIONS_INLINE,
  BOARD_MIN_COLUMNS,
  LIST_LAYOUT_VALUES,
  SEARCH_AT,
  SURFACE_ROW_BUDGET,
  SIDE_MAX_WEIGHT,
  COLUMN_MAX_WEIGHT,
  DOMINANT_CHILD_SHARE,
  REGION_COLUMN_EARNED_REM,
  REGION_SIDE_SPANS,
  SPACING_SCALES,
  SPACING_STEPS,
  spacingClasses,
  spacingCoefficientFor,
  SPACING_WEIGHT_AT,
  TABLE_COLUMN_SCALE,
  TABLE_PAGE_ROWS,
  TABLE_PAGINATE_AT,
  CARD_FACT_SCALE,
  ROW_WEIGHT_BY_LAYOUT,
  SCALAR_BASES,
  SURFACE_ENTRIES,
  PREVIEW_ENTRIES,
  RENDERABLE_PREVIEW_MODES,
  ASPECT_PREVIEW_MODES,
  ACTION_ENTRIES,
  LIST_LAYOUT_ENTRIES,
  SEVERITY_MAP,
  EDIT_VARIANTS,
  VARIANTS,
  CONTAINER_WIDTH_STEPS,
  HOST_PROFILES,
  FULL_BREADTH_LAYOUTS,
  BOUNDED_GROWTH_LAYOUTS,
  PAGINATED_GROWTH_LAYOUTS
} from './tables.js';

export {
  VARIANTS,
  SEVERITY_MAP,
  ROW_FIELD_BUDGET,
  RENDERABLE_PREVIEW_MODES,
  ASPECT_PREVIEW_MODES,
  LAYOUT,
  LAYOUT_ATOMS,
  LAYOUT_AMBIENT,
  LIST_LAYOUT_VALUES,
  BOARD_MIN_COLUMNS,
  SEARCH_AT,
  SURFACE_ROW_BUDGET,
  SPACING_SCALES,
  SPACING_STEPS,
  spacingClasses,
  spacingCoefficientFor,
  SPACING_WEIGHT_AT,
  TABLE_COLUMN_SCALE,
  TABLE_PAGE_ROWS,
  TABLE_PAGINATE_AT,
  CARD_FACT_SCALE,
  ROW_WEIGHT_BY_LAYOUT,
  GAP_BY_LEVEL,
  TYPE_BY_LEVEL,
  DETAIL_FACT_BUDGET,
  SCALAR_BASES,
  CHIP_BUDGET,
  SUMMARY_BUDGET,
  ROW_RELATION_BUDGET,
  CHILDREN_TABS_AT,
  HEADER_ACTIONS_INLINE,
  SIDE_MAX_WEIGHT,
  COLUMN_MAX_WEIGHT,
  DOMINANT_CHILD_SHARE,
  REGION_COLUMN_EARNED_REM,
  REGION_SIDE_SPANS,
  CONTAINER_WIDTH_STEPS,
  HOST_PROFILES,
  FULL_BREADTH_LAYOUTS,
  BOUNDED_GROWTH_LAYOUTS,
  PAGINATED_GROWTH_LAYOUTS
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

// The long-string rule in one home: multiline flags and max-length caps
// past LONG_STRING_AT make a string field prose.
export const isLongText = descriptor => descriptor?.base === 'string'
  && (descriptor.multiline === true || (descriptor.max || 0) >= LONG_STRING_AT);

// The quantitative-dominance signal (SPEC §22.8): the statlike shape —
// scalars dominated by numbers and quantities — earns a type the
// dashboard field presentations.
export function typeIsQuantitative(typeRecord = {}) {
  const fields = Object.values(typeRecord.fields || {});
  const scalars = fields.filter(descriptor => SCALAR_BASES.includes(descriptor.base) && !isLongText(descriptor));
  if (typeRecord.payload || scalars.length < 2) return false;
  const percents = scalars.filter(descriptor => descriptor.base === 'quantity' && descriptor.unit === 'percent');
  const quantities = scalars.filter(descriptor => descriptor.base === 'quantity' || descriptor.base === 'number');
  return percents.length + quantities.length >= Math.max(2, scalars.length - 1);
}

export function createUiMapping(overrides = {}) {
  const fieldEntries = [...(overrides.fields || []), ...FIELD_EDIT_ENTRIES];
  const fieldDisplayEntries = [...(overrides.fieldDisplay || []), ...FIELD_DISPLAY_ENTRIES];
  const surfaceEntries = [...(overrides.surfaces || []), ...SURFACE_ENTRIES];
  const previewEntries = [...(overrides.previews || []), ...PREVIEW_ENTRIES];
  const actionEntries = [...(overrides.actions || []), ...ACTION_ENTRIES];
  const listLayoutEntries = [...(overrides.listLayouts || []), ...LIST_LAYOUT_ENTRIES];

  function fieldCandidate(descriptor, variant, quantitative) {
    const base = descriptor.base;
    const candidate = { type: descriptor.type || null, base: base || null, variant };
    if (quantitative) candidate.quantitative = true;
    if (isLongText(descriptor)) candidate.long = true;
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
    const entry = pickEntry(edit ? fieldEntries : fieldDisplayEntries, fieldCandidate(descriptor, variant, options.quantitative === true));
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

  // resolveActionButton(action, { render, statePolicy }) -> { component, tone, icon, confirm, hidden }
  // State-toned buttons read the target state's resolved display policy
  // from the per-type state policy map (the compiled process contract's
  // flat vocabulary — SPEC §7).
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
      // Obvious actions (create "+", delete trash) render icon-only; the
      // label stays the tooltip/aria name — hosts may still force the
      // captioned form (menus keep labels).
      iconOnly: entry.iconOnly === true,
      hidden: false
    };
    if (outcome.tone === 'state' && stateTarget) {
      const display = stateDisplayFor(options.statePolicy || null, action.state.to);
      if (display) {
        outcome.severity = display.severity;
        outcome.icon = display.icon || outcome.icon;
        outcome.label = display.label;
      }
    }
    return Object.freeze(outcome);
  }

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
    const instants = fields.filter(descriptor => descriptor.base === 'instant');
    return Object.freeze({
      fieldCount: fields.length,
      scalarCount: scalars.length,
      instantCount: instants.length,
      hasMedia: Boolean(typeRecord.payload),
      // Temporal structure: two instants declare an interval (durational
      // — the gantt), one declares a schedule (the calendar). Durational
      // outranks chronological in the matcher — an interval is the
      // stronger structure than a prose stream.
      durational: instants.length >= 2,
      scheduled: instants.length === 1,
      chronological: longTexts.length >= 1 && scalars.length <= 4,
      statlike: !typeRecord.payload && scalars.length >= 2
        && percents.length + quantities.length >= Math.max(2, scalars.length - 1),
      metricField: Object.entries(typeRecord.fields || {}).find(([, descriptor]) => descriptor.base === 'quantity' && descriptor.unit === 'percent')?.[0]
        || Object.entries(typeRecord.fields || {}).find(([, descriptor]) => descriptor.base === 'quantity')?.[0]
        || null
    });
  }

  // resolveListLayout(typeRecord, { stateful }): the authored list-layout
  // override channel is gone (display derivation replaced it); the
  // matcher table over `analyzeTypeShape` decides. `stateful` is the
  // caller's derived signal that the region's served state vocabulary
  // spans enough values to board (hasStateVocabulary); it composes with
  // the process class and flat collections into the `boardable`
  // candidate signal. A class's list surface is always flat —
  // containment is navigation (the workspace explorer), never a
  // class-screen projection.
  function resolveListLayout(typeRecord = {}, options = {}) {
    const shape = analyzeTypeShape(typeRecord);
    const stateful = options.stateful === true;
    const entry = pickEntry(listLayoutEntries, {
      type: typeRecord.id || null,
      class: typeRecord.class || null,
      shape: shape.durational ? 'durational'
        : shape.chronological ? 'chronological'
          : shape.statlike ? 'statlike'
            : shape.scheduled ? 'scheduled'
              : null,
      stateful: stateful ? true : null,
      boardable: typeRecord.class === 'process' && stateful ? true : null
    });
    return entry.layout;
  }

  function cardVariantFor(typeRecord = {}) {
    const shape = analyzeTypeShape(typeRecord);
    if (shape.hasMedia) return 'media';
    if (shape.statlike) return 'stat';
    return 'text';
  }

  // cardAnatomyFor(typeRecord): the card-grid anatomy from the type's own
  // data shape — a visual preview (a renderable payload mode or a declared
  // preview source) with no fact fields renders the overlay `tile` (the
  // preview is the card, the identifier rides it in a badge); a visual
  // preview with facts renders `side` (the preview is a bounded left
  // column beside identity and facts); everything else renders `plain`
  // (identity row with the payload chip, then facts).
  function cardAnatomyFor(typeRecord = {}) {
    const preview = resolvePreview(typeRecord);
    const visual = RENDERABLE_PREVIEW_MODES.includes(preview.mode)
      || typeRecord.previewSource?.display === 'geometry';
    if (!visual) return 'plain';
    const identifier = typeRecord.identifier || null;
    const facts = Object.entries(typeRecord.fields || {})
      .filter(([name, descriptor]) => name !== identifier
        && descriptor.display !== 'hidden'
        && SCALAR_BASES.includes(descriptor.base)
        && !isLongText(descriptor))
      .length;
    return facts ? 'side' : 'tile';
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

  function cardFactCount(typeRecord = {}, { compact = false } = {}) {
    const shape = analyzeTypeShape(typeRecord);
    return scaledBudget(CARD_FACT_SCALE, shape.scalarCount, compact);
  }

  return {
    resolveFieldControl,
    resolveSurface,
    resolvePreview,
    resolveActionButton,
    resolveListLayout,
    analyzeTypeShape,
    cardVariantFor,
    cardAnatomyFor,
    tableColumnCount,
    cardFactCount
  };
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

export function formatQuantity(quantity, { locale } = {}) {
  if (!quantity || !Number.isFinite(quantity.value)) return '—';
  const suffix = UNIT_SYMBOLS[quantity.unit];
  if (suffix === undefined) return `${quantity.value} ${quantity.unit}`;
  const value = quantity.value.toLocaleString(locale, { maximumFractionDigits: 2 });
  return suffix ? `${value} ${suffix}` : value;
}

// titleFor(record, typeView, { unnamedLabel }): the one record-title
// resolver — the value of the type's `identifier`-flagged field when
// non-empty, else the localized unnamed placeholder (default 'Unnamed';
// callers pass t('common.unnamed')). Never record ids, never slugs,
// never heuristics: a record without a declared title is unnamed.
// The identifier field IS the identity slot of every surface (header
// title, card title, table identity column) — fact strips, card facts,
// and descriptor columns never repeat it (isIdentifierField).
export function isIdentifierField(typeView = null, name = '') {
  return Boolean(typeView?.identifier) && name === typeView.identifier;
}

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
  || (Array.isArray(value) && !value.length)
  // A quantity carrying a null value renders the fallback dash — the
  // value-aware pass treats it as unfilled, the same law as strings.
  || (value && typeof value === 'object' && !Array.isArray(value)
    && 'value' in value && (value.value === null || value.value === undefined)));

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
export function resolveListControls(typeRecord = {}, instances = [], { pool = null } = {}) {
  const descriptors = typeRecord.fields || {};
  const shape = analyzeInstanceShape(typeRecord, instances);
  const sortKeys = shape.filledScalarNames
    .filter(name => {
      const descriptor = descriptors[name];
      if (!SCALAR_BASES.includes(descriptor.base)) return false;
      return !isLongText(descriptor);
    })
    // The identifier field is the identity column — a descriptor column
    // would repeat the title on every row.
    .filter(name => !isIdentifierField(typeRecord, name))
    .map(name => ({ name, label: fieldLabel(name, descriptors[name]), base: descriptors[name].base }));
  const declaredIdentity = typeRecord.identifier;
  const shortStringNames = Object.entries(descriptors)
    .filter(([, descriptor]) => descriptor.base === 'string' && !isLongText(descriptor))
    .map(([name]) => name);
  // The natural default sort: the first filled short scalar, the same
  // first entry the sort keys list (the shared README's list-controls
  // contract) — collections open ordered, not in pool insertion order.
  const searchKeys = declaredIdentity && shortStringNames.includes(declaredIdentity)
    ? [declaredIdentity]
    : [];
  const facets = Object.entries(shape.enumValues)
    .filter(([, values]) => values.length > 0)
    .map(([name, values]) => ({ name, label: fieldLabel(name, descriptors[name]), values }));
  // The relation chip column: the first declared relation — an explicit
  // edge or a declared ref field (SPEC §6: one relation grammar; ref
  // field values store scalarized under `fields.<name>` at the construct
  // boundary or as ref objects under `relations.<name>` through relation
  // operations — readers take both) — a column only when any loaded
  // instance carries its refs, the same filledness law as scalar
  // columns.
  const refFieldNames = Object.entries(descriptors)
    .filter(([, descriptor]) => descriptor?.base === 'ref')
    .map(([name]) => name);
  const firstRelationKey = [
    ...Object.keys(typeRecord.edges?.relations || {}),
    ...refFieldNames
  ][0] || null;
  const relationColumn = firstRelationKey && instances.some(instance => {
    const refs = instance?.relations?.[firstRelationKey];
    if (Array.isArray(refs) ? refs.length > 0 : Boolean(refs)) return true;
    return refFieldNames.includes(firstRelationKey) && isFilled(instance?.fields?.[firstRelationKey]);
  })
    ? Object.freeze({ key: firstRelationKey })
    : null;
  // The compact structural summary column: the first declared structural
  // field (json/record/map) any loaded instance fills — the same
  // value-aware law as every other column. Structural data is data: a
  // collection carrying it is never a name pile.
  const hasStructuralValue = instance => value => {
    if (value === null || value === undefined) return false;
    return Array.isArray(value) ? value.length > 0 : typeof value === 'object' ? Object.keys(value).length > 0 : true;
  };
  const summaryEntry = Object.entries(descriptors)
    .filter(([, descriptor]) => ['json', 'record', 'map'].includes(descriptor?.base))
    .find(([name]) => instances.some(instance => hasStructuralValue(instance)(instance?.fields?.[name])))
    || null;
  const summaryColumn = summaryEntry ? Object.freeze({ key: summaryEntry[0] }) : null;
  // The children columns: one per declared children edge — every edge
  // is the parent's own facet (its key labels the column), each showing
  // only that edge's child instances as chips. The same filledness law
  // as every other column: an edge whose children no listed row carries
  // renders no column.
  const childrenColumns = pool
    ? Object.entries(typeRecord.edges?.children || {})
      .map(([edgeKey, declaration]) => ({
        edgeKey,
        types: Object.freeze([...(declaration?.types || [])]),
        filled: instances.some(instance => childrenOfParent(typeRecord, pool, instance.id, { edgeKey }).length > 0)
      }))
      .filter(entry => entry.types.length && entry.filled)
      .map(entry => Object.freeze({ key: entry.edgeKey, types: entry.types }))
    : [];
  const childrenColumnsFrozen = Object.freeze(childrenColumns);
  return Object.freeze({
    searchKeys: Object.freeze(searchKeys),
    sortKeys: Object.freeze(sortKeys.map(key => Object.freeze({ ...key }))),
    defaultSort: sortKeys[0]?.name || null,
    relationColumn,
    summaryColumn,
    childrenColumns: childrenColumnsFrozen,
    facets: Object.freeze(facets.map(facet => Object.freeze({ ...facet, values: Object.freeze([...facet.values]) }))),
    pagination: Object.freeze({
      paginateAt: TABLE_PAGINATE_AT,
      rows: TABLE_PAGE_ROWS,
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

// The stop-line label derivation shared by the display contract: the leaf
// segment of a value, start-cased.
export function startCaseKey(key = '') {
  return String(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

// --- State display policy (flat vocabulary, SPEC §7) ----------------------------
// Types declare nothing about states; the compiled producer workflows the
// hydration payload already carries own the vocabulary with the authored
// per-value policy (label/severity/icon/terminal). These three pure
// helpers are the one client-side derivation of that channel.

// stateSegmentsOf(value): the display path of one flat state value. Values
// are single segments by contract, but persisted data may carry dotted
// paths from the declaration-era tree migration (and the machine runtime
// keys nested states by dotted paths) — the split renders those as a
// segmented path instead of one opaque token.
export function stateSegmentsOf(value = '') {
  return String(value ?? '').split('.').filter(Boolean);
}

// statePolicyByType(producerOutputs, types): { [typeId]: { [value]:
// { label, severity, icon, terminal } } }. Graph workflows supply the
// states their transitions reach; the class declaration overrides the
// display policy of the values it declares.
export function statePolicyByType(producerOutputs = {}, types = []) {
  const byType = {};
  for (const output of Object.values(producerOutputs || {})) {
    const typeId = output?.typeId;
    if (!typeId || !output?.workflow) continue;
    const policies = byType[typeId] || (byType[typeId] = {});
    for (const region of Object.values(output.workflow.regions || {})) {
      for (const [value, definition = {}] of Object.entries(region.states || {})) {
        if (!value || policies[value]) continue;
        policies[value] = Object.freeze({
          label: definition.label || null,
          severity: definition.severity || null,
          icon: definition.icon || null,
          terminal: definition.isTerminal === true
        });
      }
    }
  }
  for (const type of types || []) {
    if (!type?.id || !type.stateVocabulary) continue;
    const policies = byType[type.id] || (byType[type.id] = {});
    for (const [value, declaration = {}] of Object.entries(type.stateVocabulary)) {
      const policy = declaration.policy || {};
      const existing = policies[value] || {};
      policies[value] = Object.freeze({
        label: policy.label || existing.label || null,
        severity: policy.severity || existing.severity || null,
        icon: policy.icon || existing.icon || null,
        terminal: declaration.terminal === true
      });
    }
  }
  return byType;
}

// stateFieldPolicyByType(producerOutputs): { [typeId]: { [value]:
// { visible, editable } } } from the same compiled workflows
// statePolicyByType reads (SPEC §7 `fieldPolicy`; the first authored
// entry for a value wins, matching that merge). Only states carrying a
// facet enter the map.
export function stateFieldPolicyByType(producerOutputs = {}) {
  const byType = {};
  for (const output of Object.values(producerOutputs || {})) {
    const typeId = output?.typeId;
    if (!typeId || !output?.workflow) continue;
    const policies = byType[typeId] || (byType[typeId] = {});
    for (const region of Object.values(output.workflow.regions || {})) {
      for (const [value, definition = {}] of Object.entries(region.states || {})) {
        if (!definition.fieldPolicy || policies[value]) continue;
        policies[value] = Object.freeze({
          visible: definition.fieldPolicy.visible || null,
          editable: definition.fieldPolicy.editable || null
        });
      }
    }
  }
  return byType;
}

// temporalFieldsFor(type): the temporal projection's field derivation —
// declared instants in declaration order are the interval for durational
// types (first start, second end) and the lone instant is the schedule
// date for scheduled types. Pure over the type record; null when the
// type declares no instants.
export function temporalFieldsFor(typeRecord = {}) {
  const instants = Object.entries(typeRecord.fields || {})
    .filter(([, descriptor]) => descriptor.base === 'instant');
  if (!instants.length) return null;
  return Object.freeze({
    start: instants[0][0],
    end: instants[1]?.[0] || null
  });
}

// hasStateVocabulary(statePolicy): the board projection's `stateful`
// signal — a served vocabulary spanning at least BOARD_MIN_COLUMNS
// values. One value is a tag, not a lane; none is no state surface at
// all.
export function hasStateVocabulary(statePolicy = null) {
  return Object.keys(statePolicy || {}).length >= BOARD_MIN_COLUMNS;
}

// stateTransitionsByType(producerOutputs): { [typeId]: [{ from, to,
// region, intent }] } from the same compiled producer workflows
// statePolicyByType reads — the authored machine's edges are the board
// projection's legal-move contract (a card may drop into a column only
// when an edge leads there from its current state). The first authored
// edge for a from→to pair wins, mirroring statePolicyByType's
// first-entry-wins; `region` is the owning workflow region key and
// `intent` the authored transition intent, both passed through so drops
// dispatch through the same state-service transition channel the detail
// header's buttons use.
export function stateTransitionsByType(producerOutputs = {}) {
  const byType = {};
  for (const output of Object.values(producerOutputs || {})) {
    const typeId = output?.typeId;
    if (!typeId || !output?.workflow) continue;
    const edges = byType[typeId] || (byType[typeId] = []);
    for (const [regionKey, region] of Object.entries(output.workflow.regions || {})) {
      for (const transition of region.transitions || []) {
        if (!transition?.from || !transition?.to) continue;
        if (transition.processOwned === true) continue;
        if (edges.some(edge => edge.from === transition.from && edge.to === transition.to)) continue;
        edges.push(Object.freeze({
          from: transition.from,
          to: transition.to,
          region: regionKey || null,
          intent: transition.intent || null
        }));
      }
    }
  }
  return byType;
}

// stateDisplayFor(policyByValue, value): the resolved display of one state
// value against a type's policy map — the single resolver every state
// surface (tags, table cells, transition buttons) reads. Lookup is exact
// first, then the leaf segment (authored policy rides the wired state
// node's own value). SPEC §7 defaults apply: the label derives from the
// leaf segment, terminal severity defaults to secondary, other severity
// to info. A value outside the served vocabulary still displays (stale
// data degrades to a neutral raw chip, known: false); a type without a
// vocabulary (null/empty map) renders no state surface at all.
export function stateDisplayFor(policyByValue = null, value = '') {
  const segments = stateSegmentsOf(value);
  if (!segments.length || !policyByValue || !Object.keys(policyByValue).length) return null;
  const leaf = segments[segments.length - 1];
  const policy = policyByValue[String(value)] || policyByValue[leaf] || null;
  if (!policy) {
    return { segments, label: startCaseKey(leaf), severity: 'secondary', icon: null, terminal: false, known: false };
  }
  // Entries arrive normalized (statePolicyByType: `terminal`) or straight
  // from a compiled machine's state definition (`isTerminal`).
  const terminal = policy.terminal === true || policy.isTerminal === true;
  return {
    segments,
    label: policy.label || startCaseKey(leaf),
    severity: SEVERITY_MAP[policy.severity] || (terminal ? 'secondary' : 'info'),
    icon: policy.icon || null,
    terminal,
    known: true
  };
}

// The per-instance action kinds the type-level contract may offer without a
// form or instance context: deletion and instance-scoped commands. Status
// transitions are per-instance machine facts (their legal target depends on
// the opened instance's current state), so they never ride this type-level
// set — the state service's machine-scoped transitions own them.
const INSTANCE_ACTION_KINDS = Object.freeze(['deleteInstance', 'runCommand']);

// resolveInstanceActions(actions, typeId): the per-instance quick-action
// set for one collection type, from the compiled action map. Pure over
// the contract; the contract's own order wins (no re-sorting).
export function resolveInstanceActions(actions = {}, typeId = null) {
  if (!typeId) return [];
  return Object.values(actions).filter(action => action?.typeId === typeId
    && INSTANCE_ACTION_KINDS.includes(action?.actionKind)
    && action?.trigger?.mode === 'manual');
}

// The compiled construct action's re-run (SPEC §24, owner decision
// 2026-10-27): a record whose provenance names a construct and derives
// from pinned sources (sources non-empty) carries the action that built
// it; the synthesized row launches that action with `rerun`, and the
// effect re-derives over the stored inputs. The row prompts nothing —
// the stored inputs are the run's inputs. Authored-content records
// (upload/editor constructs) are the replace affordance's business.
export function constructRerunAction(actions = {}, record = null) {
  const provenance = record?.provenance;
  if (!provenance?.sources?.length) return null;
  const op = provenance.op;
  const match = typeof op === 'string' ? op.match(/^cts\.construct:([^:]+)(?::([^:]+))?$/) : null;
  if (!match) return null;
  const action = actions[match[1]];
  if (!action || action.actionKind !== 'createInstance' || action.typeId !== record.type) return null;
  return {
    id: `${match[1]}:rerun`,
    actionKind: 'rerunInstance',
    rerunOf: match[1],
    rerun: true,
    typeId: action.typeId,
    labelKey: 'uiMapping.rederive',
    label: action.label || match[1],
    icon: 'pi pi-refresh',
    trigger: { mode: 'manual' },
    access: action.access || {},
    __rerun: true
  };
}

// Create controls for a collection surface: creates targeting one type
// collapse to a single control whose `group` carries every sibling, so a
// type with several creation modes renders one affordance that opens the
// mode-selecting create dialog. Creates for other types stay one control
// each; contract order is kept (each group leads with its first action).
export function createActionControls(actions = []) {
  const creates = (actions || []).filter(action => action?.actionKind === 'createInstance');
  const groupsByType = new Map();
  for (const action of creates) {
    const list = groupsByType.get(action.typeId) || [];
    list.push(action);
    groupsByType.set(action.typeId, list);
  }
  const seen = new Set();
  const controls = [];
  for (const action of creates) {
    if (seen.has(action.typeId)) continue;
    seen.add(action.typeId);
    controls.push({ action, group: groupsByType.get(action.typeId) });
  }
  return controls;
}

// Input-policy fields arrive under two compiled shapes: the native one
// (id = wire path) and the block-composed one (id = `field:`-prefixed
// path, the wire path on `path`). The wire path is the row id and the
// draft key the run's data channel reads.
const policyFieldPath = field => String(field?.path || field?.id || '').replace(/^field:/, '');
const isLineagePath = path => String(path || '').startsWith('lineage.');
const hasAuthoredDefault = field => field?.default !== undefined && field?.default !== null;

// planActionLaunch(action): how a screen launches one manual action —
// 'link' (the relation picker dialog), 'dialog' (the generated create
// dialog for any action carrying construction inputs, the run dialog for
// a run action carrying prompted inputs), 'confirm' (the resolved action
// button's confirmation, i.e. the destructive kinds), else 'run'. The
// construction dialog wins over confirmation, and grant level is never a
// presentation signal. A lineage axis the graph supplies without an
// authored default counts as a dialog row: its wire source is the launch
// context, and the dialog's launch-context channel seeds and hides it
// inside the parent's surface (auto-running when the context supplied
// every row).
export function planActionLaunch(action = {}) {
  if (action.actionKind === 'link') return 'link';
  const policyFields = action.inputPolicy?.fields;
  const dialogRows = policyFields != null
    ? policyFields.filter(field => (field?.prompt !== false)
      || (isLineagePath(policyFieldPath(field)) && !hasAuthoredDefault(field))).length
    : (action.construction?.inputs || []).length;
  if (dialogRows) return 'dialog';
  if (action.actionKind === 'runCommand' && resolveRunDialogInputs(action).length) return 'dialog';
  return defaultMapping.resolveActionButton(action).confirm ? 'confirm' : 'run';
}

// The run dialog rows: one per prompted exposure input. Descriptor derives
// from the input's declared parameter type so FieldControl renders the
// same controls row fields use; a unit-carrying default arrives in the
// quantity shape its control models.
export function resolveRunDialogInputs(action = {}) {
  return (action.inputs || [])
    .filter(input => input && input.prompt !== false)
    .map(input => ({
      id: input.id,
      label: input.label || input.id,
      descriptor: runInputDescriptor(input),
      span: 'half',
      required: input.required === true,
      ...(input.default !== undefined && input.default !== null
        ? { default: input.unit ? { value: input.default, unit: input.unit } : input.default }
        : {})
    }));
}

function runInputDescriptor(input = {}) {
  if (input.type === 'number') return { base: 'quantity', ...(input.unit ? { unit: input.unit } : {}) };
  if (input.type === 'boolean') return { base: 'boolean' };
  if (input.type === 'enum') return { base: 'enum', ...(Array.isArray(input.options) ? { options: input.options } : {}) };
  return { base: 'string' };
}

const VALUE_FALLBACK = '—';

export function formatValue(descriptor = {}, value, { locale } = {}) {
  if (value === null || value === undefined || value === '') return VALUE_FALLBACK;
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (Number.isFinite(value.value)) return formatQuantity(value, { locale });
    if (value.tag) return String(value.tag);
    if (value.id) return String(value.id);
    if (value.fileId) return String(value.fileId);
    return VALUE_FALLBACK;
  }
  if (Array.isArray(value)) return `${value.length}`;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return new Date(value).toLocaleDateString(locale);
  }
  switch (descriptor.base) {
    case 'quantity':
      return formatQuantity(value, { locale });
    case 'instant':
      return new Date(value).toLocaleDateString(locale);
    case 'boolean':
      return String(value);
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
  if (node.dataTraits) return node.dataTraits.weight;
  if (node.surfaceKind !== 'list') {
    const groups = node.groups || resolveFieldGroups(node.type || {});
    const facts = groups.reduce((sum, group) => sum + group.fields.length, 0);
    const structural = groups.reduce((sum, group) => sum
      + group.fields.filter(field => !SCALAR_BASES.includes(field.descriptor.base)).length, 0);
    const relationRefs = Object.values(node.instances?.[0]?.relations || {})
      .reduce((sum, refs) => sum + (Array.isArray(refs) ? refs.length : refs ? 1 : 0), 0);
    return facts + structural * 2 + Math.ceil(relationRefs / 4);
  }
  const count = node.instances?.length || 0;
  // The same derivation the materialization resolves — sibling
  // arrangement must weight the layout that actually renders.
  const layout = listLayoutOf(node);
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
  return 2 + count * perRow + Math.ceil(relationRefs / 4);
}

// Data traits (SPEC → Data traits): the compose-time record every
// arrangement decision consumes, one derivation frozen on the region
// node. Weight is `estimateRegionWeight`; the rest derive from the type
// record, the resolved layout, and the loaded pool.
export function shapeFamilyOf(typeRecord = {}, { stateful = false } = {}) {
  const shape = analyzeTypeShape(typeRecord);
  if (stateful) return 'stateful';
  if (shape.durational || shape.scheduled) return 'temporal';
  if (shape.chronological) return 'prose';
  if (shape.statlike) return 'measure';
  if (shape.hasMedia) return 'media';
  return 'plain';
}

// listLayoutOf(node): the one list-layout derivation — compose-time
// traits, weight estimation, and the RegionBlock materialization resolve
// the same layout over the same node, so the weighted arrangement is
// the rendered one.
export function listLayoutOf(node = {}) {
  return resolveListLayout(node.type || {}, {
    stateful: hasStateVocabulary(node.statePolicy)
  });
}

export function regionDataTraits(node = {}) {
  const instances = node.instances || [];
  const volume = instances.length;
  const stateful = hasStateVocabulary(node.statePolicy);
  if (node.surfaceKind !== 'list') {
    return Object.freeze({
      weight: estimateRegionWeight(node),
      breadth: 'content',
      volume,
      shape: shapeFamilyOf(node.type || {}, { stateful }),
      filledness: volume ? 'filled' : 'inert',
      growth: 'flowing'
    });
  }
  const layout = listLayoutOf(node);
  const breadth = FULL_BREADTH_LAYOUTS.includes(layout) ? 'full' : 'content';
  const growth = BOUNDED_GROWTH_LAYOUTS.includes(layout)
    || (PAGINATED_GROWTH_LAYOUTS.includes(layout) && volume > TABLE_PAGINATE_AT)
    ? 'bounded'
    : 'flowing';
  return Object.freeze({
    weight: estimateRegionWeight(node),
    breadth,
    volume,
    shape: shapeFamilyOf(node.type || {}, { stateful }),
    filledness: volume ? 'filled' : 'inert',
    growth
  });
}

// Container traits (SPEC → Container traits): the measured host width is
// the truth, the host profile the fallback; the record is plain data the
// pure arrangement consumes. A placement box (a side column, a column
// track) overrides `height`/`scroll` with the host record's values while
// measuring its own width. Density derives from the host profile alone
// (data-dense panes compact, pages and reading hosts neutral); no width
// step tightens a host that is already small. An explicit value (a
// placement box inheriting its host's density) wins over the derivation.
export function resolveContainerTraits({
  widthRem = null, hostKind = 'page', density = null, height = null, scroll = null
} = {}) {
  const profile = HOST_PROFILES[hostKind] || HOST_PROFILES.page;
  const width = Number.isFinite(widthRem)
    ? (widthRem >= CONTAINER_WIDTH_STEPS.wideRem ? 'wide'
      : widthRem >= CONTAINER_WIDTH_STEPS.mediumRem ? 'medium' : 'narrow')
    : profile.width;
  const profileDensity = Number.isFinite(density) ? density : (profile.density ?? 1);
  return Object.freeze({
    hostKind,
    width,
    widthRem: Number.isFinite(widthRem) ? widthRem : null,
    height: height || profile.height,
    scroll: scroll || profile.scroll,
    density: profileDensity
  });
}

function tabsOutcome(childRegions, weights) {
  return {
    mode: 'tabs',
    order: childRegions
      .map((region, index) => ({ id: region.id, weight: weights[index] }))
      .sort((a, b) => b.weight - a.weight)
      .map(entry => entry.id)
  };
}

// One step of the arrangement ladder (SPEC → Arrangement decision
// procedure): ordered rules over the children's data traits, earlier
// decisions binding later ones, the last rule terminal. Full-breadth
// children claim whole rows; a dominant sibling keeps the flow while its
// remainder arranges, else the set tabs; light peers share proportional
// columns at every step past narrow; a set past the budgets with a child
// too heavy to share tabs — tabs are the page-height bound, sitting at
// any tree level; a sibling set inside a tab arrangement stacks
// (SPEC §22.1, owner direction 2026-10-26); everything else stacks.
function arrangeForStep(childRegions, step, insideTabs) {
  if (childRegions.length < CHILDREN_TABS_AT) return { mode: 'stack' };
  const traitsOf = region => region.dataTraits || regionDataTraits(region);
  const weights = childRegions.map(region => estimateRegionWeight(region));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const primaryIndex = weights.indexOf(Math.max(...weights));
  const restRegions = childRegions.filter((_, index) => index !== primaryIndex);
  const restWeight = total - weights[primaryIndex];
  if (weights[primaryIndex] >= DOMINANT_CHILD_SHARE * total) {
    if (restWeight <= SURFACE_ROW_BUDGET) {
      return { mode: 'mixed', primary: primaryIndex, rest: arrangeChildren(restRegions, insideTabs) };
    }
    return insideTabs[step] ? { mode: 'stack' } : tabsOutcome(childRegions, weights);
  }
  const columnable = childRegions.filter(region => traitsOf(region).breadth !== 'full');
  const columnableWeights = columnable.map(region => estimateRegionWeight(region));
  if (step !== 'narrow' && columnable.length >= CHILDREN_TABS_AT
    && columnableWeights.every(weight => weight <= COLUMN_MAX_WEIGHT)) {
    const fullRow = childRegions
      .filter(region => traitsOf(region).breadth === 'full')
      .map(region => region.id);
    return {
      mode: 'columns',
      tracks: columnableWeights.map(weight => `minmax(0, ${Math.max(1, Math.round(weight))}fr)`).join(' '),
      ...(fullRow.length ? { fullRow } : {})
    };
  }
  // Full-row children within the column cap stack (the table is the
  // row-cheapest layout); a sibling past the cap is unreadable in flow.
  if (!insideTabs[step] && total > SURFACE_ROW_BUDGET
    && weights.some(weight => weight > COLUMN_MAX_WEIGHT)) {
    return tabsOutcome(childRegions, weights);
  }
  return { mode: 'stack' };
}

// No ancestor arrangement tabbed (SPEC §22.1): the default context every
// top-level set composes under.
export const TAB_ANCESTOR_NONE = Object.freeze({ narrow: false, medium: false, wide: false });

// Arrangement outcomes carried for every width step (SPEC → What it is):
// the composed tree is host-blind, the materialization engages the step
// its host grants, and a host change re-engages without recomposition.
// `insideTabs` carries, per step, whether an ancestor arrangement tabbed
// — a tabbed step excludes tabs in its descendants at that step.
export function arrangeChildren(childRegions = [], insideTabs = TAB_ANCESTOR_NONE) {
  return Object.freeze({
    narrow: arrangeForStep(childRegions, 'narrow', insideTabs),
    medium: arrangeForStep(childRegions, 'medium', insideTabs),
    wide: arrangeForStep(childRegions, 'wide', insideTabs)
  });
}

// The record side column earns width with the weight of the children it
// carries: a heavier child set claims a wider share of the 12-track
// record grid.
export function regionSideSpanFor(weight = 0) {
  const step = REGION_SIDE_SPANS.find(entry => weight > entry.at);
  return step ? step.span : REGION_SIDE_SPANS[REGION_SIDE_SPANS.length - 1].span;
}

// resolveFieldGroups(type): the derived-section projection — the bundle's
// `sections` (base-derived, total field assignment) with descriptor
// labels attached. Unassigned fields trail in an unlabeled default group.
export function resolveFieldGroups(type = {}) {
  const entries = Object.entries(type.fields || {})
    .filter(([, descriptor]) => descriptor.display !== 'hidden')
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
  const kebab = String(typeId || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
  return `uiMapping.types.${kebab}`;
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

// typeLabelFor(type, { t, te, entitiesLabelKey, unnamedLabel }): the one
// type-label chain, canonical in this module's README (Identity and
// labels). Takes a type record or a bare id; the app binding
// (`utils/generated-labels.js`) feeds the entities key and the
// registry-resolved record.
export function typeLabelFor(type, { t, te, entitiesLabelKey = '', unnamedLabel = 'Unnamed' } = {}) {
  const record = typeof type === 'string' ? { id: type } : (type || {});
  const translator = { t, te };
  const entities = localizedLabel(translator, entitiesLabelKey, '');
  if (entities) return entities;
  const generated = localizedLabel(translator, typeLabelKey(record.id || ''), '');
  if (generated) return generated;
  return record.name || unnamedLabel;
}

// Create-dialog input resolution — the contract (flat-wire input
// matching, row shapes, the prompted-identifier required law) is
// canonical in this module's README; keep this comment a pointer.
export function resolveCreateDialogInputs(action = {}, type = null, bundle = null) {
  const fields = type?.fields || {};
  const identifier = type?.identifier || null;
  const policyFields = action.inputPolicy?.fields || [];
  // The compiled input policy owns the row list: the compiler keeps it to
  // the fields the graph leaves unsupplied (wired producers and authored
  // socket defaults drop out), so a supplied field stays out of the
  // dialog. Lineage axes are the exception: their wire source is the
  // launch context, so an axis without an authored default stays a row
  // and the dialog's launch-context channel decides (a scoped launch
  // seeds and hides it, a contextless launch prompts it). Construction
  // inputs serve actions compiled without a policy. Row ids are wire
  // paths (the `field:`-prefixed ids of the block-composed shape map
  // onto their path).
  const source = policyFields.length
    ? policyFields.filter(field => field?.prompt !== false
      || (isLineagePath(policyFieldPath(field)) && !hasAuthoredDefault(field)))
    : [...(action.construction?.inputs || [])];
  const policyById = new Map(policyFields.map(field => [policyFieldPath(field), field]));
  const rows = [];
  for (const inputId of source) {
    const id = typeof inputId === 'string' ? inputId : policyFieldPath(inputId);
    if (!id) continue;
    const policy = policyById.get(id) || (typeof inputId === 'object' && inputId ? inputId : null);
    // SPEC §4 payload path: file inputs are protocol inputs, not row
    // fields — they ride the FileUpload control (accept policy comes
    // from the type's payload traits at render) instead of resolving
    // against declared fields.
    if (policy?.type === 'file' || policy?.base === 'blob' || policy?.base === 'file') {
      rows.push({ id, label: policy.label || fieldLabel(id), descriptor: { base: 'blob' }, span: 'full', required: policy?.required === true });
      continue;
    }
    const fieldName = Object.hasOwn(fields, id)
      ? id
      : Object.keys(fields).find(name => id === `fields.${name}`);
    if (fieldName) {
      rows.push({
        id,
        label: policy?.label || fieldLabel(fieldName, fields[fieldName]),
        descriptor: fields[fieldName],
        ...(policy?.control ? { control: policy.control } : {}),
        ...(policy?.controlOptions ? { controlOptions: policy.controlOptions } : {}),
        span: 'half',
        required: policy?.required === true || fieldName === identifier
      });
      continue;
    }
    // A lineage input is a containment-declared parent picker: the row
    // carries its binding (key, accepted parent types) so the launch
    // context seeds and hides it inside the parent's surface. Accepted
    // parents resolve over the bundle's children edges, the served
    // per-input parent type serving as the fallback (the policy field's
    // own typeId, the exposure input's typeId, or a parent-bound
    // create's `parentTypeId`) — without the binding the row degrades to
    // a context-free entity picker the launch context can never fill.
    if (id.startsWith('lineage.')) {
      const key = id.slice('lineage.'.length);
      const accepts = parentTypesForChildrenKey(bundle, type?.id, key);
      const declared = [policy?.typeId, policy?.accepts?.[0], policy?.type?.typeId].find(Boolean)
        || declaredParentTypeId(action, source, id);
      const accepted = accepts.length ? accepts : (declared ? [declared] : []);
      if (accepted.length) {
        const parentLabel = (bundle?.types || []).find(candidate => candidate.id === accepted[0])?.name;
        rows.push({
          id,
          label: parentLabel || policy?.label || fieldLabel(key.replace(/Id$/, '')),
          lineage: { key, accepts: accepted },
          span: 'half',
          required: policy?.required === true
        });
        continue;
      }
    }
    // A string protocol input (the `content` creation protocol's text
    // body): a scalar prompt row, its control pin riding the descriptor —
    // whether the construction input arrives as the full object or as
    // its bare id with the policy on the input policy (the served
    // contract summarizes inputs to ids).
    if (policy?.type === 'string') {
      rows.push({
        id,
        label: policy.label || fieldLabel(id),
        descriptor: {
          base: 'string',
          ...(policy.control ? { control: policy.control } : {}),
          ...(policy.controlOptions ? { controlOptions: policy.controlOptions } : {})
        },
        span: 'full',
        required: policy.required === true || id === identifier
      });
      continue;
    }
    // Construct operator reference inputs: typed pickers over the
    // operator's accepts — single refs pick one (`entity`), list refs pick
    // many (`typeList`). The pickers model `{ type, id }` refs; the
    // dialog's payload scalarizes them to bare ids. A `spot-parts` control
    // pin rewrites the list row into the per-spot assignment widget (the
    // template row supplies the spot vocabulary).
    if (policy?.type === 'entity' || policy?.type === 'typeList') {
      const accepts = policy.accepts?.length ? [...policy.accepts] : (policy.typeId ? [policy.typeId] : []);
      rows.push({
        id,
        label: policy.label || fieldLabel(id),
        descriptor: policy.type === 'entity'
          ? { base: 'ref', accepts }
          : { base: 'list', itemType: { base: 'ref' }, accepts },
        ...(policy.control ? { control: policy.control } : {}),
        span: policy.type === 'entity' ? 'half' : 'full',
        required: policy.required === true
      });
      continue;
    }
    // Operator data inputs (free-form maps, quantities, booleans): plain
    // rows over the policy's own base — a free-form object is the json
    // editor, a `template-values` pin renders the composition's token
    // form instead.
    if (policy?.type) {
      rows.push({
        id,
        label: policy.label || fieldLabel(id),
        descriptor: { base: policy.type === 'object' ? 'json' : policy.type },
        ...(policy.control ? { control: policy.control } : {}),
        ...(policy.controlOptions ? { controlOptions: policy.controlOptions } : {}),
        span: 'full',
        required: policy.required === true
      });
      continue;
    }
  }
  return Object.freeze(rows.map(row => Object.freeze(row)));
}

// A required create-dialog row counts as unfilled when its draft value is
// nullish, an empty string or list, or a cleared quantity; picker and file
// models are objects and count as filled. The create never runs with its
// record unnamed or a required construction input empty.
export function createDialogRowUnfilled(row = {}, value = undefined) {
  if (!row.required) return false;
  if (row.control === 'layer-mapping' && row.controlOptions?.requiredTarget) {
    const mapping = value && typeof value === 'object' && !Array.isArray(value) ? Object.values(value) : [];
    return !mapping.includes(row.controlOptions.requiredTarget);
  }
  return value == null || value === '' || (Array.isArray(value) && !value.length)
    || (value && typeof value === 'object' && value.unit !== undefined && (value.value == null || value.value === ''));
}

// The create-dialog draft as the run parameter channel wants it: picker
// refs (`{ type, id }`) scalarize to bare ids (a spot assignment keeps its
// spot beside the id), quantity controls (`{ value, unit }`) to their
// scalar, file references stay the payload object the construct path
// validates.
export function createDialogPayload(draft = {}) {
  const scalarize = value => {
    if (Array.isArray(value)) return value.map(scalarize);
    if (!value || typeof value !== 'object' || value.fileId) return value;
    if (value.id !== undefined) {
      return value.spot !== undefined ? { id: value.id, spot: value.spot } : value.id;
    }
    if (value.value !== undefined) return value.value;
    return value;
  };
  const payload = {};
  for (const [key, value] of Object.entries(draft || {})) {
    payload[key] = scalarize(value);
  }
  return payload;
}

// The one numeric-write rule every number/quantity control binds: a
// quantity descriptor drafts the SPEC §2 `{ value, unit }` shape, every
// other numeric base keeps the scalar. A nullish model starts at the
// descriptor's own base.
export function numericControlWrite(descriptor = {}, model, value) {
  if (model === null || model === undefined) {
    return descriptor.base === 'quantity' ? { value, unit: descriptor.unit } : value;
  }
  return typeof model === 'number' || descriptor.base !== 'quantity' ? value : { value, unit: descriptor.unit };
}

// The declared storage key of one children edge: the `lineageKey` the
// declaration carries (stamped at CTS edge normalize, SPEC §6), with the
// entry's map key as the raw-declaration fallback. Children instances
// store their parent under this key — matching by the map key alone reads
// an authoring identity no instance ever carries.
export function lineageKeyOfEdge(edge = {}, mapKey = '') {
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

// The served per-input parent type of one lineage axis when the bundle
// declares no children edge for it: the exposure inputs carry each
// input's declared `typeId` verbatim (`action.inputs`), and a
// parent-bound create names its context parent (`parentTypeId` — only a
// single-axis fallback, several axes cannot share it).
function declaredParentTypeId(action = {}, source = [], rowId = '') {
  const exposureInput = (action.inputs || []).find(input => (
    typeof input === 'object' && policyFieldPath(input) === rowId
  ));
  if (exposureInput) return exposureInput.typeId || exposureInput.type?.typeId || '';
  const lineageAxes = source.filter(entry => isLineagePath(
    typeof entry === 'string' ? entry : policyFieldPath(entry)
  ));
  if (lineageAxes.length !== 1) return '';
  const parentInput = (action.inputs || []).find(input => (
    typeof input === 'object' && String(input.id || '') === 'parent'
  ));
  return parentInput?.typeId || parentInput?.type?.typeId || action.parentTypeId || '';
}

// The incoming containment edges of one type: every children edge, on any
// type, that names it. Each entry is `{ parentTypeId, key }` with the
// edge's declared lineage key — the storage key a child instance's parent
// ref lives under. This is the cross-cut's resolution home: a list of a
// child-capable type renders each row's parent from these edges, the
// same declaration the tree projection nests through.
export function incomingChildrenEdges(bundle = null, typeId = '') {
  const edges = [];
  for (const parentType of bundle?.types || []) {
    for (const [mapKey, declaration] of Object.entries(parentType?.edges?.children || {})) {
      if (!(declaration?.types || []).includes(typeId)) continue;
      const key = lineageKeyOfEdge(declaration, mapKey);
      if (key) edges.push({ parentTypeId: parentType.id, key });
    }
  }
  return Object.freeze(edges);
}

// One instance's declared parent ref through those edges: the first
// incoming edge whose lineage key is stamped on the instance resolves
// `{ parentTypeId, parentId }` (both stored reference shapes match);
// an unstamped instance is a root and resolves null.
export function parentRefOf(instance = {}, edges = []) {
  for (const edge of edges) {
    const ref = instance.lineage?.[edge.key];
    const value = ref?.id ?? ref;
    if (value !== null && value !== undefined && value !== '') {
      return { parentTypeId: edge.parentTypeId, parentId: String(value) };
    }
  }
  return null;
}

// Hierarchy materialization: the pool instances that are children of one
// parent instance through the type's declared children edges. Every edge
// contributes the instances of its declared child types whose
// `lineage[lineageKey]` resolves to the parent id — references match in
// both stored shapes, the `{ id }` ref and the normalized id. Pure over the
// bundle type record and pool — InstancePicker's hierarchical mode and
// the workspace explorer consume this one matcher so pickers and
// navigation trees never disagree.
export function childrenOfParent(type = null, pool = {}, parentId = null, { edgeKey = null } = {}) {
  const children = [];
  const parentKey = parentId === null || parentId === undefined ? '' : String(parentId);
  if (!parentKey) return children;
  for (const [mapKey, declaration] of Object.entries(type?.edges?.children || {})) {
    if (edgeKey !== null && mapKey !== edgeKey) continue;
    for (const childTypeId of declaration?.types || []) {
      for (const instance of Object.values(pool[childTypeId] || {})) {
        const ref = instance.lineage?.[lineageKeyOfEdge(declaration, mapKey)];
        const value = ref?.id ?? ref;
        if (value !== null && value !== undefined && String(value) === parentKey) {
          children.push(instance);
        }
      }
    }
  }
  return children;
}

// (The class-screen tree projection and `hierarchyRootInstances` are
// gone by owner direction: a class's list surface shows that class's
// instances, flat — containment navigation is the workspace explorer's
// job. `childrenOfParent` above stays: the explorer and the pickers
// resolve nesting through it.)

export const defaultMapping = createUiMapping();
export const resolveFieldControl = defaultMapping.resolveFieldControl;
export const resolveSurface = defaultMapping.resolveSurface;
export const resolvePreview = defaultMapping.resolvePreview;
export const resolveActionButton = defaultMapping.resolveActionButton;
export const resolveListLayout = defaultMapping.resolveListLayout;
export const analyzeTypeShape = defaultMapping.analyzeTypeShape;
export const cardVariantFor = defaultMapping.cardVariantFor;
export const cardAnatomyFor = defaultMapping.cardAnatomyFor;
export const tableColumnCount = defaultMapping.tableColumnCount;
export const cardFactCount = defaultMapping.cardFactCount;
export { composeScreen, buildInstancePool, screenWeight, recordChildSectionKey, composeDocumentSections } from './screen.js';
