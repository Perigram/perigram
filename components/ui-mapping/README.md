# COMPONENT: UI Mapping Components

Materialization layer for the design-system mapping contract: real Vue
components that render the pure resolver outputs and the composed screen
tree. Every component decision (component choice, span, variant, budget,
action tone) comes from
[shared/ui-mapping](../../shared/ui-mapping/README.md); the registry of
component keys to these SFCs is the handwritten design-system surface, and
the only handwritten part. The display helpers (`titleFor`,
`formatQuantity`) live in the mapping contract.

Parent: [components](../README.md); its [SPEC](../SPEC.md).

## Construction fill values

The generated construction dialog composes a live preview through
`FillDialogBody` and consumes its ephemeral `meta` response. For Documents
templates, `ActionFormDialog` passes `meta.tokens` and `meta.sections`
to `TemplateValuesRow`: scalar tokens render as text inputs, while XLSX
repeat sections render as JSON-array editors. Invalid JSON or a non-array
value is rejected locally and does not replace the last valid draft value.
The values remain in the construction draft; token/section metadata and
substituted values are not persisted as a separate template record.


## Composition flow

`GeneratedMappingScreen.vue` composes the compiled screen contract
(`composeScreen` — pure, in `shared/ui-mapping/screen.js`) into a region
tree and materializes it with `RegionBlock` → `SurfaceBody` →
`FieldControl` / `InstanceInlineRef` / `PreviewBox` / `ActionButton`. The
screen root measures itself and provides the page container record when no
host declared one (panes and popups provide their own), so every surface
below resolves the real box it renders in. The `presentation` prop
(`record`, the default, or `peek`) threads into `composeScreen`: the
record presentation composes the depth-0 record as one document stack
(SPEC §22.17), and the record's comments live behind the header's entry —
the page host opens the thread stage as its bounded side panel
(`RecordCommentsPanel`, [chat](../chat/README.md)). The screen accepts a
`sourceStates` prop (per-source
loading/ready/empty/denied/error from the data layer) that `composeScreen`
folds into the region tree.

Type names resolve only through the one type-label chain
(`typeLabelFor` in [shared/ui-mapping](../../shared/ui-mapping/README.md),
bound app-side by `utils/generated-labels.js`): the design-system
`entities.*` keys win for pack types, generated
`uiMapping.types.<id>` overrides come next, org-authored types fall back
to their authored bundle name, and the unnamed placeholder is the last
resort.

Region actions run through `ActionButton`. Actions with construction
inputs open the generated create dialog, whose rows come from
`resolveCreateDialogInputs`
([shared/ui-mapping](../../shared/ui-mapping/README.md) — the canonical
row-derivation contract). Launch context is the engine's one
addition: when the dialog opens on a detail surface whose scope carries
the opened instance (`screen.scope.instanceId` + `screen.typeId`), every
lineage row whose accepted parent types include that type submits the
opened instance's reference without rendering, and a dialog whose every
row the context supplies runs with no form at all
([SPEC §4](../../SPEC.md)); every lineage axis without an authored
default rides the dialog — graph-wired axes included, because their wire
source is the launch context — and the same context reaches nested
part-creates through `NestedCreateDialog`'s `scopedInstance` prop.
`link` actions prompt for the relation
target through `InstancePicker` over the pool before dispatch (`onRun`
receives `{ relations: { key: ref } }`; the picker accepts the relation's
declared `targetTypes` and models the instance ref `{ type, id }` it
submits; its create affordance runs the host's nested dialog and lands
the created record as the link target). Relation targets live outside the opened screen's sources: the
dialog lazy-loads each accepted type through the host's `onLoadType` seam
when it opens, and the declared target domain (`where`, SPEC §6) filters
the offered candidates through the one shared evaluator. Relation
operations address their relation (SPEC §22.12): a section toolbar's
link runs with the screen scope's parent, and every reference-bound
entry — the relation chip's Unlink, a relation-scoped section row's
Unlink — executes through the `generatedExecuteAction` provide carrying
`{ instance: parent, data: { relations: { key: ref } } }`, the same
launch pipeline as header actions.

Instance navigation and quick actions follow the same callback seam as
`onRun`: an `onOpen(instance)` prop turns collection identities (cards,
table rows, list rows, tree rows, timeline entries, breadcrumb ancestors)
into link buttons that emit the instance — the app decides where they go;
identities stay plain text without it. Inline instance references
(relation chips, `ref` field values) are the one exception: they render
through the shared `InstanceInlineRef`, which owns its inspect-and-open
behavior itself. `onRun` receives a third `context` argument:
`{ instance }` when an instance-scoped quick action (the per-card ellipsis
menu) launched the run, so executors target the launching entity; a
reference-bound relation operation additionally carries `data` — the
relation payload (`{ relations: { key: ref } }`) the run dispatches with,
bound to the parent record as its instance. The record header seats the
opened record's scoped quick actions — machine transitions and the
record's derived export affordances — beside the region's manifest
actions; the construct's re-run rides the record-utilities group. A
collection surface offers the same set through its ellipsis menus.

Detail editing follows the record-surface edit law
([SPEC §4](../../SPEC.md)): an `onPatch({ instance, patch })` prop
enables the per-field inline pencils — scalar facts click-to-edit through
`InlineField` (confirming patches that one field), structural panels carry
their own pencil and confirm/discard over a local draft. RegionBlock maps
changed field names onto the flat §3 wire patch (the identifier `name` row
writes the wire name slot, everything else `fields.<name>` — the same
shape `processUpdate` writes) and re-emits every inline change as one
`patch` event. Every applied field change lands in the state record: the
instance patch transport appends an attributed `field_change` event to
`status_events` (actor, field, from → to — see
[server/core/machines](../../server/core/machines/README.md)), rendered
beside the transition history in `StateHistory`.

## Region data states and header controls

- `RegionDataState.vue` — materializes the composed region `dataState`:
  skeleton lines on first load (system stack rhythm), one shared Message
  for empty/missing/denied/error, the stale surface under one
  indeterminate progress bar on reloads with already-loaded instances —
  `LAYOUT.reloadBar` overlays a collection surface's top edge, and a
  depth-0 record header owns a permanent `LAYOUT.reloadLane` under the
  header the strip appears inside (SPEC §22.9) — and
  plain content for ready — the only loading/empty states any component
  renders.
- The region header is one title row — label, count chip, and create set
  (+ link where a relation section owns it, SPEC §22.12) — with the
  search trigger and the one view-setup trigger at the trailing end. A
  create whose target the region already names renders the bare `New`;
  the full class-named caption renders when the button stands alone on
  an empty stub line.
- The view-setup popover is the collection's one view surface. Its
  layout picker renders the display types as projection icons: the
  derived layout and, where the collection switches, the alternate
  (Table ↔ Board). Picking a layout restores the per-type models for that
  projection and persists the choice.
- The same popover hosts the shared `FilterBuilder` panel
  ([shared](../shared/README.md)) over the fields `builderFieldsForType`
  derives ([shared/ui-mapping](../../shared/ui-mapping/README.md)), the
  sort keys (the card-grid projection), and the field selection that sets
  the collection's explicit column set (persisted per type, absent = the
  derived budget). The trigger badges the active condition count
  (`countPredicates`). Every hosted control is a live model. The filter
  tree, projection, and sort choices are persisted view state per type
  (`utils/ui-view-state.js`), evaluated with the one matcher
  (`instanceMatchesFilter`) against the region's pool.
- Search renders as a round icon button on every collection region and
  expands in place to its input on press; an active query keeps it open
  and an empty blur collapses it. The input binds the region-owned
  search model.
- The layout choice carries the one layout-shaped user view state,
  persisted per type beside sort and filters: a collection whose type
  serves a state vocabulary and whose derived layout is a structural
  collection (table) offers the board choice, and a derived board offers
  the table choice; a stored preference for a non-switchable collection
  is ignored. A stored preference is the user's explicit view — the
  table floor governs the derivation alone. Timeline and stats keep
  their derived shape.
- A region mounted with a `viewState` prop renders a saved lens: every
  view model seeds from the prop (the stored tree re-validates through
  `normalizeFilter`, the projection and sort through their bounds) and
  the persistence skips — the controls stay live but their choices stay
  session-local. A `label` prop overrides the type-derived section title
  (the embed names the view). The title row stays one line while it has
  room (SPEC §22.15): the label yields first through ellipsis.

## The record document's overlay (SPEC §26)

An instance overlay composes custom blocks around the record document's
declared sections and reorders them; the storage contract, the block
kinds, the section-key grammar, and the order law are canonical in the
[instance-overlays feature](../../server/features/instance-overlays/README.md).
`composeDocumentSections`
([shared/ui-mapping](../../shared/ui-mapping/README.md)) is the pure
application.

- **Collection header in the document.** A collection section inside
  the record document renders the same header as a standalone list:
  label, count, and create set at the leading end; the search and
  view-setup triggers at the trailing end.
- **Composition.** The depth-0 record in the `record` presentation
  renders the document's section flow through `SurfaceDetailBody`: the
  body's own sections (`properties`, `editor`, each relation section)
  render in the composed order, and the child collections and the
  overlay's blocks render through the `document-section` slot the
  `RegionBlock` host provides — child collections through one
  `RegionChildren` stack per section, text blocks through the
  [generated](../generated/README.md) `OverlayTextBlock`, view blocks
  through `ViewEmbed`. The declared structural open sections ride with
  the `editor` key (the band and its open sections are one flow
  position). The record header and the inert stubs sit outside the
  order. Editor-bound types render no overlay (SPEC §4): their open
  page surfaces resolve the editor page. With no overlay the flow is
  the derivation order — the same document the fixed rendering
  produced. A child section that empties drops to the stub strip and
  its order entry goes dormant until the collection fills again.
- **Hosts.** Routed record pages and workspace panes compose; the record
  popup (a `popup` container-traits host), the peek, and nested cards
  keep their own presentations and render no overlay.
- **Authoring.** Write-grant holders (the
  [file-surfaces](../generated/README.md) write-grant seam decides) get
  the session ([composables](../../composables/README.md)
  `useRecordOverlay`). The authoring surface is the document's left
  gutter lane: the lane sits in the measure's left margin, so every
  viewer keeps the same header and content position. Every section
  renders the lane's pair aligned with the section's first line and
  revealed on hover or focus: the plus first, then the six-dot drag
  handle. The plus opens the same block vocabulary as the slash panel —
  headings, lists, to-do, quote, callout, code, image, diagram, divider,
  table, collection view; a text entry inserts a text block opened at
  that kind, the callout inserts an empty blockquote, the image entry
  opens its upload-or-address dialog, and the collection-view entry opens
  the type containment tree with each collection's saved views. The drag
  handle opens the section menu (move up/down; custom blocks also
  delete) and drags to reorder; the drop target paints a floating line
  above the section. Sections reorder by dragging the handle and by the
  handle's keyboard arrows. Declared sections reorder alone; custom
  blocks also edit and delete. A text block is seamless document
  content: click mounts the engine inline at the click point (crepe's
  page chrome stripped through `ck-inline-editor`), Escape or
  Cmd/Ctrl+Enter closes it, and Enter at the block's end starts the
  next block. An empty paragraph keeps Enter inside the same block, so
  sequential empty lines never stack as separate blocks. Backspace in an
  empty block removes it and resumes the previous text block. An arrow
  key at a text block's visual edge continues in the adjacent text block
  at its start or end. The engine scrolls the block into view on mount.
  Inline instance references ride the text as `#instance:` links; the
  Instance entry opens the shared `InstanceSelect`, and the read
  composition mounts the shared `InstanceInlineRef` chip in place of
  each link. The document's trailing line is always mounted while no
  block editor holds focus: idle it renders the placeholder alone, and
  the live engine mounts from the first activation. Enter commits its
  text as a block and leaves a fresh empty line, and
  Backspace in its empty line resumes the document's last text block. It
  is the document's single placeholder: empty text blocks render nothing
  and drop when their editor closes. `TrailingTextBlock` is the one
  mount; the custom page
  ([generated](../generated/README.md)) renders the same component over
  its page session. The record's own
  field edits
  stay on the inline-pencil channel. User space autosaves: a dirty
  overlay writes itself after 1.5s idle through the same save seam
  (registered on the workspace page-dirty registry) and keeps the open
  editor while later keystrokes queue the next write; the header's
  cluster slot keeps the flush-now save.

## Drag payloads

Native drag payloads carry app-private MIME types, so dropping a dragged
item over an editor or text field inserts nothing.

| Source | Type | Value |
|---|---|---|
| Document section handle | `application/x-perigram-doc-section` | section key |
| Board card | `application/x-perigram-instance` | instance id |

Drop targets resolve the drag through their in-memory state (the session's
`dragKey`, the board's dragged instance).

## Components

- `GeneratedMappingScreen.vue` — engine: composes and renders a compiled
  screen; the top-level sections render through `RegionChildren` over the
  composed `regionsArrangement` (screen sections arrange through the same
  stepped ladder as record children — columns, tabs, full-row claim), with
  the screen-level RegionBlock props and event channels passed through the
  `regionProps`/`regionEvents` passthrough. `presentation` selects the
  depth-0 record treatment and threads into `composeScreen`:
  `record` (the default) composes the document flow — the depth-0 record
  renders one inline stack at the `LAYOUT.measure` (the wide step, 60rem)
  with `SurfaceHeader` page chrome (lineage trail, identity line, action
  cluster, lifecycle history);
  `peek` keeps the ladder arrangement, the lineage trail, and the compact
  identity line, state surface, and action cluster over the record body.
  A host passing `headerTarget` seats that header in its own DOM
  (the record popup's dialog header) through a teleport. A host passing
  `expandable` gets the header's step-up button, whose `expand` event the
  host turns into the record's own page. `keepEmptyLists` keeps an empty
  top-level list section in the arrangement with its header and empty
  state instead of the stub strip (the class page's own collection). The root measures itself and
  provides the page container record when no host declared one, so step
  engagement and budgets resolve against the real box (a designer preview
  box or narrow viewport arranges narrow). The root also provides the
  rhythm set: the spacing coefficient derives from the host record's
  density tier and the screen's composed weight
  (`spacingCoefficientFor`/`screenWeight`), and an explicit
  `spacingScale` prop (the showcase slider) overrides the derivation. It hosts the generated action
  form dialog and nested part-creates through
  `ActionFormDialog`/`NestedCreateDialog` (below), the link dialog
  (`StandardDialog`), ConfirmDialog for destructive actions, and Toast
  feedback on runs.
  Launch behavior follows `planActionLaunch` (see the shared README's
  Actions section): a create with construction inputs always opens its
  dialog regardless of grant level. The screen hosts its own `<Toast />`
  element — the toast service fires into the nearest host in the tree, and
  the module-imports spec fails on imported-but-unrendered components.
  Confirmations use the default group: the app layout owns the single
  default-group `ConfirmDialog` host, so concurrently mounted screens
  share one host.
- `RegionBlock.vue` — one composed region with data-driven layout: the
  list layout comes from `resolveListLayout` (`table` |
  `card-grid` | `timeline` | `stats` | `board` | `gantt` | `calendar`;
  the
  matcher is [shared/ui-mapping](../../shared/ui-mapping/README.md)'s).
  The list header stays one line while the row has room — label, count
  chip, and create set lead; the search and view-setup triggers trail
  (SPEC §22.15, see above). List regions stack the header row and the
  collection surface (`RegionCollections.vue`, the one materialization of
  the layout switch embedded and standalone lists share) on the section
  rhythm; nested child regions arrange through `RegionChildren.vue` over
  the stepped outcomes and budgets canonical in
  [shared/ui-mapping](../../shared/ui-mapping/README.md). A region
  rendering in the stub slot (`stub` prop, the pack strip under a record
  body) renders its create affordances and, for a relation section, its
  injected link action — while loading/denied/error states keep the
  shared `RegionDataState` surface.
  A create action renders its compiled caption without the creation
  mode; the header shortens its own type's create to the bare `New`
  while the empty stub line keeps the class name. The toolbar and stub
  line render their create set through `createActionControls`:
  same-type creates collapse to one `CreateControl` (see below) whose
  mode selection names the siblings.
  A relation-scoped section's toolbar and its empty stub line render the
  injected link actions for its relation (SPEC §22.12) beside the create
  set — the same-type link collapses to the bare "Link" — and its rows
  (every projection) carry the relation's unlink
  actions in their ellipsis menus, running against the parent record
  with the row's relation ref as payload. A class list region renders
  no link — the action addresses a concrete parent instance.
  Top-level detail regions compose a record page (SPEC §22.17): in the
  `record` presentation the region renders one inline document — the
  root carries `LAYOUT.measure` (content centered and bounded at the
  wide step), a full-width `SurfaceHeader`, then the record body with
  the child and linked collections as inline sections below it in
  composed order, the inert stubs. A depth-0 record of an
  editor-bound type on an open page surface resolves the editor page
  (SPEC §4, owner direction 2026-11-07) instead (`RecordEditorBody`
  [generated](../generated/README.md)): an `ownsChrome` surface (the
  graph editor) owns the page — the editor mounts flush with its file
  panel and the pane's Back control alone above it when navigation
  history exists; every other editor keeps the unified header over the
  flush mount with the editor-page chrome channel — no property rows,
  trailing sections, stubs, or overlay
  composition; the popup host keeps the compact document, whose editor
  band mounts read-only (the popup carries no chrome channel; editing
  opens through the step-up). In the
  `peek` presentation the record keeps the ladder arrangement — the
  wide step's side outcome lays the body beside the weight-earned side
  column, narrower hosts take the children's own step outcome below
  the body.
  The depth-0 record document also composes its instance overlay (SPEC
  §26 — see the section below) on routed and pane hosts.
  Nested detail regions keep the Card
  surface; empty regions render the stub line or a Message by placement.
- `RegionChildren.vue` / `PlacementBox.vue` — the arrangement
  materialization: the composed tree carries one outcome per width step,
  and RegionChildren engages the step the host record grants (`stack`,
  `mixed` with the remainder's own stepped arrangement, `columns` with the
  full-row claim, weight-ordered `tabs`) without recomposition; the
  columns outcome engages its tracks only when the measured box grants
  every track its earned minimum, stacking otherwise. Each column track
  and the record side column is a PlacementBox — a placement slot that
  measures its own box and provides the container record everything inside
  renders against, so a table or card grid inside a rail or track sheds
  columns and facts for the width it actually has.
- `SortControl.vue` — the collection sort control over the shared
  `listControls.sortKeys` contract (tables sort natively by column).
  Board lanes render its trigger with its own popover; the region
  header's view popover renders its `inline` key list. Keys render
  inline as buttons and the order toggle flips asc/desc beneath them; the
  host owns the value, the order, and their persistence
  (`utils/ui-view-state.js`). The key list renders inline because a
  select overlay would sit outside the popover's DOM subtree, where the
  popover's outside-click handling closes the control on every pick.
- `BoardCollection.vue` — the state board: the projection whose columns
  are the type's served state vocabulary (authored order, `StateTag`
  headers with per-column counts) and whose cards are the loaded instances
  grouped by their flat state — the card-grid anatomy (preview band
  through `PreviewBox`, identity link, budgeted facts) with two deliberate
  omissions: the status badge (the lane already is the state) and the type
  subtitle (a lane is single-type). Facts follow the card-grid budget
  (`cardFactCount` over `CARD_FACT_SCALE`, compact in a `narrow` host
  through the container seam); the beyond-budget overflow opens the
  card's record popup — the record surface carries the full fact set —
  and the facts rhythm follows
  the screen's injected spacing coefficient (compact screens shrink board
  cards with everything else). Per-instance quick actions (deletion,
  instance-scoped commands) ride the card's ellipsis menu like the card
  grid; status transitions are the drag itself and the opened record's
  strip. It renders by derivation for process-class flat collections and
  through the projection switch for any stateful structural collection
  (see the header-controls contract above). Columns are `subtle` wells on
  the surface ladder; cards sit on the content surface. Membership moves
  only through the machine: legality starts from the contract edges
  (`stateTransitionsByType`, carried on the region node) and is replaced
  at dragstart by the host's machine-authority resolver
  (`onFetchTransitions` — the state service's per-instance transitions,
  the same source the detail header's transition buttons dispatch
  through), because the compiled contract copy can lag the served machine
  (override or default machines serve transitions the producer copy never
  carried). A machine-legal target lane paints the content surface instead
  of the subtle well while a drag is live — the target token REPLACES the
  well token, since an appended `bg-*` pair is unordered in the generated
  stylesheet and the idle well would win. A lane with neither a resolver
  hit nor contract edges admits no drags from that state; a served machine
  with no moves anywhere renders a read-only board. The drop emits the
  `transition` intent; the host executors apply it optimistically over the
  shared pool (`utils/optimistic-state.js`) — the card lands in its lane
  immediately, the server result reconciles, a failure rolls the captured
  record back, and offline queueing keeps the flip for the outbox to
  replay (the app's one optimistic contract). The machine stays the
  authority: every surface reconciles through the same store write,
  refused moves restore, and board-local state stays untouched. Ordering
  belongs to the column: each lane carries its own `SortControl` with a
  persisted per-type-and-state preference (`board-column:` scopes through
  `utils/ui-view-state.js`). Column bodies are bounded
  (`--ck-board-column-max-height`, viewport-relative) and scroll
  independently — the board fits its container, and the same flex contract lets lanes fill bounded hosts
  (workspace panes). Dragging into the rail's horizontal edge zone
  auto-scrolls toward hidden columns. Stale states outside the vocabulary
  degrade to neutral columns that admit no drops. Native HTML5 drag is the
  desktop affordance; the per-card ellipsis menu and the opened record's
  transition strip remain the accessible and touch paths.
- `GanttCollection.vue` — the durational projection: one row per instance
  over a shared instant scale. Declared instants in declaration order are
  the interval (`temporalFieldsFor`: first start, second end); the pool's
  own min/max bounds the scale, bars are data-driven geometry (the inline
  data-driven exception: `left`/`width` from the instant values) painted
  by the state severity token classes (`bg-status-*`), a start without an
  end renders a point — a duration is never fabricated — and the axis
  carries month ticks (dense scales drop labels, keeping structure) plus
  the today marker when the scale spans now. Identity links follow the
  shared `onOpen` contract.
- `CalendarCollection.vue` — the scheduled projection: a month grid over
  the type's lone declared instant. Day cells are subtle wells, today's
  cell steps up to the content surface, instances render as capped
  identity chips with a plain overflow count (the day cell is a summary
  chip carrying no lineage trail — the record surface states the
  ancestry),
  and month navigation is local view state — the month opens on the first
  loaded instance's month. Labels and weekday headers format through the
  active locale.

- `CollectionTable.vue` — the columnar list projection (DataTable):
  identifier (`InstanceIdentity`) under the identifier field's label (a
  type without an identifier field heads the column with the type label;
  SPEC §22.15), status, budgeted scalar descriptor
  columns, the first declared relation as budgeted chips when any
  loaded instance carries its refs (the contract's `relationColumn` —
  an explicit edge or a declared ref field, whose value lives under
  `relations.<key>` and reads through the one resolver; a typeless
  stored shape adopts the edge's single declared target or the ref
  field's first accepted type; an unfilled relation renders no column),
  and the first filled
  structural field
  (json/record/map, the contract's `summaryColumn`) as a bounded inline
  summary cell — a narrow host sheds it with the compact column scale —
  and one column per declared children edge — its key labels the
  column, only that edge's children ride it as budgeted chips
  (`childrenOfParent` over the host-overlaid pool). Both chip cells'
  overflow controls open the row's record popup (SPEC §22.8's overflow
  law — the record surface carries the full sets), the screen's open
  channel as fallback. Scalar cells are
  `InlineField` in its cell variant: on patchable surfaces every value
  (the empty ones included) edits in place through the per-field
  pencil, patching through the region's `inline-change` channel; rows
  carry the per-instance ellipsis menu (the same run contract the
  cards use) exactly where that row has an applicable action, and
  relation refs normalize through the one app resolver
  (`resolveInstanceRelationRefs`: a bare stored id resolves against the
  relation's single declared target, ref objects keep their own type). Rows are surface cards — the
  preset paints every row as the content surface with transparent
  internal dividers, the recipe clips the row corners
  (`[clip-path:inset(0_round_var(--p-border-radius-xl))]`, since a row's
  background is not clipped by its radius), and the recipe's other half
  separates the rows (`LAYOUT.rowSurfaceTable` through the pt table
  channel: separated cell borders leave the ladder-step gap between
  rows) — every instance row sits
  one step above the canvas on its own card, while
  the table box stays unpainted (SPEC §22.10).
  The resolved container record sizes the column budget — a
  `narrow`/`medium` box (pane, popup, side rail, column track) takes the
  compact column scale through the container seam. Columns come from the composed `listControls` contract (filled
  short scalars bounded by the richness budget — a field no loaded instance
  fills stays out of the columns), identity/status/scalar columns are
  sortable (quantity values sort by their numeric value), the
  list-controls contract's `defaultSort` (the first filled short scalar)
  is the default sort, the user's last sort persists per type through
  `utils/ui-view-state.js`, and the paginate threshold is the
  shared `TABLE_*` budget from the mapping contract. Filtering belongs to
  the region toolbar above the table. The region toolbar renders
  type-level actions only (creates): every other action kind addresses a
  concrete instance (delete, transitions, instance-scoped commands) and
  renders on the instance surfaces — row menus, the detail header, and
  the machine-served transitions. An unscoped list of a type that can be
  someone's child (a declared children edge names it) composes the
  containment cross-cut (`crossCut` on the composed node — scoped sources
  render inside the surface that already states their parent): every
  identity renders outside its parent's surface, and the identifier
  surface carries the lineage chain at its top (see `InstanceIdentity`).
  Containment navigation belongs to the workspace
  explorer.
- `CardGrid.vue` — the media and membership collection projection
  (DataView, paginated): cards lay out in the shared `ResponsiveGrid`
  primitive with container
  queries and bounded item tokens (viewport breakpoints lie inside
  panels), each Card clipped (`overflow-hidden`). The card anatomy
  follows the type's data shape through `cardAnatomyFor`
  ([shared/ui-mapping](../../shared/ui-mapping/README.md)):
  the `tile` (visual preview, no card facts) carries the preview as the
  whole card in `#header` with the identifier in the grounded chip
  recipe (`CHIP_LABEL_PT` + `FILE_CHIP_CLASS` from `chip-surface.js` —
  a chip over media carries its own ground; the transparent instance
  chip is the content-surface variant, and the two background
  utilities never compose), opening the record when the screen carries
  an open handler, riding the media's corner
  (`LAYOUT.mediaTileBadge` positioning) and status plus the row menu
  floating on the media — the body slot stays hidden so no padded box
  trails it, and the grounded lineage trail chip rides under the
  identifier chip when the cross-cut composes (the tile bypasses the
  identifier surface, so its host renders the trail). The tile's
  identifier chip is a record-peek trigger (SPEC §22.14 —
  `HoverPeek` + [`InstancePeek`](../shared/README.md#instancepeekvue),
  the compiled record surface in the peek rhythm); the `side`
  anatomy (visual
  preview with facts) lays the preview in one bounded framed
  column (`LAYOUT.previewSide`) beside identity, status, and the
  labeled budgeted facts; the `plain` stack
  (every other type) renders the payload chip beside identity in
  `#title`: an editor-bound file type opens its file-surface editor through
  the page-open seam; unbound types download the payload.
  The facts render in `#content`; the identity
  surface carries the lineage trail on cross-cut lists. Card ordering
  lives in the region header's view popover (RegionBlock applies the
  `sortKeys` contract through the shared comparator before the grid
  mounts; the DataView itself renders no header). The card identity is a
  link button when the screen has an `onOpen` handler, and the type's
  per-instance quick actions (resolveInstanceActions: deletion and
  instance-scoped commands — status transitions are per-instance machine
  facts served by the state service) render as one shared ellipsis menu
  per card that re-emits through the region run contract with that card as
  instance context — confirmation and dispatch stay upstream. The
  ellipsis renders only on rows carrying an applicable action
  (`actionAppliesToEntity` per instance): a type-level action set never
  opens an empty menu.
- `StatGrid.vue` — the stats projection for percent/quantity-dominant
  types (the shape matcher is
  [shared/ui-mapping](../../shared/ui-mapping/README.md)'s): a dense
  `ResponsiveGrid` of cards — identifier (`InstanceIdentity`), state
  tag, and the type's derived
  metric field rendered in the `text-metric` face, quantities formatted
  through `formatQuantity`.
- `TimelineCollection.vue` — the chronological list projection (Timeline):
  marker-per-entry with identifier (`InstanceIdentity`, trimmed at the
  timeline column's edge — the bounded
  identity-link recipe the tables use: `min-w-0 max-w-full` with a
  truncating label), inline scalar facts, and the type's primary long-text
  (or first structural) field as the entry body, selected by type matcher
  (log entries). The timeline is left-anchored: the `#opposite` column
  PrimeVue always renders is display:none'd through pt, keeping wide
  unbreakable content from eating half the row, pushing the separator, and
  drifting items' left borders out of alignment. Past the shared page
  budget the entries page through a standalone Paginator over `pageSlice`.
- `SurfaceHeader.vue` — the unified page header (SPEC §22.3): one
  anatomy for every page surface — the record document (non-editor
  types), the editor pages ([generated](../generated/README.md) files,
  whose name/save live here through the chrome channel), and custom
  pages (a `title` + `onRename` with no type or instance, so no type
  label, state surface, or comments entry renders). It paints nothing —
  the page's stack rhythm separates it from the body, and pane boxes /
  route shells own the frames around it. Lineage Breadcrumb above the
  identity line (when the record has declared containment ancestors),
  a contextual `navigation` channel (the `#navigation` slot for direct
  template hosts plus the `navigation` prop — `{ icon, label, command }`
  threaded through GeneratedMappingScreen → RegionBlock to the depth-0
  header; a host that opened the record inside another surface injects its
  back affordance ahead of the identity block), then one identity line,
  rendered in every host (the pane tab names the record beside it, and
  the header stays the page's own title surface): Avatar carrying
  the type glyph, the title in the container-stepped
  `text-record-title` role (the one title resolver —
  [shared/ui-mapping](../../shared/ui-mapping/README.md); instance ids
  are private display vocabulary). The title edits in place where the
  surface owns the name: a bound editor chrome channel (`rename`),
  else the host's `onRename` (the record document's identifier-field
  patch — the popup's title stays read-only); the quiet transparent
  input commits on enter and blur. The identity line carries the title
  and the state surface; a subtle type label under the title through the
  same type-label chain opens the class dialog (SPEC §27,
  [type-designer](../type-designer/README.md)); it is editable for
  organization classes to capability holders and read-only otherwise.
  Exactly one state surface rides the title line. A state axis is a tree, so stateful
  records carry no lifecycle strip: an instance with a flat `state`
  renders the segmented current-state tag (`StateTag`, resolved against
  the region's `statePolicy` — the header shows the data's state even when
  the served vocabulary has none for it). The tag is the state surface's
  trigger: it opens the state popover, which carries the machine's legal
  transitions on top and the shared `StateHistory` audit trail
  (`/api/state/history`, a state-stepped vertical feed) below. Instances
  without a state render nothing (no state is information).
  The action cluster sits right (the identity's flex-1 is the push): the
  bound editor's divergence refresh and dirty-marked save (SPEC §4),
  host-owned leading cluster entries through the `cluster` slot (the
  record overlay's save, SPEC §26; the custom page's save), the
  comments entry, then action groups by
  control kind with hairline dividers between consecutive non-empty
  groups (`LAYOUT.actionGroup`/`actionDivider`): record utilities — the
  construct re-derive — then at most `HEADER_ACTIONS_INLINE` generated
  buttons inline with the overflow ellipsis in the same group — a third
  and every further action join one popup ellipsis menu with the same
  localized labels — then the step-up. The comments entry
  (SPEC §22.17) renders wherever the header carries a record identity:
  a provided `recordCommentsPanel` channel (the page hosts — routed
  page, pane, workspace page — provide it) opens the record's thread
  as the bounded side panel (`RecordCommentsPanel`,
  [chat](../chat/README.md)); hosts without the channel (the record
  popup) and the compact peek keep the shared chat-surface entry — one
  comments entry point on every record surface. An editor-bound type's
  open page is its editor (SPEC §4), so the header carries no
  editor action. Runtime transitions
  arrive as `{ __runtime, state: { to }, intent, region }` from the
  page's state-service fetch, dispatch through the dedicated
  `transition` channel, and their labels/severity/icons resolve from the
  same policy map. The header is
  its own layout container through the named `.ck-record-header` recipe
  (the global stylesheet, referenced from LAYOUT — headers render
  inside panels and detail child stacks): long names truncate through
  the `min-w-0` chain, wide headers floor the identity at 16rem so a
  large action cluster wraps below the identity, and the record title
  steps with the same width (1.5rem narrow, 1.75rem from the 34rem
  step). `compact` renders the record name as the lineage trail's last
  crumb (or its sole crumb without ancestors), with the state surface
  and action cluster over the body; the byline stays on the page.
  `expandable` adds the step-up button at the end of the cluster and
  emits `expand`. The version surface and its replace
  affordance ride the payload preview
  ([generated](../generated/README.md)). Under the header rides the
  record's permanent reload lane (SPEC §22.9).
- `StateTag.vue` — the segmented state tag: one materialization of the
  mapping contract's `stateDisplayFor`. Flat values render as a single Tag
  styled by the authored severity/icon; dotted values render as a path —
  muted ancestor Tags with angle separators and the styled leaf — so
  nested/nested-legacy state values stay readable. The raw value rides in
  the title attribute as the debugging channel. `actionable` makes the tag
  the state surface's trigger: it carries the dropdown caret, the button
  role, and emits `select` with the DOM event for the host's popover
  anchor.
- `SurfaceBody.vue` — instance surface by container variant: `full` → the
  bare content column of a record page, `detail` → Card. Both variants
  render through `SurfaceDetailBody` under the identity line.
- `PropertyRows.vue` — the property-row list both body grammars render
  (SPEC §22.17): spec rows with the per-group show-more control, an
  optional authoring projection (the holder's per-row popover, SPEC §1),
  and the row group class the popover's hover reveal rides on.
- `SurfaceDetailBody.vue` — shared detail/full body. The document variant
  (`full` + `record`) renders the record document's section flow: the
  property block, the dominant band with the declared structural open
  sections riding beneath it, and each relation section
  (`RelationChipSection.vue` — the one chip section both grammars
  render) in the composed overlay order, with foreign sections (child
  collections, custom blocks) delegated to the host's
  `document-section` slot. The `full` variant
  in the `record` presentation of an editor-bound type mounts the editor
  surface as the body's dominant content (SPEC §4) — the compact
  document the record popup renders, since the open page surfaces
  resolve the editor page in `RegionBlock`:
  `RecordEditorBody`
  ([generated](../generated/README.md)) fills the bounded
  `LAYOUT.editorBandBounded`, the version trigger overlays its corner, and
  the body grammar
  follows the type's content — the fact strip renders only when
  the type carries filled non-identifier scalar facts, so a
  payload-only document type shows the editor alone while a canvas type
  keeps its parameter facts; relation sections and the record ladder's
  child collections stack after the editor per the existing arrangement.
  The record document body (SPEC §22.17, `full` + `record`) leads with
  the property block: the declared scalar facts as compact property rows
  (muted label cell + value) directly under the header, collapsed to
  filled values behind the per-group show-more control, single-group
  bodies carrying no group titles; structural fields and relations
  follow below the editor/preview as labeled open sections stacked full
  width. The property block renders the compiled fact block
  unchanged. The `peek` presentation, nested Card variants, and editor-less
  types keep the preview band and the fill grammar: preview (the Card
  variant and narrow hosts
  rendering in the bounded
  `LAYOUT.previewEmbedBand`), a bounded
  scalar facts strip (`DETAIL_FACT_BUDGET`, identifier-excluded — the
  title owns that value; collapsed behind one show-more control per
  group; `LAYOUT.factsGrid` columns on full variants, the hairline
  `LAYOUT.specList` on cards), structural fields as labeled open
  sections, labeled relation
  sections (the field label override channel over the relation key,
  start-cased fallback) with budgeted chips and show-more toggles —
  relations a child region covers render no duplicate section — and
  each chip carries the
  relation's inline-resolved operations (unlink) as `contextActionEntries`
  bound to the opened record. The
  non-document `full` variant fills its surface through the
  `LAYOUT.bodyGrid`/`LAYOUT.factsGrid` utilities: content width is the
  floor and the host grants growth — fact groups fill in tracking
  columns, body blocks grow into spare row width; nested card
  variants keep the hairline spec list. The preview treatment follows
  the content with `PreviewBox fill`: prose flows
  (`LAYOUT.previewHeroBandFlow`), a page renders in the framed region
  (`LAYOUT.previewHeroBandAspect`), bounded
  media and declared
  previewSource fill the framed region
  (`LAYOUT.previewHeroBandContent`) — the framed region fills the
  page's free space (viewport-derived height floored at 24rem) — and
  the quiet glyph keeps the bare
  small ladder. Narrow hosts (the record peek) render the bounded
  embed band (`LAYOUT.previewEmbedBand`, 9rem below 40rem of container
  width, 14rem above) whatever the content. Without an editor mount,
  the `full` variant overlays
  the version trigger (`PayloadRevisionPicker`) on the preview's top
  corner, outside the band's clip; its popover carries the revision list
  and the replace affordance
  ([generated](../generated/README.md)). A list region with
  nothing to show
  renders at content width, and a record's empty child regions render
  their section title with the create set directly beneath it, packed
  side by side at content width (`RegionChildren pack`). Every scalar and
  simple structural field renders through `InlineField.vue`, the one
  detail value cell (plain display; the click-to-edit Inplace with pencil
  on patchable surfaces) — hosts own the label placement, so facts,
  simple structural rows, and quantity maps share the same affordance.
  Rich structural values render open under their section label with their
  own pencil through `StructuralFieldPanel.vue`: one panel edits at a
  time over a local draft with confirm/discard. Display renders only
  fields that carry values.
- `PreviewBox.vue` — preview materialization keyed on the declared
  payload; the `variant` prop names the slot this box fills: `band`
  (default) renders one fixed-height stamp (`LAYOUT.previewBand` —
  bounded card hosts like the board), `stamp` fills a caller-sized box
  with the card treatment (the card grid's tile and side-preview
  columns), `pane` fills the record body's hero band with the detail
  treatment. A
  registered plugin preview binding
  (`components/generated/plugin-preview-bindings.js`) takes the band
  first. An
  instance payload reference with a renderable declared mode (the pool's
  `instance.payload`, projected from the wire `attachments.primary`)
  renders through the shared viewer (`FilePayloadViewer`): the card
  treatment fills its band with no own border, because the host owns the
  chrome — images and sketch scenes fill the band at uniform scale,
  vector drawings (dxf/svg/occs) fit inside it, tables clip their rows,
  the PDF renders its first page as a painted canvas thumbnail (pdf.js;
  the param'd iframe stands in when the paint cannot run), Word
  documents clip, prose rides the card-band compact scale
  and clamps, and dimension text renders big. The pane treatment
  follows the content: prose renders as markdown at the body's measure
  (the shared pipeline under its one element recipe — the text preview
  mode is markdown like the text editor and agent answers), the PDF
  fills the framed region (viewer chrome hidden, the page fits the
  frame's width and scrolls inside), and bounded
  media fill the framed region — contained rasters, fitting drawings,
  scrolling tables and Word documents. Fetch-backed
  modes state their load (spinner) and surface a failed download. A
  type that declares a `previewSource` field (the authored pack vocabulary
  adopted by the CTS registry, carried on the bundle type record and read
  off the wire DTO by `dtoToScreenInstance` as `instance.previewSource` —
  the first non-empty of the declared path and its `fallbackPaths`, so
  stored-shape variants of one renderable source all preview) renders that
  value through `DrawingCanvas` in the same band when no payload exists —
  the declared preview channel (cassette geometry, raw layer/polygon
  parts, and the OCCS template document, which renders through the
  canvas's `occs-cassette` source) independent of an uploaded payload.
  Attachment-class previews carry honest surfaces: an instance with a
  payload the viewer cannot render centers the shared `FileChip` (the
  file's name and mime-aware icon), while
  a payload-less instance renders the quiet type-glyph band (the authored
  `depiction.glyph` — blank is the honest surface for a record that never
  saved a source).
- `FieldControl.vue` — the field dispatcher: resolves the descriptor in
  the given variant and renders the display primitive or delegates to an
  editor. A ref field whose value resolves no reference renders
  nothing (empty and unrecognized shapes alike — the chip, not a
  placeholder badge, is the surface). Measured values (quantities, instants, numbers) render in the
  mono face with tabular figures; prose and labels stay in the UI face.
  Structural displays are labeled: records/maps/json render as budgeted
  description lists (instance-ref subfields render as `InstanceInlineRef`
  chips), record lists as inline checklist items (boolean + string subfields),
  variants as tag plus payload value. Every component it
  dispatches to (including MeterGroup, Chart, Rating, Slider, OrderList)
  is imported explicitly — the module-imports spec fails on any
  capitalized template tag without a matching import, because unresolved
  components render as empty nodes outside the Nuxt auto-import runtime.
  Data-visualization color travels with the data, decided by the medium:
  meter bars are DOM spans, so segments cycle the PrimeVue palette CSS
  vars (theme reactive); chart bars paint on a canvas where CSS variables
  cannot resolve, so datasets take concrete colors from the canonical
  design-token palette source (`designTokens.palette.primary` — chart.js
  v4 has no default palette; uncolored datasets draw near-invisible
  bars).
- Editors: `QuantityInput` (InputGroup + unit addon), `EnumSelect`
  (filtered, via the shared Select wrapper), `InstancePicker` —
  AutoComplete with typeahead over the instance pool, loading an
  accepted type's instances on demand when the screen does not source
  it, or TreeSelect when the accepted type has declared containment
  ancestry: the tree nests accepted instances under their ancestry
  (the same containment walk the record's chain renders; ancestor
  levels load on demand and render as muted navigation rows carrying
  their type label), accepted-type nodes are the only selectable ones,
  and TreeSelect's checked-keys map selection resolves to the
  `{ type, id }` instance ref of the selected node; both branches
  filter, `common.search` —
  `InstanceMultiPicker` (shared MultiSelect wrapper), `ChipsInput`,
  `FileUploadControl`, `Slider` for bounded scalars (declared min/max),
  `RefRowActions` (the create affordance itself: compiled create actions
  for the accepted types dispatch by creation protocol — the icon
  button's accessible name carries the sole accepted type's label beside
  "Create", so it never collides with the dialog's submit — and open the
  picked record as the bounded record popup when a value rides the row
  (an editor-bound type opens into its editor, SPEC §4);
  type records
  resolve through the served type view, so pickers compose it without a
  bundle; the protocol menu mounts in the affordance root, so a
  popover-hosted create keeps its subtree alive through the async run), `FillDialogBody` (the fill-dialog shell: form pane beside the
  live composed preview), `TemplateValuesRow` (the per-token values form
  a `template-values` pin renders), `MapEditor` (key-value rows: the key
  an input, each value cell the resolver's control for the declared
  itemType or the value's own type — a nested value renders its
  read-only summary), and the recursive `ObjectEditor` / `ListEditor` /
  `VariantEditor` (compact density shrinks editors through PrimeVue
  sizes); schemaless json renders read-only (the ObjectSummary
  presentation — machine data, the shared SPEC's Field I/O law). The instance pickers render every suggestion, tree
  node, and option as the one-line instance option row and build their
  options through the shared instance-option derivation
  ([shared](../shared/README.md) — SPEC §22.13). Pickers carry the
  create affordance (SPEC §22.13 create amendment) when their host
  passes the compiled create actions: the created record selects into
  the picker, and a model ref the pool never carried (a construct
  dialog's created record) resolves its label through the entity store.
  `SpotPartsRow` picks each anchor's part through the shared entity
  Select wrapper, whose popover create lands the created part on that
  spot at once. `LayerMappingRow` renders a `layer-mapping` pin: it
  reads the uploaded file's source layers and assigns each to a target
  code from the pin's `controlOptions.targets`. `CassetteParametersRow`
  renders a `cassette-parameters` pin: the picked template's OCCS
  parameter table becomes one input per parameter, read through the
  template type's served editor surface module. Which presentation an editor family resolves to
  (Knob, MeterGroup, Chart, Rating, OrderList, Inplace) is the mapping
  contract's data-shape derivation (see
  [shared/ui-mapping](../../shared/ui-mapping/README.md)); spec-row values
  are click-to-edit through Inplace with visible affordance — hover
  highlights the value row and reveals a pencil icon.
- `InstanceIdentity.vue` — the one instance-identifier surface (SPEC
  §22.8): a record's identity line carries its icon (the authored
  glyph, a record's declared thumb winning) and opens the record under
  the screen's `onOpen` contract; every projection's collection
  identities render through it. `RegionCollections` provides the
  containment cross-cut flag for the collection it renders, and an
  identity flagged as rendered outside its parent carries the lineage
  chain at its top, above the identity — the same shared `TraceChain`
  the record header and the entity cards render
  ([shared](../shared/README.md)), so every projection states ancestry
  with no per-surface wiring.
- `ActionButton.vue` — action-button presentation from
  the compiled action record; creates render captioned (the compiled
  label names the created type), delete and the construct re-run render
  icon-only (the caption stays the tooltip and accessible name).
  Instance references (relation chips, table relation columns, `ref`
  field values) render through the shared
  [InstanceInlineRef](../shared/README.md) — the app's one interactive
  reference surface, everywhere: the shared record popup on
  click/keyboard activation, exactly like relation refs on every other
  instance surface. Action and field labels resolve through the stable
  generated keys first (`actionLabelKey`/`fieldLabelKey`/`typeLabelKey` +
  `localizedLabel`), falling back to the resolver-derived label, so
  locale files may override any generated label; ActionButton carries the
  label as its accessible name. A host surface may pass a context-supplied
  label prop (still under locale-override precedence) to shorten a
  caption its own chrome already describes — a relation section's "Link"
  is the one current use.
- `CreateControl.vue` — one `createActionControls` entry: a sole create
  renders its ActionButton; a sibling group (several creation modes, one
  type) renders one PrimeVue `InputGroup` composing the creation-mode
  `Select` (options from `creationModeLabel`, lead action selected) with
  an attached create `Button` that dispatches the selected action
  through the ordinary run channel. The caption comes from the
  create-label chain without the creation mode; a host `label` prop
  shortens it to the bare `New` where its own chrome names the class.
- `ActionFormDialog.vue` — the one generated action form dialog
  (`StandardDialog` + `FillDialogBody` shell): rows from
  `resolveCreateDialogInputs` (or `resolveRunDialogInputs` for
  `runCommand`), submit gated by `createDialogRowUnfilled`, payload
  shaped by `createDialogPayload`, and the nested part-create
  (`NestedCreateDialog`) for its pickers' create affordances. The host
  owns the run: `run` emits the scalarized draft, `close` clears the
  action, and structured refusals return through the `failures` prop to
  render inline. The `scopedInstance` binding submits the launch
  context's parent reference on lineage rows accepting its type and
  hides those rows; a dialog whose every row the context supplies runs
  with no form at all. Hosts: `GeneratedMappingScreen` and the
  generated action surfaces
  ([components/generated](../generated/README.md)).
- `NestedCreateDialog.vue` — the nested part-create (SPEC §24 rails) as
  its own dialog: a construct-protocol create opens inside its host; the
  created record reports back through `applied` (`{ rowId, apply,
  typeId, id }`) and the host places it — a form row's value or the link
  dialog's target. The host's `scopedInstance` seeds and hides lineage
  rows the same way the action form dialog does. Runs execute through
  the instances store's action-run channel; refusals toast.
- `upload-create.js` — the upload-mode create dispatch (SPEC §4), shared
  by `RefRowActions`: the file input's
  accept list derives from the target type's declared MIME vocabulary,
  and the picked file uploads to the `files` bucket
  (`POST /api/files/upload?bucket=files`) returning the payload
  reference (`{ fileId, mime, size, name }`) the action run submits.

Entity Select/MultiSelect come through the shared wrappers
(`components/shared/InstanceSelect.vue`, `InstanceMultiSelect.vue`), which
own the entity-card rendering; plain enum selects (the allowance pinned in
`instance-select.spec.js`) import PrimeVue directly.

## Related

- Parent: [components](../README.md); its [SPEC](../SPEC.md).
- [shared/ui-mapping/README.md](../../shared/ui-mapping/README.md) — the
  mapping and composition contract (canonical).
- [pages/test/ui-mapping.vue](../../pages/test/ui-mapping.vue) — the
  showcase that mounts this engine over fixtures.
- [test-data/ui-mapping-fixtures.js](../../test-data/README.md) —
  synthetic compiler output.
