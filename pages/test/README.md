# CODE: Test and Demo Pages

Internal visual verification pages for UI contracts and component variants.

These pages are also available through `/admin/workbench`, which gives the
development workflow one authenticated surface for data-model review, UI
component review, and workflow/state-machine editing.

## UI Lab

`ui-lab.vue` is the design-system demo. It renders entity cards and shared primitives from `utils/design-system.js`, not from a hand-maintained component list.

The page demonstrates:
- entity card variants: `card`, `compact`, `inline`
- every shared primitive declared in `DESIGN_SYSTEM_PRIMITIVES`, including entity chrome/layout, identity/data/spec/status blocks, trace links, table/dialog/page wrappers, and layout helpers
- per-entity and per-primitive feedback controls persisted in localStorage under `cutkit:ui-lab-feedback:v1`, with markdown export to `ui-lab-feedback.md`
- embedded data-model review for each entity row, loaded from `/api/debug/data-models`, collapsed by default and expanded per entity, and exported together with component feedback. The UI Lab table hides `lineage.*` relationship internals so the review surface stays focused on canonical blocks and feature data fields.
- manifest health: missing component/factory/docs/DTO block issues

Demo data comes from `test-data/factories.js` and should match API DTO shape.
UI Lab seeds the entity store with demo lineage labels before rendering so `TraceChain` examples do not call authenticated production APIs for mock IDs.

## Variant Showcase

`components/VariantShowcase.vue` is a compact matrix route for checking every manifest entity across all card variants in a table layout. It uses the same manifest and factories as UI lab.

## Related

- [components](../../components/README.md) - frontend component contract
- [utils](../../utils/README.md) - design-system manifest and status registry
- [test-data](../../test-data/README.md) - DTO factories
