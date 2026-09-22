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

### Phase 0 — Survival audit `[ ]`

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

### Phase 1 — One spelling `[ ]`

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

### Phase 2 — Kill copies (reference, not copy) `[ ]`

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

### Phase 3 — Apply grows teeth `[ ]`

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

### Phase 5 — Constants: one storage, two views `[ ]`

- Unify literal-node and socket-value into one record with two
  presentations: inline socket chip ↔ canvas node with a wire; drag
  out / collapse in as one gesture.
- Delete `useProcessDesignerLiteralCompatibility` (+ spec).
- Acceptance: drag/collapse round-trip spec; expressiveness matrix
  (literal + operator wiring) unchanged; compatibility layer gone.

### Phase 6 — One fact renderer `[ ]`

Named domain blocks die; declared field groups + one renderer.

- Field groups and render policies declared in type paper
  (field-schemas); compiler emits the identity group for every type;
  dimensional facts render from declared groups with units.
- Retire `IdentityBlock`, `SpecsBlock`, `DataBlock` as named
  components; one generic descriptor-driven fact renderer (the
  `DataBlock` mechanism generalized, access filtering preserved).
- Acceptance: zero domain-named block components; representative
  surfaces visually unchanged; audit + design-system specs green.

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
