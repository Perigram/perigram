# COMPONENT: Artifact Conversions

This capability converts a declared artifact kind into another declared
artifact kind or a typed target entity. It owns no collection: file persistence
remains in `artifacts`, and entity construction remains in the target feature.

`service.js` reads the domain conversion contract from
`packages/facade/src/artifact-conversions.js`, verifies the source artifact
kind, then delegates. The current implementations copy `LAYOUT_DXF` into a new
revision-backed `DXF_SOURCE` artifact and import a `DXF_SOURCE` through the
cassette service's `importFromArtifact()` constructor. Conversion provenance is
recorded on artifact targets; cassette import retains its existing construction
provenance and geometry validation.

`operations.js` is the `convertArtifact` command handler registered in the app
registry. It returns typed entity references together with created DTOs so the
generated process screen can update any loaded target source immediately.

## Related

- [Artifacts](../artifacts/README.md)
- [Cassette templates](../cassettes/README.md)
- [Commands](../../core/commands/README.md)
