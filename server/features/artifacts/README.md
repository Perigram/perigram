# COMPONENT: Artifacts

Persisted metadata entity for generated files and uploaded previews. The
framework contract term for file behavior is `AttachmentKind`; `artifact` is the
current app entity type that stores file metadata and GridFS references.

## Responsibilities

- Create generation requests through `generateAttachment`.
- Store primary file metadata under `attachments.primary`.
- Stream files from kind-specific GridFS buckets.
- Return artifact DTOs for Workbench and preview UI.
- Render optional organization artifact templates and pin the exact template
  revision in artifact provenance.
- Create immutable artifact layout revisions when a template-backed artifact is
  generated or its placed items are moved/deleted.

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

When `entities.template` contains an `artifact_template`, generation delegates
rendering to the template feature and requires the requested kind to match the
format (`LAYOUT_DXF` for DXF, `PDF_PASSPORT` for PDF). Values are validated
against the selected revision's typed variables. The artifact stores the
rendered file immediately, keeps editable layout/values under `data`, and pins
the source and template revision under `provenance`.

`PUT /api/artifacts/:id/layout` creates a new artifact layout revision and
replaces the rendered file. PDF generation without a template is rejected
instead of creating a permanently pending record.

## Related

- [domain-cnc attachment kinds](../../../packages/domain-cnc/README.md)
- [commands](../../core/commands/README.md)
- [artifact templates](../artifact-templates/README.md)
