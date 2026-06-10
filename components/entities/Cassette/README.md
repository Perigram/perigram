# COMPONENT: Cassette Components

Cards for base `cassette` DTOs from the `cassettes` collection.

## Components

- `CassetteCard.vue` renders inline, compact, and card variants through shared
  `EntityCard` chrome. It shows cassette identity/status, a data-type-aware
  cassette thumbnail, and parameter count from canonical DTO fields.

## Contract

- Expects a v24 `cassette` DTO with `identity`, `status`, `lineage`,
  `attachments`, and `data`.
- Uses `data.parameters`, `data.geometry`, and `data.definition`. `CassetteThumbnail`
  resolves the visual source in order: DXF geometry, stored geometry preview,
  OCCS definition, then legacy parametric definition.
- `cassette` is distinct from `cassette_template`, `cassette_design`, and
  `cassette_instance` UI contracts.

## Related

- [components/shared/README.md](../../shared/README.md) - EntityCard, DataBlock, drawing previews
- [server/DATA_MODEL.md](../../../server/DATA_MODEL.md) - cassette DTO fields
