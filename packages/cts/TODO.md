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
- [x] **L1 — types editor**: the authoring surface IS the process designer
  tree (one tree, SPEC §20/§21): Class/Field/State nodes with the full V
  row grammar (`DescriptorEditor`, validated through `describeType`),
  class→class children wires with `onRemove`, state→state transition wires
  with intents, operator facets (species signatures + triggers), payload
  traits — compiled by `compileTreeDeclarations`
  (`packages/processes/src/designer.js`) with R4 enforced at save.
  `/organization/types` is the read-only registry browser (projection
  canvas, org-type delete, compile errors).
- [x] **Designer gap closure (2026-09-18 exploration; phases P0–P5)** —
  the one-tree declaration nodes are shallower than the type system they
  represent, while the old entity-based graph nodes carry rich typed
  sockets. Close it in phases, each independently shippable:
  - [x] **P0 — seal declaration wires**: `declarationWireLegality`
    (`packages/processes/src/designer.js`) restricts declaration canvas
    nodes to declaration partners; declaration wires persist as
    `role: 'type'` edges and save-compile from exactly those.
  - [x] **P1 — one declaration vocabulary, full row grammar**:
    `DescriptorEditor` edits the whole V grammar in the tree inspector;
    grammar lists (bases/classes/units) are single-homed in `@perigram/cts`
    exports; `pages/organization/types.vue` is the registry browser, its
    parallel authoring vocabulary deleted.
  - [x] **P2 — edges and lifecycle in the tree**: class→class children
    wires (key + `onRemove`), state→state transition wires (intents);
    `compileTreeDeclarations` emits `edges`+`transitions` and requires
    exactly one initial state (R4) — never a `states[0]` default.
  - [x] **P3 — operators and payload traits**: operator facets on class
    nodes (six species, V-typed signatures via `normalizeOperator`,
    event/schedule triggers); payload traits are the canonical registry
    shape (mime list, accept, maxSize, preview); declared construct
    operators project as `via` modes with signature-derived `modeInputs`.
  - [x] **P4 — L2 slice (composer-less construct)**: declared row fields
    project as generic-construction inputs and surface as typed construct
    sockets (`effect.createEntity`/`cts.construct` resolve the identical
    contract) — a compose node is optional. Field pickers keep slot paths;
    resolution passes them through unchanged (SPEC §20 residue note).
    Scaffold-from-type designer macro: not built, marked optional.
  - [x] **P5 — UI contract flip (declaration side)**: declared states
    carry the type's render policy (label/icon/severity) into projected
    workflows — the same metadata channel statusDefinitions use; payload
    preview derives from payload traits. Assembly (screens/navigation/
    access) stays process-owned and already consumes the projected view.
- [x] **Server compiles through CTS**: activation, contract diff, draft
  save, and the active runtime all use `getProjectedDomain` (org type store
  + strangler system view). Proven by the env-gated live spec
  `cts-server-equality.spec.js` (run inside the app container against the
  dev DB): every active definition byte-matches the legacy pipeline,
  failures included.
- [ ] **L2 — graph rebase**: palette = operator registry, sockets carry V
  types, property editors = expression language, R5 dataflow typing.
  > 2026-09-18: declaration persistence landed first (the tree saves with
  > the draft via `ctsTypes` records; APPLY compiles declarations into the
  > registry before validation). L2 landed since: the type catalog leads
  > the palette (one bound construct per type, one variant per declared
  > construct operator — typeCatalogPaletteGroups). Remaining L2 slices:
  > expression property editors on the language tester, transition guards
  > authored as expressions.
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

- [x] **The legacy cut (2026-09-18 session):** the converter
  (`compat/domain-cnc.js`) and the source-flip/server-equality gates are
  deleted; `projectDomainFromView` is synthesis-only (no legacy
  entities/workflows/construction/fieldSchemas/fieldAccess/relations/
  containment/attachmentKinds passthrough — the base domain contributes
  operator contracts, block vocabulary, and pack services only);
  `/api/admin/domain` serves the caller's projected view; the registry
  contract spec pins the resolver world (legacy types fail `Unknown
  type`). Legacy collections and definitions authored against legacy
  types are abandoned data. Remaining legacy surface (machines,
  workflow-overrides, config-bot, workbench fixtures, legacy UI routes)
  stays pack-internal until deleted.

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
  > Superseded by the one-tree L1 above: authoring IS the designer tree;
  > the types pane stays the registry browser. Remaining from this item:
  > surface registry refuse-on-breaking-diff (migration-refusal UX) inline
  > in the tree save path, and extend the language tester toward expression
  > property editors (L2).
- [~] Frontend: derive navigation/hierarchy from containment edges;
  delete hardcoded type strings (`utils/entity-hierarchy.js`,
  `stores/navigation.js`, `utils/queue-items.js`)
  > Correction (2026-09-18): derivation already landed for process-active
  > organizations — containment comes from compiled `lineageBindings`
  > (containment edges via the projection), routes from the screen
  > manifest (`detailRouteForEntity`), hubs from generated screens. The
  > remaining hardcoded strings are the legacy no-process fallback
  > (`projectHierarchyRoute` project-shell routes, `utils/queue-items.js`
  > queue surface), which SPEC §21 holds pack-internal until those flows
  > are re-authored on the graph — deleting them early would remove the
  > only fallback path. Re-gated on legacy-layer removal.

## Deferred tiers (SPEC §19 — build only on a failing need)

- [ ] Declarative migration steps beyond refuse-on-diff (§11)
- [ ] Aggregates and materialized summary caches (§9) — compute on read
- [ ] Policy beyond closed-row hiding (§10)
- [ ] State axes beyond `main` (§7)
- [ ] `match` used in a live predicate (implementation exists, unused)
