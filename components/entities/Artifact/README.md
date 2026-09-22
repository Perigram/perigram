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
- Uses `InstanceCard` with status hidden because file lifecycle is not exposed as
  an operator workflow here.
- Queue ancestry stays in shared trace chrome through `lineage.queueId`.
  Nesting-run context still renders through `InstanceInlineRef` because it is not
  currently part of the compact trace contract.
- The card may own a custom preview click action and disables `InstanceCard`
  expansion for that action.
- Generated artifact detail files resolve through the overload registry. The
  detail uses the shared artifact viewer registry and exposes file revision
  history. Writable users can replace uploaded/captured files, edit TXT/CSV,
  restore a prior revision as a new latest revision, and edit layout-backed
  artifacts through `ArtifactLayoutEditor`.

## Related

- [components/shared/README.md](../../shared/README.md) - `InstanceCard`, `InstanceInlineRef`
- [server/features/artifacts/README.md](../../../server/features/artifacts/README.md) - artifact metadata contract
