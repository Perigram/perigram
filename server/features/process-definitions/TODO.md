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

- [ ] Contract-comment trims (docs-guard homing backlog, 4 entries in service.js): block comments stating authored-data semantics move into the rewritten README sections, one-line pointers stay; migration-plan.js:1-10 restates the README's canonical migration contract → pointer.
- [ ] 409 response single-shape preparation: `migration-plan.js` carries `migrationPlan` plus the legacy `affected` mirror (L28-35, L160-163, comment "Historical 409 shape kept") — collapse to the plan together with the renderer migration (owner decision below).

### Deletions

- [ ] server/features/support/welcomemessage.js — `sendWelcomeMessage` has zero call sites (grep server/, pages/, components/, composables/: definition only); `MESSAGE_SENDER.WELCOME` survives via const.js.
- [ ] server/features/states/service.js:114-115 — `attachStatus`/`attachStatuses` identity stubs, zero callers (grep server/, workers/).
- [ ] server/features/workflow-overrides/service.js:70-80 — `getDefaultWorkflow()` always returns null; the public `resolveDefaultWorkflow` wrapper is consumed at core/machines/service.js:46,180 with null-handling at every site; inline null and delete both.

### Owner decisions wanted

- [ ] 409 dual shape: keep `migrationPlan` and drop the legacy `affected` key (repo compat law says yes) — confirm every shipped client renders `migrationPlan` before the cut.
- [ ] Owner-recovery dual-read: users/organization-owner.js:15-18 accepts the explicit `owner` flag OR the legacy dual-admin permission shape (users/README.md L91-93 documents it as live) — order the stored-membership migration so the permission-shape read dies in the same cut.

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
