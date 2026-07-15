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
- Uses `EntityCard` with status hidden because file lifecycle is not exposed as
  an operator workflow here.
- Queue ancestry stays in shared trace chrome through the structured
  `lineage.queue` reference, including its optional `revisionId` when the
  artifact belongs to one immutable nesting attempt.
- The card may own a custom preview click action and disables `EntityCard`
  expansion for that action.
- Generated artifact construction uses the shared `AttachmentInput` for file
  selection or device-camera capture and stores optional source provenance in
  `relations.source`.

## Related

- [components/shared/README.md](../../shared/README.md) - `EntityCard`, `EntityInlineRef`
- [server/features/artifacts/README.md](../../../server/features/artifacts/README.md) - artifact metadata contract
