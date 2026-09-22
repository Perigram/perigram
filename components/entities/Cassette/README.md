# COMPONENT: Cassette Components

Cards for base `cassette` DTOs from the `cassettes` collection.

## Components

- `CassetteCard.vue` renders inline, compact, and card variants through shared
  `InstanceCard` chrome. It shows cassette identity/status, the nearest lineage
  parent from `lineage.libraryId`, and a data-type-aware cassette thumbnail;
  exact parameter values belong to baked cassette designs, not template/source
  cassette cards.

## Contract

- Expects a v24 `cassette` DTO with `identity`, `status`, `lineage`,
  `attachments`, and `data`.
- Uses `data.parameters`, `data.geometry`, and `data.definition`. `CassetteThumbnail`
  resolves the visual source in order: DXF geometry, stored geometry preview,
  OCCS definition, then legacy parametric definition.
- Template parameter names and defaults remain part of the cassette definition
  and constructor flow. Cards do not summarize them as a count because a source
  cassette does not represent one exact materialized size.
- Parent library context belongs in `lineage.libraryId` and is rendered by the
  shared trace chrome, not as a duplicate body relation row.
- Shows `data.revisions.geometry.currentId` as the current geometry revision via
  `InstanceInlineRef` when the backend revision pointer is present.
- `cassette` is distinct from `cassette_template`, `cassette_design`, and
  `cassette_instance` UI contracts.

## Related

- [components/shared/README.md](../../shared/README.md) - InstanceCard, DataBlock, drawing previews
- [components/entities/EntityRevision/README.md](../EntityRevision/README.md) - Revision relation card
- [server/DATA_MODEL.md](../../../server/DATA_MODEL.md) - cassette DTO fields
