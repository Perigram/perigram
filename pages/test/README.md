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

`ui-mapping.vue` renders screens **generated** from synthetic compiler
output over a deliberately fictional facilities-grid domain (zones →
sectors → stations → units); the fixtures can be swapped for any other
hydration with the same structure without touching the generation layer. The page mounts
`components/ui-mapping/GeneratedMappingScreen` for every screen of the
seeded random world on one page (no picker — random screen keys cannot
survive a reroll), with a density control beside the seed (Auto keeps
each screen's weight-derived density; Compact/Regular force it — compact
also shrinks editor controls through PrimeVue sizes); the region tree
comes from the pure
`composeScreen` projection (see
[shared/ui-mapping/README.md](../../shared/ui-mapping/README.md)) and every
surface, field control, budget collapse, preview, and action button is
resolver output. There is no handwritten section, grid, or per-type branch
in the page or the components.

The fixture screens demonstrate:

- layouts chosen by data: tabular collections as generated tables,
  lineage-holding collections as TreeTables, media collections as paginated
  card grids, log entries as a Timeline, detail screens with three child
  regions as tabs, group surfaces with fully expanded hierarchy trees
- deep nesting: constellation → star systems → probes, with files attached
  by single and array relations carrying 0–10 items
- every field base and display refinement (percent quantities as progress
  bars, string lists as budgeted chips, variants, maps, records, blobs)
- deterministic per-instance previews for all three payload preview modes
- placed actions: toolbar placement, state-toned transitions, destructive
  confirm, hidden event triggers, and a generated create dialog whose
  fields come from the action's declared construction inputs

## Related

- [components](../../components/README.md) - frontend component contract
- [components/ui-mapping](../../components/ui-mapping/README.md) - the
  generated screen engine and resolver-driven materializations
- [utils](../../utils/README.md) - design-system manifest and status registry
- [test-data](../../test-data/README.md) - DTO factories and mapping fixtures
- [shared/ui-mapping](../../shared/ui-mapping/README.md) - the mapping and
  composition contract this page visualizes
