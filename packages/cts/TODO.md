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
- [ ] **Designer gap closure (2026-09-18 exploration; phases P0–P5)** —
  the one-tree declaration nodes are shallower than the type system they
  represent, while the old entity-based graph nodes carry rich typed
  sockets. Close it in phases, each independently shippable:
  - **P0 — seal declaration wires**: declaration canvas nodes
    (`ctsClass`/`ctsField`/`ctsState`/`ctsType`) may only wire to
    declaration-legal partners (their class, a reference node, or a
    `cts.*` species record) — never through the generic data-socket
    compatibility path, which currently lets a field declaration pose as
    a value source and any json-ish node feed a class `declare` input.
  - **P1 — one declaration vocabulary, full row grammar**: fold the types
    canvas's richer field editing (ref `accepts`, enum values, list/map
    `itemType`, variant tags) into the tree inspector, validated through
    `describeType`; demote `pages/organization/types.vue` to the registry
    browser and delete its parallel authoring vocabulary.
  - **P2 — edges and lifecycle in the tree**: class→class wires author
    children edges with `onRemove`; state→state wires author transitions
    with intents; `persistTreeDeclarations` emits `edges`+`transitions`
    and requires an explicit initial state (R4) instead of defaulting to
    the first wired state.
  - **P3 — operators and payload traits**: author the six species
    signatures (V-typed input/output, event/schedule triggers) on class
    facets compiled through `normalizeOperator`; org-authored constructs
    become `via` options; payload traits (MIME list, byte limits, preview
    mode) replace the bare MIME string.
  - **P4 — L2 slice**: row-field sockets on `cts.construct`/`cts.mutate`
    (composer-less construct), field pickers list row paths, live R5
    typecheck at the wire — shrinks the SPEC §20 residue. Optional
    designer macro: scaffold-from-type (construct + typed read + declared
    transitions) over existing factories.
  - **P5 — UI contract flip**: type-owned render (render policy, payload
    preview, rows→schemas→generated forms/columns; `statusDefinition`
    render metadata compiles into declarations, never alongside) vs
    process-owned assembly (screens/actions/navigation/access from graph
    records, already fed by the projected view); delete the hardcoded
    frontend hierarchy/navigation sources.
- [x] **Server compiles through CTS**: activation, contract diff, draft
  save, and the active runtime all use `getProjectedDomain` (org type store
  + strangler system view). Proven by the env-gated live spec
  `cts-server-equality.spec.js` (run inside the app container against the
  dev DB): every active definition byte-matches the legacy pipeline,
  failures included.
- [ ] **L2 — graph rebase**: palette = operator registry, sockets carry V
  types, property editors = expression language, R5 dataflow typing
- [x] **Designer palette derives from the registry**: entity/field/status/
  relation option lists in the designer contract come from the projected
  registry view — authored types are immediately composable in the existing
  graph nodes. (Reference-card experiment removed: cards that only display a
  type add no composition; types participate through the real nodes.) `RECORD_NODE_TYPES` +
  `CANVAS_OWNED_RECORD_KEYS` in `packages/processes/src/transpiler.js` —
  only statusDefinition/processNode canvas nodes survive the round trip
  today; a `ctsType` reference node needs a `ctsTypes` record home there,
  then the standard pattern (factories map, `recordKeyForType`,
  `syncNodeData`, palette group, inline node card) in process.vue. The
  compiled contract already consumes org types via the projection — the
  nodes are authoring/referencing surface, not a compilation need.
- [x] `contract-diff.js` stays (audit correction: it diffs process graph
  contracts; CTS diffs type versions — no overlap, nothing to collapse)
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
