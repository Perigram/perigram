# TODO: @perigram/cts

Implementation tracker against [SPEC.md](./SPEC.md). Scope discipline:
§19 core tier first; deferred tiers land only on a failing need.

## Core tier (SPEC §19) — DONE

- [x] Value universe V: atoms, Quantity, Ref, records/lists/maps/variants
  (`values.js`)
- [x] Units: closed set, declared conversions, unification (`units.js`, R3)
- [x] Closed rows + JSON Schema 2020-12 substrate with `x-quantity`/`x-ref`
  keywords (`rows.js`, R1)
- [x] Five classes with obligations (`classes.js`, R6)
- [x] Three edge kinds with `onRemove` + lineage acyclicity (`edges.js`, R2)
- [x] Single-axis states, guarded transitions, unique intents, reachable
  terminals (`states.js`, R4)
- [x] Six operator species, typed signatures, event/schedule triggers,
  ref-free services/projections (`operators.js`, R5)
- [x] CEL-semantics expressions: total evaluator, step budget, map/filter,
  compile-checked match (`expressions.js`, §18)
- [x] Version stamping + refuse-on-breaking diff (`diff.js`, R7 core)
- [x] Type registry as data, tenancy resolution, compile() = R1–R6
  (`registry.js`)
- [x] CNC starter type pack as collapse-table acceptance fixture
  (`pack/cnc.js`)

## Next: strangler integration (app-side)

- [x] Compiler pass that auto-converts `packages/domain-cnc` declarations
  (entities, workflows, attachment kinds) into CTS type records —
  `compat/domain-cnc.js`; live consumption via
  `server/api/admin/cts/types.get.js` and the read-only designer types pane
  `pages/organization/types.vue`. Per-type field extraction from `legacy`
  Json rows remains open per entity.
- [ ] Translate org-authored process definitions to the new field paths;
  reuse `data.schemaVersion` migration pattern in `packages/processes`
- [ ] Split `server/features/nesting/operations.js` into the declared
  π (extract) / σ (solve) / κ (run) operators with `provenance.effective`
  snapshots replacing `machineSnapshot`/`toolSnapshot`
- [ ] Uniform service signatures in `server/runtime/app-registry.js`
  collapsing the four adapter maps + delete switch
- [ ] Wire Ajv on the generated JSON Schemas (server DTO redaction) and
  JSONForms/FormKit generation in the designer — the substrate is emitted,
  the consumers are not yet
- [ ] Process designer: turn the read-only types pane into the authoring
  types editor (facet editors, save = compile with inline R1–R7 diagnostics,
  migration-refusal UX)
- [ ] Frontend: derive navigation/hierarchy from containment edges;
  delete hardcoded type strings (`utils/entity-hierarchy.js`,
  `stores/navigation.js`, `utils/queue-items.js`)

## Deferred tiers (SPEC §19 — build only on a failing need)

- [ ] Declarative migration steps beyond refuse-on-diff (§11)
- [ ] Aggregates and materialized summary caches (§9) — compute on read
- [ ] Policy beyond closed-row hiding (§10)
- [ ] State axes beyond `main` (§7)
- [ ] `match` used in a live predicate (implementation exists, unused)
