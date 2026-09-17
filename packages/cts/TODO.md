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

## Designer rebuild layers

- [x] **L0 — type storage**: `cts_types` collection + org-scoped
  `server/features/cts-types` (validate/diff-refuse/rollback via the real
  registry) + `GET|POST /api/admin/cts/types`, `DELETE /api/admin/cts/types/:id`;
  the merged org view feeds the types pane and language tester.
- [~] **L1 — types editor**: node-based editor lives at
  `/organization/types` (types canvas + per-type state machines; states,
  transitions, intents, initial/terminal authored by graph gestures and
  saved through the L0 API with compile errors inline). Remaining facets
  are node/editors too, not forms: rows with V types + units, edges +
  onRemove, operators + triggers, payload traits, render policy.
- [ ] **L2 — graph rebase**: palette = operator registry, sockets carry V
  types, property editors = expression language, R5 dataflow typing
- [ ] **L3 — runtime swap**: compiled org app reads the CTS bundle;
  command runtime binds operator signatures (gated on app-registry
  signature unification below)

## Strangler integration (app-side)

- [x] Compiler pass that auto-converts `packages/domain-cnc` declarations
  (entities, workflows, attachment kinds) into CTS type records —
  `compat/domain-cnc.js`; live consumption via
  `server/api/admin/cts/types.get.js` and the read-only designer types pane
  `pages/organization/types.vue`. Per-type field extraction from `legacy`
  Json rows remains open per entity.
- [x] **Domain projection (collapse direction)**:
  `compat/domain-projection.js` projects a CTS view back onto the
  compiler-consumable domain (workflows with legacy access/state-flag merge,
  org entities, field access on the `cts-types` feature, org relations).
  Proven on live data: the real active process definition compiles
  byte-identical through `projectDomainFromView` vs the hand-authored
  `cncDomain`. The designer preview compiles through the projection.
- [~] Translate org-authored process definitions to the new field paths —
  **re-scoped, gated**: under the strangler, storage keeps
  collection-per-type and old field paths; process-definition translation
  has nothing to target until per-type field extraction and the storage
  migration land. Blocked-by: field extraction (above), not by compiler
  machinery. Do not build a dead mapping ahead of that.
- [x] Split `server/features/nesting/operations.js` into the declared
  π (`projections.js`, pure) / κ (`operations.js`, command + materializer)
  operators with `provenance.solve.effective` replacing
  `machineSnapshot`/`toolSnapshot`/`materialSnapshot` on runs, designs, and
  sheets; `server/scripts/migrate-nesting-provenance.js` migrates persisted
  records (run it before deploying); `SheetDesignEditor.vue` reads
  provenance. σ stays the external solver behind the typed value request.
- [ ] Uniform service signatures in `server/runtime/app-registry.js`
  collapsing the four adapter maps + delete switch — touches ~30 feature
  services and their callers; needs its own session with e2e coverage
- [~] Wire Ajv on the generated JSON Schemas — **deferred with reason**:
  the only available ajv is a transitive 6.x (draft-07; cannot validate the
  emitted 2020-12 schemas), and the real consumer (server DTO redaction)
  does not exist yet. Adding `ajv@8` as a dependency is correct the day
  that consumer is built; the in-package total walker already validates.
- [ ] Process designer: turn the read-only types pane into the authoring
  types editor (facet editors, save = compile with inline R1–R7 diagnostics,
  migration-refusal UX). The in-designer language tester
  (`LanguageTesterPanel.vue`, dock entry) already evaluates real expression
  ASTs and instance validation client-side — extend it, do not add parallel
  surfaces.
- [ ] Frontend: derive navigation/hierarchy from containment edges;
  delete hardcoded type strings (`utils/entity-hierarchy.js`,
  `stores/navigation.js`, `utils/queue-items.js`)

## Deferred tiers (SPEC §19 — build only on a failing need)

- [ ] Declarative migration steps beyond refuse-on-diff (§11)
- [ ] Aggregates and materialized summary caches (§9) — compute on read
- [ ] Policy beyond closed-row hiding (§10)
- [ ] State axes beyond `main` (§7)
- [ ] `match` used in a live predicate (implementation exists, unused)
