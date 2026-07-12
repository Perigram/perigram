# COMPONENT: Tool Profile UI

Master-data card for CNC tool profiles.

## Files

| File | Purpose |
|---|---|
| `ToolProfileCard.vue` | Entity card wrapper for diameter, angle, and kerf settings. |

## Contract

- Expects a `tool_profile` DTO with tool geometry data under `data`.
- Uses `DataBlock` for tool-specific fields.
- Status and trace are hidden because tool profiles are master data.

## Related

- [components/shared/README.md](../../shared/README.md)
- [server/features/tool-profiles/README.md](../../../server/features/tool-profiles/README.md)
