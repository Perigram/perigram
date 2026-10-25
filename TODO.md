# TODO

## Deslopification program (owner direction 2026-10-23)

Baseline: full-repo audit of 2026-10-24 (nine area reports, three
independent review passes; evidence is inlined below — the reports were
ephemeral). System law: [SPEC §23](./SPEC.md). Per-folder
deltas live in the folders' own TODO.md; this file carries the
repository-level cuts, the root documentation, and the guards.

Status legend per AGENTS.md: tasks move to WAITING for owner verification,
archived only on the owner's word.

### Repository shape (SPEC §23.1)

- [x] Remove `video/` (19 tracked files) — the explainer-video renderer:
  `video/groundtruth.mjs` imports deleted `utils/` files
  (ERR_MODULE_NOT_FOUND reproduced at audit), all 5 relative links in
  `video/README.md` resolve above the repo root and are broken, and
  `nuxt.config.js` special-cases ignoring the tree. Drop its
  Documentation Map row in the same cut. The renderer moves to its own
  repository first (~/Projects/perigram-video; owner pushes to a remote).
  Landed 2026-10-25 (655938b35): video/ moved to its own repository —
  0 tracked files under video/, `nuxt.config.js` video special-case
  gone, Documentation Map row dropped, renderer at ~/Projects/perigram-video.
  Untracked build-artifact residue remains in the primary working
  directory (video/frames, video/out.mp4, video/target,
  assets/rive/perigram-mark) — owner-local cleanup, deliberately
  untouched by agents.
- [x] Remove `packages/mongo`, `packages/nitro`, `packages/vue` — zero
  consumers repo-wide (reference search over all js/vue/mjs excluding the
  packages themselves); `packages/vue/README.md` documents exports that do
  not exist. Same cut cleans `scripts/framework-inspect.js` PACKAGE_NAMES,
  regenerates `framework.manifest.json` (`npm run framework:write-manifest`),
  drops `tsconfig.json` path rows, and updates the `.codex` skill reference.
  Tracked in [packages/TODO.md](./packages/TODO.md).
  Landed 2026-10-25 (655938b35): folders gone, every reference cleaned,
  manifest regenerated.
- [x] Remove `constants/` + `components/UserForm.vue` — the only import of
  `constants/` is `UserForm.vue:36` (`USER_ROLES`, a hardcoded legacy role
  set); `<UserForm` template usage: 0 matches repo-wide.
- [x] Remove `assets/rive/perigram-mark/` + `public/rive/` — `rive`,
  `perigram-mark`, `\.riv` search over all app code: 0 references;
  package.json carries no rive dependency. Drop the Documentation Map row
  in the same cut.
- [x] Remove the retired Swarm/Hetzner deploy plane:
  `.github/workflows/publish.yml` (builds absent `workers/fileprocessing`),
  `docker-stack.yml`, `docker-stack-external.yml`,
  `docker-stack-workers-only.yml`, `build-images.sh` (referenced only by
  `workers/README.md:30` — fix in the same cut), `start-dev.sh`, and the
  four legacy files `deploy/README.md` itself declares retired.
  `deploy/seed.Dockerfile` and the Forgejo workflow stay.

### Root documentation

- [x] `README.md` Development section: keep the durable operational
  contracts — PWA/service-worker laws, dev-stack filesystem runbook,
  WORKER_TOKEN, theme-token restart law, server-side `xlsx` ESM import
  law, `#packages` alias law — and cut the one-off history: the
  CutKit→Perigram rename runbook, the cutkit-network saga, the
  "/_nuxt/ was once excluded" parenthetical, and the agent-worktree
  watcher narration (root audit classification).
- [x] `README.md` Documentation Map: register the orphaned top-level
  READMEs (components, composables, stores, shared, utils, layouts,
  middleware, i18n, assets, packages, test-data, test-tools, k8s) — every
  one missing from the map at audit — plus this program.
- [x] `SPEC.md`: number the section headings; sweep the 36
  "SPEC §N" citations across READMEs to the new numbers (decided
  2026-10-25).
  Landed 2026-10-25: 23 `##` + 10 `###` headings numbered (§4 UI holds
  the §Files artifact-death sentence; Deslopification last as §23);
  citation map — §UI→§4, §Now playing→§11, §Server→§13, §Vocabulary→§14,
  §Process runtime→§19, §Plugin marketplace→§20, §Exports→§21,
  §Generative UI→§22, §Deslopification→§23(.1), §Agent access→§3,
  §Files→§4.

### Guards

- [x] `scripts/check-docs.js`: add `workers` to SOURCE_ROOTS
  (contract-shaped comments there are unscannable); make `resolveTarget`
  fail links resolving above the repository root (`video/README.md` passed
  the guard with 5 such broken links); add orphaned-README detection (a
  README no parent map registers).
  Landed 2026-10-25 (655938b35): `workers` in SOURCE_ROOTS; the link
  pass fails `..` resolutions; `findOrphanedReadmes` flags unlinked
  READMEs.
- [x] `scripts/check-arch.js`: delete the dead `descriptorRefFields`
  function (never called; its comment claims enforcement), the empty
  `PACK_OWNED_FEATURES` map with its dead branch, and the four phantom
  capability names (server/features audit).
  Landed 2026-10-25 (655938b35): `descriptorRefFields`,
  `PACK_OWNED_FEATURES`, and the four phantom names deleted.
- [x] `scripts/framework-inspect.js`: `mcp-smoke` probes the deleted
  `queue` type — repoint to a live declared type.
  Landed 2026-10-25 (655938b35): `mcp-smoke` probes `user`.

### E2E

- [x] Fix `home-default-screen`, delete `home-and-instance-ui` (decided
  2026-10-25) — both listed under e2e/README "Known-stale remainder";
  `home-calls` is live (its selectors were verified at review) and stays.
- [x] `home-default-screen` re-verified stale 2026-10-24: the spec asserts
  `/screens/home` URLs while `/home` is the live route — review-3 checked
  line 18 only; the rewrite spans the whole spec.

### Area documentation deltas (folders without their own TODO)

- [x] `e2e/README.md`: coverage table lists 19 of 23 live specs — add
  `cassette-profile-editor`, `definitions-pane`, `home-workspace-restore`,
  `process-designer-getfield`; the default-login prose contradicts
  `global-setup.js` (fresh identity per run); trim the walkthrough
  narration; L205 names fixtures vocabulary the file no longer carries.
- [x] `test-data/README.md` rewrite: 10 of 12 listed factories do not
  exist, the usage example fails at runtime, `ui-mapping-real.js` and
  `contextToScenario` are deleted — document the real nine factories
  (decision below before the rewrite).
- [x] `test-tools/README.md`: document the two fixture surface plugins
  e2e consumes.
- [x] `scripts/README.md`: drop the dead duplicate-key check claim (the
  check does not exist), correct the framework-inspect contract line,
  move the four server/scripts file summaries to
  [server/scripts/README.md](./server/scripts/README.md) (their canonical
  home, per the server/core delta).
- [x] `deploy/README.md`: document `seed.Dockerfile` (the one live
  artifact deploy.yml builds), reconcile `cutkit-` container names with
  the `perigram-autodeploy` naming.
- [x] `deploy/deploy.yml`: move the inline LIVEKIT and garage S3 keys to
  Forgejo secrets; `deploy/README.md` states the sourcing (decided
  2026-10-25).
  Owner action: set `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `GARAGE_ACCESS_KEY`, `GARAGE_SECRET_KEY` as Forgejo repository secrets
  before the next staging deploy (the values left the workflow file).
- [x] `k8s/README.md`: rewrite in English; `deploy/` owns deployables,
  `k8s/` owns cluster state (decided 2026-10-25).

### Owner decisions wanted

- [x] `video/`: remove with git history as the archive, or move the
  renderer to its own repository first?
  decided 2026-10-25: move to its own repository — local repo created at
  ~/Projects/perigram-video; owner pushes to a remote.
- [x] `deploy/README` says "no credentials" while `deploy/deploy.yml`
  carries inline LIVEKIT and garage S3 keys — move to Forgejo secrets, or
  bless the inline lab keys and fix the sentence?
  decided 2026-10-25: move to Forgejo secrets; README states it.
- [x] Root SPEC numbering: number sections (36 "SPEC §N" citations start
  resolving) or rewrite the citations to section names?
  decided 2026-10-25: number sections; sweep the 36 citations.
- [x] Artifact-family cutover: SPEC §4 retires `artifact` when
  chat/proof/capture/upload move to file instances; support chat still
  rides artifacts (`support/service.js:2,40`). Schedule the cutover or
  record the cluster as the live file path
  ([server/features/TODO.md](./server/features/TODO.md)).
  decided 2026-10-25: schedule — the task section below owns the cutover.
- [x] `k8s/README` is Russian and overlaps `deploy/` on the hera
  production environment: which folder owns that contract canonically?
  decided 2026-10-25: English rewrite; deploy owns deployables, k8s owns
  cluster state.
- [ ] `test-data/factories.js` has 3 live consumers (ui-lab,
  design-system spec + util); confirm nothing expects the deleted CNC
  factory set before its README rewrite names the real nine factories.
- [x] Registry naming: `getAppRegistry` vs `getPerigramRegistry` — ten
  core files import the legacy name
  ([server/core/TODO.md](./server/core/TODO.md)).
  decided 2026-10-25: `getAppRegistry` everywhere, direct imports,
  perigram-registry.js shim deleted — work item in server/core/TODO.md.
- [x] Event tier: register `frameworkEventDefinitions` into the framework
  domain or delete the emission and validation tier
  ([server/core/TODO.md](./server/core/TODO.md)).
  decided 2026-10-25: register into `defineDomain` + define the
  `convertArtifact` command — work item in server/core/TODO.md.

- [ ] WAITING — owner verification: read root README Development +
  Documentation Map and the five area READMEs (e2e, test-data, test-tools,
  scripts, deploy); guards, the video/ removal, and the repository-shape
  cuts landed (655938b35); the test-data decision, the
  artifact-family cutover, and the exhaustive code audit stay open;
  k8s/README rewritten (deploy owns deployables, k8s owns
  cluster state); root SPEC sections numbered §1–§23 with the citation
  sweep landed.

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025` (worktree
`.agent-worktrees/deslop-execute-20261025`). Executed: `constants/` +
`components/UserForm.vue` deleted; rive assets deleted (doc-map row
dropped); the Swarm/Hetzner deploy plane deleted (publish.yml, three
stack files, build-images.sh, start-dev.sh, four deploy/ legacy files —
deploy/README now states the surviving set); `.forgejo/workflows/deploy.yml`
LIVEKIT + garage keys moved to Forgejo secrets (README documents the four
required secrets — owner must set them on the Forgejo repo before the next
staging push); k8s/README rewritten in English with the deploy/k8s scope;
`home-default-screen` rewritten to `/home` + system-screen route
replacement, `home-and-instance-ui.spec.js` deleted with its coverage row
and the Known-stale paragraph.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). Root documentation: README
Development section deslop'd — durable operational contracts kept,
one-off history cut; Documentation Map completed with the orphaned
top-level READMEs (landed earlier in the program commit). Area deltas:
e2e, test-data, test-tools, scripts, deploy READMEs executed; the four
server/scripts summaries moved to server/scripts/README.md. E2E:
`home-default-screen` re-verified stale (spec asserts `/screens/home`
URLs, `/home` is the live route, review-3 checked line 18 only);
`home-calls` verified live and delisted. OPEN: repository shape cuts,
guards, E2E rewrites, SPEC numbering, 8 owner decisions.

## Exhaustive first-party code audit (owner direction 2026-10-25)

Scope: every first-party line read once — one deep pass per component
folder (~30 folders, ~177k lines; vendored bundles excluded). The
measured floor: 1.3–2.3% token duplication on the core planes, ~3k
proven cuts already executed. Findings must beat the tool floor.

- [ ] Per folder, read every module end to end and file findings in that
  folder's TODO with file:line evidence and the search that proves them.
  Categories: dead exports and unreachable branches (reachability
  search), duplication (token, near-miss, Vue-template),
  speculative abstraction, over-engineering, contract-shaped comments,
  synthesized wire fields.
- [ ] Items with conclusive reachability evidence and zero decision
  hooks execute in the same session (specs and docs die with code);
  everything else lands unchecked.
- [ ] Validation: guards and the touched areas' suites green on the
  session branch.
- [ ] Report: per-folder conformance table, findings by category, lines
  cut vs filed.

Session mechanics: parallel area waves with review agents re-verifying
every DEAD/DUPLICATE claim (the 2026-10-24 pattern); escalation and
status rules per AGENTS.md.

## Artifact-family cutover to file instances

- [x] Retire the artifact family: the `artifacts`, `artifact-templates`,
  `artifact-conversions` features, the artifact entity UI, and their
  routes/specs. `artifact` is legacy vocabulary and dies. What chat
  operates on after the cutover is the implementing agent's decision;
  CTS types with payload traits and the upload creation protocol are
  the seams. User-plane UX must not degrade.
  Landed 2026-10-25 (session `agent/artifact-cutover-20261025-1655`,
  worktree `.agent-worktrees/cutover`): the three features, their API
  routes, ArtifactCard/ArtifactTemplateCard, the ArtifactViewer
  artifact-entity branch (the component lives on as
  `components/shared/FilePayloadViewer.vue`, both mounts pass `source`
  only), `shared/attachment-kinds.js`, `utils/artifact-ui.js`, and
  `utils/artifact-viewer.js` deleted with their specs; the `artifact`
  framework type left `packages/cts/src/pack/framework.js`;
  `generateAttachment` moved to
  `server/features/plugins/operations.js` (binding-resolved export into
  the `files` bucket, write-gated on the source instance, result
  carries the file reference — the artifact record and template/value
  inputs died); the `convertArtifact` command, its REST route, and the
  listing `attachmentKinds`/`conversions` grammar (SDK parser, schema,
  install/upgrade gates) deleted; facade listing v18 drops the
  conversion service, renames the export kind `LAYOUT_DXF` → `dxf`,
  and `generateSheetDxf` reads the §3 values shape (`fields`); chat
  creator-only sources generalize to any payload-protocol creator type
  (support/service.js); stored data migrates through
  `server/scripts/migrate-artifact-family-retirement.js`.
  Validation: unit suites green (2096 tests; three pre-existing
  failures at HEAD: ui-mapping-random, agent-tooling-loop activation
  gate, invitations string-org ids), check-arch green, SSR smoke green,
  manifest regenerated. check-docs carries three filed links (below).

- [ ] WAITING — owner verification: UX parity on the live stack (chat
  attachments incl. instance-chat materialization, camera capture,
  uploads, sheet-design DXF export) and the post-merge e2e run
  (`e2e/chat-file-upload.spec.js`, `e2e/process-generated-screen.spec.js`,
  `e2e/order-process.spec.js`, `e2e/cassette-designer-3d.spec.js`,
  `e2e/definitions-pane.spec.js`, `e2e/invitation-page.spec.js`).

- Owner edits wanted (SPEC law links dead with the family; SPEC files
  are agent-untouchable):
  - `components/SPEC.md:86` links the deleted `./artifacts/README.md`
    (L14 prose names the folder beside it) — drop the row and the word.
  - `shared/SPEC.md:99` lists the deleted `attachment-kinds.js` as a
    support contract — drop the line (payload traits own the
    vocabulary, per CTS SPEC §4).
  - SPEC §20's delivered-state paragraph (2026-10-10) names listing
    `attachmentKinds` and `conversions` as delivered grammar; this
    cutover retired both keys (payload traits are the upload contract,
    conversions died with the artifact family). Reconcile §20 when
    convenient.
  - `server/core/effects/service.js` keeps the `artifact` effect type
    (named in `server/core/SPEC.md`); post-cutover it has zero
    emitters — delete the branch with a SPEC touch, or keep.
  - `server/features/support/SPEC.md:73` still names `artifact` beside
    `user` as concrete option loaders; the loader set is `user` only.
  - `workers/nesting/README.md` links a missing `./jagua-rs/README.md`
    — pre-existing at HEAD, unrelated to this cut.

Session reads before any code: AGENTS.md; [SPEC](./SPEC.md) §4 (Files),
§13 (Server), §20 (Plugin marketplace — attachments/exports as
declarations); [CTS SPEC](./packages/cts/SPEC.md) §4–§5 (declarations,
payload traits); [instances](./server/features/instances/README.md),
[support](./server/features/support/README.md) (today's attachment
flows), [entities](./components/entities/README.md).

Acceptance: support chat attachments, proof, capture, and upload flows
operate on declared file types end to end; the retiring set above
deletes in the same cut with its specs and docs; the plugins/artifacts
seams that survive (generateAttachment, attachment kinds) either ride
the declared vocabulary or carry a filed migration item; guards green
(framework suites, check-arch, check-docs, SSR smoke) and e2e green
against a running stack; owner verifies UX parity on the live stack.

### Agent Notes (2026-10-25)

Session `agent/artifact-cutover-20261025-1655` (worktree
`.agent-worktrees/cutover`). Design: chat attachments keep their two
declared paths (common/party chats store plain GridFS descriptors in
the `files` bucket; instance chats materialize each file as the
accepting declared child type through the upload creation protocol —
both pre-existing and untouched); the chat create-and-attach affordance
generalized from the artifact special-case to every payload-protocol
creator type; proof attachments were already plain lifecycle refs and
needed nothing. Exports: `generateAttachment` survives under its SPEC
§21 name with plugin-owned internals — no artifact record, file lands
in the `files` bucket, command result carries
`{ kind, fileId, name, mimeType }`; the derived export surface's
duplicate write-gate collapsed into the handler (one gate home).
Attachment-kind vocabulary: `domain.attachmentKinds` (the payload-trait
projection keyed by type id) is the surviving table; the framework kind
list and listing-level kind declarations died. The two components/TODO
cutover-owned boxes closed (ArtifactViewer branch, artifact_template
UI). Framework manifest regenerated. Remaining artifact-family strings
in code: the SPEC files above (filed), `server/core/effects`'s
`artifact` effect branch (filed), the migration script, and English
"artifact" in e2e test-output comments.

## Generative UI arrangement foundations (owner direction 2026-10-25)

Law: [SPEC](./SPEC.md) §22.7–22.11 — instance-page layout consumes two
derived records (data traits, container traits) and derives everything;
engine home `shared/ui-mapping`, materialization `components/ui-mapping`.

- [ ] Data-trait record on every composed region node: weight (exists,
  `estimateRegionWeight`), breadth (chip-scale / content-width /
  full-row), volume, shape family, filledness (inert empties exist),
  growth bound — one compose-time pure record.
- [ ] Container-trait seam: width scale, height boundedness, scroll
  ownership, density resolved per host (page, pane, dialog, popup,
  mobile tab); the sanctioned scoped-CSS container homes and the
  measured track engagement become materializations of the trait
  vocabulary, with no private per-surface breakpoints.
- [ ] Arrangement as a total function over data × container traits —
  the §22.1–22.2 ladder generalized; every trait combination resolves a
  placement.
- [ ] Placement-aware composition: nested class refs render as instance
  chips everywhere (`InstanceInlineRef`); presentation picks by
  placement (page / rail / row / stub).
- [ ] Pin audit: layout thresholds named in the one budget/layout
  table; type-keyed layout branches and component-local layout magic
  numbers in app code deleted or pinned through the declared seams.

Session reads before any code:
[shared/ui-mapping](./shared/ui-mapping/README.md),
[components/ui-mapping](./components/ui-mapping/README.md),
[assets/tokens](./assets/tokens/README.md), SPEC §22.
