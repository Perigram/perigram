# COMPONENT: Remnant UI

Cards and detail views for reusable material remnants.

## Files

| File | Purpose |
|---|---|
| `RemnantCard.vue` | Entity card for warehouse/project remnant lists. |
| `RemnantDetail.vue` | Detail page body for a single remnant. |

## Contract

- Expects a v24 `remnant` DTO with `identity`, `status`, `lineage`, `specs`,
  and `data`.
- Geometry is rendered with `GeometryPreview`, which reads
  `data.geometry.preview`, `data.geometry.data.layers`, `data.geometry.points`,
  or polygon fallback data such as `data.geometry.data.polygon`.
- Queue-cut remnants store the material sheet as the outer polygon and placed
  cassette cut contours as holes. Those holes must remain visible in card and
  detail previews.
- Source sheet relationships render as compact clickable `InstanceInlineRef` rows
  when those DTOs can be fetched from lineage ids. Warehouse location remains
  lineage/detail traceability, not a repeated card fact.
- Actual lifecycle status is rendered by `InstanceCard` / `InstancePage` from the
  `remnant` workflow (`AVAILABLE` / `USED`). The reusable/waste area flag is
  material metadata and must not be rendered as a status substitute.

## Related

- [shared](../../shared/README.md) - `InstanceCard`, `GeometryPreview`, and drawing contract.
- [server/features/remnants](../../../server/features/remnants/README.md) - Remnant data model and production output creation.
