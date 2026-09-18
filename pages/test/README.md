# CODE: Test and Demo Pages

Internal visual verification pages for UI contracts and component variants.

`/admin` now owns the consolidated entity-centric development surface.
These pages remain focused visual demos and compatibility routes.

## UI Lab

`ui-lab.vue` is the design-system demo. It renders entity cards and shared
primitives from `utils/design-system.js`, not from a hand-maintained component
list. Entity preview rows use the domain surface contract, so field groups and
surface display policy are visible to framework consumers and app constructors.

The page demonstrates:
- entity card variants: `card`, `compact`, `inline`
- every shared primitive declared in `DESIGN_SYSTEM_PRIMITIVES`, including entity chrome/layout, identity/data/spec/status blocks, trace links, table/dialog/page wrappers, and layout helpers
- geometry and current-location examples through `DrawingCanvas`, `GeometryPreview`, and `StatusLocation`, backed by DTO factory data
- per-entity and per-primitive feedback controls persisted in localStorage under `cutkit:ui-lab-feedback:v1`, with markdown export to `ui-lab-feedback.md`
- embedded data-model review for each entity row, loaded from `/api/debug/data-models`, collapsed by default and expanded per entity, and exported together with component feedback. The UI Lab table hides `lineage.*` relationship internals so the review surface stays focused on canonical blocks and feature data fields.
- manifest health: missing component/factory/docs/DTO block issues

Demo data comes from `test-data/factories.js` and should match API DTO shape.
UI Lab seeds the entity store with demo lineage labels before rendering so
`TraceChain` examples do not call authenticated production APIs for mock IDs.

## UI Mapping Showcase

`ui-mapping.vue` renders the design-system mapping level over synthetic
compiler output. It consumes only the resolvers from
[shared/ui-mapping](../../shared/ui-mapping/README.md) plus the fixtures in
`test-data/ui-mapping-fixtures.js` — the page itself owns no per-type logic
and its component registry maps resolver component keys to registered
components, never to data-driven component names.

The page demonstrates:
- field controls: every fixture field descriptor resolved in the editor
  family (InputNumber with unit suffix, filtered Select for large enums,
  EntityPicker, recursive Object/List/Variant editors) and the display family
  (Tag, chips, quantity/instant text)
- class archetypes across container variants: file/item/group/process types
  at `inline`, `row`, `detail`, and `full`
- the nested case: a group collection whose item rows each carry a different
  number of related files (0, 1, 3, 8), collapsed by the per-slot budgets
  (`+n` count overflow, expandable "show more", bounded scroll)
- compiled actions resolved to button presentations, including the hidden
  event-triggered action and the destructive confirm-required action
- the chrome ladder: role-based surface/padding/border tokens and the
  same-role flattening rule (card in card degrades to a divider)

## Related

- [components](../../components/README.md) - frontend component contract
- [utils](../../utils/README.md) - design-system manifest and status registry
- [test-data](../../test-data/README.md) - DTO factories and mapping fixtures
- [shared/ui-mapping](../../shared/ui-mapping/README.md) - the mapping
  contract this page visualizes
