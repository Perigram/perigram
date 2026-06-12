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
- Source sheet, warehouse, and material pile relationships render as compact
  clickable `EntityInlineRef` rows when those DTOs can be fetched from lineage
  ids.
- Actual lifecycle status is rendered by `EntityCard` / `EntityPage` from the
  `remnant` workflow (`AVAILABLE` / `USED`). The reusable/waste area flag is
  material metadata and must not be rendered as a status substitute.

## Related

- [shared](../../shared/README.md) - `EntityCard`, `GeometryPreview`, and drawing contract.
- [server/features/remnants](../../../server/features/remnants/README.md) - Remnant data model and production output creation.
