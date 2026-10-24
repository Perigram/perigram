# CODE: Test and Demo Pages

Internal visual verification pages for UI contracts and component variants.

## UI Lab

`ui-lab.vue` is the design-system demo. It renders entity cards and shared
primitives from `utils/design-system.js`, not from a hand-maintained component
list. Entity preview rows use the domain surface contract, so field groups and
surface display policy are visible to framework consumers and app constructors.

The page demonstrates entity card variants (`card`, `compact`, `inline`),
every shared primitive declared in `DESIGN_SYSTEM_PRIMITIVES`, and geometry
and current-location examples (`DrawingCanvas`, `GeometryPreview`,
`StateLocation`) over DTO factory data; manifest health reports missing
component/factory/docs/DTO block issues. Two behaviors are non-obvious:

- per-entity and per-primitive feedback controls persist in localStorage under
  `perigram:ui-lab-feedback:v1`, with markdown export to `ui-lab-feedback.md`
- each entity row embeds a data-model review loaded from
  `/api/debug/data-models`, collapsed by default, expanded per entity, and
  exported together with component feedback; the review table hides
  `lineage.*` relationship internals so it stays on canonical blocks and
  feature data fields

Demo data comes from `test-data/factories.js` and should match API DTO shape.
UI Lab seeds the instances store with demo lineage labels before rendering so
`TraceChain` examples do not call authenticated production APIs for mock IDs.

## UI Mapping Showcase

`ui-mapping.vue` renders screens **generated** from synthetic compiler
output over a deliberately fictional facilities-grid domain (zones →
sectors → stations → units); any other hydration with the same structure can
replace the fixtures, and the generation layer stays fixed. A source toggle switches between the seeded random world and the REAL
pipeline (`?source=real`: CTS registry bundle, real process compiler
contract over the persisted acceptance fixture, projected DTO
instances — test-data/README.md documents the honest gaps). The page
mounts `components/ui-mapping/GeneratedMappingScreen` for every screen
of the active world on one page (no picker — random screen keys cannot
survive a reroll), with a spacing-coefficient slider beside the seed (0.5–2, `?scale=`)
that scales the whole rhythm set — gaps, paddings, control and editor
sizes — through the literal SPACING_SCALES table; the region tree
comes from the pure
`composeScreen` projection (see
[shared/ui-mapping/README.md](../../shared/ui-mapping/README.md)) and every
surface, field control, budget collapse, preview, and action button is
resolver output. Collection identities are live links: the
page routes `onOpen` in-page — the type's detail section scrolls into
view through the `?screen=` query, and types without a detail screen
toast. The data-states mode is on by default: the world's seeded
`sourceStatesMatrix` injects loading/denied/error source states so every
RegionDataState presentation renders beside the naturally-ready screens
(`?state=off` returns to the natural world). The empty and no-record
states ship as their own explicitly labelled generated screens — they
demonstrate the surfaces.

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
  confirm, hidden event triggers, per-card quick-action menus
  (transitions, deletion, instance commands), relation link and unlink,
  and a generated create dialog whose
  fields come from the action's declared construction inputs
- data states (skeletons, empty, missing, denied, error) and the budget
  thresholds (virtualized >50, paginated >10, toolbar search >8) —
  guaranteed in every random world, not left to seed luck

## Related

- [components](../../components/README.md) - frontend component contract
- [components/ui-mapping](../../components/ui-mapping/README.md) - the
  generated screen engine and resolver-driven materializations
- [utils](../../utils/README.md) - design-system manifest and status registry
- [test-data](../../test-data/README.md) - DTO factories and mapping fixtures
- [shared/ui-mapping](../../shared/ui-mapping/README.md) - the mapping and
  composition contract this page visualizes
