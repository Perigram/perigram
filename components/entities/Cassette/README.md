# COMPONENT: Cassette Components

Cards for `cassette` DTOs — §13 file-class instances served by the generic
instance service (see
[server/packs/facade/cassettes/README.md](../../../server/packs/facade/cassettes/README.md)).

## Components

- `CassetteCard.vue` renders inline, compact, and card variants through shared
  `InstanceCard` chrome. It shows cassette identity and declared fields
  through the bundle-resolved fact rows.
- `CassetteThumbnail.vue` resolves the visual source in order: the stored
  geometry fields (`data.polygonParts`, `data.layerData`), then the OCCS
  payload document (PARAMETRIC templates — fetched from the payload channel
  and parsed).

## Contract

- Expects the §13 wire DTO: `identity`, `lineage`, `attachments.primary`
  (the OCCS/DXF payload reference), and `data` projecting the declared
  fields (`templateType`, `parameters`, `mapping`, `polygonParts`,
  `layerData`).
- Template parameter names and defaults remain part of the payload document
  and constructor flow. Cards do not summarize them as a count because a
  source cassette does not represent one exact materialized size.
- The OCCS document never rides the DTO: the thumbnail fetches it through
  the instance payload URL when a PARAMETRIC template has no stored
  geometry fields.

## Related

- [components/shared/README.md](../../shared/README.md) - InstanceCard, DataBlock, drawing previews
- [server/packs/facade/cassettes/README.md](../../../server/packs/facade/cassettes/README.md) - cassette storage contract
