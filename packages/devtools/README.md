# COMPONENT: @cutkit/devtools

Read-only inspection helpers for framework definitions, UI/design-system contracts, and manifest validation.

The app-level CLI entrypoint is `scripts/framework-inspect.js`.

## Public API

- `summarizeDefinitions(definitions)`
- `summarizeWorkflows(workflows)`
- `summarizeRoutes(definitions)`
- `summarizeSummaries(summaries)`
- `summarizeCommands(commands)`
- `summarizeTasks(tasks)`
- `summarizeAttachmentKinds(attachmentKinds)`
- `summarizeRelationships({ relations, summaries })`
- `summarizeUiComponents(contracts, componentInventory)`
- `summarizeUiPrimitives(primitives)`
- `createFrameworkManifest(inputs)`
- `validateFrameworkManifest(inputs)`
- `validateUiFieldPaths(inputs)`
- `validateStatusPolicies(inputs)`
- `validateUiPrimitives(primitives)`
- `queryDocs(corpus, query)`
- `validateDefinitionSet(definitions)`

## Commands

```bash
npm run framework:list-entities
npm run framework:list-workflows
npm run framework:list-routes
npm run framework:list-commands
npm run framework:list-ui-primitives
npm run framework:query-docs -- workflow
npm run framework:manifest
npm run framework:write-manifest
npm run framework:validate
node scripts/framework-inspect.js mcp-smoke
```

`framework.manifest.json` is committed and must stay synchronized with source metadata. Use `npm run framework:write-manifest` after intentional framework/UI contract changes, then `npm run framework:manifest` to verify the committed file.

Manifest relationships come from declared domain containment/link relations
plus summary contracts. Devtools no longer guesses relationships from generated
flat lineage fields, so the manifest exposes ownership and non-owning links as
separate kinds.

The app-level docs corpus includes root/server/package docs plus component, shared UI, utility, test-data, i18n, and design-system docs so `query-docs` can answer both backend workflow and frontend generation questions.
