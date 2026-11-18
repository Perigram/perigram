# TODO

## packages/ deslop delta (2026-10-24 audit)

### Deletions

- [x] Delete `packages/mongo` + its README row. Evidence: `createMongoRepository`/`createStatusEventStore`/`createSummarySync` have zero call sites (repo-wide grep js/vue/mjs excluding node_modules and the package itself; only config aliases reference the package). Removal ordered by [root SPEC](../SPEC.md) §Deslopification.
- [x] Delete `packages/nitro` + its README row. Evidence: `createEntityRouteMap`/`resolveEntityRoute` — same search, zero call sites.
- [x] Delete `packages/vue` + its README row. Evidence: `createDomainUiAdapter`/`createEndpointMap` imported only by `shared/framework-packages.spec.js:184`; claimed consumer `composables/useEntity.js` deleted; README documents 3 exports the package does not have (`collectionToEntityType`, `camelToSnake`/`snakeToCamel`; live list is 7 names).
- [x] With those three deletions, clean every reference: `scripts/framework-inspect.js:44-51` `PACKAGE_NAMES` (mongo L47, nitro L48, vue L49); regenerate `framework.manifest.json` via `npm run framework:write-manifest` (committed file lists all three at L741-747); `tsconfig.json:27-29` aliases (plus `@perigram/domain-cnc` alias in the same block — `packages/domain-cnc` does not exist); `nuxt.config.js:13-15` and the vitest alias maps; `.codex/skills/perigram-vue-design-system/SKILL.md:3` (documents `@perigram/vue` and the deleted `composables/useEntity.js`). Without PACKAGE_NAMES + manifest regen, `framework:manifest` output changes silently (review-1 correction).
- [x] Retire the `queryDocs`/`query_docs` ghost: `packages/devtools/README.md` L24 (API row; devtools exports 20 functions, `queryDocs` absent — verified by live `node -e import(...)`), L35 (`npm run framework:query-docs -- workflow`; no such script in package.json L24-31, no command in scripts/framework-inspect.js), L44 (docs-corpus paragraph); `packages/mcp/README.md` L19 (`query_docs` tool; `createReadOnlyToolHandlers` registers 14 handlers, none query docs); `shared/framework-packages.spec.js:186,230` (destructures `queryDocs` — undefined, silently dropped). Delete rows and tokens.

### README

- [x] `packages/README.md`: rewrite to the [packages SPEC](./SPEC.md) shape — L3 extraction-phase narration ("used to extract… without breaking existing app imports") and L26-28 "Extraction Rule" (written around awaiting adoption; masked three dead folders) restate what the SPEC's Package map, Dependency direction law, Extraction rule, and Manifest law now own; keep the manifest sentence and the alias paragraph as law.
- [x] `packages/core/README.md`: add the unlisted public exports — the `validate*Definition` family (9 functions), `validateDomain`, `normalizeStatusLifecycle`, `normalizeEntityOutputContracts`, `validateResultEntityOutputs` (packages/core/src/index.js); add one pointer sentence naming the layer boundary between the `Status.state` v2 region story (L70-80) and the CTS flat-state law (cts SPEC §7).
- [x] `packages/workflows/README.md`: add the unlisted public exports — `getWorkflowRegions`, `getWorkflowRegion`, `hasLifecyclePayload`, `workflowStateEntries` (described in prose L84 but unlisted), `resolveWorkflowStatePath`, `workflowTransitionsForState` (packages/workflows/src/index.js); dedupe L80-83 (parent-is-leaf) and L126-131 (guard evaluation ownership) to links — cts SPEC §7 owns the declaration law (area-1 clusters 8-9); L133-134 deadline citation ("CTS SPEC §7") awaits the owner decision in [packages/processes/TODO.md](./processes/TODO.md).
- [x] `packages/mcp/README.md`: drop the `query_docs` row (deletion item above); state the read-only scope once (L3 and L27-28 both carry it in a 28-line file).
- [x] `packages/devtools/README.md`: drop the `queryDocs` API row, the `framework:query-docs` script line, and the docs-corpus paragraph (deletion item above); add `validateWorkflowAccess`, `validateCommands`, `validateTasks`, `validateAttachmentKinds` to the API list (exported, unlisted).
- [x] `packages/plugin-sdk/README.md`: keep one hand-maintained copy of the CLI surface — L185-204 mirrors the `cli.js` usage string nearly verbatim; summarize in the README and let `--help` own the full text.

### Code deslop

- [x] `packages/plugin-sdk/src/cli.js:160-175`: `usage` omits the implemented `vendor` command (cli.js:38) and `--surface-origin` flag (cli.js:134); the README documents both — fix the string.
  Landed 2026-10-25: usage matches the implemented surface — `vendor`,
  `connect --surface-origin`, and `surfaces --listing` added; every
  `commands` key renders in `--help`.
- [x] `packages/plugin-sdk/src/cli.js:160-175` — the hand-maintained
  `usage` string drifted stale against the implemented command surface
  (new wave-1 finding); regenerate it from the command definitions.
  Landed 2026-10-25: same fix — `commands` holds imperative closures with
  no flag metadata, so the string stays the hand-maintained mirror of the
  definitions, agreeing with README §CLI.

### Owner decisions wanted

- None.

- [ ] WAITING — owner verification: read the packages root README and the
  four package READMEs (core, cts, processes, plugin-sdk); queryDocs/query_docs
  dead at every site, processes migration residue + 2 dead script refs dropped,
  cts folded to a module map.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). README wave across the 8
packages READMEs: processes restructured to the SPEC 12-section skeleton
(1452→1359); cts rewritten as a module map with SPEC pointers (246→148);
core/workflows/devtools/mcp/plugin-sdk trims — missing exports added,
`queryDocs`/`query_docs` dead at every site, deadline citation repointed
to server/core/machines. New code finding below: the cli.js `usage`
mirror is stale. OPEN: 3-package deletion + reference cleanup, both code
items; processes/cts deltas live in their own TODOs.

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025`. Deletions executed: packages
mongo/nitro/vue removed with every reference cleaned — framework-inspect
PACKAGE_NAMES, tsconfig + nuxt + both vitest alias maps (incl. the
phantom `@perigram/domain-cnc` alias), package-lock workspace entries,
`.codex` skill (`@perigram/vue` + deleted-`useEntity` guidance rewritten
to the stores/`$fetch` law), framework-packages.spec vue import +
`queryDocs` destructure/handler key; manifest regenerated via
`framework:write-manifest`. cli.js usage-string items stay open.

### Agent Notes (2026-10-25)

Session `agent/pkg-deslop2-20261025` (worktree `.agent-worktrees/pkg`).
Both cli.js usage items landed: `--help` now renders the full implemented
surface (`vendor`, `connect --surface-origin`, `surfaces --listing`).
cts/processes contract-comment homing landed in their own TODOs. Guards:
check-arch OK; check-docs homing debt 26→17 with a pre-existing blocking
broken link in `workers/nesting/README.md` → `./jagua-rs/README.md`
(committed 0a715d34d, outside this wave).
