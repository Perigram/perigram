# TODO: Process Designer polish, unification, separation, compile-to-apps

Status: WAITING

Successor of `TODO-process-designer.md_archive` (procedural entity CRUD plan,
completed). This plan is the accepted outcome of the 2026-09-19 designer
review. Canonical owners stay
[`packages/processes/README.md`](./packages/processes/README.md),
[`components/process-designer/README.md`](./components/process-designer/README.md),
and [`shared/ui-mapping/README.md`](./shared/ui-mapping/README.md); update
those with each landed contract instead of duplicating them here.

Recorded decisions:

- **No legacy support at all.** No v4 graphs exist or will; the block
  substrate, status-definition nodes, v4 action authoring, and their loading
  surfaces are dead weight, not compatibility surface. Cut them wherever they
  appear (designer, package authoring traces). The `operationKindOf`
  species-to-operation twin mapping is NOT legacy: it is the canonical
  execution seam and stays.
- **Hard cutover, no dual emit.** The compiler's legacy screen/action channel
  (entity-era vocabulary) is replaced outright by the CTS-vocabulary UI
  contract. Accepted consequence: organizations with stored compiled
  snapshots in the old vocabulary must re-activate their processes; the
  existing degradation path in
  `server/features/process-definitions/runtime.js` (bypass with a loud log)
  already covers the interim.

## P1 — Designer polish and legacy cut

Scope: `pages/organization/process.vue`,
`components/process-designer/*`, `composables/useProcessDesigner*` — page and
component side only.

- [x] Remove dead husks from the legacy cut: `applySemanticConnection`,
  `clearSemanticConnection`, `syncInferredActionInputs` (and their threading
  through `useProcessDesignerGraphEditing`, whose statusDefinition-blocking
  logic is equally dead), the ~60 blank-line scar clusters, and the dead
  helpers (`syncActionConstruction`, `statusSeverityOptions`,
  `statusIconOptions`, `addServicePrincipal`, `removeSelectedPrincipal`,
  `relationKeyFromHandle`, `processPortTypeLabel`, `parseValueInput`,
  `normalizeTriggerMode`, `fieldOptionsForSelectedEntity`, `fieldLabel`,
  `addEffectiveRoleAccess`, `actionEventOutputs`).
- [x] Cut the block substrate from the designer: open-block-entry inspector
  editor, open-block read editor, field-set multiselect, block option
  helpers (`openBlockComposition`, `*OpenBlockEntry*`, `*OpenBlockRead*`,
  `processNodeBlockOptions`, `processNodeUsesBlock`, `managedProcessBlocks`,
  `constructibleEntityBlocks`, `writableEntityBlocks`), the v4/v5
  `blocks`/`slots` shims, and the `slots`/`entries` branches of
  `syncProcessNode`. `cts.field` keeps its path handling (fields of the bound
  type only).
- [x] Fix the silent `processStatusOptions` break: status inline fallbacks on
  effect nodes derive options from the bound type's declared states; the
  unbound `status` literal base leaves the literal type choices (statuses are
  type-scoped and arrive through wired state declaration sockets).
- [x] Unify node-data enrichment: one `syncCanvasNode`/`enrichNodeData`
  implementation instead of two near-identical ~80-line blocks.
- [x] Deduplicate option lists: one value-type list (page
  `processValueTypeOptions` vs `ProcessNode` `baseTypeOptions`), localize
  trigger-mode options once, collapse the repeated `te/t` fallback pattern.
- [x] Visual quick wins: CtsTypeNode raw `var(--ck-status-neutral)` inline
  style becomes a `signal-*` alias; node frame classes converge on one
  shared frame primitive.
- [x] Rewrite `components/process-designer/README.md` to the post-cut
  reality (palette groups, no block substrate, no preserved-slot rendering).

##### Agent Notes — 2026-09-19 P1 complete

P1 landed in `agent/process-designer-plan-20260919`. The page dropped from
4495 to ~3560 lines. Beyond the listed items: the unreachable canvas-node
machinery for socket/valueInput/action/entity/statusDefinition records was
removed end-to-end (page sync branches, inspector `RECORD_KEYS` rows,
node-record factories — `createEntityProfile`, `createStatusDefinition`,
`createValueInput`, `createServicePrincipal`, `createCreatedWorkflow` are
gone; sockets remain panel-owned through `addSocket`/`createSocket`).
`enrichNodeData` is now the single node-data derivation for initial
projection and live sync, `stripRuntimeNodeData` owns its key list
(`RUNTIME_NODE_DATA_KEYS`), and `useProcessDesignerGraphEditing`'s API
shrank to `onGraphChange`. `catalogContext`/`processNodeFieldOptions`
resolve only `cts.field` against the bound type. Spec updates:
`useProcessDesignerInspector.spec.js` (producer-output anchor only) and
`shared/process-designer-ui.spec.js` (authored-record boundary via
processNode, `onGraphChange` deletion boundary). Validation:
vitest composables/packages/shared designer suites 442 passed;
`node scripts/check-arch.js`, `npm run framework:validate`,
`node scripts/check-docs.js` pass. Pre-existing unrelated failures left
as-is: `components/shared/entity-select.spec.js` (DescriptorEditor direct
Select import) and three `shared/framework-packages.spec.js` manifest
checks. Not done in P1 (deferred to P2 by design): class inspector still
duplicates type-designer editors; port-resolution unification
(`outputSpecs[0]` fallbacks, `inferIncomingEntityContract` shape-sniffing)
moves with the composable extraction.

## P2 — Designer separation of concerns

- [ ] Extract from the page: `useProcessDesignerTypes` (CTS registry /
  projection / tree-overlay lifecycle and caches), `useProcessDesignerCanvas`
  (viewport, zoom, keyboard, touch, placement), context-palette composable,
  per-kind inspector components (class inspector reuses
  `components/type-designer/*`), Roles/Screens panel components, and the
  apply/persistence orchestration (`activateDraft`,
  `persistTreeDeclarations`).
- [ ] Extract the node-sync family (`syncProcessNode` and friends) as a
  dedicated module with the designer contract injected, preserving the
  realtime derivation pipeline exactly: live-graph signature ->
  `interpretDeclarationEdges` -> tree overlay -> registry invalidation ->
  designer refresh -> node sync, sequenced through one sync entry point.
- [ ] Unify port resolution to catalog + `declarationNodePorts`; remove the
  `outputSpecs[0]` fallback paths and `socketKind`/`ioSpec` shape-sniffing in
  favor of the port contract.
- [ ] Behavioral specs stay green throughout (`useProcessDesigner*.spec.js`,
  `shared/process-designer-ui.spec.js`, `palette-trace.spec.js`).

## P3 — Compiler emits the UI contract (hard cutover)

- [ ] `compileProcessDefinition` emits the CTS-vocabulary UI contract:
  `typeList`/`instanceDetail` screens, sources with
  `mode`/`scope.instanceId`/`relation`/`lineage`, actions with `actionKind`
  `createInstance`/`updateInstance`/`deleteInstance`/`link`/`unlink`/
  `runCommand` carrying `typeId`, replacing the legacy screen/action channel
  in the same change. The fixture shape in
  `test-data/ui-mapping-fixtures.js` is the de-facto input spec;
  `shared/ui-mapping` specs become compiler regression tests.
- [ ] The compiled output carries the CTS client bundle
  (`compileClientBundle()`) beside the screens/actions so renderers never
  consult the registry directly.
- [ ] Extend `contract-diff.js` to the new channel (screens, actions, role
  grants, per-type capability changes).
- [ ] Auth/runtime consumption is updated in the same task as the emit
  switch (resolveProcessAuth, screen manifests, navigation) so no stored
  contract is read through the removed vocabulary.

## P4 — Runtime and designer cutover to the UI generator

- [ ] `pages/screens/[screenKey].vue` renders through `composeScreen` +
  `components/ui-mapping/GeneratedMappingScreen.vue` with a real
  instance-pool data layer over entity collections (replacing the fixture
  stand-in `buildInstancePool` contract).
- [ ] Designer Screens tab: replace the wireframe `ProcessScreenPreview`
  with a generator preview over the new compiled contract; the legacy
  hand-authored screen editor migrates to the new contract vocabulary or
  shrinks to overrides on compiler-inferred screens; `components/generated/*`
  and `components/process-designer/ProcessScreenPreview.vue` are deleted.
- [ ] Complete the package-side legacy cut: `migration-v4.js` v3 rewrites,
  v4-to-species load migration, persisted-`slots` block-socket projection,
  and v4-kind authoring traces in the catalog/palette (execution twins
  stay).

##### Agent Notes — 2026-09-19 plan recorded

Archived the completed procedural-CRUD plan to
`TODO-process-designer.md_archive` and recorded this successor after the
designer review (dead-code inventory, block-substrate verdict, unification
map, separation-of-concerns targets, and the missing
compiler -> UI-contract -> ui-mapping wiring). P1 started in the same
session branch.
