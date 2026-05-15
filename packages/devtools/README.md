# COMPONENT: @cutkit/devtools

Read-only inspection helpers for framework definitions. CLI wiring will be added after the package API is covered by tests.

The app-level CLI entrypoint is `scripts/framework-inspect.js`.

## Public API

- `summarizeDefinitions(definitions)`
- `summarizeWorkflows(workflows)`
- `validateDefinitionSet(definitions)`

## Commands

```bash
npm run framework:list-entities
npm run framework:list-workflows
npm run framework:validate
node scripts/framework-inspect.js mcp-smoke
```
