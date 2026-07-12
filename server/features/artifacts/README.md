# COMPONENT: Artifacts

Persisted metadata entity for generated files and uploaded previews. The
framework contract term for file behavior is `AttachmentKind`; `artifact` is the
current app entity type that stores file metadata and GridFS references.

## Responsibilities

- Create generation requests through `generateAttachment`.
- Store primary file metadata under `attachments.primary`.
- Stream files from kind-specific GridFS buckets.
- Return artifact DTOs for Workbench and preview UI.

## Key Files

- `service.js` - artifact CRUD and ready/fail helpers.
- `operations.js` - `generateAttachment` command handler.
- `repository.js` - MongoDB access.

## APIs

- `GET /api/artifacts/:id`
- `GET /api/artifacts/:id/metadata`
- `DELETE /api/artifacts/:id`

## Generation Notes

`generateAttachment()` handles `LAYOUT_DXF` for two source types:
- `entities.sheetDesign` generates a DXF from the sheet design preview/layer
  geometry, stores it in the `nestDxf` GridFS bucket, and creates a `READY`
  artifact with `attachments.primary`.
- `entities.nestingRun` attaches the latest completed worker DXF when the
  nesting job already produced one; otherwise it creates a pending
  `GENERATING` artifact.
The command also accepts the standardized abstract source socket as
`entities.source` when command runtime receives `{ type, id }` for a source
whose type is accepted by the domain command contract.

## Related

- [domain-cnc attachment kinds](../../../packages/domain-cnc/README.md)
- [commands](../../core/commands/README.md)
