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

#### Agent Notes (2026-10-25, e2e repair session `agent/e2e-repair-20261025-1908`)

Ran the WAITING post-merge e2e list from the `e2efix` worktree against
the live stack. Findings and repairs:

- `753568f99` (default-plugins mechanism deleted) broke every spec that
  reads pack/plugin types without installing them — the failures
  surfaced as 404 `no instance service` / activation `unknown type`,
  silently, for 8 days. Fixed by porting the `installPlugins` /
  `connectPlugin` fixture helpers into `e2e/fixtures.js` (idempotent)
  and installing explicitly per spec: process-generated-screen,
  cassette-designer-3d, cassette-designer-parameters, home-calls,
  home-workspace-restore, md-editor-repair, order-process,
  process-designer-boot/getfield/placement, cassette-profile-editor.
  The install contract is now stated in `e2e/README.md` (Coverage).
- `e2e/chat-file-upload.spec.js` root cause: the §3 wire flattening
  (`51f1504af`, 2026-10-11) missed the support feature's materialization
  consumer — `materializeInstanceAttachments` still wrote the retired
  `identity: { name }` draft shape and read `created?.identity?.name`,
  so every materialized chat file child was created unnamed (verified
  live: ref snapshot `name: null`). The chip read "Unnamed", the spec's
  click landed on the inbox preview, and the record popup assertion
  timed out. Fixed to speak the §3 wire (`name`; support unit spec
  updated). The spec's retired `attachments.primary` read was updated
  to `payload` (instances README: the wire DTO is the stored §3
  document verbatim). The e2e goes green once the fix reaches the
  served checkout — the dev stack mounts the primary, which this
  session must not modify.
- `e2e/order-process.spec.js` was broken at import since the
  tech-drawing pack retirement (`fd9473d0c`) — it still imported the
  deleted `packages/tech-drawing`. Also fixed: the pairs join read the
  retired `identity.name` right key (now the wire `name` slot; the
  template cassette is named through the rename-channel PATCH —
  editor-protocol creates prompt no rows), and the designs' assertions
  moved to row-derived bounds + §3 provenance sources: the graph-wired
  construct Name input is retired law (`rewriteRetiredWirePaths` drops
  `data:name` edges into constructs), so baked designs are unnamed by
  design and carry their template ref in `provenance.sources`.
- `e2e/md-fresh-org.spec.js` deleted: its premise (a brand-new org's
  manifest carries the pack's starter screen) is unreachable through
  the public API since `753568f99` — starter constructs compose only
  when the initial process is created after the plugin install, and
  installs no longer happen at org creation. SPEC §Documents' "visible
  by default" owner direction (2026-10-14) predates that deletion and
  needs an owner reconciliation; `server/scripts/station-documents-types.js`
  remains the repair path for existing orgs. The editor round-trip it
  also covered is duplicated by `md-editor-repair.spec.js`.
- Spec-drift repairs against current contracts: process-generated-screen's
  inline edit drives the per-field pencil (record edit mode retired
  `3d784ce8f`); generated-state-surface seeds positioned canvas nodes
  (save-time graph integrity floor `c19295055`) and expects the
  attributed-rename audit step; md-editor-repair's dialogs fill the
  prompted identifier row and open the csv editor through the `Edit`
  action; cassette-designer-parameters' fold-edge test dismisses the
  profile picker and draws a rectangle (the Closed shape tool is gone).
- LiveKit 502 tolerance in `e2e/fixtures.js`: the dev stack's env points
  the media plane at the owner's remote deployment whose credentials
  currently 401 (ListRooms), so `/api/livekit/active-rooms` serves 502
  by design (livekit README) and every sidebar-loading spec's
  `expectCleanRuntime` failed suite-wide. The fixture tolerates exactly
  that route's 502. Fix the stale credentials (or recreate the app
  container with local dev keys) and the tolerance stays harmless.

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

### Agent Notes (2026-10-25, cutover review)

Review pass on the branch: unit suite base→branch is 4 failed/2131
passed at 713aa2396 → 3 failed/2096 passed (the fourth,
shared/process-designer-localization, fixed by the cutover — mechanism
in shared/TODO.md); no new failures. Baseline finding for this ledger:
test-data/ui-mapping-random.spec.js "produce instance values that
conform to their descriptors (CTS checkValue)" fails pre-existing at
713aa2396. Review fixes on the branch: e2e invitation-page
`waitForLoadState` typo, `artifact` in the check-arch entity-name
allowlist, `queue.confirmDeleteRun` artifact copy (en+ru), a `LAYOUT_DXF`
enum string in the processes availability spec, and the core README
AttachmentKind row.

## File-template fill flows (SPEC §24)

- [ ] WAITING — owner verification: platform seam — a service-backed
  construction executor may return `payload: { base64, mime, name? }`
  beside its `data` fields; the platform stores the bytes in the `files`
  bucket and the created instance carries them as its payload
  (trait-validated; a refusal deletes the blob; an executor payload
  overrides the draft's uploaded one).

  ### Agent Notes (2026-10-25)

  Seam implemented in `server/features/instances/construction-services.js`
  (`payloadFromWire` reused as the single trait validator, exported from
  `service.js`); focused spec `construction-services.spec.js`. Contract
  homes updated: instances README §Service-backed construction, plugin-sdk
  README listing contract (`constructions`).

- [ ] WAITING — owner verification: agent tooling for fill flows —
  `list_actions` rows carry their input contracts (construction mode and
  inputs, inputPolicy fields, run inputs; one row via `actionId`),
  `get_instance` rows carry the file payload reference, and
  `read_instance_file {type, id}` reads any readable file instance's
  payload through the attachment extraction families on both surfaces
  (chat and MCP).

  ### Agent Notes (2026-10-25)

  Implemented in `server/features/agent-bots/tools.js` (tool table row,
  manifest paragraph, read_instance_file paragraph in the agent-bots
  README); focused cases in `tools.spec.js` (payload-ref row, instance
  payload read on both surfaces, payload-less/blob-gone refusals,
  contract projection and single-action read).

  ### Agent Notes (2026-10-25, probe session)

  E2E probe `e2e/agent-mcp-template-fill.mjs` (API-only, node against
  E2E_BASE_URL): composes a fill definition through the MCP tools,
  activates, runs the compiled `content` action, reads the filled
  markdown back through `read_instance_file`. Bare
  `create_process_definition` (name only) now seeds the empty v4 draft;
  the seed's home is `emptyAuthoredDocument` in
  `packages/processes/src/authoring.js`.

- [ ] Documents plugin: xlsx fill service on the new seam (template
  workbook ref + rows/values in, filled workbook payload out); md fill
  rides the same service shape.
- [ ] PDF render service (md/xlsx/dxf → PDF) on the same seam; the
  parse-render engines are recoverable from git history
  (`server/features/artifact-templates/format.js` at 713aa2396,
  retired by the artifact-family cutover).
- [ ] DXF spot placement service (template DXF + referenced DXF payloads →
  composed DXF); the facade nesting → construct-sheet → export flow is the
  reference geometry path.

## Generative UI arrangement foundations (owner direction 2026-10-25)

Law: [SPEC](./SPEC.md) §22.7 records the direction; the design — trait
records, decision procedure, placement slots — is
[shared/ui-mapping/SPEC.md](./shared/ui-mapping/SPEC.md). Engine home
`shared/ui-mapping`, materialization `components/ui-mapping`.

- [x] Data-trait record on every composed region node (SPEC → Data
  traits): `weight` (exists, `estimateRegionWeight`), `breadth`, `volume`,
  `shape`, `filledness` (inert empties exist), `growth` — one compose-time
  pure record in the region tree.
  Landed 2026-10-25: `regionDataTraits`/`shapeFamilyOf` in shared/ui-mapping;
  `composeScreen` nodes carry `dataTraits` (the top-level `weight` field
  folded into it); random-world spec pins the domains over every composed
  node.
- [x] Container-trait seam at the materialization layer (SPEC → Container
  traits): width steps, height boundedness, scroll ownership, density per
  host (page, pane, dialog, popup, mobile tab), measured box over host
  profile; the sanctioned scoped-CSS container homes, `ResponsiveGrid`
  container queries, and measured track engagement materialize the one
  step vocabulary.
  Landed 2026-10-25: `CONTAINER_WIDTH_STEPS` (medium 40 / wide 60 — the
  form grid and record split materialize them) + `HOST_PROFILES` in
  tables.js, pure `resolveContainerTraits`, app seam
  `composables/useContainerTraits.js`; the peer-column engagement in
  RegionChildren measures through it. Height/scroll resolve in the record;
  their materializations are the existing host structures (pane/dialog
  scroll columns).
- [x] The arrangement decision procedure (SPEC → Arrangement decision
  procedure) as ordered total rules over data × container traits, outcomes
  carried per width step so one composed tree serves every host.
  Landed 2026-10-25: `arrangeChildren` rewritten by ordered rule with the
  full-row claim (breadth-`full` siblings claim rows, `fullRow` on the
  columns outcome; full rows stay out of the side rail); the stack
  fallback beside columns carries per-step engagement (CSS container
  steps + the seam's measured grant).
- [x] Placement-aware composition (SPEC → Placement-aware composition):
  slot-picked presentations; nested class refs render as instance chips
  everywhere (`InstanceInlineRef`).
  Landed 2026-10-25: the stub slot renders one compact line (icon, label,
  count, its own create action — RegionBlock `stub` prop, loading/denied/
  error keep RegionDataState); ref fields, relation chips, and table
  relation cells already chip; ObjectSummary instance-ref subfields now
  chip too (FieldControl).
- [x] Pin audit (SPEC → Pins): layout thresholds named in the one
  budget/layout table; type-keyed layout branches, component-local magic
  numbers, and private breakpoints in app code deleted or pinned through
  the declared seams.
  Landed 2026-10-25: `TABLE_VIRTUAL_SCROLL_REM` replaces the table's
  hardcoded 26rem; `LAYOUT.previewBand` replaces five PreviewBox band
  literals; the scoped-CSS homes carry the step materializations
  (60rem = the wide step) with one-fact comments; no type-keyed layout
  branches found (the create-label collapse is the action contract, not
  layout).

Session reads before any code:
[shared/ui-mapping/SPEC.md](./shared/ui-mapping/SPEC.md),
[shared/ui-mapping](./shared/ui-mapping/README.md),
[components/ui-mapping](./components/ui-mapping/README.md),
[assets/tokens](./assets/tokens/README.md), SPEC §22.

### Agent Notes (2026-10-25)

Session `agent/genui-traits-impl-20261025-1752` (worktree
`.agent-worktrees/genui-traits-impl`). All five program items landed;
specs: ui-mapping (91), screen (15), test-data (128 total incl. the new
totality walk), design-system (33), SSR smoke (14) green. Found and fixed
en route: the random-world generator rolled fractional currency values
against the CTS minor-unit law (SPEC §18) — currency quantities now roll
integers; the failure was pre-existing at base on
`test-data/ui-mapping-random.spec.js`. Behavior notes for owner review:
two light table children of a record now stack full-width under the body
(the full-row claim) instead of sharing squeezed columns; inert children
render the compact stub line instead of an empty-state Message.

- [ ] WAITING — owner verification: the five landed items above; check a
  generated detail with mixed children (a table child beside light peers)
  and the stub strip on the live stack.

### Agent Notes (2026-10-25, visible round)

Session `agent/genui-visible-20261025-1812` (worktree
`.agent-worktrees/genui-visible`). The consumer round the foundations
unlock: hosts declare container profiles through the seam
(`provideContainerTraits` — the pane measures its scroll column, EntityPopup
provides the popup profile; `useHostContainerTraits` resolves the host
record, page profile as the providerless default); budgets consume the
width step (compact table columns in narrow/medium hosts —
CollectionTable; compact card facts in narrow hosts — CardGrid,
BoardCollection); screen top-level sections arrange through the one ladder
(`regionsArrangement` = `arrangeChildren`, materialized by RegionChildren
with a `regionProps`/`regionEvents` passthrough; `regionsMode`/
`childrenModeFor` retired with their consumers migrated in the same cut).
Full-row refinement: full-breadth children within the column cap stack,
past it the set tabs (the page-height bound). SPEC addendum in
shared/ui-mapping/SPEC.md (host declaration law, budget law, screen-level
ladder rule). Specs: 160 unit/fixture/random + 14 SSR green; design-system
guard green.

- [ ] WAITING — owner verification (visible round): a typeList screen with
  several sections in a wide pane vs a narrow one (columns engage/shed);
  a table inside a pane or the record popup (compact columns); the record
  popup's card facts.

### Agent Notes (2026-10-25, everyday-page round)

Session `agent/genui-look-20261025-1945` (worktree `.agent-worktrees/genui-look`).
The everyday record page finally moves: SPEC §22.2 fill amendment (content
width is the floor, the host grants growth); `ck-facts-grid` fills in
tracking columns; `ck-body-grid` blocks grow into spare row width; the
record preview renders in the stepped hero band (7/11/14rem by container
step, `LAYOUT.previewHero` + `PreviewBox fill`) instead of the fixed
stamp. The ladder provably engages: the random world's guarantees are
structural now — projection floors (gantt/calendar/board types), two peer
hosts with claimed columnable and heavy peers, the empty type reserved
before claiming and spared by the state matrix; the column-engagement pin
holds across all seeds (previously zero engagements anywhere — the
moderate host's guaranteed table peers were full-breadth by law, so
columns were dead code). En route: several order-dependent generator bugs
fixed (host discovery order, empty-type fallback claiming a peer,
lineage stamps landing under the wrong host). Specs: 129 unit/random +
14 SSR green (board/gantt/calendar/columns/facts-grid/body-grid asserted
in rendered markup); design-system + localization green.

- [ ] WAITING — owner verification (everyday round): any generated record
  page on a wide screen — facts spread, sections grow, preview band
  taller; the showcase (`/test/ui-mapping`) — column arrangements render
  between peer collections.

### Agent Notes (2026-10-25, arrangement rework)

Session `agent/genui-arrangement-rework-20261025-2117` (worktree
`.agent-worktrees/genui-rework`). Owner review found the three earlier
rounds left §22.7's core unimplemented; this session rebuilt it. The
composed tree now carries one arrangement outcome per width step
(`arrangeChildren` → `{ narrow, medium, wide }`); RegionChildren engages
the step the host record grants. Ladder fixes: light peers share columns
at medium/wide (the under-budget stack shortcut is gone); the side rail is
rule 4 at wide over any light non-full child set (it previously required
the stack outcome — inverted order); the dominant child's remainder
carries its own stepped arrangement (previously pinned stack);
`REGION_COLUMNS_MAX` is deleted — any peer count columns, and the measured
engagement (`trackCount × REGION_COLUMN_EARNED_REM`) sheds tracks the box
cannot grant (4+ light peers previously fell through to tabs). Placement
is measured: each column track and the record side column is a
`PlacementBox` providing its own container record, so tables and card
grids inside them take the compact budgets for the width they have; the
routed screen root provides the measured page record when no host
declared one, so narrow viewports and the designer preview arrange
narrow. The record split engages through the seam (RegionBlock's
scoped-CSS home retired; `scripts/ui-visual-inventory.js` exception
tables follow). Component hygiene: SurfaceBody/StatGrid literal utility
strings collapsed into LAYOUT tokens; main.css fill-grid thresholds
(22rem track floor, 46rem content cap) named in their home. Specs:
129 unit/random green with the new totality pin (every composed node
resolves an arrangement at every width step, across all seeds) + 14 SSR,
design-system, check-arch, framework:validate green; check-docs green on
the integration tree (a fresh worktree lacks the `jagua-rs` submodule, so
the guard reports its README link broken there only).

- [ ] WAITING — owner verification (rework round): a record page with two
  or three light child collections on a wide screen (columns below the
  body, side rail for the lightest set), the same record dragged into a
  narrow pane (stacks, compact table columns), and the record popup.

### Agent Notes (2026-10-25, rail budget round)

Owner verdict on the rework: worse in many cases, too little care. Two
causes found. (1) Real defect, fixed: the side rail was a half-page
monster — SIDE_MAX_WEIGHT 16 let 11-16-row sets grab the rail and
REGION_SIDE_SPANS granted 4-6 of 12 tracks (33-50% of the record grid),
starving the record body. The rail is now a minor column: light sets only
(≤ 10 rows), span 3-4 of 12 (≤ a third). Heavier columnable sets column
below the body where peers earn real width. (2) The dev server was
serving a stale `ui-mapping-random` transform — showcase pages composed a
world from the pre-everyday-round vocabulary ("Tin Riddles" names removed
by 2544b7068) 90 minutes after that merge, with the on-disk file
byte-identical to the host; `docker compose restart app` cleared it. Any
owner verdict rendered between the everyday-round merge and the restart
partly judged a frankenbuild. Verification this round is visual, not just
spec-based: per-section showcase screenshots (side span 3 beside the
body, columns pairs below, tabs for heavy tables) at
`.playwright/genui2-*.png`, plus a real org record page; the look probes
live at `e2e/zz-genui-look-probe*.spec.js`.

- [ ] WAITING — owner verification (rail round): record pages on a wide
  screen — the rail reads as a minor column (~quarter page), record body
  keeps its fact columns; if anything still looks wrong, name the record
  and width.

## Generated UI language (owner direction 2026-10-26)

Law: the generative UI task is to define the generated UI language —
foundations, atomic elements, and the procedural rules that compose
layouts. The canonical definition is
[shared/ui-mapping/SPEC.md](./shared/ui-mapping/SPEC.md) → Layout
language; root SPEC §22.7 delegates to it. The ui-mapping subsystem is
the instrument: edit it to fix bugs or to match the defined contracts.

- [x] The language defined: two trait records as the only decision inputs;
  a nine-atom closed vocabulary (`stack`, `row`, `grid` with
  earned/floor/steps track derivations, `band`, `well`, `tabs`,
  `placement`, `stub`, `pack`) plus the ambient sets atoms compose under
  (cells, clamps, chrome, data-driven geometry); nine composition rules
  (value cells, fact grammar, open sections, chip rows, the body floor
  grid, the record ladder, the screen ladder, scroll ownership, placement
  sizing).
  Landed 2026-10-26: SPEC → Layout language; `LAYOUT_ATOMS`/`LAYOUT_AMBIENT`
  registries in tables.js assign every LAYOUT recipe to its atom or set;
  the engine spec pins the partition and the nine-atom set — the
  vocabulary is closed by guard.
- [ ] WAITING — owner verification: the atom set and the composition
  rules in shared/ui-mapping/SPEC.md → Layout language; a recipe the
  vocabulary cannot express is a pin to record there.

### Agent Notes (2026-10-26, language round)

Session `agent/ui-language-20261026-0005` (worktree
`.agent-worktrees/ui-language`). The language is now named and guarded
where the mechanics lived scattered: the LAYOUT recipes were already
atom instances in practice — the registries make the assignment explicit
and the spec pins that nothing enters LAYOUT outside the vocabulary. No
component behavior changed; the definition, the registries, and the
partition pin are the whole delta. Specs: 92 engine green; design-system
guard green.

## Agent vocabulary construction modes (SPEC §3)
- [ ] WAITING — owner verification: the authoring vocabulary serves
  per-type construction modes with defaults (`detail: 'construction'`)
  off the process-definitions projection; the guide's configure law
  points at it.

### Agent Notes (2026-10-26, agent/construction-detail-20261026-0833)
- Served `domain.construction` rows `{modes, defaultMode}` through
  `listConstructionModes`; dialog-shaped `inputs`/`modeInputs` stay
  designer-side (construction.inputs derives from declared fields).
- Validation results in the session handoff report.

## Arrangement foundations restored (owner direction 2026-10-26)

The rollback of 10:08 is itself reverted on the owner's direction: the
SPEC §22.7 law, `shared/ui-mapping/SPEC.md`, the traits/atoms engine,
the container-trait seam (`useContainerTraits`), `PlacementBox`, and the
random-world totality specs stand again. The owner's 2026-10-26 tabs
direction is integrated into the restored ladder: tabs sit at any tree
level; a tab arrangement at a step excludes tabs in its descendants at
that step (`arrangeChildren` carries a per-step `insideTabs` context;
`withArrangement` threads it top down).

- [ ] WAITING — owner verification: record pages and section screens on
  a wide host — the side rail, peer columns, and weight-ordered tabs
  compose from content; nothing under a tab tabs again; the showcase at
  `/test/ui-mapping` reads per the restored SPEC.

### Agent Notes (2026-10-26, agent/genui-restore-20261026-1219)
- `git revert` of the rollback commit `5d96bcc88`, conflicts resolved
  toward the program with the tabs law re-applied on top
  (`arrangeForStep(childRegions, step, insideTabs)`, `TAB_ANCESTOR_NONE`).
- The 11:52 tabs session's flat-ladder engine is superseded by the
  restored stepped engine; its SPEC 22.1/22.3/22.6 wording amendments
  stand.
- Specs: 118 green across `shared/ui-mapping/` and the random-world
  totality spec; guards in the session handoff report.

## Arrangement engaged on real screens (verification 2026-10-26)

The restored program verified against live surfaces, structure-dumped
per width step (browser probes; the model-side artifact is JSON, the
screenshots ride beside):

- Showcase (`/test/ui-mapping`): at 1680px a record page carries the
  weight-proportional `9fr/3fr` body + side-rail split, weight-ordered
  tabs, the facts/body fill grids, and a packed inert stub; at 480px the
  split and peer columns disengage — one composed tree, re-engaged by
  host width.
- Real workspace (seeded org process: a group type with two child
  collections): the heavy record (12+12 children) tabs its collections
  in weight order with resolved type labels and tables inside the
  panels; the light record (1+1) rides the `9fr/3fr` side rail. Live
  pane host, live instances, live compiled screen.
- Probes: `e2e/zz-genui-structure-probe.spec.js` (width steps) and
  `e2e/zz-genui-real-arrangement.spec.js` (seeded real path); artifacts
  `.playwright/genui-structure.json`, `.playwright/genui-real-structure.json`.
- Probe pitfall recorded: `executeAction` silently drops unknown payload
  keys — a child create binds its parent only through the declared
  edge's `lineageKey` (`lineage.<lineageKey>`), discovered by reading the
  stored children edges, not the action's graph input list.

## Procedural create-action names (owner direction 2026-10-26)

Generated create actions render as icon buttons and carry procedural
names (root SPEC §4): an authored label wins; a generic one derives
`New <Type>` and folds a distinguishing construction mode —
`New <Type> from <Mode>`. A collection offering several creates for one
type renders one create control; its form opens with the creation-mode
selection followed by the selected mode's inputs.

- [ ] WAITING — owner verification: multi-mode create captions on every
  action surface and the mode-selecting create dialog.

### Agent Notes (2026-10-26, agent/create-action-names-20261026-1430)

- Caption law single-homed in the processes package: `creationModeLabel`
  derives the mode display name (`convertDxf` → `Convert Dxf`); the
  compiler's `displayActionLabel` folds a distinguishing construction
  mode into generic create captions (`Create <Type> from <Mode>`), and
  `projectUiAction` translates that family to the manifest vocabulary
  (`New <Type> from <Mode>`); authored labels keep winning verbatim.
- `createActionControls` (shared/ui-mapping) collapses same-type creates
  to one control; RegionBlock's toolbar and stub line render it, the
  sibling group rides the run context, and the engine's create dialog
  opens over the group with a leading creation-mode row (`Select`,
  options from `creationModeLabel`; switching reseeds the draft; the
  dialog header carries the selected action's caption). A grouped create
  opens its dialog whatever the lead action's launch.
- Drive-by: `instance-select.spec.js`'s enum-select allowance was already
  red at base (ChatComposer, ChatSearchPanel import `primevue/select`);
  both added beside the new creation-mode row entry, and the Select-law
  sentences in components/ui-mapping + components/shared READMEs now
  state the allowance.
- Specs: ui-contract (captions), ui-mapping (controls), 917 tests across
  shared/components/processes/composables green except the pre-existing
  `useProcessDesignerNodeSync` legacy-draft failure (reproduced at base);
  SSR smoke 16 green; check-arch, framework:validate green; docs guard
  reports only the pre-existing `workers/nesting/jagua-rs` submodule
  link (submodule uninitialized in worktrees).
- Visual verification of the mode-selecting dialog needs an authored
  definition with two same-type create actions (cassette-design carries
  upload/bake/convertDxf modes) — left to the owner against the running
  dev stack after merge.

### Agent Notes (2026-10-26, agent/genui-rail-20261026-1617 + close)

- Owner defect "items hang in right column when nothing else exists":
  fixed and geometry-verified. The side rail now engages only when the
  record body carries at least the rail's weight (SPEC rule 4); a thin
  body keeps its children below at full width. Live pane measurement
  after the fix: the thin record renders one full-width block
  (x279 w1378 h170) — no split, no hanging column; the heavy record
  (12+12 children) keeps weight-ordered tabs.
- Screen-level inert partition implemented (SPEC rule 1): a section
  resolved empty leaves the ladder as a compact stub strip below the
  arranged sections; loading/denied/error sections keep their state
  surfaces. Empty home sections no longer claim column/tab tracks.
- Probe false alarm recorded: icon-only tabs with empty textContent in
  desktop dumps are the hidden mobile bottom bar (labels live on
  aria-label/title) — a layout law, not a defect.
- Specs 122 green (rail gate pins incl. thin-body negative, screen
  stub partition, random-world totality over the new shape); guards:
  arch, docs, SSR smoke, design-system pass.

### Agent Notes (2026-10-26, agent/create-inputgroup-20261026-1655)

Owner rework of the UI half: the mode selection lives in the toolbar
control, as the direction named it — `CreateControl.vue` renders one
PrimeVue `InputGroup` (creation-mode `Select` + create `ActionButton`)
for a same-type create group; the button dispatches the selected action
through the ordinary launch contract (params dialog, or direct run for a
mode without prompted inputs). The dialog's mode row and the engine's
group branch from the first session are removed; `createActionControls`,
the caption law, and the i18n key stand. The PrimeVue MCP was consulted
for the InputGroup composition this round (buttons as direct group
children; Select `size`/`ariaLabel`).

## Sidebar explorer carries one hierarchy (owner direction 2026-10-26)

Root SPEC §4: an instance lists beside its type node only while no loaded
instance parents it — parented children nest beneath their parent rows,
and relation-linked children nest with the link glyph.

- [ ] WAITING — owner verification: the seeded org's sidebar (queue with
  its four child types) — child instances nest beneath their parent
  instances, the child type nodes keep unparented rows only, and
  relation-nested rows wear the link glyph.

### Agent Notes (2026-10-26, agent/sidebar-hierarchy-20261026-1735)

- The malformed panel was the README's own law violated in code: "a child
  never appears both beneath its parent and beside it" was cut only for
  self-containment (`selfContainmentKeys`); a child type's home section
  listed every instance under its abstract type node. The cut is now
  `parentContainmentEdges` over the merged containment (self pairs and
  cross-type children edges alike) against a loaded pool of every
  section's raw items plus the lazy pool — cut children re-enter beneath
  their parent row through the existing lazy child load, the same
  mechanics the self-recursive case always used.
- Relation-nested rows: `entityNode` marks its relation children
  (`data.linked`) and `entityPanelItem` renders `pi pi-link` in place of
  the type glyph.
- The source-level root cuts stand: `filterRootSourceItems`
  (composables README) and `shouldRenderHomeSection` — both key off
  compiled `lineageBindings`, which the seeded child-type sections carry
  none of; the component-level cut closes that gap.
- Specs: components/generated 45 green; SSR smoke 16; arch guard green;
  docs guard reports only the pre-existing jagua-rs submodule link; the
  one failing test repo-wide is the pre-existing
  `useProcessDesignerNodeSync` legacy-draft spec.

### Agent Notes (2026-10-26, agent/sidebar-hierarchy-2-20261026-1805)

- Owner follow-up ("didn't fix"): the containment root-cut was correct
  but addressed the wrong shape — a mounted-model reproduction spec
  (`sidebar-explorer.spec.js`, renderToString over the real component
  with mocked stores) proved the cut works, and the live nesting under
  parent instances is relation-driven. The actual defect is the nested
  child-type row carrying its whole section list beside the instance
  tree.
- `typeNode` now attaches home-section instances to ROOT panels only; a
  nested child-type row opens its typeList screen with no instance rows.
  The reproduction spec pins the law (root panel rows, child row without
  rows); the cross-type root cut stays (it is what lets section-loaded
  children re-enter beneath parent rows).
