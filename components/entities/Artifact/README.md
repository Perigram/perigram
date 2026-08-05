# COMPONENT: Artifact UI

Card surface for generated file records such as DXF, SVG, PDF, and nesting
reports.

## Files

| File | Purpose |
|---|---|
| `ArtifactCard.vue` | Entity card wrapper with preview/select click behavior and source run relation. |
| `ArtifactDetail.vue` | Registered generated-detail editor for name, kind-declared data/file operations, and layout-backed artifacts. |

## Contract

- Expects an `artifact` DTO with `identity`, `lineage`, `attachments`, and
  `data.type`.
- Uses `EntityCard` with status hidden because file lifecycle is not exposed as
  an operator workflow here.
- Queue ancestry stays in shared trace chrome through `lineage.queueId`.
  Nesting-run context still renders through `EntityInlineRef` because it is not
  currently part of the compact trace contract.
- The card may own a custom preview click action and disables `EntityCard`
  expansion for that action.
- Generated artifact detail files resolve through the overload registry.
  Upload-backed kinds can replace their primary file, writable users can edit
  identity name and `data.metadata`, and kinds declaring `editor.mode: layout`
  use the shared `ArtifactLayoutEditor` and revision-backed layout API.

## Related

- [components/shared/README.md](../../shared/README.md) - `EntityCard`, `EntityInlineRef`
- [server/features/artifacts/README.md](../../../server/features/artifacts/README.md) - artifact metadata contract
