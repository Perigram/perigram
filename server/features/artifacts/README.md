# COMPONENT: Artifacts

An `artifact` is an ordinary v24 entity for uploaded, camera-captured, or
generated files. It has canonical identity/origin/status/lineage/relations/
attachments/data blocks. File metadata belongs to `attachments.primary`; an
optional revision-capable non-owning source belongs to `relations.source`.

## Creation And Delivery

The domain construction mode is `createArtifactFromAttachment`. Generated
forms prompt for a name and shared `attachment` input. That input supports both
file upload and device camera capture and passes the uploaded descriptor to the
normal entity service.

- `GET /api/artifacts/:id` returns the access-redacted artifact JSON DTO.
- `GET /api/artifacts/:id/content` checks the same entity access/status and
  streams bytes from the attachment's recorded GridFS bucket.
- `DELETE /api/artifacts/:id` removes the entity and its primary file when
  authorized.

Metadata and content are deliberately separate routes; entity detail requests
must never become file streams.

## Generated Attachments

`generateAttachment` accepts the abstract `source` capability socket. Current
`LAYOUT_DXF` generation loads a sheet design, stores its generated DXF, and
creates a ready artifact linked through `relations.source`. `PDF_PASSPORT`
creates a generating artifact for the downstream generator.

## Related

- [Domain attachment kinds](../../../packages/domain-cnc/README.md)
- [Commands](../../core/commands/README.md)
