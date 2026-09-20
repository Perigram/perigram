# COMPONENT: UI Mapping Components

Materialization layer for the design-system mapping contract: real Vue
components that render the pure resolver outputs and the composed screen
tree. They own no per-type or per-screen logic — every component decision
(component choice, span, variant, budget, chrome, action tone) comes from
[shared/ui-mapping](../../shared/ui-mapping/README.md); the registry of
component keys to these SFCs is the handwritten design-system surface, and
it is the only handwritten part.

## Display helpers live in the mapping contract: `instanceIdentity(type,
instance)` is the single identity heuristic (preferred short-string fields,
then the first short string field, then the id) and `formatQuantity`
renders unit symbols (`25.5°`, `43,200 min`) instead of raw storage units.

Composition flow

`GeneratedMappingScreen.vue` composes the compiled screen contract
(`composeScreen` — pure, in `shared/ui-mapping/screen.js`) into a region
tree and materializes it with
`RegionBlock` → `SurfaceBody` →
`FieldControl` / `InstanceChip` / `PreviewBox` / `ActionButton`. Region
actions run through `ActionButton`; actions with construction inputs open
the generated create dialog, whose fields are the declared construction
inputs resolved against the target type's field descriptors and ordered
and sectioned by the type's authored `render.groups` (`resolveFieldGroups`)
— one unlabelled section for groupless types. `link`
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

Region data states and the collection toolbar are shared surface
concerns:

- `RegionDataState.vue` — materializes the composed region `dataState`:
  skeleton lines on first load (system stack rhythm), one shared Message
  for empty/missing/denied/error, nothing for ready. Reloads with
  already-loaded instances keep their stale surfaces under one
  indeterminate progress bar instead — no component invents its own
  empty or loading state.
- `CollectionToolbar.vue` — materializes the composed `listControls`
  contract above non-table list regions: a search input over the
  resolved `searchKeys` and one clearable select per enum facet over the
  values actually present. It appears only past the `SEARCH_AT` budget,
  its gaps come from the system spacing scale (`spacing.toolbar`) and
  its control sizes from `editorSize`, and it owns no per-type logic —
  the region tree carries every decision. RegionBlock stacks it on the
  system rhythm (`spacing.stackTight`) ahead of the collection surface,
  so it never sticks to the content below. Search and facet selections
  are region-owned models RegionBlock applies client-side over the
  loaded instances. Table-layout regions skip the toolbar: their
  DataTable filters natively over the same contract.

## Components

- `GeneratedMappingScreen.vue` — engine: composes and renders a compiled
  screen; owns the generated create dialog, ConfirmDialog for destructive
  actions, and Toast feedback on runs.
- `RegionBlock.vue` — one composed region with data-driven layout: the list
  layout comes from `resolveListLayout` (`table` | `tree-table` |
  `card-grid` | `timeline`, matched by class, hierarchy, or type override).
  Top-level detail regions compose a record page: `SurfaceHeader` plus the
  main content in a 7-column lane with child regions in a 5-column lane
  (`detailSplit`, collapsing to stacked below xl); nested detail regions
  keep the Card surface. Empty regions render a Message.
- `CarouselGrid.vue` — the large media collection projection: a circular
  PrimeVue Carousel of clipped preview cards.
- `BreadcrumbTrail.vue` — the lineage trail: a Breadcrumb of ancestor
  identities walked from the instance's lineage through the pool.
- `CollectionTable.vue` — the columnar list projection (DataTable):
  identity (a link button when the screen has an `onOpen` handler),
  status, budgeted scalar descriptor columns, and the first
  declared relation as budgeted chips. Columns come from the composed
  `listControls` contract (filled short scalars bounded by the richness
  budget — a field no loaded instance fills never becomes a column),
  identity/status/scalar columns are sortable (quantity values sort by
  their numeric value), the declared `render.sortKey` is the default
  sort, and the paginate/virtualize thresholds are the shared
  `TABLE_*` budgets from the mapping contract, never literals. The
  table filters natively in row display over the same contract (enum
  and boolean selects over present values, numeric input for
  numbers/quantities, text for the rest, plus a global search over the
  resolved search keys), so RegionBlock feeds it raw instances and no
  second toolbar.
- `HierarchyTable.vue` — the hierarchical list projection (TreeTable):
  the collection plus its lineage descendants nested as expandable rows
  with the same generated columns; row identities are link buttons under
  the same `onOpen` navigation contract.
- `CardGrid.vue` — the media collection projection (DataView, paginated):
  cards lay out in the shared `ResponsiveGrid` primitive with container
  queries and bounded item tokens (viewport breakpoints lie inside panels),
  each Card clipped (`overflow-hidden`) on the stock anatomy — preview as
  `#header`, identity + status in `#title`, type label in `#subtitle`,
  labeled budgeted facts in `#content`. The DataView header carries the
  composed sort contract: a select over the resolved `sortKeys` with the
  declared default preselected plus an order toggle, ordered through the
  shared `sortControlRows` comparator. The card identity is a link button
  when the screen has an `onOpen` handler, and the type's per-instance
  quick actions (resolveInstanceActions: transitions, deletion,
  instance-scoped commands) render as one shared ellipsis menu per card
  that re-emits through the region run contract with that card as
  instance context — confirmation and dispatch stay upstream.
- `TimelineCollection.vue` — the chronological list projection (Timeline):
  marker-per-entry with identity (link button under the `onOpen`
  contract), inline scalar facts, and the type's
  primary long-text (or first structural) field as the entry body,
  selected by type matcher (log entries). Past the shared page budget
  the entries page through a standalone Paginator over `pageSlice`.
- `StateStrip.vue` — the lifecycle projection: the declared state axis as
  a linear PrimeVue Stepper (numbered steps, active state from the
  instance). The strip fits its container: steps shrink and share the
  row, long state labels crop with the built-in title ellipsis (the
  native title attribute carries the full name) — no horizontal
  scrolling. A state with a runnable manual
  transition action in the region action set is an enabled step that
  emits the action through the screen `run` contract (optimistic
  highlight, re-anchored from the instance on reload); event-triggered,
  hidden, and current-state entries stay disabled, so without transition
  actions the strip is a pure display.
- `HierarchyTree.vue` — the deep-nesting projection: a fully expanded
  PrimeVue Tree built recursively from the type's declared children edges
  and the instance pool's lineage, shown on group surfaces.
- `SurfaceHeader.vue` — the record-page header bar: lineage Breadcrumb
  (when nested), Avatar identity with title and a `type · id` muted
  subtitle, status, placed actions, the Edit toggle, and the lifecycle
  Stepper for stateful types. The bar is its own layout container: the
  identity/actions row engages from the header container width through
  the scoped CSS block (never the viewport — headers render inside panels
  and detail side columns): the identity block stays one
  avatar-title-status row (`LAYOUT.row` plus `LAYOUT.headerIdentity`) that
  still truncates long names through the `min-w-0` chain, wide headers
  floor the title at 16rem so
  a large action cluster wraps below the title instead of crunching it,
  and at most `HEADER_ACTIONS_INLINE` generated buttons render inline —
  a third and every further action join one popup ellipsis menu (no
  reserved layout space) with the
  same localized labels.
- `SurfaceBody.vue` — instance surface by container variant: `full` → the
  bare content column of a record page, `detail` → Card (same-role nesting
  flattens to a Divider), `row` / `inline` → dense flex row with budgeted
  fields and relation chips.
- `SurfaceDetailBody.vue` — shared detail/full body: Stepper lifecycle
  strip on stateful types, preview, a bounded scalar facts strip (`DETAIL_FACT_BUDGET`, labeled via `fieldLabel`:
  descriptor label or start-case name), structural fields as an Accordion,
  budgeted relation chips with show-more toggles for relations not already
  covered by a child region, and the hierarchy tree for groups.
- `PreviewBox.vue` — preview materialization keyed on the declared payload,
  height-bounded
  preview mode: deterministic per-instance inline SVG (seeded hue) built
  entirely from theme tokens — `--ck-subtle-background` bases with
  translucent hsl accents — so generated art adapts to light/dark and owns
  no hardcoded colors; `image` renders a seeded gradient sky, `geometry` a
  star plot, `attachment` a size/MIME row.
- `FieldControl.vue` — the field dispatcher: resolves the descriptor in the
  given variant and renders the display primitive or delegates to an
  editor. Structural displays are labeled: records/maps/json render as
  budgeted description lists, record lists as checklist rows (boolean +
  string subfields), variants as tag plus payload value.
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
- `InstanceChip.vue`, `PreviewBox.vue`, `ActionButton.vue` — reference chips,
  payload previews keyed on the declared preview mode, and action-button
  presentation from the compiled action record. Action and field labels
  resolve through the stable generated keys first
  (`actionLabelKey`/`fieldLabelKey`/`typeLabelKey` + `localizedLabel`),
  falling back to the resolver-derived label, so locale files may
  override any generated label; ActionButton carries the label as its
  accessible name.

Select/MultiSelect only ever come through the shared entity wrappers
(`components/shared/EntitySelect.vue`, `EntityMultiSelect.vue`), which own
the direct PrimeVue imports.

## Related

- [shared/ui-mapping/README.md](../../shared/ui-mapping/README.md) — the
  mapping and composition contract (canonical).
- [pages/test/ui-mapping.vue](../../pages/test/ui-mapping.vue) — the
  showcase that mounts this engine over fixtures.
- [test-data/ui-mapping-fixtures.js](../../test-data/README.md) — synthetic
  compiler output.
