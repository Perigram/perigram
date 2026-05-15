# COMPONENT: @cutkit/mcp

Read-only MCP tool handlers for LLM-assisted industrial app planning. This package intentionally has no write or codegen tools in v1.

## Tool Handlers

- `list_entities`
- `get_entity_schema`
- `get_workflow`
- `simulate_transition`
- `validate_architecture`

`simulate_transition` receives the workflow validator through dependency
injection so this package remains read-only and framework-adapter neutral.

Use `node scripts/framework-inspect.js mcp-smoke` for the current local
read-only handler smoke test. This is intentionally not a write-capable app
builder.
