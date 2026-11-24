// Default matcher tables for the UI mapping contract.
// Pure data: component keys are strings resolved by the app-side registry;
// no Vue, PrimeVue, or domain names live here.

// Display-family variants resolve read-only presentations; editor-family
// variants resolve input controls. One variant vocabulary everywhere.
export const VARIANTS = Object.freeze(['full', 'detail', 'row', 'inline']);
const EDIT_VARIANTS = new Set(['full', 'detail']);

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
  { match: { base: 'map' }, component: 'MapEditor', span: 'full' },
  { match: { base: 'json' }, component: 'ObjectSummary', span: 'full' },
  { match: { base: 'list' }, component: 'ListEditor', span: 'full', recursive: true },
  { match: { base: 'variant' }, component: 'VariantEditor', span: 'full', recursive: true },
  { match: {}, component: 'ObjectEditor', span: 'full' }
]);

// Display-family entries: compact value presentations for rows and inline
// contexts. The resolved density ('row' | 'inline') travels as a prop.
// Data-shaped refinements: percent quantities render as Knob dials, string
// lists render as budgeted chips. The dashboard presentations (Knob,
// MeterGroup, Chart, Rating) are quantitative-type decisions (SPEC §22.8):
// they match only when the caller resolves the field with
// `quantitative: true` — the type's statlike shape — and every other type
// falls through to the plain-value entries.
export const FIELD_DISPLAY_ENTRIES = Object.freeze([
  { match: { base: 'string', long: true }, component: 'ProseText', span: 'full' },
  { match: { base: 'map', itemBase: 'quantity', itemUnit: 'percent', quantitative: true }, component: 'MeterGroup', span: 'full' },
  { match: { base: 'map', itemBase: 'quantity', quantitative: true }, component: 'Chart', span: 'full' },
  { match: { base: 'enum', ordinal: true, quantitative: true }, component: 'Rating', span: 'full' },
  { match: { base: 'quantity', unit: 'percent', quantitative: true }, component: 'Knob', span: 'half' },
  { match: { base: 'enum' }, component: 'Tag', span: 'half' },
  { match: { base: 'ref' }, component: 'InstanceInlineRef', span: 'half' },
  { match: { base: 'quantity' }, component: 'QuantityText', span: 'half' },
  { match: { base: 'instant' }, component: 'InstantText', span: 'half' },
  { match: { base: 'boolean' }, component: 'BooleanCheck', span: 'half' },
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
// hand-picked type id. Shape keys come from analyzeTypeShape.
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
  { match: { class: 'file' }, layout: 'card-grid' },
  // Scheduled (exactly one instant, no stronger shape): appointment-like
  // collections lay out as the month grid; temporal shape beats size the
  // way chronology already does.
  { match: { shape: 'scheduled' }, layout: 'calendar' },
  { match: {}, layout: 'table' }
]);

// A board with one column is a list, not a board: the state vocabulary
// must span at least this many values before a collection earns the
// board projection.
export const BOARD_MIN_COLUMNS = 2;

// Known list-layout values: validates authored `render.listLayout` and
// bounds the resolver vocabulary.
export const LIST_LAYOUT_VALUES = Object.freeze(['table', 'card-grid', 'timeline', 'stats', 'board', 'gantt', 'calendar']);

// Collection thresholds live with the other design-system budgets so
// materializations carry no magic numbers: tables paginate past
// TABLE_PAGINATE_AT rows; the region toolbar's search appears only
// past SEARCH_AT rows.
export const TABLE_PAGINATE_AT = 10;
export const TABLE_PAGE_ROWS = 10;

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
// preview card or board card is 4 rows, a table row 1): a child set at
// or under SIDE_MAX_WEIGHT rides beside the record body; each column
// child stays at or under COLUMN_MAX_WEIGHT; a sibling holding at least
// DOMINANT_CHILD_SHARE of the total weight is the dominant child. The
// side rail is a minor column — at most a third of the record grid
// (REGION_SIDE_SPANS over 12 tracks); heavier sets arrange below the
// body, where proportional columns grant each peer real width.
export const SIDE_MAX_WEIGHT = 10;
export const COLUMN_MAX_WEIGHT = 12;
export const DOMINANT_CHILD_SHARE = 0.6;
// Peer columns engage when the host can grant every track this earned
// minimum: engagement is `trackCount × REGION_COLUMN_EARNED_REM` of
// measured host width, generative for any track count.
export const REGION_COLUMN_EARNED_REM = 30;
export const REGION_SIDE_SPANS = Object.freeze([
  { at: 8, span: 4 },
  { at: 0, span: 3 }
]);

// Container width steps (SPEC → Container traits): the one rem ladder the
// container seam resolves and every container-relative mechanism
// materializes — the form grid's two-column engagement is the medium step,
// the record split's engagement the wide step.
export const CONTAINER_WIDTH_STEPS = Object.freeze({
  mediumRem: 40,
  wideRem: 60
});

// Host profiles: the fallback container traits per host kind; the measured
// box overrides the width (SPEC → Container traits). Density is the
// rhythm tier the host rides: bounded hosts compact, pages neutral.
export const HOST_PROFILES = Object.freeze({
  page: { height: 'flow', scroll: 'page', width: 'wide', density: 1 },
  pane: { height: 'bounded', scroll: 'surface', width: 'medium', density: 0.75 },
  dialog: { height: 'bounded', scroll: 'surface', width: 'medium', density: 1 },
  popup: { height: 'bounded', scroll: 'surface', width: 'narrow', density: 0.75 },
  'mobile-tab': { height: 'flow', scroll: 'page', width: 'narrow', density: 0.75 }
});

// Data-trait derivations (SPEC → Data traits): layouts whose surfaces
// demand the full row to stay readable; layouts whose surfaces own a
// scroll or page bound past a budget.
export const FULL_BREADTH_LAYOUTS = Object.freeze(['table', 'board', 'gantt', 'calendar']);
export const BOUNDED_GROWTH_LAYOUTS = Object.freeze(['table', 'board', 'gantt', 'calendar']);
export const PAGINATED_GROWTH_LAYOUTS = Object.freeze(['card-grid', 'timeline']);

// Full-height weight: every element counts, scaled by how tall its
// presentation renders (a preview card is ~4 table rows, a timeline entry
// ~2). No sampling cap — sibling arrangement must see the true total.
export const ROW_WEIGHT_BY_LAYOUT = Object.freeze({
  table: 1,
  timeline: 2,
  'card-grid': 4,
  board: 4,
  gantt: 2,
  calendar: 3
});

// Hierarchy-driven rhythm and type: the composed node's chrome level picks
// the stack gap and the heading typography role, so spacing and type scale
// follow the tree position. The level-0 record header is the generated
// instance page's own title — it carries the page-title role; nested
// surfaces step down through the section-heading and label roles, and
// depth from two rides the tight rhythm.
export const GAP_BY_LEVEL = Object.freeze({
  0: 'stack',
  1: 'stackTight',
  2: 'stackTight'
});

export const TYPE_BY_LEVEL = Object.freeze({
  0: 'text-record-title',
  1: 'text-section-heading',
  2: 'text-label'
});
export const DETAIL_FACT_BUDGET = Object.freeze({ max: 4, overflow: 'more' });

export const SCALAR_BASES = Object.freeze(['string', 'number', 'quantity', 'instant', 'boolean', 'enum']);

// The spacing ladder (SPEC §22.9): generated surfaces space on one
// 4px-based ladder — Tailwind steps 1, 2, 3, 4, 6, 8 (4, 8, 12, 16, 24,
// 32px). Static recipes and materialization utilities ride these steps
// alone; the rhythm interpolator (SPACING_SCALES) owns the sub-steps
// between them, keyed by the density coefficient.
//
// Layout vocabulary: the only layout classes the materializations may use.
// Components never declare gaps, grids, or stacks of their own — PrimeVue
// components own their internal layout, and everything else comes from
// this table so the design system stays procedural and overridable. The
// layout language (SPEC → Layout language) owns this table: every recipe
// registers under an atom or an ambient set (LAYOUT_ATOMS/LAYOUT_AMBIENT
// below), and the engine spec pins that partition.
export const LAYOUT = Object.freeze({
  stack: 'flex flex-col gap-6',
  // The screen root's section rhythm: the ladder's top step, one above
  // the section stack so screen sections step down into their content
  // (SPEC §22.9).
  stackSection: 'flex flex-col gap-8',
  stackTight: 'flex flex-col gap-3',
  // A labeled block: label line, content below (SPEC §22.8 structural
  // values) — the tightest stack the vocabulary owns.
  labeledBlock: 'flex w-full flex-col gap-1',
  row: 'flex flex-wrap items-center gap-2',
  labelCell: 'shrink-0 text-label text-muted',
  rowBetween: 'flex flex-wrap items-center justify-between gap-2',
  factCell: 'flex min-w-0 flex-col gap-1',
  // Container-relative form grid: the utility body lives in the global
  // stylesheet (assets/css/main.css) beside SurfaceHeader's scoped block —
  // the tailwindcss build has no container-queries plugin, so viewport
  // variants cannot express "wide where I am rendered" (dialogs, panes).
  formGrid: 'ck-form-grid',
  // Container-relative record-body grids (real CSS in main.css beside
  // the form grid): content width is the floor and the host grants
  // growth — fact groups fill in tracking columns, body blocks grow into
  // spare row width (.ck-span-full still earns the full row).
  factsGrid: 'ck-facts-grid',
  bodyGrid: 'ck-body-grid',
  // The record body's preview band steps up with its container (real
  // CSS in main.css); the card slot keeps the fixed previewBand stamp.
  previewHero: 'ck-preview-hero',
  previewHeroBand: 'ck-preview-hero-band',
  // The media region: bounded previews (rasters, drawings, tables,
  // documents, plugin modules) fill the framed stepped band (real CSS
  // in main.css).
  previewHeroBandContent: 'ck-preview-hero-band-content',
  // The editor band (SPEC §4): the record body's editor region — the
  // framed band an editor surface fills as the record body (real CSS in
  // main.css; the bounded variant serves popup hosts).
  editorBandBounded: 'ck-editor-band-bounded',
  // The page-scale band: the page fills the column's width at its own
  // aspect (real CSS in main.css).
  previewHeroBandAspect: 'ck-preview-hero-band-aspect',
  // The prose band: record prose flows at the body's measure (real CSS
  // in main.css).
  previewHeroBandFlow: 'ck-preview-hero-band-flow',
  // The bounded band: Card variants and narrow hosts (the record peek)
  // frame their preview at the stepped quiet-band scale (real CSS in
  // main.css).
  previewEmbedBand: 'ck-preview-embed-band',
  packRow: 'flex flex-wrap items-start gap-6',
  // The reload strip takes no flow slot on collections — appearing and
  // vanishing shift nothing below it. `reloadBar` overlays a collection
  // surface's top edge; depth-0 record headers own a permanent `reloadLane`
  // under the header instead, a bounded 4px track the strip appears inside.
  reloadBar: 'pointer-events-none absolute inset-x-0 top-0 z-10 h-1',
  reloadLane: 'h-1 shrink-0',
  scrollX: 'w-full overflow-x-auto',
  clip: 'overflow-hidden',
  // The record document's measure (SPEC §22.17): the depth-0 record page
  // renders one inline stack centered and bounded at the wide step's rem
  // width (the token), inside whatever host column the page grants.
  measure: 'mx-auto w-full max-w-[var(--ck-record-measure)]',
  // Row-surface recipe (the table row IS the card): a row's own
  // background is not clipped by its border-radius, so rows round by
  // clipping. The one constant every table rowClass channel returns.
  rowSurface: '[clip-path:inset(0_round_var(--p-border-radius-xl))]',
  // The row-surface recipe's other half: separated cell borders leave
  // the ladder-step gap between the rounded content rows, so each row
  // reads as its own surface card over the transparent table box (the
  // pt table channel carries it).
  rowSurfaceTable: 'border-separate border-spacing-x-0 border-spacing-y-1',
  bounded: 'w-full max-w-[var(--ck-bounded-grid-item-max-width)]',
  sectionTitle: 'text-label text-muted',
  // The record-header container recipe (real CSS in main.css beside the
  // form grid): the root establishes the layout container, the row
  // stacks and engages one wrapping identity/action line from 34rem of
  // header width, and the identity floors at 16rem so a large action
  // cluster wraps below it while long names keep truncating.
  header: 'ck-record-header',
  headerRow: 'ck-record-header-row',
  headerIdentity: 'ck-record-header-identity',
  // The header's action cluster groups by control kind (record
  // utilities, generated actions, machine transitions) — one tight
  // group per kind, hairline dividers between groups.
  actionGroup: 'flex items-center gap-1',
  actionDivider: 'h-5 w-px shrink-0 bg-content-border',
  cellText: 'line-clamp-2 max-w-96 break-words text-left',
  chipRow: 'flex flex-wrap items-center gap-2 pt-2',
  panelBody: 'py-2',
  previewBand: 'h-28 w-full',
  // File-card anatomies: a visual preview with no card facts renders the
  // overlay tile — the preview is the card and the identifier chip rides
  // its corner; a visual preview with facts renders the side-preview
  // card — the preview is a bounded framed column. The row-scale column
  // serves the instance tile (§22.13).
  mediaTile: 'relative h-40 w-full',
  mediaTileBadge: 'absolute bottom-2 left-2 min-w-0 max-w-[calc(100%-1rem)]',
  mediaTileControls: 'absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2',
  previewSide: 'min-h-28 w-28 shrink-0 self-stretch overflow-hidden rounded-ui border border-chrome-border bg-subtle',
  previewSideRow: 'w-16 shrink-0 self-stretch overflow-hidden rounded-ui border border-chrome-border bg-subtle',
  // Board projection: the horizontal column rail and the column bodies.
  // Lanes STRETCH to the rail height (equal lanes; in a bounded host the
  // rail fills and each lane scrolls internally), and the body carries
  // the hard bounds: `min-h-0 flex-1` lets it fill a bounded lane,
  // `max-h-[var(--ck-board-column-max-height)]` caps it in unbounded
  // (page-scrolling) hosts. Cards inside are `shrink-0` — a shrinking
  // flex child would cramp instead of overflowing, and the body would
  // never scroll. Column width is a layout dimension token — one board
  // column never depends on its content's width. Columns are in-surface
  // wells one step above the canvas; the cards inside sit on the content
  // surface.
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
  // The plain in-surface well: a quiet rounded inset one step off the
  // canvas (the preview file-facts band).
  well: 'rounded-ui bg-subtle',
  calendarStack: 'flex w-full min-w-0 flex-col gap-2',
  calendarHead: 'flex min-w-0 items-center justify-between gap-2',
  calendarGrid: 'grid w-full min-w-0 grid-cols-7 gap-1',
  calendarCell: 'flex min-h-20 flex-col gap-1 rounded-panel bg-subtle p-2',
  calendarCellToday: 'flex min-h-20 flex-col gap-1 rounded-panel bg-content p-2',
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

// The layout-language registries (SPEC → Layout language): the closed
// atom vocabulary and the ambient recipe sets atoms compose under. The
// engine spec pins the partition over LAYOUT — a recipe outside the
// registries is a vocabulary defect. The `tabs`, `placement`, and `stub`
// atoms materialize as components (Tabs in RegionChildren, PlacementBox,
// the RegionBlock stub slot), so their recipe lists are empty.
export const LAYOUT_ATOMS = Object.freeze({
  stack: Object.freeze(['stack', 'stackSection', 'stackTight', 'labeledBlock', 'panelBody', 'ganttStack', 'calendarStack']),
  row: Object.freeze(['row', 'rowBetween', 'chipRow', 'ganttAxisRow', 'calendarHead', 'boardRow']),
  grid: Object.freeze(['formGrid', 'factsGrid', 'bodyGrid', 'calendarGrid']),
  band: Object.freeze(['previewHero', 'previewHeroBand', 'previewHeroBandContent', 'previewHeroBandAspect', 'previewHeroBandFlow', 'previewEmbedBand', 'previewBand', 'mediaTile', 'previewSide', 'previewSideRow', 'editorBandBounded']),
  well: Object.freeze(['boardColumn', 'boardColumnScroll', 'boardColumnTarget', 'calendarCell', 'calendarCellToday', 'ganttTrack', 'well']),
  tabs: Object.freeze([]),
  placement: Object.freeze([]),
  stub: Object.freeze([]),
  pack: Object.freeze(['packRow'])
});

export const LAYOUT_AMBIENT = Object.freeze({
  cells: Object.freeze(['labelCell', 'factCell', 'specRow', 'specList', 'sectionTitle', 'cellText']),
  clamps: Object.freeze(['nameClamp', 'chipClamp', 'linkClamp']),
  chrome: Object.freeze(['clip', 'rowSurface', 'rowSurfaceTable', 'bounded', 'measure', 'scrollX', 'dialog', 'header', 'headerRow', 'headerIdentity', 'ganttIdentity', 'reloadBar', 'reloadLane', 'actionGroup', 'actionDivider', 'mediaTileBadge', 'mediaTileControls']),
  geometry: Object.freeze(['ganttBar', 'ganttAxisSpacer'])
});

// Row-variant field budgets (SPEC §22.8): a row carries identity, status,
// and one fact; the rest counts, reusing the slot-cardinality mechanism.
export const ROW_FIELD_BUDGET = Object.freeze({ max: 1, overflow: 'count' });

// --- Surfaces ---------------------------------------------------------------

// Class presets pick the archetype family; the container picks the variant.
// `slots` are the fillable surface slots; `budgets` bound unbounded slots.
export const SURFACE_ENTRIES = Object.freeze([
  {
    match: { class: 'file', variant: 'full' },
    archetype: 'viewer', component: 'FileViewerSurface',
    slots: ['preview', 'meta', 'relations']
  },
  {
    match: { class: 'file', variant: 'detail' },
    archetype: 'payload-card', component: 'FileCard',
    slots: ['preview', 'meta', 'relations'],
    budgets: { relations: { max: 6, overflow: 'more' } }
  },
  { match: { class: 'file', variant: 'row' }, archetype: 'file-row', component: 'FileRow', slots: ['meta', 'relations'], budgets: { relations: { max: 2, overflow: 'count' } } },
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
    slots: ['identity', 'fields', 'relations', 'children'],
    budgets: { children: { overflow: 'scroll' } }
  },
  {
    match: { class: 'group', variant: 'detail' },
    archetype: 'collection-card', component: 'CollectionCard',
    slots: ['identity', 'fields', 'relations', 'children'],
    budgets: { relations: { max: 6, overflow: 'more' }, children: { max: 6, overflow: 'more' } }
  },
  {
    match: { class: 'group', variant: 'row' },
    archetype: 'collection-row', component: 'GroupRow',
    slots: ['identity', 'fields', 'relations', 'children'],
    budgets: { relations: { max: 2, overflow: 'count' }, children: { max: 2, overflow: 'count' } }
  },
  { match: { class: 'group', variant: 'inline' }, archetype: 'chip', component: 'InstanceChip', slots: [] },
  {
    match: { class: 'process', variant: 'full' },
    archetype: 'process-detail', component: 'ProcessSurface',
    slots: ['identity', 'status', 'fields', 'relations', 'actions']
  },
  {
    match: { class: 'process', variant: 'detail' },
    archetype: 'process-card', component: 'ProcessCard',
    slots: ['identity', 'status', 'fields', 'relations'],
    budgets: { relations: { max: 6, overflow: 'more' } }
  },
  {
    match: { class: 'process', variant: 'row' },
    archetype: 'process-row', component: 'ProcessRow',
    slots: ['identity', 'status', 'fields', 'relations'],
    budgets: { fields: ROW_FIELD_BUDGET, relations: { max: 2, overflow: 'count' } }
  },
  { match: { class: 'process', variant: 'inline' }, archetype: 'chip', component: 'InstanceChip', slots: [] },
  { match: { variant: 'full' }, archetype: 'record', component: 'RecordSurface', slots: ['identity', 'fields', 'relations'] },
  { match: {}, archetype: 'record', component: 'RecordSurface', slots: ['identity', 'fields', 'relations'] }
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
// FilePayloadViewer branches); every other mode degrades to a payload
// download. App-side materializations import this list instead of
// restating it.
export const RENDERABLE_PREVIEW_MODES = Object.freeze([
  'dxf', 'svg', 'sketch', 'image', 'pdf', 'docx', 'table', 'workbook', 'text', 'graph'
]);

// Page-scale preview modes render in the framed region
// (`LAYOUT.previewHeroBandAspect`), the viewer fitting the frame's
// width.
export const ASPECT_PREVIEW_MODES = Object.freeze(['pdf']);

// --- Actions ----------------------------------------------------------------

// Compiled action records → button presentation. `hidden` entries must be
// checked before kind entries (specificity handles ordering).
export const ACTION_ENTRIES = Object.freeze([
  { match: { trigger: 'event' }, component: null, hidden: true },
  { match: { actionKind: 'createInstance' }, component: 'Button', tone: 'primary', icon: 'pi pi-plus' },
  { match: { actionKind: 'deleteInstance' }, component: 'Button', tone: 'danger', icon: 'pi pi-trash', confirm: true, iconOnly: true },
  { match: { actionKind: 'rerunInstance' }, component: 'Button', tone: 'secondary', icon: 'pi pi-refresh', iconOnly: true },
  { match: { actionKind: 'runCommand' }, component: 'Button', tone: 'secondary', icon: 'pi pi-bolt' },
  { match: { actionKind: 'emitEvent' }, component: 'Button', tone: 'secondary', icon: 'pi pi-bolt' },
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

export { EDIT_VARIANTS };

// Spacing coefficient: one slider step maps to a full literal rhythm set
// (Tailwind only compiles classes it can see, so every step is written out).
// The coefficient scales gaps, paddings, toolbar rhythm, control size, and
// editor size together; density classification still derives per screen.
export const SPACING_SCALES = Object.freeze({
  0.5: Object.freeze({
    screenRoot: 'flex flex-col gap-4',
    stack: 'flex flex-col gap-2',
    stackTight: 'flex flex-col gap-1',
    specRow: 'flex min-w-0 items-center justify-between gap-2 py-0.5',
    chipRow: 'flex flex-wrap items-center gap-1 pt-0.5',
    toolbar: 'flex flex-wrap items-center gap-1',
    sectionTitle: 'text-label text-muted',
    knob: 40,
    editorSize: 'small'
  }),
  0.75: Object.freeze({
    screenRoot: 'flex flex-col gap-6',
    stack: 'flex flex-col gap-3',
    stackTight: 'flex flex-col gap-2',
    specRow: 'flex min-w-0 items-center justify-between gap-3 py-1',
    chipRow: 'flex flex-wrap items-center gap-1 pt-1',
    toolbar: 'flex flex-wrap items-center gap-1',
    sectionTitle: 'text-label text-muted',
    knob: 48,
    editorSize: 'small'
  }),
  1: Object.freeze({
    screenRoot: 'flex flex-col gap-8',
    stack: 'flex flex-col gap-6',
    stackTight: 'flex flex-col gap-3',
    specRow: 'flex min-w-0 items-center justify-between gap-4 py-2',
    chipRow: 'flex flex-wrap items-center gap-2 pt-2',
    toolbar: 'flex flex-wrap items-center gap-2',
    sectionTitle: 'text-label text-muted',
    knob: 64,
    editorSize: null
  }),
  1.25: Object.freeze({
    screenRoot: 'flex flex-col gap-8',
    stack: 'flex flex-col gap-6',
    stackTight: 'flex flex-col gap-4',
    specRow: 'flex min-w-0 items-center justify-between gap-4 py-2',
    chipRow: 'flex flex-wrap items-center gap-2 pt-2',
    toolbar: 'flex flex-wrap items-center gap-2',
    sectionTitle: 'text-label text-muted',
    knob: 72,
    editorSize: null
  }),
  1.5: Object.freeze({
    screenRoot: 'flex flex-col gap-8',
    stack: 'flex flex-col gap-8',
    stackTight: 'flex flex-col gap-6',
    specRow: 'flex min-w-0 items-center justify-between gap-6 py-3',
    chipRow: 'flex flex-wrap items-center gap-3 pt-3',
    toolbar: 'flex flex-wrap items-center gap-3',
    sectionTitle: 'text-label text-muted',
    knob: 80,
    editorSize: null
  }),
  1.75: Object.freeze({
    screenRoot: 'flex flex-col gap-8',
    stack: 'flex flex-col gap-8',
    stackTight: 'flex flex-col gap-6',
    specRow: 'flex min-w-0 items-center justify-between gap-6 py-4',
    chipRow: 'flex flex-wrap items-center gap-3 pt-4',
    toolbar: 'flex flex-wrap items-center gap-3',
    sectionTitle: 'text-label text-muted',
    knob: 88,
    editorSize: null
  }),
  2: Object.freeze({
    screenRoot: 'flex flex-col gap-8',
    stack: 'flex flex-col gap-8',
    stackTight: 'flex flex-col gap-8',
    specRow: 'flex min-w-0 items-center justify-between gap-8 py-6',
    chipRow: 'flex flex-wrap items-center gap-4 pt-4',
    toolbar: 'flex flex-wrap items-center gap-4',
    sectionTitle: 'text-label text-muted',
    knob: 96,
    editorSize: null
  })
});

export const SPACING_STEPS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);

export function spacingClasses(scale = 1) {
  return SPACING_SCALES[scale] || SPACING_SCALES[1];
}

// Data-aware rhythm (SPEC → Container traits, density): a screen whose
// composed weight passes this budget tightens one step, floored at the
// tightest.
export const SPACING_WEIGHT_AT = SURFACE_ROW_BUDGET * 2;

// spacingCoefficientFor(container, totalWeight): the one derivation a
// screen's rhythm resolves through — the host record's density tier,
// tightened for heavy screens, clamped onto the literal steps. An
// explicit coefficient (the design-lab slider) bypasses this entirely.
export function spacingCoefficientFor(container = {}, totalWeight = 0) {
  const base = Number.isFinite(container.density) ? container.density : 1;
  const bounded = base < 1;
  const wanted = (bounded && Number.isFinite(totalWeight) && totalWeight > SPACING_WEIGHT_AT)
    ? base - 0.25
    : base;
  const clamped = Math.min(2, Math.max(0.5, wanted));
  return SPACING_STEPS.find(step => step >= clamped) || SPACING_STEPS[SPACING_STEPS.length - 1];
}
