# TODO — Crystallization Program

Program plan ratified in design session 2026-09-22. Vision first, then
phased refactors. Each phase is sized for session worktrees; record
progress as Agent Notes subsections under the owning phase, per repo
convention. Docs land with every phase (`neo:` commits, owning READMEs).

---

## Vision (input for the SPEC rewrite)

The sentence:

> The shop's paperwork is already the program. CutKit makes it run.

Five concepts and two scope laws. Each carries a law and a test — the
test is what rules code review.

### 1. Paper — the app is authored, not coded

Declarations only: vocabulary (types), grammar + optics (process
definitions), standards (referenced vocabulary). Paper is instances of
declaration types; Apply is the stamp that posts it. Code is the
executor and stays generic over all paper.

- Law: if it is not on paper, the app cannot do it. No behavior lives in
  code as a special case.
- Test: every feature answers "where is this written?" and points at a
  declaration. A type-name branch outside projection machinery is a
  violation.
- Marks: inert until applied; complete (behavior derivable from paper
  alone); revisioned (never edited in place); authorable (data, not
  code — a foreman can write it).

### 2. Stamp — state is the sum of recorded work

State changes only through stamps: who, when, which operation, with
what evidence, at which station. `status_events` is the substance, not
a feature.

- Law: no state without a stamp; never edited in place; append-only log.
- Test: any write path changing state without event + actor + declared
  evidence is a defect.

### 3. Station — every screen is where an operator meets paper

A station shows: the work present, the permitted stamps, the evidence
required. Access derives from the paper's role declarations — compiled,
never a software-side matrix. Hand-built screens exist only as editor
bindings (a station specialized for a payload kind).

- Law: stations are compiled from paper.
- Test: a screen that cannot answer "which stamp does this serve?" is
  decoration — delete or refuse it.

### 4. Lineage — matter is continuous

Every physical thing knows what it was made from and becomes: sheet →
part → remnant → part. Data mirrors conservation of matter.

- Law: creation records source; transformation preserves provenance;
  waste is addressable (remnant), never anonymous deletion.
- Test: trace any instance to material intake; a dead end is a hole in
  the paper.

### 5. Apply — paper is inert until posted

Two worlds by design: the document (editable, versioned, diffable) and
the running shop (compiled, live). One verb moves between them; apply
always shows its diff first.

- Law: the running shop is a pure function of applied paper; the
  registry is a build output, re-derived — never hand-written.
- Test: "change behavior" answers "which paper, which revision?" —
  never "which admin toggle?"

### Scope laws

- Shop: all paper is shop-scoped; every stamp lands inside one shop.
- Standard: paper may reference paper. Packs and shared vocabularies
  are paper cited by other paper — never code, never configuration.

### The razor

Change something. Did the shop's grammar change (paper), one sentence
(matter/instance), or nothing because it is derived (projection —
editing it directly is a violation)?

---

## Program

### Phase 0 — Survival audit `[x]`

One session, no code. Evidence, not taste.

- Classify every abstraction that survived the deletion waves vs died:
  does the survivor set serve "paperwork that runs"?
- Classify every designer node kind, inspector section, palette entry:
  structure-owns (type paper) / binding-owns (process) / inferable /
  duplicate-spelling.
- Pin the org-declaration persistence seam: where do org type bytes
  persist on save vs apply (the async-store gap noted in the
  construct-hygiene session notes).
- Output: three lists appended here — references (keep), payloads
  (migrate to registry), dual spellings (pick one).

#### Agent Notes — 2026-09-22 (audit complete)

**Verdict: the survivor set serves "paperwork that runs." PASS**, with
two open dualities (artifact entity, v24 status-block residue) and one
major inference gap (screens). Several planned phases turned out to be
already built — later phases are amended below accordingly.

**Survival record.**

- Survived and serving the sentence: process compiler + compiled
  contract; CTS registry + packs; the declaration one-tree (SPEC
  §20/§21 — class/field/state/type-ref nodes, `compileTreeDeclarations`
  in dependency order); states + `status_events` engine; lineage /
  provenance / remnants; standards (pens, layers); editor bindings /
  file surfaces; Apply with a write gate (SPEC §11 diff, `migrate`
  steps, compile-before-persist); `ApplyMigrationDialog` (removed-state
  ceremony for live instances); opaque rename-safe registry ids
  (never derived from authored names); generated screen renderer;
  home screen synthesis per assignment.
- Died / dying: hardcoded entity vocabulary; statusDefinition canvas
  records; the block substrate; the compose node (composer-less
  construct landed); constant/literal nodes (inline socket fallbacks
  replaced them); `entityType` keys; `status`→`states` rename (v24
  block residue remains); artifact entity (still open — Phase 7).

**Persistence seam (pinned).** SAVE: the declaration tree persists as
`ctsTypes` records inside the process definition draft — no registry
side effects. APPLY: `persistTreeDeclarations` posts through
`POST /api/admin/cts/types`; the write gate compiles the whole org view
first and refuses breaking redefinitions without `migrate` steps;
declarations land in `cts_types`. The per-org registry is rebuilt from
packs + stored org declarations (`server/features/cts-types`), served
through `GET /api/admin/cts/types`; the designer's live overlay is a
session registry keyed by tree signature. This IS "registry as build
output" — the model Phase 2/3 assumed is already the shipped shape.
Residual: the client registry view composes stored declarations
async (the literal-lags note from the construct-hygiene session) —
verify in Phase 1.

**Node-kind classification.**

- Structure-owns (type paper, authored in the one tree): class, field,
  state, type-reference nodes; declaration wires (declare-on-class,
  ref targets, children edges, state→state transitions). No data-plane
  node authors type internals — the hollowing shape is already dead
  (matching is by node identity; ids are opaque; renames re-bind).
- Binding/computation (process grammar, keep): `cts.construct`,
  `cts.read`, `cts.mutate`, `cts.field`, `producer.join`, `read.*`,
  `collection.*`, `control.*`, `predicate.*`, `tree.*`, `value.*`,
  `record.*`, services (from `serviceContracts`).
- Inferable (Phase 4 targets): the Screens tab — `data.screens` are
  authored records the compiler consumes verbatim; only the home
  screen is synthesized. No per-type station inference exists yet.
- Inspector: `ProcessNodeInspector` (binding/authorization — keep),
  `DeclarationInspector` (structure authoring — keep), Roles tab
  (org data CRUD — keep as organization surface).

**Three lists.**

- *References (keep):* type-reference items and construct palette
  entries bound to registry ids; pack types surfaced read-only;
  `producerOutputs` keyed by `nodeId:outputSocketId`.
- *Payloads (migrate/verify):* none found at the node level — the
  draft tree's `ctsTypes` records are the document home, not a copy
  (draft vs posted is the Apply duality, by design). Phase 2 shrinks
  to: pin the invariant with round-trip specs + close the async
  literal-lag residual.
- *Dual spellings (pick one):*
  1. `construction?.mode ?? via` — read in `pages/organization/process.vue:1941`
     and `ProcessNodeInspector.vue:163` (Phase 1).
  2. Rename tautologies in `packages/processes/src/compiler-core.js:1696`:
     `template === 'typeList' || 'typeList'` and `typeId || typeId` —
     dead `entityType`-era residue (Phase 1).
  3. v24 `status` block vs `states.main` wire — two Stamp vocabularies;
     CTS-native types already write `states.main` only, legacy block
     remains on older entities (Phase 7).
  4. Artifact entity vs file-type instances — two Paper shapes for
     payloads (Phase 7).

**Plan corrections from evidence.**

- Phase 2 (kill copies): mostly already built. Remaining: round-trip
  guard specs + the async literal-lag residual. No rebuild.
- Phase 5 (constants): already the architecture — inline socket
  fallbacks, no constant nodes, `useProcessDesignerLiteralCompatibility.spec.js`
  pins the socket boundary (it is a guard, not a reconciliation
  layer). Phase shrinks to verification only; the `mode ?? via`
  spelling is its only real deletion.
- Phase 3 (apply teeth): write gate + removed-state ceremony exist.
  Real gaps: `removeType` deletes org declarations without an
  instance check (the abandonment gate is missing); no cross-process
  blast radius in the apply diff for type edits.
- Phase 4 (optics by inference): confirmed as the largest real gap —
  screens are authored-only today.

Status: WAITING.

### Phase 1 — One spelling `[x]`

Kill dual vocabularies. Same expressiveness, one serialization.

- Enumerate dual spellings: `construction.mode ?? via`; v4/v5 graph
  record shapes; any residual `entityType`-era keys; `status`/`state`
  residuals beyond the landed rename.
- Make acceptance-time normalization total at the existing
  `resolveCtsDefinition` seam: every load rewrites old → new; saves
  persist the new spelling only.
- Delete fallback reads and reconciliation logic.
- Acceptance: old spellings absent from `src` (archives excluded);
  designer round-trip specs green.

#### Agent Notes — 2026-09-22 (phase 1 complete)

`construction.mode` is the one authored spelling; `via` survives only
as (a) the v4 executable-contract vocabulary at the lowering seam and
(b) a legacy input the sync/load seams adopt and delete.

- Palette presets carry `construction: { mode }`
  (`typeCatalogPaletteGroups`); the drop replace also fixes a latent
  defect where a non-default preset variant lost to the factory's
  `genericCreate` default.
- `updateProcessNodeConstructionMode` writes one spelling; inspector
  and page reads dropped the `?? via` fallbacks; the node factory's
  duplicate `via` write is gone.
- `syncProcessNodeConstruction` adopts a legacy `via` and deletes the
  key (drafts self-clean; saves persist one spelling); the
  `migrate-construction-modes` script writes `construction.mode` and
  strips `via`.
- `entityType`-era tautologies collapsed in `compiler-core.js`
  (`'typeList' || 'typeList'`, `typeId || typeId`, and the
  `instanceDetail` twin).
- Specs updated to the one spelling; new legacy-self-clean case in
  `useProcessDesignerNodeSync.spec.js`. Validation: 9 focused suites
  (109 tests), `packages/processes` + `packages/cts/src/compat`
  (476 pass; 2 `ui-contract.spec` failures are pre-existing on
  `local`, verified by baseline run), arch guard, docs guard.

Status: WAITING.

### Phase 2 — Kill copies (reference, not copy) `[x]`

#### Agent Notes — 2026-09-22 (closed by verification)

The audit already found this mostly built; the remaining "pin with
round-trip specs" is covered by existing coverage:
`cts-designer-roundtrip.spec.js` (declaration nodes/wires persist
through the canvas round trip), `useProcessDesignerCanvasModel.spec.js`
(rename re-binds a bound construct live; class delete unbinds without
losing the node), `useProcessDesignerLiveGraph.spec.js` (rename
propagates in the same tick), plus Phase 1's legacy-via self-clean
case. The async literal-lag residual stands as tracked in the
construct-hygiene notes (no consumer); nothing further to build here.


The graph stores bindings; the type document is the single home for
declaration bytes.

- `cts.*` type nodes store `typeId` + process-level facts (exposed
  transitions, grants). Internals read live from the type document
  through the session overlay.
- Inspector edits write through to the type paper; "declare on
  `<type>`" inline form included. Edit anywhere, store once.
- Declaration internals serialize as one structured record per type —
  no scattered label-wired records (the hollowing shape).
- The session overlay (live compile) is the only real-time surface,
  formally: registry re-derives at apply only.
- Shared-type semantics acknowledged: editing a bound type affects all
  binders at apply (visible in Phase 3 diff).
- Acceptance: rename a type field in-graph, save/reload — binding
  intact (round-trip spec); edit propagates to other binders after
  apply; hollowing-class specs pin it.

### Phase 3 — Apply grows teeth `[x]`

The posting verb becomes the flagship moment: post a revised traveler,
see the diff.

- Extend `contract-diff.js`: type-edit blast radius — which processes
  bind an edited type; state/field renames reaching actions, grants,
  screens.
- Delete ceremony: apply diffs "type disappears" against living
  instances; refuses without an explicit abandonment stamp (SPEC §19
  promoted from note to gate).
- Acceptance: apply with orphaned instances fails closed; diff lists
  binders and affected stations.

#### Agent Notes — 2026-09-22 (phase 3, delete ceremony + blast radius)

- `removeType` (`server/features/cts-types`) now diffs the removal
  against reality: living instances (per-class collection probe) AND
  non-archived process definitions binding the type. Non-empty blast
  radius refuses with 409 `{ instances, boundBy }`; explicit
  `abandon: true` proceeds and records the ceremony (counts, actor,
  timestamp) on the org contract-change event and in the response —
  SPEC §19 promoted from note to gate.
- `findTypeReferences(organizationId, typeId)` added to
  process-definitions service (structural scan: nodes, screens, draft
  declaration children edges; mirrors `findRoleReferences`).
- Route `DELETE /api/admin/cts/types/:id` accepts `?abandon=true` and
  the session actor; the types pane surfaces the 409 payload as a
  second explicit abandon confirm (i18n en+ru).
- Residual RESOLVED 2026-09-22 (follow-ups session): `defineType`
  refusals now attach `data.boundBy` (the `findTypeReferences` list) to
  the 400 — binder visibility on both delete and edit paths.
- Validation: cts-types spec (16, incl. 3 new gate/ceremony cases),
  localization spec, arch guard, docs guard.

Status: WAITING.

### Phase 4 — Optics by inference only `[ ]`

No created screens. The compiler always drafts the station set;
authors attach deltas.

- Migration broom (one-time): sweep authored screen declarations
  against compiler inference; delete byte-equivalent ones.
- Remove the screen create verb everywhere (surface + API); only
  override-shaped delta records that reference an inferred screen are
  accepted. Empty deltas rejected.
- Arch guard: screen-shaped records must be override-shaped — slop
  dies by guard, not vigilance.
- Empty-section law, designer-wide: an inspector section with nothing
  to say does not exist (the `DataBlock` null-row rule, generalized).
- Palette discipline: unbindable entries hidden but discoverable —
  greyed, one-line unlock hint; never invisible dead ends.
- Acceptance: no create verb in code; guard red-greens a violating
  fixture; inference-equality sweep reports zero.

#### Agent Notes — 2026-09-22 (phase 4, slice 1: slop guard + broom)

**Correction to the Phase 0 audit:** role-grant station inference
ALREADY EXISTS (`inferScreensFromRoleGrants` — `auto_<roleId>_<typeId>`
list + detail stations). Phase 0's claim "no per-type station inference
exists" was wrong. The real gap was the inverse: authored screens may
duplicate inference (they suppress it via the existingKeys set), which
is exactly the hand-added-screens slop.

This slice lands the guard and the broom:

- `redundantAuthoredScreens` detector (exported; script-facing wrapper
  `detectRedundantScreens(definition, domain, orgRoles)`): runs the
  pure inference (empty authored set) and flags authored screens whose
  normalized projection equals the inferred candidate over exactly the
  fields inference sets. Any customization (label, route, bindings,
  extra sources/regions) makes a screen NOT redundant — only true
  duplicates are flagged.
- `validateProcessDefinition` refuses redundant screens: Apply fails
  with "duplicates the inferred station for role … — delete it". The
  slop dies by guard, not vigilance.
- `server/scripts/sweep-redundant-screens.js` — one-time broom over
  stored definitions (org domain projection + `organizations.data.roles`
  read directly; dry-run default, `--apply` deletes and best-effort
  recompiles). Follow-up fix: domains/roles are memoized per
  organization (730 stored definitions sweep in ~2s; per-doc rebuild
  took minutes). Live-DB dry-run 2026-09-22: ZERO redundant screens
  stored — the guard is preventive, `--apply` unnecessary.
- Spec: `packages/processes/src/screen-inference.spec.js` (4 cases:
  detection, validation block, label-deviation kept, clean compile).
  Full `packages/processes` suite green except the 2 pre-existing
  `ui-contract.spec` failures (baseline-verified on `local`).

Deferred to the Phase 4 follow-up slices (tracked here):

1. Create-verb removal + delta-only serialization in the designer
   Screens tab (screens become override records referencing inferred
   stations; the tab reworks around diffs-against-inference).
2. Empty-section law, designer-wide (inspector sections with nothing
   to say do not render).
3. Palette discipline: unbindable entries hidden but discoverable.
4. Phase 3 residual: `defineType` breaking-change refusals attach the
   binder list (`findTypeReferences`) to the 400 payload.

Status of slice 2 (2026-09-23, parallel subagent session, merged):
create verb removed — the only creation path is Customize on an
inferred station (deep-clone with fresh id/route, compile-only keys
stripped); inferred stations render in the compiled preview marked
"Inferred"; authored-vs-inferred is DERIVED (membership in
data.screens), no stored marker. Guard made total: canonicalJson
treats null/undefined entries as absent (inference spells unset
conditions as undefined keys; persistence drops them — without this
the slice-1 guard could never flag a stored duplicate). Known edge:
with zero inferred stations there is no creation entry — accepted
consequence of delta-only. Remaining Phase 4 items: empty-section law,
palette discipline.

### Phase 5 — Constants: one storage, two views `[ ]`

- Unify literal-node and socket-value into one record with two
  presentations: inline socket chip ↔ canvas node with a wire; drag
  out / collapse in as one gesture.
- Delete `useProcessDesignerLiteralCompatibility` (+ spec).
- Acceptance: drag/collapse round-trip spec; expressiveness matrix
  (literal + operator wiring) unchanged; compatibility layer gone.

### Phase 6 — One fact vocabulary `[ ]`

CORRECTED 2026-09-23 (twice, honestly): the UI generator already
renders stations from the compiled contract — but its own surfaces
(`GeneratedInstanceCollection`, `GeneratedInstanceDetailBody`) delegate
fact rows to `InstanceSurfaceContent` → `instance-display-contract.js`
→ domain-cnc `cncInstanceFieldGroups` → the named blocks. Two fact
vocabularies feed one generator; the blocks exist only because the
second channel exists. The cut is the channel, not the components:

- The ONE fact vocabulary is the compiled type view (CTS client
  bundle: field schemas + render policies — already served and cached
  via `useFileTypeView`). Card/detail field groups become a render
  facet of type declarations, compiled into the bundle.
- `instance-display-contract.js` / `cncInstanceFieldGroups` stop being
  a parallel source: descriptors resolve from the bundle; app
  extensions (`app-instance-surfaces.js`) compose as overrides on it.
- `IdentityBlock` and `SpecsBlock` die as a consequence (their content
  is declared fields + policies: identity group with the
  name→slug→uid→Unnamed fallback policy; dimensional group with units).
- `DataBlock` survives as the generator's fact-row control — no new
  component, no rename; it is fed by bundle-resolved descriptors.
- Acceptance: one display truth repo-wide; generated surfaces' fact
  rows resolve from the compiled bundle; `IdentityBlock`/`SpecsBlock`
  gone; same data renders on representative surfaces; audit +
  design-system specs green.

#### Agent Notes — 2026-09-23 (parallel subagent session, merged)

Landed the recut scope: `render.groups` facet in @perigram/cts
(descriptor records + identity policy) compiled into the client
bundle; declarations carry the content (framework, tech-drawing, cnc
pack — including the SpecsBlock dimensional group with units);
`instance-display-contract.js` resolves bundle groups first with
extensions composing on top; `cncInstanceFieldGroups` reduced to 20
genuinely-undeclared types (reasons in its header);
`registerDeclarationFieldAccess` seam feeds the registry projection
into field-access checking. **IdentityBlock and SpecsBlock are
deleted**; DataBlock stays as the generator's fact-row control, fed by
bundle-resolved descriptors. New spec:
`shared/fact-display-vocabulary.spec.js` (6 end-to-end cases).

Stop-lines (tracked, where this seam grows next):
- Designer tree authoring of `render.groups` (org types declare via
  API/packs today; the seam compiles but has no authoring UI).
- Access vocabulary still legacy-keyed for migrated types (declaration
  projection lacks legacy DTO read paths like `specs.*`); documented at
  the alias site.
- Identity fallback for chrome keeps name→slug→typeLabel→Unnamed
  (privacy rule: never raw uid); the full chain compiles as policy for
  fact rows.

Integrator notes: both parallel branches (phase 4b + phase 6) merged
clean; visual inventory regenerated post-merge (cross-branch audit
drift from 4b's process.vue changes);
`packages/domain-cnc/src/relationships.spec.js` (2 failures) is
pre-existing from parallel sessions — fails identically at the
pre-merge local tip; not this program's defect.

### Phase 7 — Finish the dual worlds `[ ]`

- Artifact entity → file-type paper: migrate chat/proof/capture/upload
  flows off the artifact entity; declare `generateAttachment` /
  `convertArtifact` operators with file-instance outputs; cut the
  artifact overload.
- Stamp vocabulary: `states.main` end-to-end; the v2 snapshot shape
  stays internal to the block.
- Acceptance: artifact entity gone (or pure file instances); single
  state vocabulary repo-wide.

### Phase 8 — Org as repo `[ ]`

- Export the org's applied declarations (types, processes, deltas) as
  pack-shaped, diffable files; import/merge with diff; round-trip
  byte-stable.
- Acceptance: export → import = identity; org paper reviewable as PRs.

---

## Guard map (law → guard)

| Law | Guard |
|---|---|
| Paper | `check-arch` hardcoded-entity / type-branch bans |
| Stamp | stateService write boundary + append-only event specs |
| Station | design-system + generated-surface specs; screen-shape guard (Phase 4) |
| Apply | `contract-diff` + blast radius + abandonment gate (Phase 3) |
| Lineage | lineage/provenance round-trip specs |

Guard budget rule: guards may only shrink unless a new law lands;
deleting a guard means the structure absorbed its rule — say so in the
commit that deletes it.
