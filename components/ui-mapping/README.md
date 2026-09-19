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
tree and materializes it with `RegionBlock` → `SurfaceBody` →
`FieldControl` / `EntityChip` / `PreviewBox` / `ActionButton`. Region
actions run through `ActionButton`; actions with construction inputs open
the generated create dialog, whose fields are the declared construction
inputs resolved against the target type's field descriptors.

## Components

- `GeneratedMappingScreen.vue` — engine: composes and renders a compiled
  screen; owns the generated create dialog.
- `RegionBlock.vue` — one composed region with data-driven layout: the list
  layout comes from `resolveListLayout` (`table` | `tree-table` |
  `card-grid` | `timeline`, matched by class, hierarchy, or type override);
  detail regions with `CHILDREN_TABS_AT` or more child regions render them
  as Tabs; empty regions render a Message; actions sit in the Panel header.
- `CollectionTable.vue` — the columnar list projection (DataTable):
  identity, status, budgeted scalar descriptor columns, and the first
  declared relation as budgeted chips.
- `HierarchyTable.vue` — the hierarchical list projection (TreeTable):
  the collection plus its lineage descendants nested as expandable rows
  with the same generated columns.
- `CardGrid.vue` — the media collection projection (DataView, paginated
  grid of preview cards with Avatar identity, status, deterministic
  preview, budgeted scalar facts).
- `TimelineCollection.vue` — the chronological list projection (Timeline):
  marker-per-entry with identity and budgeted facts, selected by type
  matcher (log entries).
- `HierarchyTree.vue` — the deep-nesting projection: a fully expanded
  PrimeVue Tree built recursively from the type's declared children edges
  and the instance pool's lineage, shown on group surfaces.
- `SurfaceBody.vue` — instance surface by container variant: `full` →
  Panel with the placed actions in the header, `detail` → Card (same-role
  nesting flattens to a Divider), `row` / `inline` → dense flex row with
  budgeted fields and relation chips.
- `SurfaceDetailBody.vue` — shared detail/full body: preview, a bounded
  scalar facts strip (`DETAIL_FACT_BUDGET`, labeled via `fieldLabel`:
  descriptor label or start-case name), structural fields as an Accordion,
  budgeted relation chips with show-more toggles for relations not already
  covered by a child region, and the hierarchy tree for groups.
- `PreviewBox.vue` — preview materialization keyed on the declared payload
  preview mode with deterministic per-instance visuals (seeded hue):
  gradient images for `image`, line-pattern plots for `geometry`, size and
  MIME for `attachment`.
- `FieldControl.vue` — the field dispatcher: resolves the descriptor in the
  given variant and renders the display primitive or delegates to an editor.
- Editors: `QuantityInput` (InputGroup + unit addon), `EnumSelect`
  (filtered, via the shared Select wrapper), `EntityPicker` (AutoComplete
  with typeahead over the instance pool), `EntityMultiPicker` (shared
  MultiSelect wrapper), `ChipsInput`, `FileUploadControl`, and the
  recursive `ObjectEditor` / `ListEditor` / `VariantEditor`. Percent
  quantities display as Knob dials.
- `EntityChip.vue`, `PreviewBox.vue`, `ActionButton.vue` — reference chips,
  payload previews keyed on the declared preview mode, and action-button
  presentation from the compiled action record.

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
