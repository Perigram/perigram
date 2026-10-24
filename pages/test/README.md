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
component/factory and DTO block issues.

Demo data comes from `test-data/factories.js` and should match API DTO shape.
UI Lab seeds the instances store with demo lineage labels before rendering so
`TraceChain` examples do not call authenticated production APIs for mock IDs.

## UI Mapping Showcase

`ui-mapping.vue` renders screens **generated** from synthetic compiler
output — `test-data/ui-mapping-random.js` seeds a random world (generated
type vocabularies, random field bases and units, a linear containment
chain per vocabulary) and the `?seed=` reroll rebuilds it; the generation
layer stays fixed. The page
mounts `components/ui-mapping/GeneratedMappingScreen` for every screen
of the world on one page (no picker — random screen keys cannot
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

- layouts chosen by data across the resolver vocabulary: board for
  state-vocabulary collections, timeline for chronological, card-grid and
  carousel for file collections, generated tables as the default; detail
  screens compose child regions as tabs or stack
- containment chains per vocabulary, with relations attached single or
  array
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
