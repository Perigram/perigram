# COMPONENT: UI Mapping Components

Materialization layer for the design-system mapping contract: real Vue
components that render the pure resolver outputs and the composed screen
tree. They own no per-type or per-screen logic — every component decision
(component choice, span, variant, budget, chrome, action tone) comes from
[shared/ui-mapping](../../shared/ui-mapping/README.md); the registry of
component keys to these SFCs is the handwritten design-system surface, and
it is the only handwritten part.

## Composition flow

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
- `RegionBlock.vue` — one composed region with data-driven layout: list
  regions render media classes (`file`) as `CardGrid` and tabular classes as
  `CollectionTable`; detail regions with two or more child regions render
  them as Tabs, otherwise stacked; actions sit in the Panel header.
- `CollectionTable.vue` — the columnar list projection: identity, status,
  up to three scalar fields, and the first declared relation as budgeted
  chips, generated from the type's field descriptors.
- `CardGrid.vue` — the media collection projection: a paginated DataView
  grid of preview cards (Avatar identity, status, deterministic preview,
  two scalar facts).
- `HierarchyTree.vue` — the deep-nesting projection: a fully expanded
  PrimeVue Tree built recursively from the type's declared children edges
  and the instance pool's lineage, shown on group surfaces.
- `StateStrip.vue` — the lifecycle projection: every declared state as a
  Tag with the current one carrying its render severity, shown on stateful
  detail/full surfaces.
- `SurfaceBody.vue` — instance surface by container variant: `full` →
  Panel with the placed actions in the header, `detail` → Card (same-role
  nesting flattens to a Divider), `row` / `inline` → dense flex row with
  budgeted fields and relation chips.
- `SurfaceDetailBody.vue` — shared detail/full body: state strip, preview,
  scalar facts strip (labeled via `fieldLabel`: descriptor label or
  start-case name), structural fields, budgeted relation chips with
  show-more toggles, and the hierarchy tree for groups.
- `PreviewBox.vue` — preview materialization keyed on the declared payload
  preview mode with deterministic per-instance visuals (seeded hue):
  gradient images for `image`, line-pattern plots for `geometry`, size and
  MIME for `attachment`.
- `FieldControl.vue` — the field dispatcher: resolves the descriptor in the
  given variant and renders the display primitive or delegates to an editor.
- Editors: `QuantityInput` (InputGroup + unit addon), `EnumSelect`
  (filtered, via the shared Select wrapper), `EntityPicker` /
  `EntityMultiPicker` (shared entity Select wrappers over the instance
  pool), `ChipsInput`, `FileUploadControl`, and the recursive
  `ObjectEditor` / `ListEditor` / `VariantEditor`.
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
