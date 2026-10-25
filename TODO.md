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

- [ ] Retire the artifact family: the `artifacts`, `artifact-templates`,
  `artifact-conversions` features, the artifact entity UI, and their
  routes/specs. `artifact` is legacy vocabulary and dies. What chat
  operates on after the cutover is the implementing agent's decision;
  CTS types with payload traits and the upload creation protocol are
  the seams. User-plane UX must not degrade.

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

- [ ] Documents plugin: xlsx fill service on the new seam (template
  workbook ref + rows/values in, filled workbook payload out); md fill
  rides the same service shape.
- [ ] PDF render service (md/xlsx/dxf → PDF) on the same seam; the
  artifact-templates pdfjs/pdf-lib parse-render engines donate to the
  owning plugin at the artifact-family cutover.
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
