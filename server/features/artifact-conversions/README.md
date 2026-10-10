# COMPONENT: Artifact Conversions

This capability converts a declared artifact kind into another declared
artifact kind or a typed target entity. It owns no collection: file persistence
remains in `artifacts`, and entity construction runs through the generic
instance machinery. The machinery is plugin-agnostic — it owns source
verification, artifact-to-artifact copying, and the service-backed entity
path — and imports no domain code.

The conversion catalog (ids, labels, source kinds, targets, and per-target
service bindings) comes from the organization's installed plugins
([plugins feature](../plugins/README.md)): the facade plugin supplies
`layoutDxfToDxfSource` (copy a `LAYOUT_DXF` into a new revision-backed
`DXF_SOURCE` artifact — pure framework machinery) and
`dxfSourceToCassette` (import a `DXF_SOURCE` as a STANDARD cassette —
the artifact file travels as a value to the plugin's executor, which
returns the payload and extracted geometry fields; the platform stores
the payload and creates the cassette generically). Conversion provenance
is recorded on both target shapes. Without an installed plugin no
conversions are known — the service refuses unknown ids and entity
targets without a service binding.

`operations.js` is the `convertArtifact` command handler registered in the
app registry; `POST /api/artifact-conversions` is the client-reachable
route (editor dialogs that are not process actions). Both return typed
entity references together with created DTOs so generated screens can
update any loaded target source immediately.

## Related

- [Artifacts](../artifacts/README.md)
- [Plugins](../plugins/README.md)
- [Commands](../../core/commands/README.md)
