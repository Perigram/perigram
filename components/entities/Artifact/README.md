# COMPONENT: Artifact UI

Card surface for generated file records such as DXF, SVG, PDF, and nesting
reports.

## Files

| File | Purpose |
|---|---|
| `ArtifactCard.vue` | Entity card wrapper with preview/select click behavior and source queue/run relations. |

## Contract

- Expects an `artifact` DTO with `identity`, `lineage`, `attachments`, and
  `data.type`.
- Uses `EntityCard` with status hidden because file lifecycle is not exposed as
  an operator workflow here.
- Queue and nesting-run context renders through `EntityInlineRef`; those rows
  are relation summaries, not raw route links.
- The card may own a custom preview click action and disables `EntityCard`
  expansion for that action.

## Related

- [components/shared/README.md](../../shared/README.md) - `EntityCard`, `EntityInlineRef`
- [server/features/artifacts/README.md](../../../server/features/artifacts/README.md) - artifact metadata contract
