# COMPONENT: Artifact UI

Card surface for generated file records such as DXF, SVG, PDF, and nesting
reports.

## Files

| File | Purpose |
|---|---|
| `ArtifactCard.vue` | Entity card wrapper with preview/select click behavior and source run relation. |

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
- Artifact records carry no detail surface: no pack declares the type, so it
  stays outside the served type view and every record surface (popup, pane,
  route) stays silent for it. The card's preview and the artifact viewer
  registry cover inspection; file operations ride the artifact API surfaces
  that manage them.

## Related

- [components/shared/README.md](../../shared/README.md) - `InstanceCard`, `InstanceInlineRef`
- [server/features/artifacts/README.md](../../../server/features/artifacts/README.md) - artifact metadata contract
