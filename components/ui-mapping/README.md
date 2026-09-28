# COMPONENT: UI Mapping Components

Materialization layer for the design-system mapping contract: real Vue
components that render the pure resolver outputs and the composed screen
tree. They own no per-type or per-screen logic — every component decision
(component choice, span, variant, budget, chrome, action tone) comes from
[shared/ui-mapping](../../shared/ui-mapping/README.md); the registry of
component keys to these SFCs is the handwritten design-system surface, and
it is the only handwritten part.

## Display helpers live in the mapping contract: `titleFor(instance,
type)` is the single title resolver (the declared `identifier` field
value, else the unnamed placeholder) and `formatQuantity`
renders unit symbols (`25.5°`, `43,200 min`) instead of raw storage units.

Composition flow

`GeneratedMappingScreen.vue` composes the compiled screen contract
(`composeScreen` — pure, in `shared/ui-mapping/screen.js`) into a region
tree and materializes it with
`RegionBlock` → `SurfaceBody` →
`FieldControl` / `InstanceChip` / `PreviewBox` / `ActionButton`. A routed
detail surface additionally mounts the shared instance conversation rail
(`InstanceChatPanel`, keyed to the composed non-list region's opened
instance) after the body — the generator's detail routes are the
org-authored CTS types' detail pages, and the rail is app-level chrome
the composition root owns, not a materialization decision. Region
actions run through `ActionButton`; actions with construction inputs open
`type-labels.js` is the single label seam for generator surfaces: the
design-system entity contracts (`entities.*` locale keys) win for pack
types — localization parity with the legacy renderer — org-authored types
fall back to their authored render label, the raw id last. Materializations
never resolve type names straight from the bundle.
the generated create dialog, whose rows are the declared construction
inputs resolved by `resolveCreateDialogInputs`
([shared/ui-mapping](../../shared/ui-mapping/README.md)): authored fields
(bare name or slot-qualified `data.`/`specs.` path) render through their
descriptor, the identity `name` renders as a plain string control, and
`lineage.<key>` inputs render an `InstancePicker` over the parent types
whose children edges declare that key (reverse containment over the
bundle). The draft keys are the compiled input ids, so the payload lands
exactly on the construction paths; pickers model `{ type, id }` and are
reduced to the bare instance id at submit. When the dialog opens on a
detail surface whose scope carries the opened instance
(`screen.scope.instanceId` + `screen.typeId`), every lineage row whose
accepted parent types include that type is preselected to the opened
instance — parent-scoped creates stamp their lineage instead of landing
unparented. `link`
actions prompt for the relation target through `InstancePicker` over the
pool before dispatch (`onRun` receives `{ relations: { key: ref } }`).
The screen accepts a `sourceStates` prop (per-source
loading/ready/empty/denied/error from the data layer) that
`composeScreen` folds into the region tree.

Instance navigation and quick actions follow the same
callback-not-routing rule as `onRun`: an `onOpen(instance)` prop turns
collection identities (cards, table rows, tree rows, timeline entries)
into link buttons that emit the instance — the app decides where they
go — and without it identities stay plain text. `onRun` receives a
third `context` argument: `{ instance }` when an instance-scoped quick
action (the per-card ellipsis menu) launched the run, so executors
target that entity instead of the screen scope.

Detail editing follows the same rule: an `onPatch({ instance, patch })`
prop enables the record-page edit affordances — the header Edit toggle
(submit diffs the draft against the instance fields) and the per-field
inline pencil (confirm patches that one field). RegionBlock maps
changed field names onto the wire patch blocks (`name` →
`identity.name`, everything else → `data.<field>`, the same mapping
`processUpdate` writes) and re-emits both affordances as one `patch`
event; without `onPatch` neither affordance renders.

Region data states and the region header's in-place controls are shared
surface concerns:

- `RegionDataState.vue` — materializes the composed region `dataState`:
  skeleton lines on first load (system stack rhythm), one shared Message
  for empty/missing/denied/error, nothing for ready. Reloads with
  already-loaded instances keep their stale surfaces under one
  indeterminate progress bar instead — no component invents its own
  empty or loading state.
- The region header's in-place controls (the dissolved
  `CollectionToolbar`): search expands IN PLACE — the icon button becomes
  an icon field at its position (icon/Esc/empty-blur collapses) — and the
  shared `FilterBuilder` popover (own funnel trigger, condition-count
  badge) renders in the header cluster, and `SortControl` (its own
  popover over the `sortKeys` contract) carries ordering for the
  card-grid and board projections. Set conditions are the one
  filtering state — no parallel facet selects speak the same axis. The panel's fields derive through
  `builderFieldsForType` (see
  [shared/ui-mapping](../../shared/ui-mapping/README.md)): every scalar
  field, the primary status over the values actually present, and the
  relation, parent, and children traversal axes. Search stays a
  region-owned model; the composed tree is persisted view state per type
  (`utils/filter-view-state.js`) and is evaluated with the one matcher
  (`instanceMatchesFilter`) against the region's pool. Columns keep only
  their native sorting. The region header stays one line (label, count,
  controls, actions), wrapping only when the opened controls or the
  action cluster demand it. The
  card-grid projection adds an in-place sort control (select + order
  toggle unfolding beside the sort button; the persisted per-type sort
  preference survives the move; table projections keep native column
  sorting, so the control renders only for card grids — the board sorts
  per column inside BoardCollection, each lane on its own persisted
  per-type-and-state preference over the same sortKeys contract).
  The projection switch is the one layout-shaped user view state,
  persisted per type beside sort and filters
  (`utils/ui-projection-preference.js`): a collection whose type serves
  a state vocabulary and whose derived layout is a structural collection
  (table) may switch to the board, and a derived board may
  switch back to the table — one icon toggle in the header cluster, and
  a stored preference for a non-switchable collection is ignored, so the
  derivation stays the default and the switch never fights
  shape-specialized projections (timeline, stats, carousel, the handful
  list).

- `SortControl.vue` — the collection sort control for the card-grid and
  board projections (tables sort natively by column): a self-contained popover
  over the composed `listControls.sortKeys` contract. Keys render inline
  as buttons and the order toggle flips asc/desc beneath them; the host
  owns the value, the order, and their persistence
  (`utils/ui-sort-preference.js`). The list is inline deliberately — a
  select overlay would sit outside the popover's DOM subtree, where the
  popover's outside-click handling closes the control on every pick.

## Components

- `GeneratedMappingScreen.vue` — engine: composes and renders a compiled
  screen; owns the generated create dialog, ConfirmDialog for destructive
  actions, and Toast feedback on runs. Launch behavior follows
  `planActionLaunch` (see the shared README's Actions section): a create
  with construction inputs always opens the dialog — grant level never
  replaces the form with a bare confirmation. The screen hosts its own
  `<Toast />` element — without it in the tree the toast service fires
  into nothing (the module-imports spec also fails on imported-but-
  unrendered components). Confirmations use NO group: the app layout owns
  the single default-group `ConfirmDialog` host, so several concurrently
  mounted screens can never render one require multiple times.
- `RegionBlock.vue` — one composed region with data-driven layout: the list
  layout comes from `resolveListLayout` (`table` |
  `card-grid` | `timeline` | `stats` | `list` | `board` | `gantt` |
  `calendar`, matched by
  class, shape, size, or the state vocabulary — see
  [shared/ui-mapping](../../shared/ui-mapping/README.md)).
  The list header is one wrapping line — label, count, in-place expanding
  search and filter controls, and actions. The search toggle expands into
  an icon field AT the button's position (the icon or Esc collapses it;
  an empty blur collapses too) and the filter toggle unfolds its facet
  selects directly beside the button (the button stays as the collapse
  anchor and carries the active-selection count badge). The standalone list region
  renders as a borderless Panel — regions paint
  no box; the higher record surface (`SurfaceHeader`'s `headerBar`) keeps
  the hairline border, and pane boxes own their own frames. A create
  action for the region's own type collapses its caption to the bare
  localized `uiMapping.new` ("New") through ActionButton's context label:
  the header already names the class, so the caption never repeats it
  (creates for other types and every other action keep the full label).
  Top-level detail regions compose a record page: `SurfaceHeader` plus the
  main content in a 7-column lane with child regions in a 5-column lane
  (`detailSplit`, collapsing to stacked below xl); nested detail regions
  keep the Card surface. Empty regions render a Message.
- `BoardCollection.vue` — the state board: the projection whose columns
  are the type's served state vocabulary
  (authored order, `StateTag` headers with per-column counts) and whose
  cards are the loaded instances grouped by their flat state — the
  card-grid anatomy (preview band through `PreviewBox`, identity link,
  budgeted facts) with two deliberate omissions: no status badge (the
  lane already is the state) and no type subtitle (a lane is
  single-type). Facts follow the card-grid budget
  (`cardFactCount` over `CARD_FACT_SCALE`); beyond-budget facts collapse
  behind the shared show-more keys with one expand per card — board
  lanes are dense, so the budget is the collapse — and the facts rhythm
  follows the screen's injected spacing coefficient (compact screens
  shrink board cards with everything else). Per-instance quick
  actions (deletion, instance-scoped commands) ride the card's ellipsis
  menu like the card grid; status transitions are the drag itself and
  the opened record's strip. It renders by derivation for process-class
  flat
  collections and through the projection switch for any stateful
  structural collection (see the header-controls contract above). Columns are `subtle` wells on the surface ladder; cards
  sit on the content surface. Membership moves only through the
  machine: legality starts from the contract edges
  (`stateTransitionsByType`, carried on the region node) and is replaced
  at dragstart by the host's machine-authority resolver
  (`onFetchTransitions` — the state service's per-instance transitions,
  the same source the detail header's transition buttons dispatch
  through), because the compiled contract copy can lag the served
  machine (override or default machines serve transitions the producer
  copy never carried). A machine-legal target lane paints the content
  surface instead of the subtle well while a drag is live — the target
  token REPLACES the well token, never a second background utility
  (an appended `bg-*` pair is unordered in the generated stylesheet and
  the idle well would win). Without a resolver and without contract
  edges from a state, its cards are not draggable — a served machine
  with no moves anywhere renders a read-only board. The drop emits the
  `transition` intent; the host executors apply it optimistically over
  the shared pool (`utils/optimistic-state.js`) — the card lands in its
  lane immediately, the server result reconciles, a failure rolls the
  captured record back, and an offline queueing keeps the flip for the
  outbox to replay (the app's one optimistic contract). The machine
  stays the authority: every surface reconciles through the same store
  write, refused moves restore, and no board-local state is mutated.
  Ordering belongs to the
  column: each lane carries its own `SortControl` over the composed
  `sortKeys` contract with a persisted per-type-and-state preference
  (`board-column:` scopes through `utils/ui-sort-preference.js`).
  Column bodies are bounded (`--ck-board-column-max-height`,
  viewport-relative) and scroll independently — the board fits its
  container instead of growing the page, and the same flex contract
  lets lanes fill bounded hosts (workspace panes). Dragging into the
  rail's horizontal edge zone auto-scrolls toward hidden columns. Stale
  states outside the
  vocabulary degrade to neutral columns that admit no drops. Native
  HTML5 drag is the desktop affordance; the per-card ellipsis menu and
  the opened record's transition strip remain the accessible and touch
  paths.
- `GanttCollection.vue` — the durational projection: one row per
  instance over a shared instant scale. Declared instants in declaration
  order are the interval (`temporalFieldsFor`: first start, second
  end); the pool's own min/max bounds the scale, bars are data-driven
  geometry (the inline data-driven exception: `left`/`width` from the
  instant values) painted by the state severity token classes
  (`bg-status-*`), a start without an end renders a point — never a
  fabricated duration — and the axis carries month ticks (dense scales
  drop labels, not structure) plus the today marker when the scale
  spans now. Identity links follow the shared `onOpen` contract.
- `CalendarCollection.vue` — the scheduled projection: a month grid over
  the type's lone declared instant. Day cells are subtle wells, today's
  cell steps up to the content surface, instances render as capped
  identity chips with a plain overflow count (the day cell is a summary,
  not a list), and month navigation is local view state — the month
  opens on the first loaded instance's month. Labels and weekday
  headers format through the active locale.
- `CarouselGrid.vue` — the large media collection projection: a circular
  PrimeVue Carousel of clipped preview cards.
- `BreadcrumbTrail.vue` — the lineage trail: a Breadcrumb of ancestor
  identities walked from the instance's lineage through the pool.
- `CollectionTable.vue` — the columnar list projection (DataTable):
  identity (a link button when the screen has an `onOpen` handler),
  status, budgeted scalar descriptor columns, and the first
  declared relation as budgeted chips. Rows are Notion-style surface
  cards — the preset paints every row as the content surface with
  transparent internal dividers, and the recipe clips the row corners
  (`[clip-path:inset(0_round_var(--p-border-radius-xl))]`, since a row's
  background is not clipped by its radius), adds a hairline
  separated-border gap (the layout-only scoped block) and a muted
  transparent header band — every instance row sits one step above the
  canvas, with no border and no ring, while the table box stays
  unpainted. Columns come from the composed
  `listControls` contract (filled short scalars bounded by the richness
  budget — a field no loaded instance fills never becomes a column),
  identity/status/scalar columns are sortable (quantity values sort by
  their numeric value), the declared `render.sortKey` is the default
  sort, the user's last sort persists per type through
  `utils/ui-sort-preference.js`, and the paginate/virtualize thresholds are the shared
  `TABLE_*` budgets from the mapping contract, never literals. Filtering
  belongs to the region toolbar above the table, not to a per-column
  filter row. The region toolbar renders type-level actions only (creates):
  every other action kind addresses a concrete instance (delete,
  transitions, instance-scoped commands) and renders on the instance
  surfaces — row menus, the detail header, and the machine-served
  transitions. An unscoped list of a type that can be someone's child (a
  declared children edge names it) composes the containment cross-cut:
  every instance lists with its parent beside the identity
  (`ParentRef.vue` — the parent type's icon plus the parent's resolved
  label, non-interactive; the region host lazily overlays loaded parent
  types onto the pool through the same `loadType` seam the tree uses).
  Class surfaces never nest — containment navigation is the workspace
  explorer's.
- `CardGrid.vue` — the media collection projection (DataView, paginated):
  cards lay out in the shared `ResponsiveGrid` primitive with container
  queries and bounded item tokens (viewport breakpoints lie inside panels),
  each Card clipped (`overflow-hidden`) on the stock anatomy — preview as
  `#header`, identity + status in `#title`, type label (with the row's
  `ParentRef` parent context when the type is someone's child) in
  `#subtitle`, labeled budgeted facts in `#content`. Card ORDERING lives in the
  region header's in-place sort control (RegionBlock applies the
  `sortKeys` contract through the shared comparator before the grid
  mounts; the DataView itself renders no header). The card identity is a link button
  when the screen has an `onOpen` handler, and the type's per-instance
  quick actions (resolveInstanceActions: deletion and instance-scoped
  commands — status transitions are per-instance machine facts served by
  the state service, never a type-level action) render as one shared
  ellipsis menu per card
  that re-emits through the region run contract with that card as
  instance context — confirmation and dispatch stay upstream.
- `TimelineCollection.vue` — the chronological list projection (Timeline):
  marker-per-entry with identity (link button under the `onOpen`
  contract), inline scalar facts, and the type's
  primary long-text (or first structural) field as the entry body,
  selected by type matcher (log entries). Past the shared page budget
  the entries page through a standalone Paginator over `pageSlice`.
- `HierarchyTree.vue` — the deep-nesting projection: a fully expanded
  PrimeVue Tree built recursively from the type's declared children edges
  and the instance pool's lineage, shown on group surfaces. The tree
  re-derives from the reactive pool, so reconciliation (a new child, a
  moved parent) re-nests it in place instead of waiting for a remount.
- `SurfaceHeader.vue` — the record-page header bar: lineage Breadcrumb
  (when nested), a contextual `navigation` slot (a host that opened the
  record inside another surface — a workspace tab reached from another
  page, a popup with a back stack — injects its back affordance ahead of
  the identity block), Avatar identity with title and a `type · id` muted
  subtitle, placed actions, the Edit toggle (rendered only on patchable
  surfaces; see `onPatch` above — while editing it reads as Save and
  submits the draft), and exactly one state
  surface. A state axis is a tree, never a line, so stateful records
  carry no lifecycle strip: an instance with a flat `state` renders the
  segmented current-state tag (`StateTag`, resolved against the region's
  `statePolicy` — the header shows the data's state even when the
  served vocabulary has none for it) with a clock affordance opening
  the shared `StateHistory` popover (the `status_events` audit trail
  over `/api/state/history`, a vertical stepper), and every available
  runtime transition renders
  as a dedicated transition button after the inline action budget,
  dispatching through the `transition` channel (never the generic run
  menu) — machine transitions arrive as `{ __runtime, state: { to },
  intent, region }` from the page's state-service fetch and their
  labels/severity/icons resolve from the same policy map. Instances
  without a state render no state surface (no state is information —
  nothing synthesizes one). The bar is its own layout container: the
  identity/actions row engages from the header container width through
  the scoped CSS block (never the viewport — headers render inside panels
  and detail side columns): the identity block stays one
  avatar-title row (`LAYOUT.row` plus `LAYOUT.headerIdentity`) that
  still truncates long names through the `min-w-0` chain, wide headers
  floor the title at 16rem so
  a large action cluster wraps below the title instead of crunching it,
  and at most `HEADER_ACTIONS_INLINE` generated buttons render inline —
  a third and every further action join one popup ellipsis menu (no
  reserved layout space) with the
  same localized labels.
- `StateTag.vue` — the segmented state tag: one materialization of the
  mapping contract's `stateDisplayFor`. Flat values render as a single
  Tag styled by the authored severity/icon; dotted values render as a
  path — muted ancestor Tags with angle separators and the styled leaf —
  so nested/nested-legacy state values stay readable. The raw value
  rides in the title attribute as the debugging channel.
- `SurfaceBody.vue` — instance surface by container variant: `full` → the
  bare content column of a record page, `detail` → Card (same-role nesting
  flattens to a Divider), `row` / `inline` → dense flex row with budgeted
  fields and relation chips.
- `SurfaceDetailBody.vue` — shared detail/full body: preview, a bounded
  scalar facts strip (`DETAIL_FACT_BUDGET`, labeled via `fieldLabel`:
  descriptor label or start-case name), structural fields as an Accordion,
  budgeted relation chips with show-more toggles for relations not already
  covered by a child region, and the hierarchy tree for groups.
- `PreviewBox.vue` — preview materialization keyed on the declared payload,
  in one fixed-height band (`h-28`) for every content kind. An instance
  payload reference with a renderable declared
  mode (the pool's `instance.payload`, projected from the wire
  `attachments.primary`) renders through the shared viewer
  (via `ArtifactViewer` variant `card` — the non-interactive
  canvas that fills the card's fixed-height header band with no own
  border, because the host Card owns the chrome; images and sketch scenes
  fill the band at uniform scale while vector drawings (dxf/svg/occs)
  fit inside it, and dimension text renders big — the same contract as
  generated detail previews, which keep the pane viewer).
  A type that declares a `previewSource` field (the authored pack
  vocabulary adopted by the CTS registry, carried on the bundle type
  record and read off the wire DTO by `dtoToScreenInstance` as
  `instance.previewSource` — the first non-empty of the declared path
  and its `fallbackPaths`, so stored-shape variants of one renderable
  source all preview) renders that value through `DrawingCanvas`
  in the same band when no payload exists — the declared preview channel
  (cassette geometry, raw layer/polygon parts, and the OCCS template
  document, which renders through the canvas's `occs-cassette` source)
  never depends on an uploaded payload.
  Payload-less instances without a declared preview keep the
  deterministic per-instance inline SVG
  (seeded hue) built
  entirely from theme tokens — `--ck-subtle-background` bases with
  translucent hsl accents — so generated art adapts to light/dark and owns
  no hardcoded colors; `image` renders a seeded gradient sky, `geometry` a
  star plot. Attachment-class previews carry no invented art: an instance
  WITH a payload the viewer cannot render states the file's size and
  MIME, while a payload-less instance renders the quiet type-glyph band
  (the authored `depiction.glyph`, no MIME strings — blank is the honest
  surface for a record that never saved a source).
- `FieldControl.vue` — the field dispatcher: resolves the descriptor in the
  given variant and renders the display primitive or delegates to an
  editor. Measured values (quantities, instants, numbers) render in the
  mono face with tabular figures; prose and labels stay in the UI face.
  Structural displays are labeled: records/maps/json render as
  budgeted description lists, record lists as checklist rows (boolean +
  string subfields), variants as tag plus payload value. Every component
  it dispatches to (including MeterGroup, Chart, Rating, Slider,
  OrderList) is imported explicitly — the module-imports spec fails on
  any capitalized template tag without a matching import, because
  unresolved components render as empty nodes outside the Nuxt
  auto-import runtime. Data-visualization color travels with the data,
  decided by the medium: meter bars are DOM spans, so segments cycle the
  PrimeVue palette CSS vars (theme reactive); chart bars paint on a
  canvas where CSS variables cannot resolve, so datasets take concrete
  colors from the canonical design-token palette source
  (`designTokens.palette.primary` — chart.js v4 has no default palette;
  unclored datasets draw near-invisible bars).
- Editors: `QuantityInput` (InputGroup + unit addon), `EnumSelect`
  (filtered, via the shared Select wrapper), `InstancePicker` — AutoComplete
  with typeahead over the instance pool, or TreeSelect when the accepted
  type declares lineage children, `InstanceMultiPicker` (shared MultiSelect
  wrapper), `ChipsInput`, `FileUploadControl`, `Slider` for bounded scalars
  (declared min/max), and the recursive `ObjectEditor` / `ListEditor` /
  `VariantEditor` (compact density shrinks editors through PrimeVue
  sizes); maps and json edit through the JsonEditor textarea
  (pretty-printed, invalid JSON flagged inline). Percent quantities
  display as Knob dials, percent-valued
  maps as MeterGroup, non-percent quantity maps as bar Charts, ordinal
  enums as Rating, enum lists edit through OrderList, and spec-row values
  are click-to-edit through Inplace with visible affordance — hover
  highlights the value row and reveals a pencil icon.
- `InstanceChip.vue`, `PreviewBox.vue`, `ActionButton.vue`, `ParentRef.vue` — reference chips,
  payload previews keyed on the declared preview mode, action-button
  presentation from the compiled action record, and the containment
  cross-cut's parent context token (a muted parent-type icon + the
  parent's resolved label through `incomingChildrenEdges`/`parentRefOf`;
  a parent missing from the pool still names its type). Reference chips render as
  `subtle` pills — one step above the canvas, below instance cards: an
  inline reference is not an instance surface. Action and field labels
  resolve through the stable generated keys first
  (`actionLabelKey`/`fieldLabelKey`/`typeLabelKey` + `localizedLabel`),
  falling back to the resolver-derived label, so locale files may
  override any generated label; ActionButton carries the label as its
  accessible name. A host surface may pass a context-supplied label prop
  (still under locale-override precedence) to shorten a caption its own
  chrome already describes — RegionBlock's "New" beside the region header
  is the one current use. Obvious actions render icon-only when the
  resolver says so (create `+`, delete trash): the label stays the
  tooltip and accessible name, and the context label never widens the
  button back.

Select/MultiSelect only ever come through the shared entity wrappers
(`components/shared/InstanceSelect.vue`, `InstanceMultiSelect.vue`), which own
the direct PrimeVue imports.

## Related

- [shared/ui-mapping/README.md](../../shared/ui-mapping/README.md) — the
  mapping and composition contract (canonical).
- [pages/test/ui-mapping.vue](../../pages/test/ui-mapping.vue) — the
  showcase that mounts this engine over fixtures.
- [test-data/ui-mapping-fixtures.js](../../test-data/README.md) — synthetic
  compiler output.
