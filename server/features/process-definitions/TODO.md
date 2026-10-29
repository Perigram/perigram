# TODO

## server/features/process-definitions deslop delta (2026-10-24 audit)

### README

README REWRITE (640 lines → ~350, zero contract loss):

- [x] Delete queue-era domain narration L459-461, L487-489, L492-494, L503-510, L557-563 (cassette/queue/solveNesting passages; grep cassette|sheet_design|solveNesting over process-definitions/*.js non-spec: zero hits).
- [x] L389-391 → `rewriteRetiredWirePaths` (packages/cts/src/compat/graph-protocol.js:390, consumed service.js:51,2530); README names `rewriteRetiredNameInputs`, which exists nowhere — TODO.md:3340 already recorded this staleness and the fix missed this file.
- [x] L561-563 → delete the `migrate-process-command-output-statuses.js` citation (server/scripts has no such file; only migrate-support-transcripts.js matches).
- [x] typeId vocabulary pass: the 409 data carries `typeId` (migration-plan.js:25,162); purge the "entity type / entity service / live entities" prose at L4-5, L59, L63-66, L113-115, L340-355 (root SPEC §Vocabulary).
- [x] Restructure "Manual action execution" L356-517 (~160-line wall) into one headed subsection per effect kind (create / update / change status / link-unlink / run-command); the migration-plan section L71-126 is the model.
- [x] Delete predecessor-story prose: L121-123 (`data.migration` summary key — grep non-spec: zero), L129-130 (one-way legacy migration), L152-156 (retired v4 spellings), L389-394 (Name-input retirement story) — each restated as current behavior only.
- [x] Add route inventory: `[id]/validate.post.js`, `[id]/activate.post.js`, `active/exports/run` (routes exist, prose implies them).

### Code deslop

- [x] Contract-comment trims (docs-guard homing backlog, 4 entries in service.js): block comments stating authored-data semantics move into the rewritten README sections, one-line pointers stay; migration-plan.js:1-10 restates the README's canonical migration contract → pointer.
  Landed 2026-10-25: the 4 flagged comments (apply-diff baseline, migration decision, evaluator domain, construction-inputs derivation) are one-line README pointers; the two facts the README lacked (evaluator resolves the compile path's projected domain; authored extras kept + no-contract fallback in the construction-input derivation) moved into their owning README sections. migration-plan.js header is a pointer.
- [x] 409 response single-shape preparation: `migration-plan.js` carries `migrationPlan` only — `strandedAsAffected` and the `data.affected` mirror deleted, 409 detail string built from the stranded rows directly; migration-plan.spec gains the throw-shape test; process-definitions.spec 409 assertions updated (decided 2026-10-25: drop `affected`, `migrationPlan` is the shape).
- [x] Owner-recovery single read: `users/organization-owner.js` `isOwnerMembership` reads the explicit `owner` flag; the auth-level dual-admin fallback is gone (`hasTenantAdminPermissions` deleted); stored rows healed by server/scripts/migrate-legacy-owner-memberships.js (flags active dual-admin memberships, permissions untouched); users.spec legacy-merge tests flipped to flag-only expectations (decided 2026-10-25).

### Code findings

- [x] 24 failures in process-definitions.spec.js at base 6b12a236c (identical
  before/after the 2026-10-25 wave-2 comment-only edits): failing names span
  the core service contract — draft save + binding diagnostics, entity-node
  migration before activation, semantic apply diff + 409, declared-migration
  activation, history supersede, processUpdate chains. Spec/service drift;
  needs its own session.
  Landed 2026-10-25: specs stale against the species-rekey/§3-wire/terminal-drop
  owner waves plus two service regressions (activation's unmocked type-death
  gate in the spec; archive-intent branch unreachable behind the target-less
  transition guard) — see Agent Notes.
- [ ] `_template/process-update-handler.js` (and its four consumers:
  artifacts, artifact-templates, users, organizations) still persists the
  retired block vocabulary (`identity`/`data`/`specs`/`summary`/
  `attachments`/`relations` dotted paths), while the process seam's mutate
  patch (`wirePatchFromChanges`) now speaks the nested §3 wire (`fields.*`,
  `name`, `relations.*` per cts SPEC §3): a cts.mutate field write on a
  framework feature type fails at the handler ("Process updates cannot
  persist fields"). Generic §13 instance services accept the §3 patch
  natively. Needs an owner decision on migrating the template-handler
  family to the §3 wire (services + repositories + models in one cut).

### Deletions

- [x] server/features/support/welcomemessage.js — deleted (`sendWelcomeMessage` zero call sites); `MESSAGE_SENDER.WELCOME` survives via const.js.
- [x] server/features/states/service.js — `attachStatus`/`attachStatuses` identity stubs deleted (zero callers).
- [x] server/features/workflow-overrides/service.js — `getDefaultWorkflow()`/`resolveDefaultWorkflow` deleted; `resolveActiveWorkflow` returns null at both fallback sites; machines `initialStatus` (the no-organization variant, zero callers since the wrapper always returned null) deleted with the cut.

### Owner decisions wanted

- [x] 409 dual shape: keep `migrationPlan` and drop the legacy `affected` key (repo compat law says yes) — confirm every shipped client renders `migrationPlan` before the cut.
  decided 2026-10-25: drop `affected`; `migrationPlan` is the shape.
- [x] Owner-recovery dual-read: users/organization-owner.js:15-18 accepts the explicit `owner` flag OR the legacy dual-admin permission shape (users/README.md L91-93 documents it as live) — order the stored-membership migration so the permission-shape read dies in the same cut.
  decided 2026-10-25: order the migration; single read after — work item above.

- [ ] WAITING — owner verification: read README.md rewrite (640→600);
  queue-era narration dead, `rewriteRetiredWirePaths` citation corrected,
  typeId vocabulary pass done, route inventory added.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). README.md rewrite executed
(640→600): queue-era domain narration dead, `rewriteRetiredWirePaths`
name corrected, dead migration-script citation dropped, typeId vocabulary
pass, Manual-action wall split per effect kind, predecessor-story prose
restated as current behavior, route inventory added. OPEN: code items, 3
deletions, 409 + owner-recovery decisions.

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025`. Code wave executed: 409
single-shape (`affected` + `strandedAsAffected` deleted, specs updated),
owner-recovery flag-only read with the
migrate-legacy-owner-memberships.js healing one-shot, welcomemessage /
attachStatus(es) / getDefaultWorkflow+resolveDefaultWorkflow deleted.
users/README owner-recovery sentence collapsed to the flag read. OPEN:
service.js contract-comment trims (4 entries + migration-plan pointer).

### Agent Notes (2026-10-25, feat-deslop2 wave)

Session `agent/feat-deslop2-20261025-1521` (worktree
`.agent-worktrees/feat`). The 4 homing-backlog comments + the
migration-plan.js header landed as README pointers; the evaluator-domain
and construction-input derivation facts the README lacked moved into
§Socket projection and auth hydration and §Create. Pre-existing on this
base, untouched: 24 process-definitions spec failures identical with and
without this wave's changes (comment-only service edits).

### Agent Notes (2026-10-25, spec-repair session)

Session `agent/pdspec2-20261025-1614` (worktree `.agent-worktrees/pdspec2`).
All 24 filed failures (18 in process-definitions.spec.js + 6 in the
sibling cts-graph-protocol / draft-overlay / entity-sources /
hierarchy-hydration / query-planning specs) plus the 2 livekit
service.spec failures land green. Root causes per cluster: (a) spec never
mocked the activation type-death gate (d73679c15) — lifetime mock added,
the gate itself is covered by cts-types/lifetime.spec.js; (b) archive-intent
transition branch unreachable behind the target-less guard (d080f639c) —
service fixed, branch moved ahead of the guard; (c) specs authored in
retired vocabulary: `effect.*` kinds (species rekey waves — now `cts.*`),
`data.*`/`identity.*` wire paths and flattened processUpdate patches
(51f1504af §3 wire — now nested `fields.*`), `isTerminal` on compiled
states (6dc50c8f2 dropped terminal), `inputDefaults.field` vs the authored
`path` home, `effect.createEntity` fixtures in hierarchy-hydration,
pre-§3 `projectId` filter spelling in entity-sources, and query-planning
testing the deleted planning layer (03a118fa5 + 27b4179a3 passthrough);
(d) livekit service.spec encoded pre-9be48cc52 gating and pre-8dc8c134a
lenient listing — README documents both current contracts, specs updated.
README §Update and §Feature access boundaries reconciled to the §3 patch
and the verbatim-filter + algebra law; a cts.field `path` note and the
save-floor `position` fixture landed in the specs. New code finding filed:
template processUpdate family vs the §3 patch. Validation: both feature
directories 123/123, packages/processes 512/512, check-arch green;
check-docs has one pre-existing blocking broken link
(workers/nesting/README.md → ./jagua-rs/README.md, present at base).

### Action availability is visibility (owner direction 2026-10-31)

- [ ] WAITING — owner verification: hydration's generator action
  contract carries only the actions the assignment's roles can run
  (`process.actions` filtered to the manifest), so an unrunnable action
  renders on no surface; validate warns when a manual action resolves
  to no role (`Action <id> is exposed to no role`).

#### Agent Notes (2026-10-31)

Session `agent/action-visibility-20261031` (worktree
`.agent-wt-actions-20261031`).
Live report: owner saw "Action mkSheets is not available to the current
process role" on an admin account. Root cause: `resolveProcessAuth` sent
the client EVERY compiled action (`process.actions` unfiltered) while
`assertCompiledActionAvailable` gates on the assignment-filtered
manifest — screens list actions verbatim, so any action no assigned role
carries rendered and 403'd on click. The old `unlanedManualEffectDiagnostics`
covered only authored-grant-empty manual effects; the resolved-truth
warning (`unexposedManualActionDiagnostics` over the compiled roles)
covers missing grants, stale grant roles, and non-effect manual actions.
`npx vitest run packages/processes` 551/551; server spec family: 5
pre-existing cassette-rename drift failures on baseline, zero new
(the role-contract hydration spec is among the drifted — its repair is
the open process-definitions drift task).
