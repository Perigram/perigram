// Default matcher tables for the UI mapping contract (see README.md).
// Pure data: component keys are strings resolved by the app-side registry;
// no Vue, PrimeVue, or domain names live here.

// Display-family variants resolve read-only presentations; editor-family
// variants resolve input controls. One variant vocabulary everywhere.
export const VARIANTS = Object.freeze(['full', 'detail', 'row', 'inline']);
const EDIT_VARIANTS = new Set(['full', 'detail']);

export const SPANS = Object.freeze(['full', 'half']);

// --- Fields -----------------------------------------------------------------

// Editor-family entries. `long`, `enumSize`, and `itemBase` are
// resolver-derived qualifiers (multiline string, option-count bucket,
// list element base), not authored keys. Component keys name the
// materialization family: QuantityInput -> InputGroup + InputNumber +
// unit addon, SelectButton for few-option enums, InputChips for string
// lists, MultiSelect for reference lists, FileUpload for payload blobs.
export const FIELD_EDIT_ENTRIES = Object.freeze([
  { match: { base: 'string', long: true }, component: 'Textarea', span: 'full' },
  { match: { base: 'string' }, component: 'InputText', span: 'half' },
  { match: { base: 'number' }, component: 'InputNumber', span: 'half' },
  { match: { base: 'quantity' }, component: 'QuantityInput', span: 'half', unitSuffix: true },
  { match: { base: 'boolean' }, component: 'ToggleSwitch', span: 'half' },
  { match: { base: 'instant' }, component: 'DatePicker', span: 'half' },
  { match: { base: 'enum', enumSize: 'many' }, component: 'Select', span: 'half', filterable: true },
  { match: { base: 'enum' }, component: 'SelectButton', span: 'full' },
  { match: { base: 'ref' }, component: 'EntityPicker', span: 'half' },
  { match: { base: 'list', itemBase: 'string' }, component: 'ChipsInput', span: 'full' },
  { match: { base: 'list', itemBase: 'ref' }, component: 'EntityMultiPicker', span: 'full' },
  { match: { base: 'blob' }, component: 'FileUpload', span: 'full' },
  { match: { base: 'record' }, component: 'ObjectEditor', span: 'full', recursive: true },
  { match: { base: 'map' }, component: 'ObjectEditor', span: 'full' },
  { match: { base: 'json' }, component: 'ObjectEditor', span: 'full' },
  { match: { base: 'list' }, component: 'ListEditor', span: 'full', recursive: true },
  { match: { base: 'variant' }, component: 'VariantEditor', span: 'full', recursive: true },
  { match: {}, component: 'ObjectEditor', span: 'full' }
]);

// Display-family entries: compact value presentations for rows and inline
// contexts. The resolved density ('row' | 'inline') travels as a prop.
// Data-shaped refinements: percent quantities render as Knob dials, string
// lists render as budgeted chips.
export const FIELD_DISPLAY_ENTRIES = Object.freeze([
  { match: { base: 'quantity', unit: 'percent' }, component: 'Knob', span: 'half' },
  { match: { base: 'enum' }, component: 'Tag', span: 'half' },
  { match: { base: 'ref' }, component: 'EntityChip', span: 'half' },
  { match: { base: 'quantity' }, component: 'QuantityText', span: 'half' },
  { match: { base: 'instant' }, component: 'InstantText', span: 'half' },
  { match: { base: 'boolean' }, component: 'BooleanIcon', span: 'half' },
  { match: { base: 'blob' }, component: 'FileChip', span: 'half' },
  { match: { base: 'list', itemBase: 'string' }, component: 'ChipsDisplay', span: 'full' },
  { match: { base: 'record' }, component: 'ObjectSummary', span: 'half' },
  { match: { base: 'map' }, component: 'ObjectSummary', span: 'half' },
  { match: { base: 'json' }, component: 'ObjectSummary', span: 'half' },
  { match: { base: 'list' }, component: 'ListSummary', span: 'half' },
  { match: { base: 'variant' }, component: 'VariantTag', span: 'half' },
  { match: {}, component: 'ValueText', span: 'half' }
]);

// List-region layout entries: the presentation of a collection is a
// resolver decision, not a component branch. `hierarchical` is true when
// the collected type declares lineage children.
export const LIST_LAYOUT_ENTRIES = Object.freeze([
  { match: { type: 'log_entry' }, layout: 'timeline' },
  { match: { class: 'file' }, layout: 'card-grid' },
  { match: { hierarchical: true }, layout: 'tree-table' },
  { match: {}, layout: 'table' }
]);

// Presentation budgets and thresholds consumed by materializations so the
// numbers live with the rest of the design-system defaults.
export const TABLE_COLUMN_BUDGET = Object.freeze({ max: 3, overflow: 'count' });
export const CARD_FACT_BUDGET = Object.freeze({ max: 2, overflow: 'count' });
export const CHIP_BUDGET = Object.freeze({ max: 3, overflow: 'count' });
export const SUMMARY_BUDGET = Object.freeze({ max: 4, overflow: 'count' });
export const ROW_RELATION_BUDGET = Object.freeze({ max: 2, overflow: 'count' });
export const CHILDREN_TABS_AT = 2;
export const DETAIL_FACT_BUDGET = Object.freeze({ max: 4, overflow: 'count' });

export const SCALAR_BASES = Object.freeze(['string', 'number', 'quantity', 'instant', 'boolean', 'enum']);

// Layout vocabulary: the only layout classes the materializations may use.
// Components never declare gaps, grids, or stacks of their own — PrimeVue
// components own their internal layout, and everything else comes from
// this table so the design system stays procedural and overridable.
export const LAYOUT = Object.freeze({
  stack: 'flex flex-col gap-6',
  stackTight: 'flex flex-col gap-3',
  row: 'flex flex-wrap items-center gap-2',
  rowBetween: 'flex flex-wrap items-center justify-between gap-2',
  factsGrid: 'grid grid-cols-2 items-start gap-x-6 gap-y-4 md:grid-cols-4',
  formGrid: 'grid grid-cols-1 items-start gap-x-4 gap-y-4 md:grid-cols-2',
  cardGrid: 'grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4',
  scrollX: 'w-full overflow-x-auto',
  clip: 'overflow-hidden',
  bounded: 'w-full max-w-[var(--ck-bounded-grid-item-max-width)]',
  dialog: 'w-full max-w-full sm:w-[36rem]'
});

// Row-variant field budgets: dense rows show a bounded number of fields and
// count the rest, reusing the same budget mechanism as slot cardinality.
export const ROW_FIELD_BUDGET = Object.freeze({ max: 3, overflow: 'count' });

// --- Surfaces ---------------------------------------------------------------

// Class presets pick the archetype family; the container picks the variant.
// `slots` are the fillable surface slots; `budgets` bound unbounded slots.
export const SURFACE_ENTRIES = Object.freeze([
  {
    match: { class: 'file', variant: 'full' },
    archetype: 'viewer', component: 'FileViewerSurface',
    slots: ['preview', 'meta']
  },
  {
    match: { class: 'file', variant: 'detail' },
    archetype: 'payload-card', component: 'FileCard',
    slots: ['preview', 'meta']
  },
  { match: { class: 'file', variant: 'row' }, archetype: 'file-row', component: 'FileRow', slots: ['meta'] },
  { match: { class: 'file', variant: 'inline' }, archetype: 'chip', component: 'FileChip', slots: [] },
  {
    match: { class: 'item', variant: 'full' },
    archetype: 'record-sheet', component: 'ItemSheet',
    slots: ['identity', 'status', 'fields', 'relations']
  },
  {
    match: { class: 'item', variant: 'detail' },
    archetype: 'record-card', component: 'ItemCard',
    slots: ['identity', 'status', 'fields', 'relations'],
    budgets: { relations: { max: 6, overflow: 'more' } }
  },
  {
    match: { class: 'item', variant: 'row' },
    archetype: 'record-row', component: 'ItemRow',
    slots: ['identity', 'status', 'fields', 'relations'],
    budgets: { fields: ROW_FIELD_BUDGET, relations: { max: 2, overflow: 'count' } }
  },
  { match: { class: 'item', variant: 'inline' }, archetype: 'chip', component: 'EntityChip', slots: [] },
  {
    match: { class: 'group', variant: 'full' },
    archetype: 'collection', component: 'CollectionSurface',
    slots: ['identity', 'children'],
    budgets: { children: { overflow: 'scroll' } }
  },
  {
    match: { class: 'group', variant: 'detail' },
    archetype: 'collection-card', component: 'CollectionCard',
    slots: ['identity', 'children'],
    budgets: { children: { max: 6, overflow: 'more' } }
  },
  {
    match: { class: 'group', variant: 'row' },
    archetype: 'collection-row', component: 'GroupRow',
    slots: ['identity', 'children'],
    budgets: { children: { max: 2, overflow: 'count' } }
  },
  { match: { class: 'group', variant: 'inline' }, archetype: 'chip', component: 'EntityChip', slots: [] },
  {
    match: { class: 'process', variant: 'full' },
    archetype: 'process-detail', component: 'ProcessSurface',
    slots: ['identity', 'status', 'fields', 'actions']
  },
  {
    match: { class: 'process', variant: 'detail' },
    archetype: 'process-card', component: 'ProcessCard',
    slots: ['identity', 'status', 'fields']
  },
  {
    match: { class: 'process', variant: 'row' },
    archetype: 'process-row', component: 'ProcessRow',
    slots: ['identity', 'status', 'fields'],
    budgets: { fields: ROW_FIELD_BUDGET }
  },
  { match: { class: 'process', variant: 'inline' }, archetype: 'chip', component: 'EntityChip', slots: [] },
  { match: { variant: 'full' }, archetype: 'record', component: 'RecordSurface', slots: ['identity', 'fields'] },
  { match: {}, archetype: 'record', component: 'RecordSurface', slots: ['identity', 'fields'] }
]);

// --- Previews ---------------------------------------------------------------

// Keyed on the declared payload preview mode; MIME travels as props only.
export const PREVIEW_ENTRIES = Object.freeze([
  { match: { preview: 'image' }, component: 'ImagePreview' },
  { match: { preview: 'geometry' }, component: 'GeometryPreview' },
  { match: { preview: 'attachment' }, component: 'AttachmentPreview' },
  { match: { preview: 'none' }, component: null },
  { match: {}, component: 'AttachmentPreview' }
]);

// --- Actions ----------------------------------------------------------------

// Compiled action records → button presentation. `hidden` entries must be
// checked before kind entries (specificity handles ordering).
export const ACTION_ENTRIES = Object.freeze([
  { match: { trigger: 'event' }, component: null, hidden: true },
  { match: { actionKind: 'createEntity' }, component: 'Button', tone: 'primary', icon: 'pi pi-plus' },
  { match: { actionKind: 'deleteEntity' }, component: 'Button', tone: 'danger', icon: 'pi pi-trash', confirm: true },
  { match: { actionKind: 'runCommand' }, component: 'Button', tone: 'secondary', icon: 'pi pi-bolt' },
  { match: { actionKind: 'link' }, component: 'Button', tone: 'text', icon: 'pi pi-link' },
  { match: { actionKind: 'unlink' }, component: 'Button', tone: 'text', icon: 'pi pi-times', inline: true },
  { match: { actionKind: 'updateEntity', statusTarget: true }, component: 'Button', tone: 'state' },
  { match: { actionKind: 'updateEntity' }, component: 'Button', tone: 'secondary', icon: 'pi pi-pencil' },
  { match: {}, component: 'Button', tone: 'secondary' }
]);

// Render-policy severity → PrimeVue severity vocabulary.
export const SEVERITY_MAP = Object.freeze({
  info: 'info',
  success: 'success',
  warning: 'warn',
  warn: 'warn',
  danger: 'danger',
  error: 'danger',
  secondary: 'secondary',
  neutral: 'secondary'
});

// --- Chrome -----------------------------------------------------------------

export const CHROME_ROLES = Object.freeze(['canvas', 'section', 'card', 'control', 'inline']);

export const CHROME_TABLE = Object.freeze({
  canvas: Object.freeze({ surface: 'page', padding: 'none', border: 'none' }),
  section: Object.freeze({ surface: 'none', padding: 'lg', border: 'none' }),
  card: Object.freeze({ surface: 'content', padding: 'md', border: 'hairline' }),
  control: Object.freeze({ surface: 'control', padding: 'sm', border: 'ui' }),
  inline: Object.freeze({ surface: 'none', padding: 'none', border: 'none' })
});

// Same-role nesting degrades one step instead of repeating chrome:
// a card in a card becomes padding plus a divider; sections already separate
// by spacing and stay as they are; controls degrade to inline chrome.
const DEGRADE = Object.freeze({
  card: Object.freeze({ surface: 'none', padding: 'md', border: 'divider' }),
  control: Object.freeze({ surface: 'none', padding: 'none', border: 'none' })
});

export { EDIT_VARIANTS, DEGRADE };
