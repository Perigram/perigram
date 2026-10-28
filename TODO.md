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

- [ ] WAITING — owner verification: documents fills — `plugin.documents.fill`
  (markdown `{key}` substitution; xlsx `{key}` cells plus `{#key}`/`{/key}`
  repeated row sections; PDF template token masking/redraw) and
  `plugin.documents.render-pdf` (markdown/xlsx/csv/image/dxf → PDF) bound
  as `fill` constructions on `text-document`/`xlsx-workbook`/`pdf-document`
  and a `render` construction on `pdf-document`; documents requires
  tech-drawing for the `dxf-source` render source.

  ### Agent Notes (2026-10-26)

  `workers/documents/fill.js` (engines, PT Sans OFL fonts embedded via
  `@pdf-lib/fontkit`), service dispatch in `workers/documents/services.js`,
  listing v2 (services, constructions, requires). Token law and traps in
  the plugin README `## Template fills`. Focused spec
  `workers/documents/fill.spec.js` (19 cases).

  ### Agent Notes (2026-10-27, ledger repair)

  This box was deleted by the 2026-10-26 12:30 SPEC-restore session, which
  rewrote the section to its pre-landing shape; the template editors
  program then re-listed the landed engines as open steps. Restored; the
  program's stale steps (documents fill engines, PDF render engine, PDF
  template flow, per-kind field whitelist) close below or fold here.

- [ ] WAITING — owner verification: render-mode rename — the cassette-design
  construct renames `bake` → `render` (SPEC §24 two-mode law; facade v20);
  the engine and endpoint keep the bake id, the place-dxf precedent.

  ### Agent Notes (2026-10-27)

  Listing v20 (operator + constructions binding), Org1 seed authoring
  (`test-data/order-process-authoring.js` mode `render`). Authored
  definitions in other orgs carrying `mode: 'bake'` re-author or upgrade —
  the place→fill rename accepted the same exposure.

- [ ] WAITING — owner verification: sheet-design parts maintenance — editor
  saves commit the typed `parts` relation beside the geometry (SPEC §24
  app-canon law).

  ### Agent Notes (2026-10-27)

  `recomputeSheetLayout` returns `parts` (one flat ref per placement,
  `cassettePartsList` single-homed in `surfaces/lib/sheetLayout.js`,
  consumed by both the editor save and the `construct-sheet` executor
  path); the editor patches `{ geometry, parts }`. The stale
  `cassetteDesigns` local naming in the recompute died with it.

- [x] DXF spot placement engine (template DXF + referenced DXF payloads →
  composed DXF) — `place-dxf` in the tech-drawing executor; the facade
  nesting → construct-sheet → export flow is the reference geometry path.
  Landed bound to a bespoke `place` construct; superceded by the
  unification below (listing v3 renames the construct onto `fill`, the
  engine and its endpoint stay `place-dxf`).
- [x] Fill-mode unification (SPEC §24): the template construct is `fill`
  everywhere. Rename tech-drawing's construct onto it (listing v3), migrate
  authored `place` constructs with their definitions, and land documents'
  xlsx/md engines on the same mode beside the future PDF engine. Docs:
  tech-drawing README, plugin-sdk listing contract.
  Landed 2026-10-27 (session `agent/fill-mode-20261027`): tech-drawing v3
  renamed onto `fill` (engine and endpoint stay `place-dxf`), projection
  fixture and the create-dialog e2e migrated, Org1 upgraded, SPEC §24
  carries the mode law. Residue: operator input labels landed with v4
  (`Template`/`Parts`) beside `descriptor.label` support in the domain
  projection. The 2026-10-27 render amendment completes the vocabulary:
  `render` for derivations (cassette bake, PDF render), `fill` for
  template fills.
- [ ] Action ids are one org-wide namespace: two active definitions sharing
  a construct node id cannot coexist, and activation refuses with a
  dangling-edge error naming the other definition's graph instead of the
  collision. Surface the collision as its own diagnostic (or
  definition-qualify action ids in the manifest).
- [ ] Template editors program (SPEC §24 engines + §20 editor law):
  every template type rides the same three pieces — an editor binding in
  the listing, a revision scope on the type, and the revisioned payload
  channel for saves and replacement. Ordered steps:
  - [ ] WAITING — Revision scope on template types: dxf-source declares
    `revisions: "geometry"` (tech-drawing v5); the revisioned payload
    channel then serves replace-in-place — new bytes onto the same
    instance, so a re-authored template keeps its identity, its pins, and
    its history.

    ### Agent Notes (2026-10-27)

    Declared on `dxf-source` in the tech-drawing listing (v5). The channel
    itself is generic machinery (instance-revisions + the payload
    patch law); the file-detail replace affordance rides the lifecycle
    step below.
  - [ ] WAITING — owner verification: DXF editor surface, marker-first:
    editor binding for dxf-source; a surface module over the MLightCAD
    runtime homed in this plugin (the cross-plugin vendor dependency
    serves facade's cassette designer from the same bundle) that opens
    the template payload on the CAD canvas, authors and renames
    `{spot:<name>}` anchors — the part-matching vocabulary, authored
    where the drawing is drawn — and saves through the revisioned
    channel; full editing grows on the same surface.

    ### Agent Notes (2026-10-27)

    `surfaces/dxf-editor.mjs` (surface contract 2, `dxf-source` edit
    binding; tech-drawing v7 with the own-scope `cad-viewer` dependency).
    The canvas opens the template read-only through
    `AcApDocManager.openDocument`; the marker panel adds (name + X/Y,
    height from the drawing's own markers or extents), renames, and
    deletes anchors; every edit splices the DXF text and re-opens, so
    the canvas always shows the saved truth; saves ride
    `saveDocument` → the revisioned payload channel. The pair model and
    marker ops live in `dxf-markers.js`, single-homed with the placement
    engine (placement.js imports them). Focused spec
    `dxf-markers.spec.js` (7 cases incl. the authored-template
    round-trip through `composeDxfPlacement`). Canvas-click point
    picking and full geometry editing grow on the same surface.

    ### Agent Notes (2026-10-28, layer law)

    Strict CAD viewers resolve each entity's layer against the LAYER
    table; tables-less templates rendered a blank canvas (console:
    `layer 'FRAME' doesn't exist`). `withLayerTable` (dxf-markers.js)
    builds the canvas copy with every referenced layer plus layer 0
    declared over the CONTINUOUS linetype — existing tables gain only
    missing records; saves keep the authored bytes. Spec grows to 10
    cases; the rails e2e fails on any layer-resolution console error.
  - [ ] Fill dialog general rails (owner direction 2026-10-28): part
    inputs pick, create through the accepted type's declared creation
    mode, and open the picked instance's editor when its type binds one;
    the dialog previews the composed result through the created type's
    payload preview over the same construction service, persisting
    nothing. Ordered steps:
    - [ ] WAITING — Anchor read single-homing: the `{spot:}` parse law
      lives in the plugin's `dxf-markers.js`; the app-side pin renderer
      reads it through the served editor surface module.
    - [ ] WAITING — Construction preview seam: a non-persisting service
      invocation (`{ mode, draft }` → `{ payload, fields, failures }`).
    - [ ] WAITING — Rich part rows: create affordances dispatch by
      creation protocol (the compiled upload create runs inline, the
      editor protocol opens the blank tab, every other compiled create
      opens the nested dialog); edit affordance rides the file-surface
      registry.
    - [ ] WAITING — Preview pane in the create dialog over the composed
      payload.
    - [ ] WAITING — One fill-dialog shell (owner direction 2026-10-28):
      the form pane and the preview pane compose side by side in one
      wide dialog for every fill type, the preview rendering through the
      created type's payload preview mode.

    ### Agent Notes (2026-10-28, shell)

    Session `agent/fill-dialog-body-20261028-1840`. `FillDialogBody`
    widens the create dialog (lg) and splits the form pane from the
    preview pane when the created type is payload-bearing and the action
    carries a construction mode; the shell renders transparent
    otherwise. En route, two rails gaps died: operator data inputs fell
    through the row resolver (a json `values` map never rendered — the
    generic branch maps the compiled `object` kind onto the json
    editor), and the documents fill inputs lacked labels (listing v4,
    re-seed the catalog for existing stacks). The documents markdown
    fill rides the same rails as the DXF fill (`documents-fill-dialog`
    spec: the preview renders in the text mode, the composed markdown
    round-trips; artifact `.playwright/md-fill-composed.md`). Focused:
    ui-mapping 107, SSR smoke, arch + docs + framework guards; e2e —
    both fill dialogs 4/4, md-editor-repair 4/4, plugin-surface 1/1
    (one cold-rebuild stall after the merge re-ran green warm).

    ### Agent Notes (2026-10-28)

    Session `agent/dxf-editor-20261028-1525`. Landed: `spotNamesOf`
    homes in `workers/tech-drawing/dxf-markers.js`, re-exported by the
    dxf-editor surface module — `SpotPartsRow` imports the served module
    URL and `shared/dxf-spots.js` is deleted. The DXF editor picks
    anchor coordinates by canvas click (the engine's view transforms,
    six decimals) and the reset-view button wears a fit icon.
    `POST /api/instances/:type/construction-preview` (write-gated, 204
    unbound) answers `{ payload, fields }` beside the structured
    refusal; `ConstructionPreview` debounces the dialog draft into it
    and renders the payload through the created type's preview mode.
    `RefRowActions` renders beside reference rows: the compiled
    upload-mode create runs inline over the files channel (the bare
    create transport refuses construction-declaring types), the editor
    protocol opens the blank page, other compiled creates open the
    nested dialog in `GeneratedMappingScreen`, and the picked
    instance's editor opens through the served registry. Focused:
    construction-services spec 23/23 (five preview cases), module
    imports, ui-mapping 107, SSR smoke 19, arch + docs + framework
    guards green; e2e — the fill-dialog file 3/3 incl. the rails test
    (preview pane renders the composed DXF, inline upload create,
    assignment, editor click-to-place, revisioned save round-trip;
    artifacts `.playwright/rails-preview-composed.dxf`,
    `.playwright/rails-template-reauthored.dxf`), md-editor-repair 4/4,
    plugin-surface 1/1.
  - [ ] WAITING — Create-dialog refusal surfacing: a construction service
    answers `{ failures: [...] }` (each failure naming its offender) and
    the dialog renders the named offenders (SPEC §24 law).

    ### Agent Notes (2026-10-27)

    Executor seam: tech-drawing `place-dxf` and documents `fill` return
    `{ failures: [{ message, name? }] }` for offender-named refusals
    (unmatched markers, unplaced parts, unknown tokens); platform
    `applyConstructionService` refuses with the structured body; the
    create dialog renders the list. Focused specs: construction
    services, both executors' engine specs.
  - [ ] WAITING — owner verification: Template lifecycle: replacement is
    the generic file-detail affordance on every revision-scoped file type
    (new bytes through the revisioned payload channel); retirement is a
    compiled remove construct owned by the process definition that
    stations the type.

    ### Agent Notes (2026-10-28, spot assignment)

    Owner direction (2026-10-28): name-matching as the only fill path
    forced part renames — degenerate. Landed: the fill operator's parts
    input carries the `spot-parts` control pin (tech-drawing v8); the
    dialog lists the picked template's anchors and picks any part per
    anchor (`SpotPartsRow` over `shared/dxf-spots.js`), name-equal parts
    prefilled; the assignment travels as `{ id, spot }` beside the
    resolved ref and the placement engine places explicit assignments,
    falling back to name matching for bare refs (unknown-spot, double,
    and claimed-name collisions join the structured refusal). En route,
    a pre-existing broadcast defect died: the mutation runner aligned
    every input per item, so a multi-part fill invoked the construct
    once per part — typeList construction inputs now solve as one value.
    Validation: 868 tests green across the touched planes (the 5
    fact-display failures pre-exist on local); fill-dialog e2e 2/2 on
    the live stack (assignment surface + API refusal); live-verified in
    Org1 — mismatched names composed through explicit assignments
    (artifact `.playwright/org1-assigned-composed.dxf`).

    ### Agent Notes (2026-10-27, replacement half)

    `ReplacePayloadAction` renders in every record header whose type
    declares payload + revisions (SPEC §24): new bytes through the
    revisioned `PUT /api/instances/:type/:id/payload` channel — the
    record keeps identity, pins, and history. Write-gated like the editor
    action (`resolveTypeFeature` + the shared grant evaluator); accept
    list narrows to the declared MIME set when it carries no wildcards;
    saves emit the shared instance event. Retirement (the remove
    construct) stays open — the compiler already compiles `cts.remove`
    as the admin-only manual delete action; verification below.
  Landed beside the program: the per-kind field whitelist (every gesture
  value validates against the node contract table — configure refuses
  `inputDefaults`, `setInputDefault` refuses undeclared sockets,
  compile-side normalize drops stray defaults, `b6cb68051`); the
  documents engines and the PDF template flow (the WAITING box above).
  Beside the program: the pinned-entity-ref palette source and the
  action-id collision diagnostic (tracked above) are the
  definition-design pieces the program composes with.
- [ ] Revisioned references (SPEC §24 version-fabric law, owner
  direction 2026-10-27): revisions are the version fabric — every file
  versions its content, derived records pin the revision they were
  derived from, and consumers read the pin. Ordered steps:
  - [ ] WAITING — owner verification: Every file type declares a revision
    scope (payload/geometry/content); types missing one gain it in their
    listings.
  - [ ] WAITING — owner verification: Ref fields carry revision pinning:
    a stored ref either pins the source revision or follows latest;
    pinning rides the ref shape, and pickers/ref chips surface which.
  - [ ] WAITING — owner verification: Construction-time ref resolution
    stamps the resolved revision beside the stored ref on the derived
    record.
  - [ ] WAITING — owner verification: Editor saves and payload uploads
    bump the source revision; every consuming flow (fills, renders,
    nesting, exports, previews) reads the pinned revision.
  - [ ] WAITING — owner verification: Re-derive rides the compiled
    construct action (owner decision 2026-10-27): a re-run over the
    stored inputs executes against current referenced revisions and
    updates the record's pins and derived fields/payload — one mechanism
    for "re-render when the template changed", "re-fill with new values",
    "re-derive the sheet when cassettes changed".

    ### Agent Notes (2026-10-27, stack round)

    The live-stack e2e round (session `agent/e2e-refusal-20261027-2310`)
    verified the fabric end to end: the cassette upload minted geometry
    revision 1 and the bake pinned it — `provenance.sources` carries
    `{ type: cassette, id, revision: revision:cassette:<id>:geometry:1 }`
    (order-process pins the exact shape). En route repairs: the
    mutation-error serializer dropped refusal bodies and the action API
    returned the failure report as a settled result, so the create dialog
    closed over silent refusals — both fixed (the serializer carries
    `data.failures`; the action run refuses with the first mutation
    failure's body); the fill-dialog e2e speaks the current upload naming
    law (records name from the payload reference's file name — the
    name-ghost session's contract, untested until this round) and gains
    the refusal leg; every documents-first spec install order now
    installs tech-drawing first (documents v2 requires it; the catalog
    re-seed surfaced the drift — the catalog had not been re-seeded since
    v1). tech-drawing-fill-dialog 2/2 and order-process green on the
    stack; md-editor-repair and process-generated-screen 14/15 green.

  ### Agent Notes (2026-10-27, revision fabric session)

  Session `agent/rev-fabric-20261027-2155` (worktree
  `.agent-worktrees/rev-fabric`). All five steps landed:

  - Scopes: documents v3 (image, pdf-document, xlsx-workbook,
    docx-document → `content`), tech-drawing v6 (svg-file → `geometry`).
    Every payload-bearing file type now declares a scope. Payload-less
    catalog types (pen-template, layer-standard, color) stay unscoped:
    their content is fields and no channel writes field revisions today.
  - Ref shape: CTS `checkValue` accepts `{ type, id, revision? }`
    (absent pin follows latest); CTS SPEC §2 carries the wire law.
  - Stamping: `applyConstructionService` resolves each ref's pin
    (`getCurrentForEntity` on the source type's scope) and stamps
    declared ref/list-of-ref fields with the pinned object plus every
    causal ref in `provenance.sources` (the source slot survives
    `provenanceFromWire`). Undeclared operator inputs (documents'
    template/values) pin in provenance only — the closed row stays
    closed.
  - Bumps: `recordPayloadRevision` is the one mint home (creation
    `created`, replace `payload-replaced`, re-derive `rederived`);
    editor saves already rode the revisioned PUT payload channel.
    Pinned reads: `resolveRefValue` reads the frozen bytes through
    `pinnedRevisionFile`; a stored pin whose revision is gone refuses.
  - Re-derive: `rederive` on the instance service rebuilds the
    stored-inputs draft (`storedConstructionDraft`: declared ref fields
    with pins, replay parameters from provenance, source pins recovered
    from provenance.sources) and patches fields/payload/provenance. The
    compiled construct action is the entry: `rerun: true` beside the
    constructed record's instanceId on the action-run transport skips
    the graph and re-derives (explicit flag — a context instance alone
    stays parent context for a fresh create). `constructRerunAction`
    derives the refresh affordance on a constructed record's detail
    header and rows; the chip lock glyph surfaces pins
    (`common.pinnedRevision`).
  - Validation: 917 tests green across cts/processes/ui-mapping/
    instances/plugins/documents/tech-drawing; both listings validate
    (`perigram-plugin validate`); check-arch, framework:validate, SSR
    smoke 16 green; check-docs reports only the pre-existing worktree
    jagua-rs link. Live-stack verification pending (the re-derive run
    and the pinned chip render on the next stack pass).

- [ ] WAITING — owner verification: Pinned-entity-ref palette source: a
  `source` node emitting one authored entityRef (the "select exact
  instance" producer), so a graph can wire a pinned record into any
  construct's ref sockets. Authored socket defaults already supply ref
  inputs today (supplied fields drop out of the create dialog); the
  palette node is the visible authoring surface for the same law.

  ### Agent Notes (2026-10-28)

  The law pre-existed: a `source.literalItem` with an `entityRef` output
  type already carries the authored pick (`seedLiteralEntityBinding`
  seeds the type, the canvas node renders the type select beside
  `TypedValueControl`'s InstanceSelect — ids are never typed by hand),
  and the construct seam consumes the wired ref object (revision pinning
  stamps it at construction, SPEC §24). The palette entry is the whole
  delta: `pinnedEntity` in the `instances` group drops the literal
  pre-typed `entityRef` (`preset.type.base`), so the author picks the
  type and the exact instance on the node. Spec pins: the designer
  palette pin and the round-trip species pin carry the item.
- [ ] WAITING — owner verification: cross-plugin vendor dependency — the
  MLightCAD CAD runtime moves to tech-drawing and the facade cassette
  designer consumes it through a declared `plugin:tech-drawing/…`
  dependency (SPEC §20 law above).

  ### Agent Notes (2026-10-27)

  Bundle moved to `workers/tech-drawing/assets/vendor/cad-viewer/` (served
  by its executor); facade listing declares
  `{ name: 'cad-viewer', module: 'plugin:tech-drawing/assets/vendor/cad-viewer/cad-viewer.mjs' }`
  and the sketch editor lazy-imports the bare `cad-viewer`. Mechanism:
  `parseListing` admits `plugin:<id><path>` modules when `<id>` is in
  `requires`; the module proxy rewrites the bare import to the required
  plugin's proxied scope; the surface check exempts cross-plugin modules
  from the own-root existence rule. Focused specs: sdk (validation),
  plugins (proxy rewrite).

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

### Agent Notes (2026-10-26, agent/genui-owner-review-20261026)

- The pane record page's missing header was SPEC §22.3's own wording
  ("title surfaces stay with the pane strip") — the owner review
  amends it: the record identity block renders in every host;
  `hideTitle` and the state-only header branch are gone. The routed
  typeList now passes `pane-hosted` (its StandardPage titles it), so a
  list screen's label renders exactly once through its host; the list
  header's count became a quiet muted figure.
- The tabs/columns/mixed duplication was a broken v-if/v-else chain in
  RegionChildren: the `pack` branch started a second chain, so every
  arranged outcome rendered beside the stacked fallback. Live evidence
  before the fix: a record with two 12-row child collections rendered
  four tables (`.playwright/genui-real-structure.json`).
- The cross-cut flag composes at compose-time (`crossCut` on the node);
  CardGrid/CollectionTable consume it as a `parented` prop, and scoped
  lists skip the lazy parent-type overlay load entirely.
- The identifier exclusion moved to the group projection in
  SurfaceDetailBody (the structural-section leak for long-string
  identifiers) and to `factsFor` in the design-system fact contract
  (compact/entity cards).
- GalleryCollection: raw PrimeVue Galleria (item band + caption link +
  thumbnail strip); thumbnail count derives from the container record;
  the item band steps with its container (`.ck-gallery-item` in
  main.css). The matcher takes `gallery: true` (visual payload preview)
  at large size; `VISUAL_PREVIEW_MODES` is the signal home. The
  random-world volume file type deterministically carries a visual
  preview — a late `rnd.pick` shifted the seeded world and tripped the
  SSR id-leak smoke.
- Spacing: density tiers on HOST_PROFILES, narrow-box cap at 0.75,
  `spacingCoefficientFor(container, screenWeight)` tightens past
  `SPACING_WEIGHT_AT`; GeneratedMappingScreen derives the coefficient
  (explicit `spacingScale` overrides); `GAP_BY_LEVEL` covers depth 2.
- InstanceInlineRef chips and compact micro cards carry
  `hover:bg-subtle` beside the pointer cursor.
- Specs: ui-mapping 131, random world 10, fixtures/module-imports,
  design-system + framework-packages 37, SSR smoke 16, localization 4,
  check-arch, framework:validate, docs:validate (the worktree-only
  jagua-rs link aside) — all green. Live re-verification probe:
  `e2e/zz-genui-owner-review-probe.spec.js` (untracked, per the
  zz-probe convention).

### Agent Notes (2026-10-26, owner-review closeout)

- Follow-up fix `2f864c7d0`: the derived coefficient exposed a latent
  trap — the provided rhythm set was a reactive proxy over the FROZEN
  scale table, so the first coefficient change (pool load crossing the
  weight budget) threw "Cannot assign to read only property 'stack'"
  and 500ed the routed detail. The provided set is a mutable copy now;
  the showcase slider path shared the same landmine.
- Live verification on the dev stack
  (`.playwright/genui-review-after.json`, screenshots beside):
  routed heavy record — header title present, 2 child collections
  render 2 tables inside weight-ordered tabs (was 4 pre-fix), zero
  parent tokens inside the parent detail; unscoped child-type list —
  9/10 rows carry the parent token (the tenth is the other project's
  child); workspace pane detail — full header with the record title,
  same single-outcome tabs.
- Probes: `e2e/zz-genui-owner-review-probe.spec.js` (untracked,
  zz-convention), artifacts `.playwright/genui-review-after*`.

### Agent Notes (2026-10-26, agent/sidebar-types-gone-20261026-1850)

- Second owner follow-up: the live probe (`e2e/zz-sidebar-hierarchy-probe.spec.js`,
  artifact `.playwright/sidebar-probe.json`) rendered the real seeded
  sidebar — the children edge arrives in the served bundle (scope org,
  lineageKey stamped) and the child type rendered as a bare nested row
  after the previous cut. The owner's law reads stricter: type rows never
  render inside a panel at all.
- `explorerNodes` now panels one per stationed type that no other
  stationed type contains; contained types never panel on their own and
  carry no type row — their instances reach the sidebar beneath their
  parent instances. `typePanelItem` maps entity rows only. The pinned
  mounting spec asserts the panel rows exactly.

## Agent tooling extensions (owner direction 2026-10-27)

SPEC §3 (plugin-declared agent tools, the assistant guide) and §20 (the
listing's `tools` declaration). DWG stays out — the owner decision of
2026-10-13 stands.

- [ ] Listing `tools` declaration: `parseListing` / `normalizeListing` /
  `listing.schema.json` in the plugin SDK, descriptor-to-service binding
  (endpoint mode only), plugin-qualified ids `plugin.<id>.<tool>`; catalog
  publish and install snapshot in the plugins feature (the pinned
  declaration layer); install-gate refusals (unknown service, shadowed
  name). Docs: plugin-sdk and plugins feature READMEs.
- [ ] Catalog composition and dispatch in agent-bots: installed plugins'
  tools compose into `chatToolDescriptors` and `mcpToolDescriptors`
  org-scoped (the `web_search` availability law — an org without the
  install offers them nowhere); `executeTool` dispatches through the
  connector under the delegated principal; focused specs on both surfaces.
  Docs: agent-bots README catalog table.
- [ ] DXF agent tools, the first consumer, on the facade executor's
  vendored DXF engine: a geometry digest read (entities, layers, extents)
  over file-instance payloads and declared transforms, bound as plugin
  tools. Docs: workers/facade README service table.
- [ ] The assistant guide: org settings storage behind the models-screen
  settings gate, the models-screen block beside the search provider, and
  the ride in `runtime.js` `systemPrompt` (platform instructions first,
  guide after) for chat runs and wakes alike. Docs: agent-bots, llm, and
  pages/organization READMEs.

## Design language lands in pixels (owner direction 2026-10-27)

Law: SPEC §4 (type-and-ink ladder). Token home `assets/tokens/index.js`,
preset home `assets/presets/re_l.js` over it, rhythm homes
`shared/ui-mapping/tables.js` and `assets/css/main.css`, guard
`shared/design-system.spec.js`. Owner decisions this session: small tier
15px; values in ink, monochrome language unchanged.

- [x] Small tier 15px: `label` and `technical` roles `0.875rem` →
  `0.9375rem`; PrimeVue small controls (`formField.sm.fontSize`) and
  tags (`tag.root.fontSize`) to `0.9375rem`; small-table body cells
  breathe (`datatable.bodyCell.sm.padding` `0.5rem 0.75rem`).
  Landed 2026-10-27 in `assets/tokens/index.js`.
- [x] Ink ladder: light-scheme text color `surface.700` → `surface.800`,
  `--ck-primary-ink` to zinc-800; muted stays `surface.500`.
  Landed 2026-10-27 in `assets/tokens/index.js`.
- [x] Fact-row recipe: `LAYOUT.labelCell` and the structural-field label
  row in `SurfaceDetailBody` render `text-label text-muted`.
  Landed 2026-10-27 in `shared/ui-mapping/tables.js`,
  `components/ui-mapping/SurfaceDetailBody.vue`.
- [x] Host profiles: `dialog`/`popup` density `1`, and the narrow-box
  density cap removed from `resolveContainerTraits` (it re-tightened
  exactly the popups the profile change relaxed).
  Landed 2026-10-27 in `shared/ui-mapping/tables.js`,
  `shared/ui-mapping/index.js`.
- [x] Guard: `shared/design-system.spec.js` pins the tier size, the ink
  tokens, the label-cell recipe, and the host-profile densities;
  `framework.manifest.json` regenerated (it embeds the design tokens).
- [x] Docs: `assets/tokens/README.md`, `shared/ui-mapping/README.md`,
  `shared/ui-mapping/SPEC.md` match the landed values.

### Agent Notes (2026-10-27, generator consumption audit)

Follow-up audit of what the generator's materializations actually
consume, surface by surface:

- Values land in ink: `FieldControl` renders every value face as
  `text-body`/`text-technical` (inherit), so the `surface.800` ink
  flip reaches table cells, fact rows, card/board facts, dialogs, and
  popups through one token. Muted spans in the materializations are
  labels, placeholders, overflow counts, and axis chrome.
- One defect fixed: the timeline projection rendered a non-openable
  record name as `text-supporting text-muted` — a value muted, now
  `text-body` with the shared clamp recipe.
- The chrome contract was dead and is removed
  (`CHROME_ROLES`/`CHROME_TABLE`/`DEGRADE`/`resolveChrome`, the
  `node.chrome` field, SurfaceBody's chrome/parentRole props and
  Divider branch): no materialization consumed the surface/padding/
  border token names, and `flattened` could never fire (compose
  hardcodes the parent role, nested regions render as sibling cards).
  Surface chrome is owned by the preset component tokens and the
  `LAYOUT` recipes; rhythm by the spacing coefficient. Specs and the
  three contract READMEs updated in the same cut.

### Agent Notes (2026-10-27)

Diagnosis before the change: a computed-style audit of the live
showcase (301 text elements) showed the contract layer never reached
the pixels — half the rendered text muted zinc-500, the 14px tier
split between the app `label` role and PrimeVue small controls, and
popups double-compacted (profile 0.75 plus a narrow-width density cap).
That is why tidy-up passes moved nothing: the levers are global tokens,
and the previous agent work stayed per-surface.

Status: WAITING owner verification. The running dev container serves
the primary checkout; theme tokens bake at boot, so the change is
visible after `docker compose -f docker-compose.dev.yml restart app`
once merged (the primary checkout carries unrelated uncommitted edits,
so the restart is the owner's call).

## Generative UI layout sanity round 1 (owner direction 2026-10-27)

Law: SPEC §22.8. Engine home `shared/ui-mapping`, materializations
`components/ui-mapping`. Owner findings this session: crammed stacks,
stub clutter, bad side-rail splits, kitchen-sink rows, noisy fact
structure, wrong preview bands, dashboard widgets in ordinary records.

- [x] Page rhythm: weight tightening applies to bounded hosts only —
  `spacingCoefficientFor` keeps page hosts at their profile rhythm.
- [x] Stubs render the create affordance alone (packed row, no
  icon-label-count strip) — `RegionBlock` stub branch.
- [x] Side-rail span fallback 5 → 3 (an unspecified rail stays a
  quarter of the record grid) — `RegionBlock` splitTracks.
- [x] Rows carry identity, status, one fact: `ROW_FIELD_BUDGET` max 1,
  relation chips leave the row variant — `tables.js`, `SurfaceBody`.
- [x] Single-group record bodies render no group titles —
  `SurfaceDetailBody`.
- [x] Seeded placeholder preview art removed; payload-less instances
  render the quiet type glyph band — `PreviewBox` (the `seed` prop and
  its callers went with it).
- [x] Dashboard widgets gate on `quantitative` (`typeIsQuantitative`:
  the type's statlike shape): Knob, MeterGroup, Chart, Rating match
  quantitative types alone; plain values elsewhere — `tables.js`,
  `index.js`, `FieldControl`, `InlineField`, and the detail/row
  callers.
- [x] Guards and docs: ui-mapping spec pins updated; ui-mapping and
  components READMEs match.

### Agent Notes (2026-10-27, layout round 1)

Root causes found for the owner's findings: heavy page screens
tightened their own rhythm to the 0.75 coefficient (gap-3 sections on
pages); every empty collection advertised itself with an
icon-label-count strip; a missing side-rail span fell back to 5/12 of
the record grid; rows carried three fields plus relation chips; every
fact group printed its title; payload-less image/geometry types
rendered invented seeded SVG art; and the widget derivations fired on
field shape alone, putting dials and charts inside ordinary text
records.

Status: WAITING owner verification — live look at the showcase
(`/test/ui-mapping`) and real record pages after the app picks up the
change. Expect a round 2 from what still reads wrong.

## Generative UI layout sanity round 2 (owner direction 2026-10-27)

Law: SPEC §22.8 (carousel retired; section labels in natural case).
Owner findings: the galleria projection is the wrong component for
in-page collections; uppercase section labels read as artificial.

- [x] The `gallery` projection is retired: matcher entry, layout
  vocabulary (`galleryItem`/`galleryThumb`), `GalleryCollection.vue`,
  the `ck-gallery` styles, `VISUAL_PREVIEW_MODES` (its dominance signal,
  no remaining consumer), the random-world gallery guarantee, and the
  declaration inspector's redundant union. Preview-dominant collections
  render the card grid.
- [x] Section labels render in natural case: `sectionTitle` drops the
  `uppercase` stamp across `LAYOUT` and every spacing scale; the
  entity-card section label the same.

### Agent Notes (2026-10-27, round 2)

Status: WAITING owner verification.

## Generative UI layout sanity round 3 (owner direction 2026-10-27)

Law: SPEC §22.8 (round-3 amendments). Owner findings this session:
array values stacked mid-line, uppercase remnant in the ui-lab chrome,
file chips rendering MIME strings and instance chips borderless against
the chat standard, SurfaceHeader layout/spacing, and the hierarchy tree
duplicating child collections on record pages.

- [x] Structural values render as labeled blocks (label line, value
  below), list summaries wrap inline — `SurfaceDetailBody`,
  `FieldControl`.
- [x] Uppercase leaves the ui-lab chrome; the design-system guard bans
  the transform (`uppercase|lowercase|capitalize` across
  components/pages/layouts).
- [x] File chips centralize on the chat recipe (shared `FileChip`:
  name label, mime-aware icon, bordered subtle chip, `name · size`
  title); `MessageAttachments` and the generator's blob fields consume
  it; `InstanceInlineRef`'s default chip adopts the bordered recipe.
- [x] `SurfaceHeader` rhythm: tighter identity-to-actions gap, the type
  label rides the label tier.
- [x] `HierarchyTree` leaves the record body (child collections are the
  children surface); component retired.

### Agent Notes (2026-10-27, round 3)

The blob chip previously rendered the raw MIME string as its label;
that plus the borderless default instance chip were the divergence from
the chat recipes. The record body rendered the descendant tree above
the same children the child collections listed below it.

Status: WAITING owner verification.

## Generative UI layout sanity round 4 (owner direction 2026-10-27)

Law: SPEC §22.8 (no app surface applies a case transform; internal
vocabulary stays internal). Owner findings: the showcase rendered the
compiled template name as a Tag beside every screen heading and the
random-world fixture labels narrated their own purpose ("<Type> list —
empty state"); plugin editor surfaces still stamped uppercase labels.

- [x] The showcase header drops the template Tag (internal vocabulary);
  fixture labels render `<Type> list` / `<Type> detail`; the random-world
  spec finds the empty screen structurally (typeList over a type with
  zero instances), by label.
- [x] Plugin editor section labels render in natural case (cassette
  designer, sheet editor); the case-transform guard now scans plugin
  surface modules and package editors beside the app tree.

### Agent Notes (2026-10-27, round 4)

Status: WAITING owner verification.

## Design-system centralization pass (owner direction 2026-10-27)

Law: SPEC §22.8; the ui-mapping layout-language law ("materializations
never declare their own stacks") and the chip recipe home.

- [x] `LAYOUT.labeledBlock` owns the label-line/content-below recipe;
  the four hand-rolled stacks in `SurfaceDetailBody`/`JsonEditor`
  consume it; structural field labels ride `sectionTitle`.
- [x] `components/shared/chip-surface.js` is the one chip recipe home
  (`CHIP_LABEL_PT`, `FILE_CHIP_CLASS`, `INSTANCE_CHIP_CLASS`);
  `FileChip`, `InstanceInlineRef`, and `InstanceCard` consume it; the
  chat's identical instance-chip override is gone.

### Agent Notes (2026-10-27, centralization pass)

Recipe duplication measured before the cut: the truncating chip
passthrough lived in three components; the chat passed an instance
chip class byte-identical to the new default; four generator stacks
hand-rolled `flex w-full flex-col gap-1` against the layout-language
law. All now resolve through the vocabulary and the recipe module.

Status: WAITING owner verification.

## Generative UI layout sanity round 6 (owner direction 2026-10-27)

Law: SPEC §22.8 (boolean checkbox states; no per-card type names in
homogeneous collections). Owner findings: booleans rendered a Tag with
glyph characters; every card in a single-type grid repeated the raw
authored type name as its subtitle.

- [x] Booleans render as the readonly checkbox state (`BooleanCheck`:
  checked / unchecked / indeterminate, binary, no glyph characters);
  the pure text fallback prints `true`/`false`.
- [x] CardGrid drops the per-card type-name subtitle — the collection
  header names the type; only containment context (ParentRef) earns
  the line.

### Agent Notes (2026-10-27, round 6)

Status: WAITING owner verification.

## Generative UI layout sanity round 7 (owner direction 2026-10-27)

Law: SPEC §22.8 (count law); §22.3 (the host owns the name). Owner
finding: a denied list screen rendered the screen title and the region
label (the type name twice) beside a "0" count and the denial message.

- [x] The count renders only for loaded, accessible, non-empty
  collections — denied, failed, missing, and empty sources carry no
  count — `RegionBlock`.
- [x] The showcase passes `pane-hosted` (§22.3): its section headings
  own the screen names; region headers stop repeating them.

### Agent Notes (2026-10-27, round 7)

The routed screens page already carried `pane-hosted`; the showcase was
the duplicating host.

Status: WAITING owner verification.

## Generative UI spacing ladder (owner direction 2026-10-27)

Law: SPEC §22.9. Owner demands this session: one spacing system for the
generative UI; counts that look designed; showcase headings that stop
narrating templates.

- [x] The ladder: steps 4/8/12/16/24/32px (Tailwind 1/2/3/4/6/8) declared
  at the layout vocabulary; the rhythm interpolator (SPACING_SCALES)
  owns sub-steps alone; calendar cells and six materializations
  normalized off half-steps; the guard pins LAYOUT and the ui-mapping
  tree.
- [x] Counts render as the count chip (`COUNT_CHIP_CLASS` in the chip
  recipe home): region headers and arrangement tabs.
- [x] Showcase headings follow the host law: list sections name the
  type, detail sections name the record they open; fixture labels lose
  the `list`/`detail` suffix narration.

### Agent Notes (2026-10-27, spacing ladder)

Status: WAITING owner verification.

## Generative UI rhythm step-down (owner direction 2026-10-27)

Law: SPEC §22.9 (amended). Findings from the first layout-geometry dump
(`e2e/zz-layout-geometry-probe.spec.js` → `.playwright/geometry-*.json`):
headless count chips on pane-hosted headers (round 9's own slop), a
uniform 24px rhythm at every tree level, gantt axis labels overflowing
their 16px row, and the showcase defaulting to the denied/error state
matrix.

- [x] Hosted regions render no count — a count rides beside its
  heading or not at all.
- [x] The screen root separates sections on the ladder's top step
  (`LAYOUT.stackSection`, interpolated as `screenRoot` in the rhythm
  sets) — hierarchy reads through spacing.
- [x] The gantt axis row hosts its month labels (h-6).
- [x] The showcase reviews the natural world by default; the state
  matrix opts in (`?state=on`).

### Agent Notes (2026-10-27, geometry round)

The geometry probe is the session's feedback loop for layout: measured
box trees read as text, so layout defects are found without eyes.

Status: WAITING owner verification.

## Collection title bars and the table floor (owner direction 2026-10-27)

Law: SPEC §22.3 (amended) — a collection region carries its own title
bar in every host; SPEC §22.9 count line amended to match. Owner
finding: datatables rendered with a floating icon row and no title —
the pane-hosted label suppression (rounds 7/10, applying the 2026-10-26
amendment too broadly) stripped collection titles from hosted
surfaces.

- [x] Every collection region renders its title bar (icon, label,
  count chip, controls) in every host; the `paneHosted` plumbing is
  removed end-to-end (RegionBlock, GeneratedMappingScreen,
  GeneratedScreenHost/Pane, the routed page, the showcase).
- [x] The random world guarantees the default table projection: the
  volume type is a plain item type (short scalars, one numeric) so the
  >50 collection renders a real DataTable — the showcase reaches every
  projection; the random-world spec asserts the layout.

### Agent Notes (2026-10-27, round 11)

Status: WAITING owner verification.

## PrimeVue owns component internals (owner direction 2026-10-27)

Law: SPEC §22.10. Owner finding: the generator added spacing inside
PrimeVue collections that space themselves — a 4px separated-border
wedge between DataTable rows, a hardcoded dense-grid gap beside the
grid-gap token — double rhythm on top of the preset.

- [x] The DataTable row wedge (scoped `border-spacing`) and its wrapper
  class die; rows ride the component's own rhythm, flush.
- [x] The dense card grid rides `--ck-grid-gap` (one token home for
  grid gaps); the last hardcoded `gap-4` grid joins it.
- [x] The scoped-style exception registry entry dies with the block.

### Agent Notes (2026-10-27, round 12)

Status: WAITING owner verification.

## Table virtualization retires (owner direction 2026-10-27)

Law: SPEC §22.10. Owner finding: the showcase's first large table
rendered as an internal scroll box with sticky headers floating over
the rows (transparent header backgrounds over a scroll viewport) —
the dormant virtualization mode, tripped by round 11's 60-row volume
guarantee.

- [x] The generator's tables page, they never scroll-box: the
  virtual/scrollable mode, `TABLE_VIRTUALIZE_AT`,
  `TABLE_VIRTUAL_SCROLL_REM`, and the pagination contract's
  `virtualizeAt` die together.

### Agent Notes (2026-10-27, round 14)

Status: WAITING owner verification.

## Generative UI raw-chips deslop (owner direction 2026-10-27)

Law: SPEC §4 (raw PrimeVue), §22.8 (chip recipe), §22.9 (spacing
ladder). Owner verdict: the generative UI follows no reasonable design
system, violates the raw-PrimeVue rule, reads ugly overall.

- [x] Chips ride the preset: `FILE_CHIP_CLASS`/`INSTANCE_CHIP_CLASS`
  drop the hand-rolled re-skin (border, background, 12px supporting
  face) and carry the clamps alone — raw PrimeVue Chip chrome and
  inherited typography; the compact ref header label inherits the body
  face. SPEC §22.8's "bordered default" sentence reconciled with the
  chat law (§7: raw PrimeVue Chips, no hand-rolled chip chrome).
- [x] One count surface: `COUNT_CHIP_CLASS` dies; region headers and
  arrangement tabs render `Tag severity="secondary"` — the board's
  existing count materialization.
- [x] StatGrid: the raw per-card `type?.name` subtitle dies (§22.8
  no-type-name law, one type-label chain); identity renders the standard
  openable link (the stats projection was the only closed one).
- [x] The rhythm interpolator rides declared steps: `gap-5` (20px) at
  the 1.25/1.5 densities moves to the ladder neighbors (4/6); the guard
  scans `SPACING_SCALES` for off-ladder full steps.
- [x] Vocabulary and hygiene: `LAYOUT.well` owns the quiet inset recipe
  (PreviewBox's file-facts band consumes it); the dead spacing inject in
  CalendarCollection dies.

Follow-up sweep (post-merge audit re-run still showed 50 record names
at 12px muted — the same value-face defect in three more homes):

- [x] ParentRef: the parent record's name renders in ink at the
  inherited face (the muted type icon alone marks context), and the
  unloaded-parent fallback resolves through the one type-label chain
  instead of the raw bundle `type.name`.
- [x] BreadcrumbTrail drops the trailing current-record crumb — it
  duplicated the header identity line below it at 12px muted; the trail
  carries ancestors alone.
- [x] FileUploadControl renders the chosen file through the shared
  `FileChip` (was a bare 12px muted span) and localizes its labels
  (`common.upload`, `errors.uploadFailed`).

### Agent Notes (2026-10-27, round 15)

Session `agent/genui-raw-chips-20261027-1915` (worktree
`.agent-worktrees/genui-raw-chips`). Diagnosis was measured, not
guessed: the live showcase audit (`e2e/zz-design-audit-probe.spec.js` →
`.playwright/design-audit-showcase.json`, 362 text elements) put 22% of
all text at 12px — the chip classes stamped the supporting role on
record and file names (data values), and re-skinned PrimeVue Chips with
utility chrome. The board already used `Tag` for counts while headers
and tabs used a hand-rolled pill — two count surfaces. StatGrid rendered
the raw authored type name per card and was the only projection whose
identity could not open a record. `SPACING_SCALES` carried `gap-5`
(20px) at two densities — a step the §22.9 ladder does not declare
(16→24 is the designed jump); the spacing guard scanned LAYOUT and the
component tree but never the interpolator table. All now fixed; the
design-system guard pins the chip classes and scans the interpolator.
Specs: 151 unit (design-system, ui-mapping, screen, module-imports,
timeline) green. Visual verification is the owner's: chips and counts
step up to preset size on the showcase (`/test/ui-mapping`) and in chat
after the dev container restarts.

Status: WAITING owner verification.

## Create dialogs prompt the contract alone (owner direction 2026-10-27)

Law: [SPEC §UI generated creates](./SPEC.md). A create dialog's row list
is its compiled construction contract — exactly the inputs the authored
declaration and graph compose. The "naming law" injections that prepended
a required identifier/Name row to every create dialog (including
registry-minted identity rows a declaration never authored, and beside
upload/capture/content protocol inputs) are slop and die.

- [x] `protocolModeInputs` (cts domain projection): upload/capture carry
  the payload input alone; content carries the text body alone.
- [x] `resolveCreateDialogInputs` (shared ui-mapping): rows come from the
  policy/construction inputs; drop the identifier unshift and the bare
  `name` ghost row.
- [x] Upload/capture constructs fill the record's `name` from the
  uploaded file's name (extension stripped) when the draft carries none
  (`createWithPayloadProtocol`).
- [x] Specs re-pinned (domain-projection, graph-protocol-construction,
  ui-mapping, instances service); md-editor-repair drops its dead
  identifier-fill loops.
- [x] Docs: SPEC §UI amended; shared/ui-mapping, components/ui-mapping,
  processes, instances READMEs; e2e README.

### Agent Notes (2026-10-27, agent/create-dialog-name-ghost-20261027)

Session worktree `.agent-worktrees/create-dialog-name-ghost`. The slop
had two injection sites contradicting four standing contracts (SPEC §UI
"upload/capture creates prompt only the file", compiler "No
identity.name ghost", e2e fixtures "protocol creates prompt none of the
rows", and the projection's own comment): `protocolModeInputs` rode an
identifier row into every protocol mode, and `resolveCreateDialogInputs`
derived identifier rows beyond the contract plus a ghost row for a bare
`name` id resolving no declared field. Registry-minted identity rows
(`constructible: false`, "authors nothing" per the registry comment)
were prompted too — a Name field for a field the declaration never had.
Records stay named for uploads by deriving the name slot from the
uploaded file's name at the construct seam; content/editor creates and
graph-supplied creates name through authored rows, composition, or the
rename channel. `packages/processes/README.md`'s construction-contracts
paragraph still described the retired always-promptable `name` compile
and was rewritten against current pins. Validation: cts + processes +
shared + instances suites green (887/891 — the 4 failures are
`shared/fact-display-vocabulary.spec.js`, pre-existing on `local`,
identifier-exclusion work in flight by another session); root guards,
SSR smoke, and architecture guard green. E2E not run (no live stack in
this session); md-editor-repair and order-process cover the changed
dialogs on the next stack run.

Status: WAITING owner verification.

## Generative UI owner corrections (owner direction 2026-10-27)

Law: SPEC §22.8 (chip recipe), §22.10 (the preset token layer is a
sanctioned spacing channel), the list-layout matcher. Owner findings on
round 15 and earlier rounds: the bordered instance/file chips were the
intended recipe; the small-table cell padding was the intended preset
deviation; a table must never render with no data column beside
identity (and status).

- [x] The bordered chip recipe is restored (round 15 over-reached):
  `FILE_CHIP_CLASS`/`INSTANCE_CHIP_CLASS` and the compact ref header
  label carry the border, surface, and supporting face again; SPEC
  §22.8's "bordered default" stands; the guard pins the restored
  classes.
- [x] The small-table cell padding is restored at its token home:
  `datatable.bodyCell.sm.padding: '0.5rem 0.75rem'` (removed by the
  §22.10 round 12 cleanup, which swept a preset token — the layer
  §22.10 itself sanctions); the design-system guard pins it and the
  tokens README deviation table carries the row.
- [x] The list-layout matcher demotes name-pile tables: a `columns: 0`
  signal (filled non-identifier short scalars + the first declared
  relation — the value-aware count of data columns a table would show
  beside identity and status) renders the `list` projection instead.
  `listLayoutOf(node)` is the one region-level derivation — compose
  traits, weight estimation, and RegionBlock resolve the same layout
  over the same node.

### Agent Notes (2026-10-27, round 16)

Session `agent/genui-corrections-20261027-2000` (worktree
`.agent-worktrees/genui-corrections`). The demotion is value-aware by
design: a type whose declared scalars no instance fills also demotes
(the census showed a detail screen rendering a one-column "Record"
table). Arrangement follows automatically — the demoted peers carry
chip breadth and share columns instead of claiming full rows. Specs:
175 unit (design-system, ui-mapping, screen, fixtures, random world,
module-imports, timeline) green; the traits fixture and the
relation-children composition fixture now fill a non-identifier scalar
so the table projections they pin derive over a shown data column.
Token change bakes at boot: the padding is visible after
`docker compose -f docker-compose.dev.yml restart app` once merged.

Status: WAITING owner verification.

## Group surfaces carry their membership (owner direction 2026-10-27)

Law: SPEC §22.11. Owner direction: group-class instances render as
groups in their collection surfaces, showing their children — flat, no
tree projection.

- [x] Group collections derive the card grid (matcher entry beside the
  file class): the class identity law — identity is its membership —
  makes membership the card's content.
- [x] A group card carries its children as budgeted reference chips
  (`InstanceInlineRef` over `childrenOfParent`, the surface contract's
  children slot: max 6, show-more per card) ahead of its facts; a child
  opens its own surface — one level, never a tree.
- [x] Child types lazy-load through the `loadType` overlay seam the
  containment cross-cut already owns (the parent-type overlay
  generalizes to overlaid types); an unloaded type renders without its
  context.

### Agent Notes (2026-10-27, round 17)

Session `agent/genui-corrections-20261027-2000` (worktree
`.agent-worktrees/genui-corrections`). The `children` slot existed in
the surface contract since the class archetypes landed (collection,
collection-card, collection-row with per-variant budgets) — no
materialization consumed it; group instances rendered as plain records.
Answer to the owner's question: yes — the correct way is the class
surface's own children slot over the one hierarchy matcher, budgeted
like relation chips, with the lazy overlay for pool data. The fixtures
spec's folder pin moves with the law (the stale comment asserted the
table default). En route, two latent defects surfaced and died:
`childrenOfParent` dropped the edge map key (edges authoring no
explicit `lineageKey` never matched — the same law the cross-cut's
`incomingChildrenEdges` already carries), and the live probe caught a
500 (the card expansion set read through its ref). Specs: 176 unit
green (design-system, ui-mapping, screen, fixtures, random world,
module-imports, timeline); SSR smoke 16; live verification
`e2e/zz-round1617-verify.spec.js` → `.playwright/genui-round1617.json`:
no identity-only tables, group cards carry membership chips at the
budget cap.

Status: WAITING owner verification.


## Contextual creates derive their lineage chain (owner direction 2026-10-27)

Law: [SPEC §UI contextual creates](./SPEC.md). The stored lineage is the
full ancestor chain (§3 read model: filters, access facts, breadcrumbs).
That chain vocabulary leaked into the write model: construction contracts
prompted a picker per ancestor axis, so creating a child inside its parent
still asked for the grandparent — and skipping it stored a broken chain.

- [x] `orgLineageFields` splits: construction addresses immediate parent
  axes; the fieldSchemas pass keeps the recursive ancestor chain (read
  model).
- [x] `createValidated` derives the chain: every referenced parent
  contributes its own lineage, authored axes win, ref objects scalarize,
  cross-org parents refuse.
- [x] Specs: projection pins immediate-only construction + deep schemas;
  instance service pins derivation, precedence, and the cross-org refusal.
- [x] `normalizeConstruction` reconciles authored construction inputs
  against the current contract on every mode (stale ancestor-axis stamps
  persisted in authored definitions die at compile; block-composed
  constructs keep their canonical block entries).
- [ ] Optional repair for legacy rows whose prompts allowed skipping
  ancestors (chains written incomplete before this law) — owner decides.

### Agent Notes (2026-10-27, agent/lineage-context-20261027)

Session worktree `.agent-worktrees/lineage-context`. Diagnosis came from
the live org (org-6a05940e manifest over the API): the xlsx-workbook
create inside a queue detail carried `lineage.queueId` AND
`lineage.projectId` prompts — `orgLineageFields` recursed through
ancestors and `edgeFieldsFor` fed the whole list into construction
inputs. All axes were optional, so a skipped grandparent stored a broken
chain (project-scoped access facts and filters silently never matched).
The dialog's scoped seeding (SPEC §UI "never prompts that binding")
hid only the axis matching the screen's type; ancestors still prompted.
The read model keeps the chain; the write model now derives it at the
construct seam. Authored explicit ancestor values survive (draft axes
overlay the derived chain). Validation: cts + instances suites green
(154); processes/shared/server sweep green except 15 pre-existing
failures on `local` head (4 fact-display, 11 agent-tooling-loop /
invitations — another session's in-flight work, reproduced without this
change). Guards: check-arch, framework:validate, docs:validate, SSR
smoke green. E2E not run (dev stack serves the primary tree; contextual
create is covered next stack run by process-generated-screen's child
region leg).

### Agent Notes (2026-10-27, agent/lineage-context-2-20261027)

Owner reported the symptom persisting. The live manifest confirmed the
projection fix served clean for protocol modes (xlsx upload: payload +
queueId alone) while `mkAttempt` (genericCreate) still prompted
`lineage.projectId`: the authored definition document persisted
construction inputs machine-stamped from the retired recursive contract
(`authoring.js` stamps node inputs from the contract of the moment), and
`normalizeConstruction` only dropped stale authored extras for declared
modes — on genericCreate they survived verbatim as prompts. The
reconciliation now runs on every mode: an authored input the current
contract leaves unaddressed dies at compile (a block-composed construct
keeps its canonical block entries), so the stale stamps self-heal at
serve and the stored drafts clean on their next authoring touch — no
definition rewrite needed. Compiler pin added; processes 545 green, cts/
shared/instances green (4 known fact-display failures pre-exist).
`packages/processes/README.md` already states the law ("compilation
discards construction inputs the current domain contract has retired") —
the cut makes the sentence true.

Status: WAITING owner verification.

## Table row rhythm, card overflow, and icon noise (owner direction
2026-10-27)

Law: SPEC §22.8 (glyph law, card overflow), §22.10 (row-surface
separation), §22.11 (membership overflow). Owner findings: the row gap
the table had is still gone; a card's show-more should open the
instance popup, not unwrap the card; typography is ugly with instance
icons sprayed at random.

- [x] The row gap returns as the row-surface recipe's other half:
  `LAYOUT.rowSurfaceTable` (`border-separate border-spacing-x-0
  border-spacing-y-1`) through the pt table channel — the recipe owns
  the clip and the separation, §22.10 names it, and the scoped-style
  wedge stays dead. (Round 12's cleanup had swept both the cell-padding
  token and the separation; the token returned in round 16, the
  separation now.)
- [x] Card overflow opens the record popup (§22.8): the group
  membership overflow and the board card's fact overflow open the
  instance's record popup through `useEntityPopup` — the record surface
  carries the full set — with the screen's open channel as fallback and
  the `+n` count when nothing opens; the per-card unwrap state dies.
- [x] The glyph follows the round-6 name law (§22.8): homogeneous
  collections repeat neither the type name nor the type glyph per card
  — the icons die on card-grid, board, stat, gantt, and row/detail
  surfaces; the collection title bar, the record header avatar,
  ParentRef, and reference chips keep their icons (mixed-type and
  containment context).

### Agent Notes (2026-10-27, round 18)

Session `agent/genui-rowgap-20261027-2100` (worktree
`.agent-worktrees/genui-round18`). The icon noise was the round-6 law
half-applied: names died per card, glyphs stayed — every identity row
in every projection carried a type glyph the collection's own header
already states.

Status: WAITING owner verification.

### Agent Notes (2026-10-27, agent/lineage-context-3-20261027)

The reload asymmetry explained the persisting symptom: the dev server
externalizes workspace packages (`#packages` law), so the running nitro
process kept the pre-merge `packages/processes` module in its Node
module cache while the `packages/cts` change served fresh — protocol
modes healed (xlsx), the compiler reconciliation did not. While
verifying, one more seam surfaced and closed: lineage axes are contract
vocabulary on every construction path — a block-composed construct
reconciles its authored `lineage.*` entries against the contract's
lineage set (the immediate axes), so a stale ancestor stamp dies there
too; composed `fields`/`name` entries stay authored. Compiler pins for
both; processes 546 green; the running stack needs an app-container
restart to drop the cached module.

Status: WAITING owner verification.

## Identifier icons and the groups projection (owner direction
2026-10-27)

Law: SPEC §22.3 (bare title bars), §22.8 (identifier icons), §22.11
(groups projection). Owner findings: icons belong on exact instance
identifiers, never on type names — the state was inverted (bare card
titles, iconed table titles); and round 17's membership chips dumped
every child of every type into cards.

- [x] `InstanceIdentity.vue` is the one instance-identifier surface:
  the record's icon (authored glyph, the record's declared thumb
  winning) beside its identity link, consumed by every projection
  (card-grid, board, stat, table identity cells, gantt, timeline,
  calendar, row/detail bodies). The collection title bar drops its
  icon — type names render bare (§22.3 amendment).
- [x] The `groups` projection replaces membership cards: a group-class
  collection renders each group instance as a group — its identifier
  heading a section, its members beneath as identifier rows (every
  children edge's instances over the overlaid pool), member count
  beside the header, budgeted per group, overflow opening the group's
  record popup. The class outranks incidental field shape in the
  matcher; `LIST_LAYOUT_VALUES` and the row weights carry `groups`.
- [x] The random world gains a prose floor (a long-body file type) so
  the timeline projection stays reachable — groups now outrank
  incidental chronology on group types; the world spec pins it.

### Agent Notes (2026-10-27, round 19)

Session `agent/genui-identicon-20261027-2140` (worktree
`.agent-worktrees/genui-ident`). Round 17's card-grid-for-groups was the
wrong reading of "rendered as groups in their dataviews" — the group
instance IS the group: a section of members, one level, no tree, and
the chips-in-card presentation dies with it. The identifier component
centralizes what nine projections hand-rolled.

Status: WAITING owner verification.

### Agent Notes (2026-10-27, agent/lineage-row-20261027)

The persisting dialog symptom lived client-side: the served policy types
lineage inputs `entity`, and `resolveCreateDialogInputs` ran its
operator-reference branch before the lineage branch — the row rendered
as a plain ref picker with the `lineage` binding stripped, so the launch
context could seed and hide nothing and the parent prompted by hand
inside the parent's own surface. The lineage branch now owns `lineage.*`
ids first; the served-shape policy pin (entity-typed lineage field)
joins the suite, closing the fixture gap that let this survive (specs
fed bare construction strings, the served shape arrived typed).
Verified against the live org's served manifest + bundle: inside the
queue detail, `mkAttempt` prompts `fields.label` alone and the xlsx
upload prompts its file alone. shared suites green (4 known fact-display
failures pre-exist), SSR smoke 16, check-arch green; app container
restarted to serve the module.

Status: WAITING owner verification.

## Group membership leaves the collection (owner direction 2026-10-27)

Law: SPEC §22.11 (rewritten). Owner verdict on the groups projection:
pure slop, awful, not an appropriate approach in the collection at all.

- [x] The `groups` projection dies whole: `GroupCollection.vue`, the
  class matcher entry, the `groups` layout value and row weight, the
  RegionCollections branch, and the group child-type overlay loading.
  A group-class collection is its record collection like any other —
  the standard matcher derives its projection over shape, size, and
  data columns.
- [x] Membership renders on the record surface alone: the record
  ladder arranges the child collections on the record page and popup.
  The identifier-icon law (§22.8) and the record-popup overflow stand
  untouched.
- [x] The random world's prose floor stays (a structural timeline
  guarantee, now standing on its own); the fixtures folder pin returns
  to the plain table.

### Agent Notes (2026-10-27, round 20)

Session `agent/genui-groups-revert-20261027-2230` (worktree
`.agent-worktrees/genui-groups-revert`). Two attempts at membership in
the group collection (chips in cards, then member-row sections) both
failed review; the collection is the wrong place. The record surface
already arranges members through the ladder — that is the whole
membership story.
Status: WAITING owner verification.

## Display-aware columns, editable tables, picker repair (owner
direction 2026-10-28)

Law: SPEC §4 (the collection-cell pencil), §22.8 (the table floor).
Owner findings: identifier+state data still becomes a datatable (field
or component selection wrong); the list contract should carry generated
buttons and editable nulls so tables edit; pickers show "[object
Object]" for selected data; instance picking needs the proper pickers
everywhere; the identifier icon has a huge gap to its title.

- [x] The column floor is display-aware: `resolveListControls` carries
  `relationColumn` (the first declared relation, a column only when any
  loaded instance carries its refs — the table renders it on the same
  law and the `columns` signal counts it filled-only), and `isFilled`
  treats a null-valued quantity as unfilled (it renders the fallback
  dash). A declared-but-unfilled relation or a column of dashes no
  longer keeps a name pile in the table projection.
- [x] Tables edit (SPEC §4): scalar cells are `InlineField` in a new
  cell variant (the hover zone without the padded look — preset cell
  padding stands), editing in place through the per-field pencil on
  patchable surfaces — nulls included — and patching through the
  region's `inline-change` channel (`emitPatchFor(instance, changes)`
  generalizes the body's patch to the row's instance). Rows carry the
  per-instance ellipsis menu (the card-grid run contract) when quick
  actions exist.
- [x] The instance picker's AutoComplete displays its selection: the
  model `{ type, id }` ref resolves to the option carrying it, so the
  input shows the record's label (a bare ref stringified to
  "[object Object]"). The chat's prompted instance fields already ride
  the shared `InstanceSelect` wrapper; the audit found no other raw
  instance pickers.
- [x] The identifier's icon-to-title gap was the preset's link-button
  horizontal padding (12px) compounding the identifier's own 8px gap —
  measured 21px. `InstanceIdentity` strips the link's horizontal
  padding: the identifier surface owns its spacing.

### Agent Notes (2026-10-28, round 21)

Session `agent/genui-tablefloor-20261028-0110` (worktree
`.agent-worktrees/genui-tablefloor`). The identity+state table survived
round 16's floor through two leaks: the relation column counted by
declaration (an empty column with a header kept the table alive and
rendered) and null-valued quantities counted as filled (columns of
dashes). Both now follow the one law the floor already claimed: a
column renders what displays, or it stays out. Gap measurement and the
relation/quantity pins live in the spec; `.playwright/genui-identgap.json`
records the 21px measurement.

Status: WAITING owner verification.

## Projection floor everywhere, honest menus and refs (owner direction
2026-10-28)

Law: SPEC §22.8 (the table floor). Owner findings: an ellipsis opening
an empty menu in table rows; label-with-state collections still forming
tables; "Н/Д" chips; flat label lists where the instances are the most
data-rich.

- [x] The ellipsis renders per row/card only where that instance has an
  applicable action (`actionAppliesToEntity` per instance) — a
  type-level action set never opens an empty menu (table, card grid,
  board alike).
- [x] The stored board→table projection preference obeys the table
  floor: a boardable type with no data column beside identity and
  state stays a board — the latched per-type view state no longer
  overrides what displays.
- [x] Relation refs normalize through the one app resolver at every
  generator site (table relation column, detail relation sections, ref
  field values): stored shapes without a type adopt the relation's
  single declared target (the descriptor's first accepted type for ref
  fields), so chips resolve instead of rendering the locale's Н/Д; the
  compact ref's unresolved fallback rides the one type-label chain (raw
  type ids stay internal).
- [x] The handful-size rule retires (`size: small → list` and the size
  signal): the display-aware columns floor subsumes it — a small rich
  collection renders its data (table/cards), a small name pile still
  stacks. `SMALL_LIST_AT` dies with it.

### Agent Notes (2026-10-28, round 22)

Session `agent/genui-projections-20261028-1035` (worktree
`.agent-worktrees/genui-round22`). Н/Д was `common.notAvailable`
rendering on relation references the chip could not type — stored
relation refs without a type component; the resolver that handles every
stored shape existed all along (utils/instance-relations.js — the
explorer's), the generator surfaces simply never consumed it.

Status: WAITING owner verification.

## The projection switch is the user's explicit view (owner direction
2026-10-28)

Law: SPEC §22.8 (the table floor governs derivation). Owner finding:
collections that had the view switch render only the board — the table
view became unreachable.

- [x] Round 22 over-reached: binding the table floor to the STORED
  preference blocked the user's explicit choice on floor-failing board
  types. The floor governs the default derivation alone; a stored
  preference is the user's view and renders.

### Agent Notes (2026-10-28, round 23)

Session `agent/genui-switch-hotfix-20261028-1115` (worktree
`.agent-worktrees/genui-hotfix`).

Status: WAITING owner verification.

## Ref chips recognize every stored shape (owner direction 2026-10-28)

Law: the one relation-ref resolver owns ref recognition. Owner finding:
Н/Д badges persist — the generative UI fails to recognize stored data
shapes.

- [x] FieldControl's ref dispatch and ObjectSummary subfield refs
  normalize through `resolveInstanceRelationRefs`: alternate id keys
  (`instanceId`, `_id`, `value`), bare ids, and typeless refs resolve
  (the descriptor's first accepted type as the fallback), with the
  revision channel passing through. The Н/Д badge stays the last
  resort for genuinely empty values.

### Agent Notes (2026-10-28, round 24)

Session `agent/genui-refshapes-20261028-1140` (worktree
`.agent-worktrees/genui-refshapes`). The audit of every
`InstanceInlineRef` call site: the table relation column and detail
relation sections normalized in round 22; the ref FIELD dispatch read
`.type/.id` alone — stored shapes the app's own resolver knows
(`instanceId`, `_id`, bare ids) fell to the Н/Д badge. All generative
ref consumption now rides the one resolver.

Status: WAITING owner verification.

## Relation-grammar columns and the N/A retirement (owner direction 2026-10-28)

Law: SPEC §22.8 (the table floor) + SPEC §6 (one relation grammar).
Owner findings: N/A badges in generated collections; flat
identifier-only lists on top-level data-rich types; card footer
whitespace.

- [x] Ref fields join the relation column: `resolveListControls`
  derives `relationColumn` over explicit edges ∪ declared ref fields
  (their wire values ride `relations.<name>` — the storage law now
  stated in the instances README). The typeless-shape fallback adopts
  the ref field's first accepted type. A filled ref field alone earns
  the table projection — facade-order, project, and every ref-carrying
  group render the chip column.
- [x] The structural summary column: the first filled json/record/map
  field derives `summaryColumn` and renders a bounded inline summary
  cell (narrow hosts shed it); `tableDataColumns` counts it —
  nesting-attempt (label + result json) renders its data.
- [x] The N/A badge dies in generated ref display: `FieldControl`'s
  ref dispatch renders nothing when the value resolves no reference
  (empty and unrecognized shapes alike); `SurfaceBody` row facts read
  ref values from `relations.<name>`.
- [ ] Card footer whitespace: NOT reproduced. Measured on a live card
  grid (probe `.playwright/genui-round25.json`): 0px gap below every
  card's last child, 20px card-body padding, no stretch (the grid is
  `items-start`). Needs the owner to name the surface (screen + type)
  — the board columns, the record popup, or the entity-card family are
  the unprobed candidates.

### Agent Notes (2026-10-28, round 25)

Session `agent/genui-round25-20261028-1500` (worktree
`.agent-worktrees/round25`). Diagnosis was measured on a live org
reproducing the owner's type shapes (`e2e/zz-round25-probe.spec.js` →
`.playwright/genui-round25.json`): the project list rendered one N/A
badge per row (the row fact read `fields.libraries` while the value
lives in `relations.libraries`), and all four ref/json-rich types
rendered zero tables (the columns signal counted short scalars and
explicit edges only). Fixes land in the contract
(`resolveListControls`/`tableDataColumns`), the materializations
(CollectionTable relation target + summary cell, SurfaceBody row read,
FieldControl ref render-nothing), and the storage law is now stated in
the instances README beside the §3 shape. Specs: the two new
relation-grammar pins + the summary pin in ui-mapping.spec; the new
`ui-mapping-refcolumns.ssr-smoke.js` mounts the real engine over the
live shapes and asserts the columns render, chips resolve, and no
N/A text exists. 177 unit + 19 SSR green; check-arch green; check-docs
green except the pre-existing jagua-rs submodule link.

Status: WAITING owner verification.

### Agent Notes (2026-10-28, round 25 follow-up)

The live probe's verification pass exposed a second stored shape: the
construct boundary scalarizes ref drafts to bare ids under
`fields.<name>` (the dialog boundary law) while relation operations
write ref objects under `relations.<name>` — the probe org's projects
stored the first, the owner's order data the second. The column
filledness, the table relation cell, and the row fact now read both
blocks through the one resolver; the instances README states the
two-block storage law beside the §3 shape.

Live verification (after `docker compose -f docker-compose.dev.yml
restart app` cleared a stale `#shared` transform — the documented
dev-server trap): the probe org's project list renders the
`Record | Libraries` table with resolved chips (both stored shapes),
the attempt list renders `Record | Result`, identifier-only types stay
the bare list, and the N/A census is zero across every screen
(`e2e/zz-round25-probe.spec.js` → `.playwright/genui-round25.json`).
The card footer measured clean on the live card grid: 0px below every
card's last child, 20px body padding, no grid stretch.

## Relation action placement repair (owner direction 2026-10-28, SPEC §22.12)

Owner findings: the "Link {type}" button renders in the top-level list
page header (assigned before, seemingly ignored); no Unlink option
anywhere; linked instances display in the parent table while children
do not.

- [x] The class-list link button dies: `RegionBlock`'s section link
  control now requires the §22.12 relation-section binding
  (`relationParent`) — the delivered gate existed for unlink alone, and
  the compiler legitimately carries the link action on typeList regions
  (every role action targeting the type), so the materialization owns
  the scoping. Link renders in the relation section toolbar on the
  record detail; a class list renders none.
- [x] Unlink reaches the bare-list projection: relation-scoped sections
  whose target type derives the `list` projection (identity-only
  records — the common linked-library shape) render their unlink
  actions in the row's ellipsis menu (`SurfaceBody` row carries the
  `{ parent, actions }` contract like the table and card rows; the run
  context binds the parent record and the row's relation ref).
- [x] Record-body chip menu repair: `inlineRefEntries` read `ref.type`
  off the normalized refs (they carry `typeId`), so multi-target
  relations never bound their chip menus and the run context carried no
  type — now reads `typeId` in both the filter and the payload.
- [x] Children placement verified, not changed: children render on the
  record surface (the detail's children-slot sections — pinned by the
  new SSR smoke) and in the workspace explorer; a class list stays
  flat (SPEC §22.11, the rounds 17/19/20 owner verdicts). A children
  column in the parent table is an explicit owner decision away.

### Agent Notes (2026-10-28)

Session `agent/genui-round26-20261028-1700` (worktree
`.agent-worktrees/round26`). New
`test-tools/ui-mapping-relation-actions.ssr-smoke.js` mounts the real
engine over a parent/child world with a declared relation and pins all
three laws: no link on the class list, link in the relation section
toolbar + unlink row menus, children sections on the record detail.
Validation: 22 SSR green (16 prior + the new 3 + the refcolumns 3),
178 unit green (ui-mapping, design-system, module-imports, test-data),
check-arch green, check-docs green except the pre-existing jagua-rs
submodule link. Live spot-check: the probe org's parent table renders
`Record | Libraries` with resolved chips.

Status: WAITING owner verification.

## Children display in parent collections (owner direction 2026-10-28)

Owner confirmation over the round-26 report: children ARE wanted in the
top-level parent table, symmetric with the relation column.

- [x] The children column: a type declaring children edges renders its
  loaded children as chips beside identity in the table projection —
  every children edge's instances whose lineage points at the row
  (`childrenOfParent`, the one containment matcher), budgeted like the
  relation chips (`ROW_RELATION_BUDGET` + `+n`). Presence derives live
  over the pool: the compose-time `childrenColumn` signal counts toward
  the table floor, and the materialization derives live so the lazily
  overlaid child types (the ParentRef overlay seam, generalized to
  child types) light the column when they land. Label: the single
  children edge's key label; `uiMapping.childrenColumn` when several.
- [x] Class lists stay flat in ROWS (no tree projection) — the children
  column is the parent's data beside identity, the relation column's
  mirror.

### Agent Notes (2026-10-28)

Session `agent/genui-children-column-20261028-1745` (worktree
`.agent-worktrees/round27`). The SSR smoke gained the children-column
pin (the relation-actions world already carried parent + children);
chip labels resolve against the served type view, so the SSR harness
asserts structure and the live probe asserts labels. SPEC §22.11's
"membership renders on the record surface" sentence now reads against
the children column — owner direction this session overrides; SPEC
reconciliation is an owner edit (SPEC files are agent-untouchable).

Status: WAITING owner verification.

## Chip-cell overflows open the record (owner direction 2026-10-28)

Owner findings on the children column: the `+N` badge does nothing, and
the chip cells are flat piles with no route to the full structure.

- [x] The relation and children chip cells' overflow controls open the
  row's record popup (`useEntityPopup`, the round-18 overflow law — the
  record surface carries the full relation and child sets); the
  screen's open channel is the fallback. The inert `+n` Tags die.

### Agent Notes (2026-10-28)

Session `agent/genui-overflow-20261028-1815` (worktree
`.agent-worktrees/round28`).

Status: WAITING owner verification.

## One children column per edge (owner direction 2026-10-28)

Owner verdict on the single children column: one flat dump of every
child type is slop.

- [x] `childrenColumns` — one column per declared children edge: the
  edge's key labels its column, only that edge's instances ride it,
  per-edge filledness (an unfilled edge renders no column), each with
  its own chips budget and record-popup overflow. The generic
  `uiMapping.childrenColumn` locale key dies with the dump. The floor
  signal counts every filled children column.

### Agent Notes (2026-10-28)

Session `agent/genui-children-peredge-20261028-1850` (worktree
`.agent-worktrees/round29`). `childrenOfParent` gains the per-edge
filter option (still the one containment matcher).

Status: WAITING owner verification.

## Random world decorruption (owner direction 2026-10-28)

Law: the random UI world generator rolls its world; nothing overwrites
a rolled type, edge, or count with hand-authored shapes or vocabulary.
Owner verdict on the accreted "guarantee" machinery (projection
floors, forced class list, the Stage/Batch/Amount/Holder/Note
volume-type stamp, peer-host claiming with rolled-edge deletion, the
reserved empty type, concentrated lineage, weight-sized peer counts,
forced 60/0 instance counts, the forced empty/missing screens): sabotage
— delete it all.

- [x] `test-data/ui-mapping-random.js`: classes, fields, edges, and
  instance counts are pure seed rolls again (the 2026-09-19 law).
  Post-roll touches are validity floors alone (authored name/glyph,
  an identifier flag somewhere, a control pin somewhere, nullable
  marking on refs whose targets rolled empty). Transition actions
  author no label — the resolver names them from their target state.
  The `sourceStatesMatrix` stays (an opt-in showcase overlay, it
  mutates nothing).
- [x] Spec migrated: determinism, CTS `checkValue` conformity,
  whole-world composition, traits/arrangement totality, and the
  validity-floor/matrix pins stand; the guarantee pins (volume table,
  prose floor, peer columns, empty/missing screens, >50 collection)
  die with the machinery. The SSR smoke's pinned seed 37 carries
  board/gantt/calendar naturally — no pin needed.
- [x] Docs: test-data, shared/ui-mapping, pages/test READMEs state the
  rolled-world law.

### Agent Notes (2026-10-28)

Session `agent/random-world-decorrupt-20261028-1405` (worktree
`.agent-worktrees/decorrupt`). Corruption timeline established before
the cut: `1eb7248ee` (10-21) introduced the volume/peer/empty
machinery; `2544b7068` (10-25) forced the class list and projection
floor stamps; `3b6e882a8`+`c26963809` (10-27, round 11) stamped the
hardcoded Serial/Stage/Batch/Amount/Holder/Note field set over the
rolled volume type; `ecdf27f02` (round 19) added the prose floor. All
deleted. Post-cut verification across seeds 1–400: every world
composes; natural layout coverage per seed spans table/card-grid/
timeline/stats/gantt/calendar/board with no stamps (seed 37 alone
carries board+gantt+calendar+table+timeline); empty types occur
naturally. Validation: random-world spec (8), test-data+ui-mapping+
design-system suites (175), SSR smoke 16, check-arch green; check-docs
reports only the pre-existing jagua-rs submodule link.

Status: WAITING owner verification.

## Plugins upgrade affordance defect (owner report 2026-10-28)

The owner's session saw the installed-plugins table (facade v17) and the
catalog list (facade v24) with install buttons on catalog rows, and no
upgrade tag or button on the installed row — while the same page through
the same app rendered both for a headless probe with an identical
install. The upgrade went through the console transport, so the
consent-diff surface was bypassed once. Unreproduced; re-probe with the
next catalog version bump.

- [x] Root cause (2026-10-28, same day): an inert bare `<template>`
  wrapper inside the installed-row actions cell — hidden by UA style,
  it zero-sized every action button (upgrade, connector, settings,
  uninstall) since it landed; the catalog rows' install buttons sit
  outside it, which is why those rendered. The wrapper is deleted and
  `e2e/plugins-upgrade.spec.js` pins the whole consent workflow
  (affordance renders → diff dialog → confirm → version lands); the
  upgrade gate now also refuses removed types still bound by authored
  definitions, so a rename can never again strand an org's compile.

## Facade domain model — template, design, instance (facade SPEC, owner direction 2026-10-28)

The facade flow becomes a six-type family (cassette-template,
cassette-design, cassette-instance, sheet-design, sheet-cut-plan,
sheet-instance) composed through declared constructs, relations, and the
generic machinery; the sheet-design editor edits the opened record on
one canvas (multi-sheet retracted, owner direction 2026-10-28 evening).
Ordered steps:

- [ ] WAITING — owner verification: Listing compliance: delete the dead
  `states`/`transitions` blocks from cassette and cassette-design — CTS
  `normalizeType` drops the keys silently, so they are declaration slop;
  SPEC §7 owns state vocabularies at the process graph.
- [ ] WAITING — owner verification: Type family: rename `cassette` →
  `cassette-template` (id, glyphs already say it; stored installs +
  instances migrate), add `cassette-instance`, `sheet-cut-plan`,
  `sheet-instance` as item types (icons already in the ck-entity font),
  make `cassette-design.template` nullable (DXF imports carry none),
  align `sheet-design` identifier to `fields.name` (rename-field
  migration).
- [ ] WAITING — owner verification: Placements relation:
  `sheet-design.fields.parts` (flat cassette ref list) becomes a
  declared relation edge to cassette-design, `onRemove: detach`, one ref
  per placement, stored under `relations.parts` with the derived index;
  executor-returned relations merge through the construct boundary.
- [ ] WAITING — owner verification: Nesting provenance: solve input
  items are keyed by `designId`, placements without one refuse; solve
  output groups identical design multisets into (layout, count) pairs.
- [ ] WAITING — owner verification: `fromLayout` construct: consumes
  typed cassette-design refs (resolved, revision-pinned,
  provenance-stamped), validates the layout against them, emits geometry
  + the parts relation; an empty layout constructs a blank sheet.

  ### Agent Notes (2026-10-28, family slice)

  Session `agent/facade-family-20261028` (worktree
  `.agent-worktrees/facade-family`). Listing v22 carries the six-type
  family with the `parts` relation edge and the design-keyed solve
  signature; `construct-sheet` validates placements against the resolved
  `designs` refs, copies their revision pins into `relations.parts`,
  and constructs blank sheets from an empty draft;
  `construction-services.js` merges executor-returned `relations`
  beside computed fields; `groupNestingLayouts` joins same-design
  layouts with counts; the editor palette patches geometry and the
  relation together over `queries.list('cassette-design')`;
  `migrate-facade-type-family.js` renames stored cassettes/refs/authored
  type ids before the v22 upgrade (the gate refuses removed types with
  live instances). The nesting-polygons projection output itself is
  unchanged — the design key enters at composition (the demo process
  wires `getField('_id')` from the bake result into `designId`).
- [ ] WAITING — owner verification: Multi-sheet canvas retraction (owner
  rejection 2026-10-28 evening): the sheet-design editor edits the
  opened record on one canvas; surface contract 5 retires with its
  construct/remove mount transports; the generic
  `DELETE /api/instances/:type/:id` transport and its ref sweep stay.
- [ ] WAITING — owner verification: Demo process, seeds, and e2e
  recomposed onto the family (design refs threaded through the solve;
  grouped layouts consumed as sheet designs with counts).

  ### Agent Notes (2026-10-28, canvas slice)

  Session `agent/facade-canvas-20261028` (worktree
  `.agent-worktrees/facade-canvas`). Contract 5 mounts `construct.run`
  and `remove.record` over two new gated transports
  (`POST /api/instances/:type/construct`, `DELETE
  /api/instances/:type/:id` — the remove gate loads the entity and
  checks the compiled grant, fail-closed like patch); the instances
  store carries `constructInstance` through the outbox. The editor
  surface (listing v23, contract 5) renders one panel per sheet-design
  record, drags placements within a sheet magnetically, moves them
  between records on cross-panel drops (the source item travels, the
  target's free sweep re-clamps, both records commit on save),
  constructs blank sheets and deletes records through the transports,
  and keeps one canvas-wide undo stack. E2E corpus renamed onto
  cassette-template (the pairs-join table column stays `cassette` —
  it keys by template name, the join's leftKey); live E2E needs the
  running stack.

  ### Agent Notes (2026-10-28, retraction)

  Session `agent/unslop-sheet-editor-20261028` (worktree
  `.agent-worktrees/unslop-sheet-editor`). The owner rejected the
  canvas slice on delivery. The editor surface restores the
  single-record canvas (contract 4, listing v25); contract 5 leaves the
  supported set with its construct route, `constructInstance`, and
  mount transports; the `addSheet` locale keys go. The generic
  `DELETE /api/instances/:type/:id` transport and `removeForHttp` stay —
  the §22.12 ref sweep rides them and the store's `removeInstance`
  spoke that path before the slice.

## Relation link lifecycle (owner direction 2026-10-28, SPEC §22.12)

- [x] Link actions render in their target relation's section toolbar
  (beside the create affordance) on parent details; the record header
  carries a link action only when no section exists for its relation.
  Composition injects the detail's link/unlink actions into the
  matching relation-scoped child regions (`shared/ui-mapping/screen.js`).
- [x] Unlink renders on the linked rows of relation-scoped sections
  (row menus of the table and card-grid projections) with the parent
  record and relation ref as run context, mirroring the record-body
  relation chip menus.
- [x] Replace affordance law (SPEC §24 refinement): construct-derived
  payloads (provenance sources non-empty) carry no replace button; the
  button renders labeled.
- [ ] Per-relation unlink policy — compiler vocabulary
  (`detach` default | `delete`), server execution, authoring surface.
- [ ] WAITING — owner verification: deletion ref-cascade — deleting a
  referenced instance removes the refs pointing at it
  (`server/features/instances` remove path sweeps relation refs).
- [ ] Revision selector on revision-scoped details — lists prior payload
  revisions, opens one read-only.

  ### Agent Notes (2026-10-28, ref sweep)

  Session `agent/ref-sweep-20261028-2100` (worktree
  `.agent-worktrees/ref-sweep`). `remove(id, { actor, organizationId })`
  sweeps before the delete: relation edges derive per target type over
  the same per-org view the lineage keys use (explicit `edges.relations`
  entries and ref fields alike, cached beside the declaration cache and
  invalidated with it; `*` wildcard ref fields join every target set);
  the referrer scan covers both storage blocks
  (`relations.<key>.id` and bare `relations.<key>` / `fields.<key>`,
  string and ObjectId id forms), a single ref nulls, arrays drop their
  matching entries, the typed filter keeps other-type refs sharing the
  id, and each swept referrer publishes the entity event with reason
  `ref-sweep`. A system target derives its edges from the static view
  alone (the instances README states the boundary). En route repair:
  `remove` resolved the declaration with a null organization, so
  org-authored types deleted from the `files` fallback collection — the
  transports now pass the organization (`removeForHttp` the doc's own,
  `processDelete` the run's). Validation: instances suite 79 green
  (+6 sweep cases); check-arch green; check-docs carries only the
  pre-existing jagua-rs submodule link; the 17 process-definitions spec
  failures reproduce at base 11c687e99 (concurrent merges, untouched).

  ### Agent Notes (2026-10-28, placement delivery)

  SPEC §22.12 + §24 refinement written from owner words this session.
  Delivered: composition-time injection (link and unlink actions land
  on the relation-scoped child node with the parent instance attached),
  `RegionBlock` toolbar link controls, row-menu unlink entries through
  a `context.data` run-context channel (the chip path's contract
  generalized), replace gating on `provenance.sources`.
