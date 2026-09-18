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
output. The page only mounts `components/ui-mapping/GeneratedMappingScreen`
over the fixture contract with a screen picker; the region tree comes from
the pure `composeScreen` projection (see
[shared/ui-mapping/README.md](../../shared/ui-mapping/README.md)) and every
surface, field control, budget collapse, and action button is resolver
output. There is no handwritten section, grid, or per-type branch in the
page or the components.

The fixture screens demonstrate:

- an entity detail screen with a scoped single source, placed actions
  (including the destructive confirm-required and hidden event-triggered
  ones), and a relation-scoped child collection with per-row file budgets
  (items carry 0, 1, 3, and 8 related files)
- a group detail screen with lineage-scoped children and a create action on
  the child region, opening the generated create dialog whose fields come
  from the action's declared construction inputs
- list and home screens with unscoped collections and toolbar actions

## Related

- [components](../../components/README.md) - frontend component contract
- [components/ui-mapping](../../components/ui-mapping/README.md) - the
  generated screen engine and resolver-driven materializations
- [utils](../../utils/README.md) - design-system manifest and status registry
- [test-data](../../test-data/README.md) - DTO factories and mapping fixtures
- [shared/ui-mapping](../../shared/ui-mapping/README.md) - the mapping and
  composition contract this page visualizes
