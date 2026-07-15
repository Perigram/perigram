# COMPONENT: Cassette Instance UI

Cards and detail views for physical cassette instances produced from queue cuts
or other sheet processing.

## Files

| File | Purpose |
|---|---|
| `CassetteInstanceCard.vue` | Entity card for produced cassette lists. |
| `CassetteInstanceDetail.vue` | Detail page body for tracking and source context. |

## Contract

- Expects a v24 `cassette_instance` DTO with source ids in `lineage` and, for
  queue-cut compatibility, `data.cassetteDesignId`.
- Geometry is rendered through `CassetteThumbnail` using the source
  `cassette_design` id. Baked designs can preview directly from
  `data.layerData` / `data.polygonParts` before any DXF attachment is loaded.
  The thumbnail stays mounted while the source design DTO is loading and then
  reuses the fetched DTO.
- Source design and parent template context render as compact clickable
  `EntityInlineRef` rows because they are source/provenance relations. Queue
  ancestry stays in shared trace chrome through `lineage.queue` and is not
  duplicated in the card body. Relation lookups are silent and tolerate stale
  ids by omitting the resolved row/falling back through shared inline-ref
  behavior.
- Queue-cut instances are displayed as `CUT`; lifecycle actions are provided by
  the workflow/status system, not by local component state.

## Related

- [shared](../../shared/README.md) - `EntityCard`, `EntityStatus`, and drawing canvas rules.
- [server/features/cassette-instances](../../../server/features/cassette-instances/README.md) - Cassette instance service contract.
