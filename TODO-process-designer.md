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
  through `useProcessDesignerGraphEditing`, whose stateDefinition-blocking
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
machinery for socket/valueInput/action/entity/stateDefinition records was
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
as-is: `components/shared/instance-select.spec.js` (DescriptorEditor direct
Select import) and three `shared/framework-packages.spec.js` manifest
checks. Not done in P1 (deferred to P2 by design): class inspector still
duplicates type-designer editors; port-resolution unification
(`outputSpecs[0]` fallbacks, `inferIncomingEntityContract` shape-sniffing)
moves with the composable extraction.

## P2 — Designer separation of concerns

- [x] Extract from the page: `useProcessDesignerTypes` (CTS registry /
  projection / tree-overlay lifecycle and caches), `useProcessDesignerCanvas`
  (viewport, zoom, keyboard, touch, placement), context-palette composable,
  per-kind inspector components (class inspector reuses
  `components/type-designer/*`), Roles/Screens panel components, and the
  apply/persistence orchestration (`activateDraft`,
  `persistTreeDeclarations`).
- [x] Extract the node-sync family (`syncProcessNode` and friends) as a
  dedicated module with the designer contract injected, preserving the
  realtime derivation pipeline exactly: live-graph signature ->
  `interpretDeclarationEdges` -> tree overlay -> registry invalidation ->
  designer refresh -> node sync, sequenced through one sync entry point.
- [x] Unify port resolution to catalog + `declarationNodePorts`; remove the
  `outputSpecs[0]` fallback paths and `socketKind`/`ioSpec` shape-sniffing in
  favor of the port contract.
- [x] Behavioral specs stay green throughout (`useProcessDesigner*.spec.js`,
  `shared/process-designer-ui.spec.js`, `palette-trace.spec.js`).

##### Agent Notes — 2026-09-19 P2 complete

P2 landed in `agent/process-designer-separation-20260919`. New modules:
`composables/useProcessDesignerTypes.js` (registry generation + projected
contract + tree overlay + declaration persistence),
`composables/useProcessDesignerNodeSync.js` (the whole record-derivation
family incl. port resolution and producer-output sync),
`composables/useProcessDesignerCanvas.js`,
`composables/useProcessDesignerContextPalette.js`,
`composables/useProcessDesignerApply.js`,
`utils/processDesignerAccess.js`, `utils/processDesignerPaletteText.js`,
and `components/process-designer/inspector/{ProcessNodeInspector,
DeclarationInspector,DeclarationEdgeInspector}.vue`. The page dropped from
3576 to ~2050 lines and now owns: document lifecycle (load/select/rename),
the canvas projection and serialization boundary, connection legality, and
the single sync entry point. The realtime pipeline is unchanged: the
live-graph watcher still fires after every composable its sync pass reads
(pinned by `shared/process-designer-ui.spec.js`, now asserting
producer-output sync in the node-sync module). The
`inferIncomingEntityContract` shape-sniffing was replaced with catalog-port
resolution, and the dead non-declaration `outputSpecs` fallback branch is
gone. Scope note: Roles/Screens panel components were NOT extracted — the
Screens tab is replaced outright in P4 and the Roles tab moves with that
rework; extracting them now would build components P4 deletes (smallest
implementation). Composables consume the domain only through injection
(`baseDomain`/`packContent` params) per the architecture guard.
Validation: 498 tests green across composables, designer shared specs,
`packages/processes`, design-system manifest (regenerated for the new
inspector components), localization; `check-arch`, `check-docs`,
`framework:validate` pass. Pre-existing unrelated failures unchanged
(instance-select DescriptorEditor import, three framework-manifest checks).

##### Agent Notes — 2026-09-19 P2 corrective: swallowed page block

The P2 assembly cut (a scripted block removal with a bad end marker)
silently swallowed a 132-line script region (`socketList` and the
socket/command-service/access-summary bindings) while the template kept
referencing it — shipping as a runtime 500 on the roles tab. Script-only
identifier checks cannot see template bindings and no suite mounted the
page, so every guard passed. Repaired in
`agent/process-designer-ssrfix-20260919`: the block is restored and the
page SSR smoke harness (`vitest.ssr.config.js` + `test-tools/`) now mounts
the real page through `vue/server-renderer` — the exact defect fails the
smoke before merge. The smoke is part of the documented validation
commands (root README). Lesson recorded: template-coupled refactors need a
rendering guard, not just identifier resolution.

##### Agent Notes — 2026-09-19 placement regression fixed

P2 shipped a second latent break: node-sync destructured
`defaultProcessNodeOperation`/`iconForProcessNode`/`humanizeNodeLabel` from
the records composable's return (standalone module exports), so every
palette click threw and no node could be placed. Fixed in
`agent/process-designer-placefix-20260919` (ed02c5ef) with the missing
placement-flow spec (every species kind + class drop through the real
composables). Same session, per user review: the class card's payload-MIME
tag is gone and the class inspector shrinks to structural authoring —
payload traits and operator signatures/triggers are pack/registry
authoring, not canvas authoring (canvas type authoring = class preset,
type id, validity, diagnostics; fields/states wire as before).

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


##### Agent Notes — 2026-09-19 P3 in progress (branch, unmerged)

`agent/process-designer-uicontract-20260919` (commit 3a3cc652) lands the
compiler-side cutover: `ui-contract-projection.js` as the single emit
boundary (screens: typeId/typeList/instanceDetail + lineage refs; manifest
actions: projected createInstance/updateInstance/deleteInstance/link/
unlink/runCommand), assignment access/home/navigation on the projected
vocabulary, server-side `compileClientBundle` emission, and the
`ui-contract.spec.js` regression bridge that composes real compiler output
through the real generator. Architectural decision recorded: the screen
channel is cut over hard; `compiled.actions` stays the server execution
contract (the run API and producer outputs consume it) and is never
serialized to UI consumers — the manifest action records are its
projection, so there is no dual UI vocabulary. All package/server/shared
specs green (4 known pre-existing failures unchanged). Remaining on the
branch before merge: [screenKey] renderer swap to the generator with a
real instance-pool loader, action dispatch wiring, and the e2e surface.
The branch stays unmerged until the browser side lands — the manifest
vocabulary change would degrade the legacy generated renderer.

Update (same day, rebased on the placement-fix local): contract-diff now
covers the projected UI contract (typeId/template/roleIds on screens;
inputPolicy.prompt/construction.mode on actions), and the designer
Screens tab renders the compiled draft through the real generator
(GeneratedMappingScreen + client bundle + projected actions, empty pool) —
ProcessScreenPreview.vue is deleted. Auth hydration now carries the
generator payload (`process.bundle` + `process.actions` projected records,
pinned by the runtime spec), so the renderer swap is purely browser-side.
Compiler-side P3 is complete; only the runtime renderer slice remains
before merge.

Update (renderer landed): `[screenKey].vue` renders process screens
(typeList/instanceDetail/home) through the generator with
`composables/useScreenInstancePool.js` (row-slot DTO->instance mapping,
lineage `{ id }` normalization, typed relations, main-axis states),
`GeneratedMappingScreen` gains a real `onRun` executor prop (create dialog
drafts, delete confirm, run API dispatch, pool reload, outbox-aware), and
auth hydration's generator payload is exposed as `authStore.processPayload`.
System screens keep the legacy renderer until they migrate. Remaining after
merge: retire the legacy generated surface used by shared consumers
(InstanceCard, chats, artifacts, billing/org pages), migrate link/unlink
dialogs to the generator, system-screen migration, and the e2e pass.

Update (overload restore): the first post-merge e2e run exposed that the
cutover screens route bypassed the workspace overloads (home shell,
project/cassette/facade/queue/artifact editors) — restored in
`agent/process-designer-overloads-20260919` by routing home and
editor-backed detail types through the legacy renderer behind an explicit
view adapter (deleted with the workspace migration; the compiled contract
stays single-vocabulary). The e2e investigation also established the suite
is stale independent of the cutover: it expects static pages removed on
Sept 13 (`/projects`) and a contractor-template bootstrap removed on
Sept 15 (registration seeds an empty process), so 28/30 tests fail on
untouched code paths. The e2e item is therefore a suite rewrite — seed the
org with a real species process via the draft/activate API and retarget
expectations at the generated-screens IA — not a pass/fail run.

##### Agent Notes — 2026-09-21 producer self-binding refusal hardened

User report (`Process node X selects missing producer output X:result`
×4, live draft): root-caused against live org data. The stored
`cts.construct` nodes carry snapshot `outputs` with a `result` entity
socket (the twin-port contract) plus matching `producerOutputId`
self-bindings; the newest draft versions lost the producer-output
records while keeping the bindings, and `migrateProducerOutputIdentities`
on the lowered twin shape refused with a 400 that bricks save/validate.
Verified on current code the twin ports re-derive the records (the draft
heals on next pass), but the refusal class was real: any twin/port drift
re-bricks drafts with no in-UI repair. Fixed in
`agent/producer-selfbind-20260921-113000`: a missing self-selection is
dropped and re-derived (it names no foreign identity), missing foreign
selections stay fatal, and a type absent from the supplied vocabulary is
left to validation's anchored unknown-type report (SPEC §19
abandoned-data policy made mechanical). Pinned by four new specs in
`migration-producer-identities.spec.js` (live twin-lowered shape,
underivable self-bind, withdrawn type, foreign refusal) — the two
heal-path specs fail on the old code. The ACTIVE definition was never
affected.

## P4 — Runtime and designer cutover to the UI generator

##### Agent Notes — 2026-09-21 queue-flow regression found and fixed (hooks + queue service mount)

Full-suite triage of the red server specs root-caused the eight
queues.spec failures to a real regression from the pack-mounting cut, not
stale specs: (1) the nesting-run `acceptNestingRun` transition hooks
(`preflightChosenNestingRun`/`applyChosenNestingRun`) were exported by the
feature but registered by nothing, so choosing a production run
transitioned COMPLETE→CHOSEN while material preflight, pile consumption,
and queue READY side effects silently never ran; (2) the hook's
`updateEntity` effect targets the `queue` type through the effect
runtime, which resolves services from the registry — and no service was
mounted for it. Fixed in `agent/arch-enforce-20260921-093000`: packs may
mount `hookHandlers` (app-registry registers them beside command/task
handlers), and the cnc pack mounts the transitional legacy `queue`
entity service with process bindings, capabilities, and the genericCreate
construction handler — the "transitional legacy entity services" the
packs README already documented. Both bindings are deleted with the
queue-flow legacy cut. Same session: stale golden-suite assertions
corrected (instance routes, pack-mount seam, §3 tenancy slot), the
committed framework manifest and UI component audit regenerated, the
`ensureIndex` NamespaceNotFound crash on fresh databases fixed,
`test:durable` repaired (`#packages` alias resolves under plain node),
and vitest excludes added for `.agent-worktrees/**` duplicates and the
node:test file.

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

##### Agent Notes — 2026-09-21 manifest vocabulary hard cutover (typeId only)

User directive: "what the fuck is even typeId" — the documented interim
decision to let manifest action records serve both vocabularies
(`typeId` authoritative with `actionId`/`typeId` riding along) was the
leak. Reversed on `agent/typeid-cutover-20260921`: hydration projects every
screen and manifest action (`projectUiScreen`/`projectManifestAction`) and
the lineage-binding payload (`childTypeId`/`parentTypeId`) — one vocabulary
crosses the wire. The whole client reads it: the view adapter in
`[screenKey].vue` is deleted, the generated family, shared entity/chat
surfaces, navigation/label/root-source utils, and workspace state records
(`typeId` keys; storage versions bumped so stale pane state is discarded)
speak `typeId`/`id`. Remaining `typeId` names client-side are
descriptor-level compiler prompt-form fields (inputPolicy/construction
input/attachment creator) plus other contracts (instance-events, design-system
entity table, support-conversation DTO) — they rename with the
compiler-plane cut. The compiled execution channel keeps its internal names
server-side only.

##### Agent Notes — 2026-09-21 home workspace restored; DTO seams fixed

User directive correction: the home workspace (panes, chats, calls) STAYS —
the goal is that every surface speaks the compiled DTO/contract vocabulary,
not deletion. The cutover commits were reverted and the actual seams behind
the reported breakage fixed:

1. **`buildInstancePool` crash ("group is not iterable")** — the instances
   store's keyed pool (`{ type -> { id -> instance }}`, from the
   client-state model commit) was passed straight into the generator's
   grouped-array instances prop. The page now maps keyed → groups at the
   composition boundary; the SSR smoke pre-loads a row and pins the render
   (it crashed before on any screen with loaded data).
2. **Flat home hierarchy** — two children-edge consumers still matched by
   the authoring map key: the registry store's containment triples
   (explorer nesting never matched stored `lineage.<lineageKey>`) and
   `HierarchyTree.vue`. Both now read the declared `lineageKey` /
   `childrenOfParent` matcher. With the create-dialog parent picker from
   the wiring session, newly created children actually carry lineage, so
   the explorer nests parent/child again.

Remaining known-legacy consumers of `components/generated/*` (project
workspace editor overloads, org system screens, InstanceCard/chats) still
stand as the P4 retirement list.

##### Agent Notes — 2026-09-21 generated-surface wiring defects fixed

User report ("created type instances are shallow; listbox items follow no
types hierarchy"), root-caused against live org data and fixed on
`agent/cts-render-wiring-20260921`:

1. **Admin-level creates skipped the construction dialog.**
   `GeneratedMappingScreen` confirmed any `access.level === 'admin'`
   action instead of opening its form, so admin-granted creates executed
   empty drafts (stored proof: instances with `name: null, fields: {}`,
   empty provenance parameters). Launch behavior now follows
   `planActionLaunch` in `#shared/ui-mapping` (shared launch contract):
   construction inputs always open the dialog; confirmation comes from
   the action-kind table (delete), never the grant level.
2. **Designer-authored containment never rendered or authored.** Children
   edges were keyed by authoring identity (`<child-type>s`) while every
   other home derived the storage key as `camel(parentId)Id` — the create
   dialog's lineage row silently dropped (no parent picker, so lineage
   never stored), HierarchyTable/InstancePicker matched by the map key
   (flat trees), and derived instance indexes targeted `lineage.<mapKey>`.
   `edges.js` now stamps every children entry's `lineageKey` at normalize
   (authored wins, else `camel(declaringTypeId)+"Id"` — one derivation
   home); the dialog resolver, both tree components (through the new
   `childrenOfParent` matcher), and `deriveInstanceIndexes` read the
   declared key. Stored declarations need no migration: the stamp applies
   at registry read.
3. **Raw type ids in compiled action captions.** `compileActions` dropped
   the domain from `displayActionLabel`, so generic `cts.construct` labels
   rendered "Create t-3ccnopv0ti LOL"; now the authored render label
   ("Create YU LOL").
4. **Legacy access junk keys heal.** `normalizeDesignerAccess` spread the
   source object, keeping pre-fix `{ "0": "i", … }` residue alive in every
   draft; it now returns the whitelisted `{ level, roleIds, grants }`
   shape, so a re-sync strips stored junk.
   The "?????" field values reported alongside were literal test input
   (execution-run payloads carry them verbatim; Cyrillic persists fine
   elsewhere) — not a code defect.

Validation: cts 51, processes 441, shared/composables/instances 245
(4 known pre-existing manifest failures unchanged), SSR page smokes,
`check-arch`, `check-docs`, `framework:validate` all pass.

##### Agent Notes — 2026-09-19 plan recorded

Archived the completed procedural-CRUD plan to
`TODO-process-designer.md_archive` and recorded this successor after the
designer review (dead-code inventory, block-substrate verdict, unification
map, separation-of-concerns targets, and the missing
compiler -> UI-contract -> ui-mapping wiring). P1 started in the same
session branch.

##### Agent Notes — 2026-09-19 round-trip + authoring-UX fixes

User-reported defects, all root-caused and fixed on
`agent/process-designer-roundtrip-20260919`:

1. **Wires drop after reload / stop transmitting data.**
   `normalizeCanvasEdge` did not persist `edge.label`, and
   `compileTreeDeclarations`/`interpretDeclarationEdges` matched
   field/state/transition/children declaration wires BY label — after a
   save/reload the declaration tree hollowed out (fields/states/transitions
   silently dropped), constructs lost their row-field sockets, and the next
   save filtered their wires as missing inputs. Labels now round-trip
   (pinned by `transpiler-roundtrip.spec.js`: canvas -> definition -> canvas
   preserves labels and the compiled tree still declares the wired members)
   and the declaration matchers key on node types — a transition with an
   authored intent (label = intent, not 'transition') compiles instead of
   silently vanishing.
2. **Class authoring demanded an id.** Authoring is name-first now: a Name
   field drives a derived kebab registry id (deduplicated; slugified), the
   id becomes hand-authored only when edited directly, and the authored
   name travels as the declaration's render label. The 'Bbraugh must be
   kebab' class of friction disappears for normal authoring.
3. **Doubled dock labels.** MotionDock rendered a persistent (opacity-1)
   tooltip label per item under reduced motion — a stack of labels over the
   canvas. Labels are hover/focus-only for everyone (instant opacity under
   reduced motion via `useEnterExit`).
4. **Multiple wires into one socket.** Single-value inputs (not `multiple`)
   reject a second wire at the connect gesture with a named-socket notice;
   duplicate deterministic declaration wires (declares/children) are
   no-ops instead of same-id duplicates.

##### Agent Notes — 2026-09-19 literal/construct socket matrix

User report: "literals aren't typed as create node expects" — root-caused
as three concrete defects, not one:

1. **The cascade behind the user's broken graph**: an invalid class id
   ('Bbraugh') yields no construction contract, so the bound construct
   exposed only the Type pin and status socket — every literal wire was
   rejected with type-mismatch reasons that looked like literal typing
   bugs. Addressed by the name-first id derivation (previous fix); the
   remaining contract stays: an unbound/invalid construct offers the pin
   only, by design.
2. **Quantity fields were unwireable from literals on mutates**: mutate
   leaf sockets kept their unit (number:mm) while number literals are
   unit-less, and unit-less -> unit-ed was rejected; constructs silently
   DROPPED units instead (constructionInputKind mapped number+unit ->
   plain number) — two nodes, two rules. Now one rule:
   `constructionInputKind` keeps the unit qualifier (and stops collapsing
   dateTime -> date), the construct socket carries it, and
   `processTypesCompatible` accepts unit-less number -> unit-ed number as
   an implicit `adoptsUnit` coercion; unit -> different-unit conversion
   stays explicit (`value.convertUnit`).
3. **entityRef literals force-default to the first entity option** and the
   authored record type drives the socket qualifier — documented in the
   new spec.

Pinned by `composables/useProcessDesignerLiteralCompatibility.spec.js`:
the full literal <-> bound-construct matrix through the REAL sync pipeline
(row sockets exposed, same-base wiring, adoptsUnit, cross-unit and
cross-type ref rejection). The user's meta-point is accepted and answered
with a contract test at the seam rather than per-node patches.

##### Agent Notes — 2026-09-21 `entityType` eliminated repo-wide

Final directive: NO legacy vocabulary remains. The repo-wide rename landed
on `agent/kill-entitytype-20260921` (380+ files): `entityType` → `typeId`
(records, props, params, i18n keys, audit selectors),
`childEntityType`/`ancestorEntityType`/`parentEntityType` →
`childTypeId`/`parentTypeId`, screen templates unified to
`typeList`/`instanceDetail`, the `workflow-overrides/[entityType]` route
files renamed to `[typeId]`, the `uiEntityType` back-compat export
deleted, and the DATA_MODEL validator keys renamed
(`framework-inspect.js`). The v4↔v5 dual-key lowering sites in
`graph-protocol.js` were rewritten as single-key normalizations (typeId
resolve + kebab, no cross-key deletes); `typeIdOf` reads one key.

Also fixed the previous session's missed rename sites (the live
`parentBoundCreateAppliesToEntityType` import crash in
GeneratedInstanceCollection/GeneratedHomeScreen — rename sweeps must grep
importers, not just definitions).

Validation: packages 551, client 381+shared, SSR smokes, server/shared
with ZERO new failures vs the local baseline (25 pre-existing
mongo-mock/manifest failures unchanged, one design-system check fixed by
the sweep), check-arch, check-docs, framework:validate all pass. Global
grep for the legacy vocabulary: 0 hits.

##### Agent Notes — 2026-09-21 persisted-data typeId migration

The rename broke stored drafts: process definitions authored under the
legacy keys compiled with `unknown entity type undefined`. Fixed on
`agent/typeid-migration-20260921` with the contract-and-data rule done
properly: `renameLegacyTypeKeys` (graph-protocol) rewrites legacy
`entityType`/`childEntityType`/`ancestorEntityType`/`parentEntityType`
keys and `entityList`/`entityDetail` templates at the one-way load seam
every validate/activate/hydrate/save flows through, and
`server/scripts/migrate-process-definitions-typeid.js` persists the same
rewrite (applied to the live db: 38 documents, idempotent). Spec pins a
legacy-vocabulary fixture loading as typeId. Verified against the live
active process through the real seam: acceptance clean, identity
migration clean, 4 actions / 8 compiled / 9 manifest screens.

## P5 — The canvas speaks BPMN (accepted target model, 2026-09-27 review)

The canvas is two graphs wearing one surface: typed dataflow plus the
event/control chain. The event chain IS the BPMN sequence flow (an effect
runs automatically iff its event socket is wired), so primacy inverts:
event wires become the primary flow, data demotes to association styling.
BPMN is read in shape, line weight, and arrangement — not hue; color
retreats to sockets and cards stay neutral (Camunda-monochrome). Only
three node populations get shapes — verbs (effects → task rectangles),
nouns (data-plane → folded-corner data objects), vocabulary (declarations
→ the dashed family matching declaration wires). Declarations are not
events; no circles, and no gateway diamonds until the control species
are target-model-real. Every visual token encodes exactly one real fact:
the Node UI contract channel table stays the law and is rewritten with
each landed stage (docs-first). Position is presentation state — nothing
positional ever persists as authorization.

### V1 — geometry, rings, de-fluff (one contract rewrite)

- [ ] Smoothstep edges: delete the `decorateEdge` normalization that
  forces bezier (a leftover from the per-kind node components) and set
  `defaultEdgeOptions = { type: 'smoothstep' }` with a ~12-16px corner
  radius. Declaration-wire matching and connection inference key on
  role/label/endpoints, not geometry (verified 2026-09-27); the
  transpiler already round-trips `edge.type`.
- [ ] Arrowheads on the control layer only (`markerEnd` on event wires) —
  data and declaration wires carry no markers.
- [ ] Socket shape channel: ring = event/trigger (outline ring = manual,
  filled = wired/automatic), filled dot = data, diamond = declaration
  binding, square = status — resolves the BPMN circle-event collision
  without breaking the channel table.
- [ ] Trigger ring on effect cards' left edge: the derived trigger mode
  becomes visible language (the one honest event token — it lives on the
  verb, where the fact lives).
- [ ] Species corner glyph + label-dominant header on task cards.
- [ ] De-fluff: card-header hover tooltip replaces the per-node `?`
  affordance; `CtsTypeNode` hint line removed; meta rows (`v1`, editor
  tag, field/state counts) to hover; socket row labels hidden on
  unselected nodes; drop the one-sided socket-grid placeholder cells.
- [ ] Rewrite the Node UI contract section for all of the above.

### V2 — the primacy inversion

- [ ] Event wires: solid, `var(--p-text-color)` (the canvas's strongest
  ink, theme-adaptive), 2.5-3px, arrowed — the primary flow.
- [ ] Data wires: thin, dashed, `var(--p-text-muted-color)` — the
  payload-family `--ck-signal-*` hue lives on socket handles only.
- [ ] Declaration wires: dashed mid-tone, unchanged family.
- [ ] Payload-family hue survives on socket handles only; wire styling
  encodes layer; selected stays primary.
- [ ] Quiet-cards cutoff as principle: selected node = authoring
  surface, unselected node = diagram element.

### Lanes A — projection (the rendering backbone)

- [ ] Lane bands derived from grant records (never stored): one lane per
  role in fixed order, effect nodes render in their primary role's lane,
    declaration band above the pool, "hide definitions" view toggle.
- [ ] Horizontal lanes; left-to-right is the reading canon.

### Lanes B — placement-writes-grants (authoring)

- [ ] Dragging an effect node across a lane boundary writes its grant
  record — the exact mutation the inspector performs; membership always
  re-derives from grants on load; lane = primary (first) role, extra
  roles stay inspector-owned chips.

### Auto-arrangement

- [ ] Diagram view (read/projection): positions fully derived — x =
  layer by longest path along the event chain (validation already
  rejects control cycles), y = lane band, data nouns attached near their
  consumer; never persisted.
- [ ] Edit view: stored positions authoritative; new-node placement
  extends the nearest-unoccupied-grid contract into the lane's next free
  column.
- [ ] Tidy command in the toolbar's canvas group: the layered pass run
  destructively (writes positions).
- [ ] Hand-rolled layered pass first (topological layering + barycenter
  ordering, ~150 lines); dagre/ELK only if real graphs defeat it.

### Open decision + docs debt

- [ ] Control species: the palette exposes if/switch/fork/join/
  forEach/stops (landed with the authoring-model rebuild) — confirm
  target-model status or schedule the cut; it decides whether the
  gateway diamond slot stays reserved.
- [ ] Reconcile stale transition-node claims: READMEs and code comments
  speak of `ctsTransition` declaration nodes; none exist — the
  declaration palette is class/field/state/typeReference and state→state
  wires are `nested`. Fix in the V1 docs pass.

### Adjacent track (record references — separate from the canvas)

- [ ] Typed instance refs insertable in any text field (generalize the
  chat token parser/renderer beyond SupportMessageContent).
- [ ] Backlinks ("referenced by") panel on detail pages.
- [ ] Cmd-K instance switcher; drag-a-row → reference gesture.
