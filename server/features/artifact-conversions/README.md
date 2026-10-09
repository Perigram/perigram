# COMPONENT: Artifact Conversions

This capability converts a declared artifact kind into another declared
artifact kind or a typed target entity. It owns no collection: file persistence
remains in `artifacts`, and entity construction remains in the mounted pack's
executors. The machinery is pack-agnostic — it owns source verification and
artifact-to-artifact copying, and imports no domain code.

The declared conversion catalog (ids, labels, source kinds, targets) and the
entity-target executors arrive through the `convertArtifact` command handler
override the pack mounts (see
[server/packs/facade](../../../packages/facade/server/index.js)): the facade pack supplies
`layoutDxfToDxfSource` (copy a `LAYOUT_DXF` into a new revision-backed
`DXF_SOURCE` artifact) and `dxfSourceToCassette` (import a `DXF_SOURCE`
through the cassette service's `importFromArtifact()` constructor) with the
catalog from `packages/facade/src/artifact-conversions.js`. Conversion
provenance is recorded on artifact targets; cassette import retains its
existing construction provenance and geometry validation. Without a mounted
pack no conversions are known — the service refuses unknown ids and
executor-less entity targets.

`operations.js` is the `convertArtifact` command handler registered in the app
registry. It returns typed entity references together with created DTOs so the
generated process screen can update any loaded target source immediately.

## Related

- [Artifacts](../artifacts/README.md)
- [Cassette templates](../../../packages/facade/server/cassettes/README.md)
- [Commands](../../core/commands/README.md)
