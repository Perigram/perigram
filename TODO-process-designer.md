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

- [x] Smoothstep edges: delete the `decorateEdge` normalization that
  forces bezier (a leftover from the per-kind node components) and set
  `defaultEdgeOptions = { type: 'smoothstep' }` with a ~12-16px corner
  radius. Declaration-wire matching and connection inference key on
  role/label/endpoints, not geometry (verified 2026-09-27); the
  transpiler already round-trips `edge.type`.
- [x] Arrowheads on the control layer only (`markerEnd` on event wires) —
  data and declaration wires carry no markers.
- [x] Socket shape channel: ring = event/trigger (outline ring = manual,
  filled = wired/automatic), filled dot = data, diamond = declaration
  binding, square = status — resolves the BPMN circle-event collision
  without breaking the channel table.
- [x] Trigger ring on effect cards' left edge: the derived trigger mode
  becomes visible language (the one honest event token — it lives on the
  verb, where the fact lives).
- [x] Species corner glyph + label-dominant header on task cards.
- [x] De-fluff: card-header hover tooltip replaces the per-node `?`
  affordance; `CtsTypeNode` hint line removed; meta rows (`v1`, editor
  tag, field/state counts) to hover; socket row labels hidden on
  unselected nodes; drop the one-sided socket-grid placeholder cells.
- [x] Rewrite the Node UI contract section for all of the above.

### V2 — the primacy inversion

- [x] Event wires: solid, `var(--p-text-color)` (the canvas's strongest
  ink, theme-adaptive), 2.5-3px, arrowed — the primary flow.
- [x] Data wires: thin, dashed, `var(--p-text-muted-color)` — the
  payload-family `--ck-signal-*` hue lives on socket handles only.
- [x] Declaration wires: dashed mid-tone, unchanged family.
- [x] Payload-family hue survives on socket handles only; wire styling
  encodes layer; selected stays primary.
- [x] Quiet-cards cutoff as principle: selected node = authoring
  surface, unselected node = diagram element (with socket labels always
  rendering — owner corrective 2026-09-28).

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
- [x] Tidy command in the toolbar's canvas group: the layered pass run
  destructively (writes positions).
- [x] Hand-rolled layered pass first (topological layering + barycenter
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

### Agent Notes — 2026-09-28 V1 + docs debt landed

V1 landed on `agent/todo-implement-all-20260928` (docs-first: the Node UI
contract was rewritten before the code). Live-verified on the org's
active draft: 29 smoothstep edges / 0 bezier, control-layer markers,
quiet cards (no `?`, no hint lines, no socket labels on unselected
nodes), ring sockets on event rows (outline manual / filled wired via
the card's connected-input fact through DesignerSocketHandle's `wired`
prop). The docs-debt pass is done in the same commit family: the three
`ctsTransition`-declaration passages in
components/process-designer/README.md now state the real model (states
are the declaration nodes; transitions are `cts.transition` process
nodes; state→state wires are `nested`). Remaining P5: Lanes A/B,
auto-arrangement, and the control-species fate decision.

### Agent Notes — 2026-09-29 rename fix + one-document version control

Owner report: rename fails ("Process dataflow version 4 is required")
and "how apply was handled before is scam (creating new definition every
time). Probably need version control." Both real. RENAME: update() ran
persistedRewrites(payload.data || payload) — an identity-only PATCH
passed {name} as data and wiped the graph; identity-only PATCHes now
never touch data. VERSION CONTROL: a definition is ONE document for its
whole life — data edits save in place (draft or active; the 409 gate is
gone), and re-activating an already-active definition records the
superseded authored snapshot in data.history ({at, actor, data}, newest
last, capped 50) before the new graph activates. The designer's fork
path (save-onto-active → createDraft copyActive, and the 409 fork
fallback) is deleted; Save always persists in place. Loaded-model state
checks read status.state.primary (the wrapped model carries no states
block — that's the wire shape; this also fixed deactivate/remove guards
that could never match). Specs: rename-keeps-data regression,
re-activation history record, in-place active save. NOTE: the first
attempt at this round died in a worktree created outside
.agent-worktrees/ (typo'd path) that an external cleanup removed with
the uncommitted work; redone in the proper location and committed
slice-first.

### Agent Notes — 2026-09-29 definitions management + additive activation

Owner ask: proper definitions management — out of the toolbar, into the
right pane; view, activate/deactivate on the fly with commutative/
additive activation ("compilation like all active ones are on single
canvas"), rename, loading to designer; later: "no status [badges] —
activate switch and delete". SERVER: activation is now additive —
repository exposes the ACTIVE set (activation order);
mergeActiveDefinitions (compiler-adapter, pure) unions the set's
authored data into one working definition compiled through the single
seam (spec: empty + full fixture hydrates the full contract); the
migration gate and Apply diff compare against the merged OTHER actives;
activate no longer archives others; deactivate (new, ACTIVE→DRAFT) and
delete (new) endpoints; action/socket/relation seams resolve the merged
set; the organization document no longer stores an active definition
pointer. Rename now passes on ACTIVE definitions (identity-only).
UI: the inspector gains a Definitions tab — one row per definition:
name (click loads to designer), inline rename, the activation switch
(the switch IS the state — no status badges), delete. The toolbar keeps
new draft / save / apply; the Folder popover and the toolbar rename are
gone. Feature specs 80/80 incl. the merged-hydration case; guards green
(audit regenerated). Known follow-up: the empty-state row (no
definitions yet) and pagination are unhandled — orgs always have the
bootstrap definition.

### Agent Notes — 2026-09-29 corrective: secondary means surface + clean view, NOT lane-exile

Owner correction of the previous note: "I didn't tell it CLAIMS NO
LANE, it is SECONDARY, it fucking means HIDDEN IN CLEAN VIEW and
SECONDARY SURFACE COLOR. It gets GRANTS BY LANE." Reverted the lane
exile entirely (isLaneEffectNode deleted; every lane site back on
isEffectNode — membership, drop-writes-grant, settle, tidy, slots).
The remove operation is presentation-secondary ONLY: plain content
surface (no primary tint) and grouped under the secondary visibility
toggle. Both consumers (card surface, toggle) resolve through ONE
predicate — utils/processDesignerPopulation.js
(isSecondaryPopulationKind) — referenced from the node UI contract's
Card surface row and the Lanes paragraph, registered in utils README.
Design-system guard caught the changed expression set in
process.vue; UI_COMPONENT_AUDIT regenerated per the documented flow.

### Agent Notes — 2026-09-29 delete joins the secondary population

Owner direction: "'delete' should be a secondary node." The remove
operation (`cts.remove`, operation kind `effect.deleteEntity`) leaves
the lane population despite being an effect species: it claims no lane,
its drop writes no grant, it hides under the secondary visibility
toggle, tidy places it as a secondary (median-anchored, bandless), and
it settles by containment. New predicate `isLaneEffectNode` (effect &&
not delete) now drives every lane-population site — membership, drop
assignment, settle, tidy effectIds, the toggle, and the hidden-on-create
rule (which now routes through the shared isSecondaryNode instead of a
duplicated species check). Its record contract, access shape, and
operation card styling are unchanged — population only. Derived
predicate, so existing drafts need no migration.

### Agent Notes — 2026-09-29 lane bounds wrap content, recalculated on the fly

Owner directive, stated bluntly after two misses: "LANE VERTICAL
BOUNDS SHOULD WRAP AROUND ITS NODES. RECALCULATED ON THE FLY ON NEW
NODES DROPPED TO LANE." The previous rounds had it inverted — drops
were clamped INTO fixed band bounds (and earlier bailed entirely on
tight bands). Landed the container model: a band's height IS its
content extent + padding, recomputed by a settle pass that runs on
load, every drag-stop, drop, add, and delete (signature watch + explicit
calls). The settle seats each band's content at its top through ONE
uniform shift — intra-lane order and drop offsets are never touched —
and stacks the bands in role order, so a card dropped below a lane's
content stays exactly where it fell and the lane grows around it,
pushing lower lanes down. Effects assign by grant; secondaries and
declarations ride their remembered settle band (from Tidy) or the band
containing them, so data nouns stay glued to their lane when lanes
resize. Drops inside a lane's current span still snap to the nearest
free row; drops outside it stay put. Load settles BEFORE the dirty
baseline so opening a draft never marks it dirty. Pure core exported as
settleLaneGeometry (spec: wrap-on-drop preserves offsets, lower lanes
shift, empty lanes stay 150px drop targets, settle idempotent); Tidy's
own geometry now equals the settle output, so tidyCanvas just settles.
Count-based sizing survives only as the pre-settle paint.

### Agent Notes — 2026-09-29 constrained-relaxation rewrite; drop/embracing regression fixed

Owner round: "nodes cover each other, not even trying to relax, evade
intersections or minimize edge length" + "lane dropping and embracing
its nodes don't work at all." A 400-graph randomized property harness
against the previous pass proved the first claim (~60% of random
graphs had card overlaps: secondaries landing on effect rows,
declarations outside the collision system) and code reading found the
second: slotIntoLane bailed whenever a band was tighter than
inset+card+inset — every empty or single-member lane under count-based
sizing — so most drops silently no-oped, and embracing only ever
happened after Tidy. Rewrote y as a true constrained relaxation: every
card settles to the median of its wired neighbors (flow AND
declaration wires — the Σ|Δy| short-edge objective once columns are
fixed), under hard constraints: every node lives in exactly one band
(effects by grant, others by anchor, anchorless by nearest band) and
per-column separation guarantees no two cards in a column overlap;
band heights re-derive from content inside the loop. Separation ALWAYS
runs after any clamp and the exit requires a no-move iteration, so an
exit state is overlap-free (the clamp-after-separation ordering caused
the first residue; islands outside the column grid caused the rest —
islands now snap to the nearest column). Band heights in the page now
floor at max(arranged height, live member-effect extent) so drops and
drags keep bands embracing without a re-tidy. Property harness:
/tmp/opencode/tidy-props.mjs (no NaN, no same-column overlap, no
divider crossing, deterministic) — 400/400. Spec 19 cases.

### Agent Notes — 2026-09-28 lane bounds hug content + bezier revert

Owner round: "not a graph relaxed well with reasonable constraints; lane
vertical bounds should be its nodes + little padding — now it doesn't
even cover their nodes; node can't cross lane divider. Also, make wires
bezier again." The relaxation reading is right: the pass is a
constrained relaxation (every card settles at the median of its
neighbors subject to lane bounds and no-overlap), and the missing
constraints were the bounds themselves. Reworked the y pass to run in
per-band RELATIVE coordinates: every node belongs to exactly one band
(effects by grant; secondaries and declarations by their anchor
effect's band), bands stack in role order and size to their content
extent + 24px padding (empty roles keep the 150px minimum), so a node
crossing a divider is impossible by construction and lane bounds hug
their content. The pass now returns `{ positions, bands }`; the canvas
adopts the arranged geometry until the band set changes (count-based
fallback otherwise — membership stays grant-derived). The lane-changing
drop clamps its slot inside the lane. Bezier wires: the V1 smoothstep
cut is reverted by owner direction (decorate normalizes stored edges,
no migration). Spec 18 cases incl. divider-crossing and content-hugging
geometry; harness re-verified (chain stays level, no long-edge
regressions).

### Agent Notes — 2026-09-28 tidy corrective: packed lane rows

Owner report: "how it gets arranged by Y is still strange." Root cause:
the row model inherited from the old stacking projection gave every
band member a UNIQUE row — with column-derived x, a simple same-lane
chain rendered as a descending staircase. Replaced with packed rows:
columns process left-to-right, a member takes the free row of its band
nearest the median row of its already-placed same-band flow neighbors
(a sequence continues level; an unanchored member takes the lowest free
row), so same-column members stack and rows are reused across columns —
review→approve→archive now reads as one horizontal line while an
unrelated same-column card yields to the row below. The pre-packing
barycenter sweep machinery is deleted (the inline row targeting IS the
barycenter; the sweep oscillation risk dies with it). First-fit packing
alone was not enough — it gave the row to whichever card walked first;
the chain-vs-isolated collision was caught on the scratch harness
(/tmp/opencode/tidy-packing.mjs). Spec 17 cases; double-feedback
idempotence verified on the chain graph.

### Agent Notes — 2026-09-28 lanes: explicit placement only

Owner report: the automatic in-lane Y restack "breaks your system a lot
— only placing something INTO a lane should trigger explicit
placement." The restack was the Lanes A one-shot projection (whole-band
re-sort on any lane-signature change and on EVERY same-lane drop stop)
— a pre-tidy remnant that fought the edit-view contract. Deleted
(`applyLaneProjection` + its watch). Lane arrangement is now never
automatic: stored positions are authoritative; loads, inspector grant
edits, role-list changes, and same-lane nudges move nothing. The one
automatic placement is the lane-changing drop: grant write + slot the
dropped card into the target lane's free row nearest the drop (drop x
kept; crowded lane leaves the card where dropped). Tidy owns bulk
arrangement. Side effect accepted: a draft authored before lanes loads
with effects at their stored positions even when they sit outside their
derived bands — re-drop or Tidy seats them.

### Agent Notes — 2026-09-28 tidy corrective: pull-up + effect-anchored medians

Owner report: "VERY long edges, no visible reason — does force even
work?" No force exists by design (layered pass); the long edges were
two placement flaws, reproduced with a scratch harness
(/tmp/opencode/tidy-diagnosis.mjs): longest-path stranded pred-less
sources at column 0 under a far-right consumer (1682px literal wire),
and fan-out stacked around one anchor. Fixes: pred-less nodes pull up
to the column before their first consumer; secondary y = median of the
EFFECT rows they touch (direct effect neighbors + nearest upstream/
downstream effects — effect rows never depend on secondaries, so
targets are constants and the pass is idempotent by construction; an
earlier neighbor-median that let secondaries watch secondaries drifted
on every re-press). Same-column spread clears fixed effect rows.
Harness after: worst "no-reason" wire 1682→420; only structural
multi-column spans remain. Spec 16 cases incl. fan-out median,
pull-up, spread, and double-feedback idempotence.

### Agent Notes — 2026-09-28 tidy: the layered pass + toolbar command

Owner asked for auto-arrangement preserving lanes, flow direction, and
minimal crossings (proposing d3-force). Declined force simulation —
the graph is a DAG by contract, lanes are hard y-bands, direction and
crossing-minimization are exactly what layered layout solves, and the
repo carries no layout dependency. Landed per this section's plan of
record: pure `utils/processDesignerArrangement.js` (longest-path
layering over flow edges — event and data; cycle-guarded for transient
authoring; barycenter rows per lane band swept to a stable order;
secondaries stacked beside their downstream effect; declaration
clusters one column left of their bound process node; islands stay
authored) + the toolbar Tidy command (`pi-objects-column`, canvas
group, writes positions only and frames all). Contract in
components/process-designer/README.md "Auto-arrangement (Tidy)";
12-case failure-mode spec first
(`utils/processDesignerArrangement.spec.js`). Remaining here: diagram
view, lane-aware new-node placement.

### Agent Notes — 2026-09-28 lanes become the authorization surface + chrome fixes

Owner round on `agent/canvas-polish-20260928`: operations carry the
primary-tinted surface (`--ck-surface-primary`) instead of the strong
border; lane bands moved to a TRUE BACKGROUND layer (negative z-index
in the zoom-pane slot — under edges and nodes, which carry z ≥ 0); the
invented "Definitions" label is gone (lane titles are the org's own
role names); pressed toolbar items render through the extracted
`DesignerToolbarItems` at one icon-only geometry (the merged chrome had
them as 61px labeled ToggleButton chips). THE SEMANTIC CHANGE: lanes
are permanent and placement REPLACES the inspector's role editor —
dropping an effect in a lane writes its grant (single grant; implicit
lane clears), the Lanes view toggle is deleted, per-grant LEVELS stay
inspector-owned, and stored multi-grant records paint a corridor
across their granted lanes (no node/wire duplication — the answer to
the owner's clones question). Verified live end-to-end: drag → PATCH
carries the lane's single grant → draft persists it; bands z -10 under
z-0 nodes; corridor collapses on reassignment. Fixes en route: list
summaries now carry `states.main` (draft-only orgs previously opened an
archived empty process — the pick ranks never matched); lane-drop
membership reads the node CENTER (position is the top-left corner).

### Agent Notes — 2026-09-28 owner redesign: cargo wires, one socket mark, operation borders; Lanes A landed

Owner review of the corrective: "dashed borders and node corners change
is awful… you didn't remove fucking arrow and dot… primary nodes are
operations; wires: solid=instance, dashed=value, dotted=event; socket
palette good but usage and shapes need conceptual redesign; when done,
do lanes." The shape populations are REVERTED (dashed frames, task
rectangles, folded corners, species corner glyph all gone — cards are
one rounded frame again) and replaced by the owner's model on
`agent/canvas-redesign-lanes-20260928`:

- WIRE LINE STYLE encodes WHAT TRAVELS: solid = instances (entity
  payloads — resolved live from the source socket's type base, restyled
  in the same sync pass), dashed = values, dotted = events in the
  primary accent, declarations keep the demuted structure family.
  NO markers anywhere — markerEnd is dropped at decorate (stored
  control edges from earlier stylings carried it) and stripped at save.
- SOCKETS: one uniform filled circle; payload-family color is the only
  socket channel (no rings/diamonds/squares, no `wired` prop —
  manual-vs-wired reads from the wire's presence). The allowlisted
  inline-exception string updated with it.
- NODES: operations (effect species) render the strong-ink border
  (`primary` prop on DesignerNodeCard); everything else keeps the quiet
  content border — secondary nodes are surface.
- LANES A: toolbar Lanes toggle renders grant-derived lane bands
  (never stored) through Vue Flow's `zoom-pane` slot (`LaneBands.vue`):
  one lane per role in fixed order (empty roles visible), declaration
  band above the pool, implicit unlabeled lane for grantless effects;
  a one-shot in-memory projection preserves x and authored-y order
  (positions are presentation state — Lanes B owns placement-writes);
  the definitions toggle hides the declaration family via runtime
  `hidden` (stripped before serialization; Vue Flow hides their wires).

Live-verified twice on seeded graphs (/tmp/opencode/redesign-report.json,
canvas-lanes-final.png): dotted-primary event (1-5 round-cap) /
2px-solid instance / 1.5px-dashed value / demuted declaration; zero
marker defs; operations rgb(63,63,70) border vs zinc-200 secondary;
handles 9999px radius in family colors; bands Definitions→roles→
unassigned with granted effects in their role lane and grantless in
the implicit one; definitions toggle removes declaration nodes.

FINDING (pre-existing, not lanes): activating a draft in the same
request that CREATED its role stores `access.grants[].roleId` stripped
(`roleIds:[null]`, compiled actions lose role scoping and screens
infer zero stations) — the org-configuration roles cache has not seen
the brand-new role; with a settled role the same activation preserves
grants (verified both ways against stored docs). Designer flows (Apply
with pre-existing roles, e.g. the owner's active definition) are
unaffected; the race needs its own task in the process-definitions
feature.

### Agent Notes — 2026-09-28 V2 corrective: primacy made real + node shape populations

Owner report: "primary-secondary wires and nodes isn't implemented, and
event wire became ugly w/ markers". Measured against the org's real data
(active `process-6ab23042`: 16 declaration + 12 data + **1** event wire;
draft `process-6ab225b5`: 19 + 3 + **0**): the mechanism was live but the
hierarchy was visually INVERTED — declaration wires rendered 2px in the
full-saturation structure violet (`--ck-signal-structure`), the loudest
ink on the canvas, so declaration-heavy graphs drowned the one primary
wire. Fixes on `agent/canvas-primacy-20260928` (docs-first, contract
rewritten before code): a derived `--ck-signal-structure-muted` token
(55% structure toward the muted ink — the one color-mix beside the
scrollbar precedent) demotes declaration wires to the second association
layer (1.5px, dash 4-3) with full hue staying on socket handles; the
control arrowhead shrinks 18px → 12px (the wedge read as a blob on the
2.5px flow); and the card SHAPE channel lands the P5 node populations —
verbs (effect species) = sharp-corner task rectangles, nouns (data
plane) = folded-corner data objects (inline SVG dog-ear — scoped CSS
stays banned by the design-system guard, which caught the first draft),
vocabulary (declaration family) = dashed frames in the declaration-wire
tone, control species keep the neutral frame (reserved gateway slot).
Type canvas unchanged (shape passthrough only). NOTE: token/tailwind
changes need a dev-container restart — HMR recompiles pages but the CSS
variable declarations and Tailwind theme are evaluated at server start
(the probe measured `stroke: none` until `docker restart cutkit_app_dev`).
Browser-verified on a seeded three-layer graph (artifacts:
/tmp/opencode/wire-report.json, canvas-probe.png): event 2.5px solid
+12px marker, data 1.5px (5-4), declaration 1.5px (4-3) demuted; task
rects `radius:0`, noun `fold:true`, declarations dashed in
`color(srgb .46 .40 .71)` — same tone as their wires. Guards: designer
suites 119 + design-system 38 + SSR smokes + check-arch/check-docs/
framework:validate green; framework manifest and UI component audit
regenerated.

### Agent Notes — 2026-09-28 V1 corrective + V2 landed

Owner review of V1: "socket labels disappeared" — the V1 de-fluff item
that hid row labels on unselected nodes made the canvas unreadable.
REVERTED by owner direction: socket labels always render (the quiet-card
policy now carries that as an explicit rule). Same round shipped V2 (the
primacy inversion) so the rework reads at a glance: the EVENT chain is
the primary flow — solid `var(--p-text-color)` 2.5px arrowed; data wires
are thin (1.5px) dashed `var(--p-text-muted-color)` associations;
declaration wires stay dashed structure-toned; the payload-family hue
lives on SOCKET HANDLES only; selected stays primary 3px
(`WIRE_STYLES` replaces `WIRE_PATTERNS`; `sourcePortForEdge` is gone
with it). Contract rewritten in the same pass (wire styling = LAYER).

### Adjacent track (record references — separate from the canvas)

- [ ] Typed instance refs insertable in any text field (generalize the
  chat token parser/renderer beyond SupportMessageContent).
- [ ] Backlinks ("referenced by") panel on detail pages.
- [ ] Cmd-K instance switcher; drag-a-row → reference gesture.
