# TODO

## packages/ deslop delta (2026-10-24 audit)

### Deletions

- [ ] Delete `packages/mongo` + its README row. Evidence: `createMongoRepository`/`createStatusEventStore`/`createSummarySync` have zero call sites (repo-wide grep js/vue/mjs excluding node_modules and the package itself; only config aliases reference the package). Removal ordered by [root SPEC](../SPEC.md) §Deslopification.
- [ ] Delete `packages/nitro` + its README row. Evidence: `createEntityRouteMap`/`resolveEntityRoute` — same search, zero call sites.
- [ ] Delete `packages/vue` + its README row. Evidence: `createDomainUiAdapter`/`createEndpointMap` imported only by `shared/framework-packages.spec.js:184`; claimed consumer `composables/useEntity.js` deleted; README documents 3 exports the package does not have (`collectionToEntityType`, `camelToSnake`/`snakeToCamel`; live list is 7 names).
- [ ] With those three deletions, clean every reference: `scripts/framework-inspect.js:44-51` `PACKAGE_NAMES` (mongo L47, nitro L48, vue L49); regenerate `framework.manifest.json` via `npm run framework:write-manifest` (committed file lists all three at L741-747); `tsconfig.json:27-29` aliases (plus `@perigram/domain-cnc` alias in the same block — `packages/domain-cnc` does not exist); `nuxt.config.js:13-15` and the vitest alias maps; `.codex/skills/perigram-vue-design-system/SKILL.md:3` (documents `@perigram/vue` and the deleted `composables/useEntity.js`). Without PACKAGE_NAMES + manifest regen, `framework:manifest` output changes silently (review-1 correction).
- [ ] Retire the `queryDocs`/`query_docs` ghost: `packages/devtools/README.md` L24 (API row; devtools exports 20 functions, `queryDocs` absent — verified by live `node -e import(...)`), L35 (`npm run framework:query-docs -- workflow`; no such script in package.json L24-31, no command in scripts/framework-inspect.js), L44 (docs-corpus paragraph); `packages/mcp/README.md` L19 (`query_docs` tool; `createReadOnlyToolHandlers` registers 14 handlers, none query docs); `shared/framework-packages.spec.js:186,230` (destructures `queryDocs` — undefined, silently dropped). Delete rows and tokens.

### README

- [ ] `packages/README.md`: rewrite to the [packages SPEC](./SPEC.md) shape — L3 extraction-phase narration ("used to extract… without breaking existing app imports") and L26-28 "Extraction Rule" (written around awaiting adoption; masked three dead folders) restate what the SPEC's Package map, Dependency direction law, Extraction rule, and Manifest law now own; keep the manifest sentence and the alias paragraph as law.
- [ ] `packages/core/README.md`: add the unlisted public exports — the `validate*Definition` family (9 functions), `validateDomain`, `normalizeStatusLifecycle`, `normalizeEntityOutputContracts`, `validateResultEntityOutputs` (packages/core/src/index.js); add one pointer sentence naming the layer boundary between the `Status.state` v2 region story (L70-80) and the CTS flat-state law (cts SPEC §7).
- [ ] `packages/workflows/README.md`: add the unlisted public exports — `getWorkflowRegions`, `getWorkflowRegion`, `hasLifecyclePayload`, `workflowStateEntries` (described in prose L84 but unlisted), `resolveWorkflowStatePath`, `workflowTransitionsForState` (packages/workflows/src/index.js); dedupe L80-83 (parent-is-leaf) and L126-131 (guard evaluation ownership) to links — cts SPEC §7 owns the declaration law (area-1 clusters 8-9); L133-134 deadline citation ("CTS SPEC §7") awaits the owner decision in [packages/processes/TODO.md](./processes/TODO.md).
- [ ] `packages/mcp/README.md`: drop the `query_docs` row (deletion item above); state the read-only scope once (L3 and L27-28 both carry it in a 28-line file).
- [ ] `packages/devtools/README.md`: drop the `queryDocs` API row, the `framework:query-docs` script line, and the docs-corpus paragraph (deletion item above); add `validateWorkflowAccess`, `validateCommands`, `validateTasks`, `validateAttachmentKinds` to the API list (exported, unlisted).
- [ ] `packages/plugin-sdk/README.md`: keep one hand-maintained copy of the CLI surface — L185-204 mirrors the `cli.js` usage string nearly verbatim; summarize in the README and let `--help` own the full text.

### Code deslop

- [ ] `packages/plugin-sdk/src/cli.js:160-175`: `usage` omits the implemented `vendor` command (cli.js:38) and `--surface-origin` flag (cli.js:134); the README documents both — fix the string.

### Owner decisions wanted

- None.
