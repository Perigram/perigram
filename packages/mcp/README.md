# COMPONENT: @perigram/mcp

Read-only MCP tool handlers for LLM-assisted industrial app planning.

Parent: [packages README](../README.md).

## Tool Handlers

- `list_entities`
- `get_entity_schema`
- `get_workflow`
- `get_framework_manifest`
- `list_routes`
- `list_ui_components`
- `list_ui_primitives`
- `list_design_tokens`
- `list_relationships`
- `list_summaries`
- `list_commands`
- `validate_ui_contracts`
- `simulate_transition`
- `validate_architecture`

`simulate_transition` receives the workflow validator through dependency
injection so this package remains read-only and framework-adapter neutral.

Use `node scripts/framework-inspect.js mcp-smoke` for the current local
read-only handler smoke test.
