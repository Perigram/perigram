# COMPONENT: @perigram/devtools

Read-only inspection helpers for framework definitions, UI/design-system contracts, and manifest validation.

Parent: [packages README](../README.md).

The app-level CLI entrypoint is `scripts/framework-inspect.js`.

## Public API

- `summarizeDefinitions(definitions)`
- `summarizeWorkflows(workflows)`
- `summarizeRoutes(definitions)`
- `summarizeSummaries(summaries)`
- `summarizeCommands(commands)`
- `summarizeTasks(tasks)`
- `summarizeAttachmentKinds(attachmentKinds)`
- `summarizeRelationships({ summaries, dataModelFields })`
- `summarizeUiComponents(contracts, componentInventory)`
- `summarizeUiPrimitives(primitives)`
- `createFrameworkManifest(inputs)`
- `validateFrameworkManifest(inputs)`
- `validateStatusPolicies(inputs)`
- `validateUiPrimitives(primitives)`
- `validateWorkflowAccess(workflows)`
- `validateCommands(commands)`
- `validateTasks(tasks)`
- `validateAttachmentKinds(attachmentKinds)`
- `validateDefinitionSet(definitions)`

## Commands

```bash
npm run framework:list-entities
npm run framework:list-workflows
npm run framework:list-routes
npm run framework:list-commands
npm run framework:list-ui-primitives
npm run framework:manifest
npm run framework:write-manifest
npm run framework:validate
node scripts/framework-inspect.js mcp-smoke
```

`framework.manifest.json` is committed and must stay synchronized with source metadata. Use `npm run framework:write-manifest` after intentional framework/UI contract changes, then `npm run framework:manifest` to verify the committed file.
