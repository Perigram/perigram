# TODO

## Deslopification program (owner direction 2026-10-23)

Baseline: full-repo audit of 2026-10-24 (nine area reports, three
independent review passes; evidence is inlined below — the reports were
ephemeral). System law: [SPEC §Deslopification](./SPEC.md). Per-folder
deltas live in the folders' own TODO.md; this file carries the
repository-level cuts, the root documentation, and the guards.

Status legend per AGENTS.md: tasks move to WAITING for owner verification,
archived only on the owner's word.

### Repository shape (SPEC §Deslopification → Repository shape)

- [ ] Remove `video/` (19 tracked files) — the explainer-video renderer:
  `video/groundtruth.mjs` imports deleted `utils/` files
  (ERR_MODULE_NOT_FOUND reproduced at audit), all 5 relative links in
  `video/README.md` resolve above the repo root and are broken, and
  `nuxt.config.js` special-cases ignoring the tree. Drop its
  Documentation Map row in the same cut. Preserve the rendered
  artifact out-of-repo first if wanted (decision below).
- [ ] Remove `packages/mongo`, `packages/nitro`, `packages/vue` — zero
  consumers repo-wide (reference search over all js/vue/mjs excluding the
  packages themselves); `packages/vue/README.md` documents exports that do
  not exist. Same cut cleans `scripts/framework-inspect.js` PACKAGE_NAMES,
  regenerates `framework.manifest.json` (`npm run framework:write-manifest`),
  drops `tsconfig.json` path rows, and updates the `.codex` skill reference.
  Tracked in [packages/TODO.md](./packages/TODO.md).
- [ ] Remove `constants/` + `components/UserForm.vue` — the only import of
  `constants/` is `UserForm.vue:36` (`USER_ROLES`, a hardcoded legacy role
  set); `<UserForm` template usage: 0 matches repo-wide.
- [ ] Remove `assets/rive/perigram-mark/` + `public/rive/` — `rive`,
  `perigram-mark`, `\.riv` search over all app code: 0 references;
  package.json carries no rive dependency. Drop the Documentation Map row
  in the same cut.
- [ ] Remove the retired Swarm/Hetzner deploy plane:
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
- [ ] `SPEC.md`: number the section headings (decision below) so the 36
  "SPEC §N" citations across READMEs resolve.

### Guards

- [ ] `scripts/check-docs.js`: add `workers` to SOURCE_ROOTS
  (contract-shaped comments there are unscannable); make `resolveTarget`
  fail links resolving above the repository root (`video/README.md` passed
  the guard with 5 such broken links); add orphaned-README detection (a
  README no parent map registers).
- [ ] `scripts/check-arch.js`: delete the dead `descriptorRefFields`
  function (never called; its comment claims enforcement), the empty
  `PACK_OWNED_FEATURES` map with its dead branch, and the four phantom
  capability names (server/features audit).
- [ ] `scripts/framework-inspect.js`: `mcp-smoke` probes the deleted
  `queue` type — repoint to a live declared type.

### E2E

- [ ] Fix or delete the known-stale specs: `home-default-screen`
  (pre-alias URL), `home-and-instance-ui` (entity-era blocks) — listed
  under e2e/README "Known-stale remainder"; `home-calls` is live (its
  selectors were verified at review) and stays.
- [ ] `home-default-screen` re-verified stale 2026-10-24: the spec asserts
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

### Owner decisions wanted

- [ ] `video/`: remove with git history as the archive, or move the
  renderer to its own repository first?
- [ ] `deploy/README` says "no credentials" while `deploy/deploy.yml`
  carries inline LIVEKIT and garage S3 keys — move to Forgejo secrets, or
  bless the inline lab keys and fix the sentence?
- [ ] Root SPEC numbering: number sections (36 "SPEC §N" citations start
  resolving) or rewrite the citations to section names?
- [ ] Artifact-family cutover: SPEC §Files retires `artifact` when
  chat/proof/capture/upload move to file instances; support chat still
  rides artifacts (`support/service.js:2,40`). Schedule the cutover or
  record the cluster as the live file path
  ([server/features/TODO.md](./server/features/TODO.md)).
- [ ] `k8s/README` is Russian and overlaps `deploy/` on the hera
  production environment: which folder owns that contract canonically?
- [ ] `test-data/factories.js` has 3 live consumers (ui-lab,
  design-system spec + util); confirm nothing expects the deleted CNC
  factory set before its README rewrite names the real nine factories.
- [ ] Registry naming: `getAppRegistry` vs `getPerigramRegistry` — ten
  core files import the legacy name
  ([server/core/TODO.md](./server/core/TODO.md)).
- [ ] Event tier: register `frameworkEventDefinitions` into the framework
  domain or delete the emission and validation tier
  ([server/core/TODO.md](./server/core/TODO.md)).

- [ ] WAITING — owner verification: read root README Development +
  Documentation Map and the five area READMEs (e2e, test-data, test-tools,
  scripts, deploy); repository shape, guards, E2E stale specs and the
  decisions below stay open.

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
