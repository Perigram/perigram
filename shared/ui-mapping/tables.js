// Default matcher tables for the UI mapping contract.
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
  { match: { base: 'number', bounded: true }, component: 'Slider', span: 'full' },
  { match: { base: 'quantity', bounded: true }, component: 'Slider', span: 'full' },
  { match: { base: 'number' }, component: 'InputNumber', span: 'half' },
  { match: { base: 'quantity' }, component: 'QuantityInput', span: 'half', unitSuffix: true },
  { match: { base: 'boolean' }, component: 'ToggleSwitch', span: 'half' },
  { match: { base: 'instant' }, component: 'DatePicker', span: 'half' },
  { match: { base: 'enum', enumSize: 'many' }, component: 'Select', span: 'half', filterable: true },
  { match: { base: 'enum' }, component: 'SelectButton', span: 'full' },
  { match: { base: 'ref' }, component: 'InstancePicker', span: 'half' },
  { match: { base: 'list', itemBase: 'string' }, component: 'ChipsInput', span: 'full' },
  { match: { base: 'list', itemBase: 'enum' }, component: 'OrderList', span: 'full' },
  { match: { base: 'list', itemBase: 'ref' }, component: 'InstanceMultiPicker', span: 'full' },
  { match: { base: 'blob' }, component: 'FileUpload', span: 'full' },
  { match: { base: 'record' }, component: 'ObjectEditor', span: 'full', recursive: true },
  { match: { base: 'map' }, component: 'JsonEditor', span: 'full' },
  { match: { base: 'json' }, component: 'JsonEditor', span: 'full' },
  { match: { base: 'list' }, component: 'ListEditor', span: 'full', recursive: true },
  { match: { base: 'variant' }, component: 'VariantEditor', span: 'full', recursive: true },
  { match: {}, component: 'ObjectEditor', span: 'full' }
]);

// Display-family entries: compact value presentations for rows and inline
// contexts. The resolved density ('row' | 'inline') travels as a prop.
// Data-shaped refinements: percent quantities render as Knob dials, string
// lists render as budgeted chips.
export const FIELD_DISPLAY_ENTRIES = Object.freeze([
  { match: { base: 'string', long: true }, component: 'ProseText', span: 'full' },
  { match: { base: 'map', itemBase: 'quantity', itemUnit: 'percent' }, component: 'MeterGroup', span: 'full' },
  { match: { base: 'map', itemBase: 'quantity' }, component: 'Chart', span: 'full' },
  { match: { base: 'enum', ordinal: true }, component: 'Rating', span: 'full' },
  { match: { base: 'quantity', unit: 'percent' }, component: 'Knob', span: 'half' },
  { match: { base: 'enum' }, component: 'Tag', span: 'half' },
  { match: { base: 'ref' }, component: 'InstanceInlineRef', span: 'half' },
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
// resolver decision over the TYPE'S SHAPE, not a component branch or a
// hand-picked type id. Shape keys come from analyzeTypeShape; `size` is
// the caller's collection size class ('small' for handful-sized sets).
// `boardable` is a derived signal like `shape`: the resolver composes it
// from the process class, the caller's stateful option (a served state
// vocabulary spanning at least BOARD_MIN_COLUMNS values), and flat
// collections — the authored workflow machine IS a stateful process
// collection's structure, so the entry sits first and the shape signals
// it overlaps (chronology, stat ratios) are secondary facets on that
// class. One match key keeps the entry on equal specificity with the
// other shape entries, so a narrow type override still outranks it
// through the override splice — the extension mechanism stays intact.
export const LIST_LAYOUT_ENTRIES = Object.freeze([
  { match: { boardable: true }, layout: 'board' },
  // Durational beats chronological: two declared instants form an
  // interval, the stronger temporal structure — prose shape on top of
  // an interval still gantts.
  { match: { shape: 'durational' }, layout: 'gantt' },
  { match: { shape: 'chronological' }, layout: 'timeline' },
  { match: { shape: 'statlike' }, layout: 'stats' },
  { match: { class: 'file', size: 'large' }, layout: 'carousel' },
  { match: { class: 'file' }, layout: 'card-grid' },
  // Scheduled (exactly one instant, no stronger shape): appointment-like
  // collections lay out as the month grid; temporal shape beats size the
  // way chronology already does.
  { match: { shape: 'scheduled' }, layout: 'calendar' },
  { match: { size: 'small' }, layout: 'list' },
  { match: {}, layout: 'table' }
]);

export const SMALL_LIST_AT = 3;

// A board with one column is a list, not a board: the state vocabulary
// must span at least this many values before a collection earns the
// board projection.
export const BOARD_MIN_COLUMNS = 2;

// Known list-layout values: validates authored `render.listLayout` and
// bounds the resolver vocabulary.
export const LIST_LAYOUT_VALUES = Object.freeze(['table', 'card-grid', 'carousel', 'timeline', 'stats', 'list', 'board', 'gantt', 'calendar']);

// Collection thresholds live with the other design-system budgets so
// materializations carry no magic numbers: tables paginate past
// TABLE_PAGINATE_AT rows and switch to virtual scrolling past
// TABLE_VIRTUALIZE_AT; the region toolbar's search appears only past
// SEARCH_AT rows.
export const TABLE_PAGINATE_AT = 10;
export const TABLE_PAGE_ROWS = 10;
export const TABLE_VIRTUALIZE_AT = 50;
export const SEARCH_AT = 8;

// Fact budgets scale with the type's richness instead of fixed constants:
// wide types earn more table columns and card facts, capped for density.
export const TABLE_COLUMN_SCALE = Object.freeze([
  { at: 8, columns: 5 },
  { at: 5, columns: 4 },
  { at: 0, columns: 3 }
]);
export const CARD_FACT_SCALE = Object.freeze([
  { at: 8, facts: 5 },
  { at: 6, facts: 4 },
  { at: 3, facts: 3 },
  { at: 0, facts: 2 }
]);

// Presentation budgets and thresholds consumed by materializations so the
// numbers live with the rest of the design-system defaults.
export const CHIP_BUDGET = Object.freeze({ max: 3, overflow: 'count' });
export const SUMMARY_BUDGET = Object.freeze({ max: 4, overflow: 'count' });
export const ROW_RELATION_BUDGET = Object.freeze({ max: 2, overflow: 'count' });
export const CHILDREN_TABS_AT = 2;

// Record-header action budget: at most this many generated action buttons
// render inline beside the title; a third and every further action join
// the SpeedDial overflow (plus the Edit toggle, which stays separate).
export const HEADER_ACTIONS_INLINE = 2;

// Weight-driven composition: sibling content whose estimated rendered
// height (in rows) exceeds the surface budget stops stacking and arranges
// — a compose-time decision over data. The arrangement ladder lives in
// `arrangeChildren` (index.js): light peers share proportional columns, a
// dominant sibling keeps the flow, heavy peers tab.
export const SURFACE_ROW_BUDGET = 10;

// Arrangement budgets, all in estimated rendered rows at card scale (a
// preview card or board card is 4 rows, a table row 1): a stack-mode
// child set at or under SIDE_MAX_WEIGHT rides beside the record body;
// each column child stays at or under COLUMN_MAX_WEIGHT; a sibling
// holding at least DOMINANT_CHILD_SHARE of the total weight is the
// dominant child; columns cap at REGION_COLUMNS_MAX tracks. The record
// side column earns width with weight through REGION_SIDE_SPANS
// (12-track grid spans).
export const SIDE_MAX_WEIGHT = 16;
export const COLUMN_MAX_WEIGHT = 12;
export const DOMINANT_CHILD_SHARE = 0.6;
export const REGION_COLUMNS_MAX = 3;
export const REGION_SIDE_SPANS = Object.freeze([
  { at: 10, span: 6 },
  { at: 4, span: 5 },
  { at: 0, span: 4 }
]);

// Full-height weight: every element counts, scaled by how tall its
// presentation renders (a preview card is ~4 table rows, a timeline entry
// ~2). No sampling cap — sibling arrangement must see the true total.
export const ROW_WEIGHT_BY_LAYOUT = Object.freeze({
  table: 1,
  timeline: 2,
  'card-grid': 4,
  carousel: 3,
  board: 4,
  gantt: 2,
  calendar: 3
});

// Card anatomy variants, selected by type shape: media cards for payloads,
// stat cards for percent/quantity-dominant types, text cards otherwise.
export const CARD_VARIANT_RULES = Object.freeze({
  media: 'media',
  statlike: 'stat',
  default: 'text'
});

// Hierarchy-driven rhythm and type: the composed node's chrome level picks
// the stack gap and the heading typography role, so spacing and type scale
// follow the tree position. The level-0 record header is the generated
// instance page's own title — it carries the page-title role; nested
// surfaces step down through the section-heading and label roles.
export const GAP_BY_LEVEL = Object.freeze({
  0: 'stack',
  1: 'stackTight'
});

export const TYPE_BY_LEVEL = Object.freeze({
  0: 'text-page-title',
  1: 'text-section-heading',
  2: 'text-label'
});
export const DETAIL_FACT_BUDGET = Object.freeze({ max: 4, overflow: 'more' });

export const SCALAR_BASES = Object.freeze(['string', 'number', 'quantity', 'instant', 'boolean', 'enum']);

// Layout vocabulary: the only layout classes the materializations may use.
// Components never declare gaps, grids, or stacks of their own — PrimeVue
// components own their internal layout, and everything else comes from
// this table so the design system stays procedural and overridable.
export const LAYOUT = Object.freeze({
  stack: 'flex flex-col gap-6',
  stackTight: 'flex flex-col gap-3',
  row: 'flex flex-wrap items-center gap-2',
  labelCell: 'shrink-0 text-body text-muted',
  rowBetween: 'flex flex-wrap items-center justify-between gap-2',
  factCell: 'flex min-w-0 flex-col gap-1',
  // Container-relative form grid: the utility body lives in the global
  // stylesheet (assets/css/main.css) beside SurfaceHeader's scoped block —
  // the tailwindcss build has no container-queries plugin, so viewport
  // variants cannot express "wide where I am rendered" (dialogs, panes).
  formGrid: 'ck-form-grid',
  scrollX: 'w-full overflow-x-auto',
  clip: 'overflow-hidden',
  bounded: 'w-full max-w-[var(--ck-bounded-grid-item-max-width)]',
  sectionTitle: 'text-label text-muted uppercase',
  // The record-header row is container-relative, never viewport-relative —
  // but through scoped CSS in SurfaceHeader (the ResponsiveGrid pattern),
  // not Tailwind variants: the tailwindcss build here has no
  // container-queries plugin, so any @container/@[w]: class silently
  // compiles to nothing. These tokens carry only the static stacked
  // layout; the row direction and the 16rem identity floor live in the
  // component scoped block.
  headerRow: 'flex flex-col items-start gap-3',
  headerIdentity: 'min-w-0 flex-1',
  cellText: 'line-clamp-2 max-w-96 break-words text-left',
  chipRow: 'flex flex-wrap items-center gap-2 pt-2',
  panelBody: 'py-2',
  // Board projection: the horizontal column rail (columns are in-surface
  // wells one step above the canvas — the surface ladder's `subtle` inset
  // level — while the cards inside sit on the content surface) and the
  // column bodies. Column width is a layout dimension token — one board
  // column never depends on its content's width — and column bodies are
  // bounded (`max-h-board-column`) with their own vertical scroll, so the
  // board never grows the page and each lane scrolls independently; the
  // `flex-1 min-h-0` pair lets the same body fill bounded hosts (workspace
  // panes) instead.
  // Board projection: the horizontal column rail and the column bodies.
  // Lanes STRETCH to the rail height (equal Notion-style lanes; in a
  // bounded host the rail fills and each lane scrolls internally), and
  // the body carries the hard bounds: `min-h-0 flex-1` lets it fill a
  // bounded lane, `max-h-[var(--ck-board-column-max-height)]` caps it in
  // unbounded (page-scrolling) hosts. Cards inside are `shrink-0` — a
  // shrinking flex child would cramp instead of overflowing, and the
  // body would never scroll. Column width is a layout dimension token —
  // one board column never depends on its content's width.
  boardRow: 'flex w-full items-stretch gap-4 overflow-x-auto pb-1',
  boardColumn: 'flex w-72 shrink-0 flex-col gap-2 rounded-panel bg-subtle p-3',
  boardColumnScroll: 'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1 max-h-[var(--ck-board-column-max-height)]',
  // The drop-target state REPLACES the well token — never appends a
  // second background utility (the pair is unordered in the generated
  // stylesheet, so the idle well would win and the state would never
  // show). One step on the surface ladder is the whole signal: a
  // machine-legal target lane paints the content surface instead of the
  // subtle well while a drag is live; the pointer's drop cursor carries
  // the hover.
  boardColumnTarget: 'flex w-72 shrink-0 flex-col gap-2 rounded-panel bg-content p-3',
  // Temporal projections. The gantt row pairs a fixed identity cell with
  // a relative track (a subtle well); bars are data-driven geometry —
  // absolutely positioned by their instant values (left/width ride the
  // inline data-driven exception) and painted by the state severity
  // token classes, never raw colors. The calendar grid is a plain
  // 7-column grid of day wells; the today cell steps up to the content
  // surface the same way a board's receiving lane does.
  ganttStack: 'flex w-full min-w-0 flex-col gap-2',
  ganttAxisRow: 'flex min-w-0 items-center gap-2',
  ganttIdentity: 'flex w-44 min-w-0 shrink-0 items-center gap-1',
  ganttAxisSpacer: 'w-44 shrink-0',
  ganttTrack: 'relative h-5 min-w-0 flex-1 rounded-panel bg-subtle',
  ganttBar: 'absolute inset-y-1 rounded-ui',
  calendarStack: 'flex w-full min-w-0 flex-col gap-2',
  calendarHead: 'flex min-w-0 items-center justify-between gap-2',
  calendarGrid: 'grid w-full min-w-0 grid-cols-7 gap-1',
  calendarCell: 'flex min-h-20 flex-col gap-1 rounded-panel bg-subtle p-1.5',
  calendarCellToday: 'flex min-h-20 flex-col gap-1 rounded-panel bg-content p-1.5',
  nameClamp: 'min-w-0 truncate',
  chipClamp: 'max-w-48 [&_.p-chip-label]:truncate',
  // Identity link buttons (collection rows, board/calendar/timeline cards,
  // breadcrumbs): left-aligned, clamped at the label node so long names
  // truncate inside their row.
  linkClamp: 'min-w-0 max-w-full text-left [&_.p-button-label]:truncate',
  specList: 'flex flex-col divide-y divide-content-border',
  specRow: 'flex min-w-0 items-center justify-between gap-4 py-2',
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
  { match: { class: 'item', variant: 'inline' }, archetype: 'chip', component: 'InstanceChip', slots: [] },
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
  { match: { class: 'group', variant: 'inline' }, archetype: 'chip', component: 'InstanceChip', slots: [] },
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
  { match: { class: 'process', variant: 'inline' }, archetype: 'chip', component: 'InstanceChip', slots: [] },
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

// Preview modes the app's shared viewer modules render (the
// ArtifactViewer branches); every other mode degrades to a payload
// download. App-side materializations import this list instead of
// restating it.
export const RENDERABLE_PREVIEW_MODES = Object.freeze([
  'dxf', 'svg', 'sketch', 'image', 'pdf', 'docx', 'table', 'workbook', 'text'
]);

// --- Actions ----------------------------------------------------------------

// Compiled action records → button presentation. `hidden` entries must be
// checked before kind entries (specificity handles ordering).
export const ACTION_ENTRIES = Object.freeze([
  { match: { trigger: 'event' }, component: null, hidden: true },
  { match: { actionKind: 'createInstance' }, component: 'Button', tone: 'primary', icon: 'pi pi-plus', iconOnly: true },
  { match: { actionKind: 'deleteInstance' }, component: 'Button', tone: 'danger', icon: 'pi pi-trash', confirm: true, iconOnly: true },
  { match: { actionKind: 'runCommand' }, component: 'Button', tone: 'secondary', icon: 'pi pi-bolt' },
  { match: { actionKind: 'link' }, component: 'Button', tone: 'text', icon: 'pi pi-link' },
  { match: { actionKind: 'unlink' }, component: 'Button', tone: 'text', icon: 'pi pi-times', inline: true },
  { match: { actionKind: 'updateInstance', stateTarget: true }, component: 'Button', tone: 'state', icon: 'pi pi-arrow-right-arrow-left' },
  // Stateless updates are the field-edit form: fields edit inline on
  // detail surfaces and editor-bound types open their editor, so the
  // bulk form never renders as a browse-surface action.
  { match: { actionKind: 'updateInstance' }, hidden: true },
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

// Spacing coefficient: one slider step maps to a full literal rhythm set
// (Tailwind only compiles classes it can see, so every step is written out).
// The coefficient scales gaps, paddings, toolbar rhythm, control size, and
// editor size together; density classification still derives per screen.
export const SPACING_SCALES = Object.freeze({
  0.5: Object.freeze({
    stack: 'flex flex-col gap-2',
    stackTight: 'flex flex-col gap-1',
    specRow: 'flex min-w-0 items-center justify-between gap-2 py-0.5',
    chipRow: 'flex flex-wrap items-center gap-1 pt-0.5',
    toolbar: 'flex flex-wrap items-center gap-1',
    sectionTitle: 'text-label text-muted uppercase',
    knob: 40,
    editorSize: 'small'
  }),
  0.75: Object.freeze({
    stack: 'flex flex-col gap-3',
    stackTight: 'flex flex-col gap-2',
    specRow: 'flex min-w-0 items-center justify-between gap-3 py-1',
    chipRow: 'flex flex-wrap items-center gap-1 pt-1',
    toolbar: 'flex flex-wrap items-center gap-1',
    sectionTitle: 'text-label text-muted uppercase',
    knob: 48,
    editorSize: 'small'
  }),
  1: Object.freeze({
    stack: 'flex flex-col gap-6',
    stackTight: 'flex flex-col gap-3',
    specRow: 'flex min-w-0 items-center justify-between gap-4 py-2',
    chipRow: 'flex flex-wrap items-center gap-2 pt-2',
    toolbar: 'flex flex-wrap items-center gap-2',
    sectionTitle: 'text-label text-muted uppercase',
    knob: 64,
    editorSize: null
  }),
  1.25: Object.freeze({
    stack: 'flex flex-col gap-6',
    stackTight: 'flex flex-col gap-4',
    specRow: 'flex min-w-0 items-center justify-between gap-5 py-2',
    chipRow: 'flex flex-wrap items-center gap-2 pt-2',
    toolbar: 'flex flex-wrap items-center gap-2',
    sectionTitle: 'text-label text-muted uppercase',
    knob: 72,
    editorSize: null
  }),
  1.5: Object.freeze({
    stack: 'flex flex-col gap-8',
    stackTight: 'flex flex-col gap-5',
    specRow: 'flex min-w-0 items-center justify-between gap-6 py-3',
    chipRow: 'flex flex-wrap items-center gap-3 pt-3',
    toolbar: 'flex flex-wrap items-center gap-3',
    sectionTitle: 'text-label text-muted uppercase',
    knob: 80,
    editorSize: null
  }),
  1.75: Object.freeze({
    stack: 'flex flex-col gap-8',
    stackTight: 'flex flex-col gap-6',
    specRow: 'flex min-w-0 items-center justify-between gap-6 py-4',
    chipRow: 'flex flex-wrap items-center gap-3 pt-4',
    toolbar: 'flex flex-wrap items-center gap-3',
    sectionTitle: 'text-label text-muted uppercase',
    knob: 88,
    editorSize: null
  }),
  2: Object.freeze({
    stack: 'flex flex-col gap-8',
    stackTight: 'flex flex-col gap-8',
    specRow: 'flex min-w-0 items-center justify-between gap-8 py-6',
    chipRow: 'flex flex-wrap items-center gap-4 pt-4',
    toolbar: 'flex flex-wrap items-center gap-4',
    sectionTitle: 'text-label text-muted uppercase',
    knob: 96,
    editorSize: null
  })
});

export const SPACING_STEPS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

export function spacingClasses(scale = 1) {
  return SPACING_SCALES[scale] || SPACING_SCALES[1];
}
