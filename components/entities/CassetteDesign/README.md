# COMPONENT: Cassette Design UI

Card surface for cassette design DTOs created from templates, uploads, or baked
parametric/OCCS definitions.

## Files

| File | Purpose |
|---|---|
| `CassetteDesignCard.vue` | Geometry-first design card with parent template context. |

## Contract

- Expects a v24 `cassette_design` DTO with `identity`, `lineage`, and `data`.
- Geometry is rendered by `CassetteThumbnail`, which resolves stored DXF,
  baked cassette `data.layerData` / `data.polygonParts`, geometry previews,
  OCCS definitions, or parametric definitions.
- The design card passes `preferGeometry` to `CassetteThumbnail`, so preview
  rendering fetches the full `cassette_design` DTO when needed and prefers the
  design's own baked layer/preview geometry over both parent-template fallback
  sources and stored DXF files. Baked dimension labels therefore render from
  the design geometry itself with measured numeric values using the persisted
  `dimension.cassette` geometry authored for that design.
- Shared constructor previews (`EntityPreview`) apply the same
  `preferGeometry` rule for `cassette_design`, so generated list/detail screens
  do not fall back to parent-template geometry when the design DTO in screen
  data is partial.
- Generated entity surfaces display exact design parameters from
  `data.parameters` as named values such as `A=1200, B=400`. If an older DTO
  lacks that top-level snapshot, the display contract may fall back to
  `data.derivedFrom.parameters`; template parameter counts are not shown on
  design cards.
- Parent template context belongs in structured `lineage.cassette` and is rendered by
  the shared trace chrome as the nearest parent, matching how cassette cards
  render their `lineage.library` parent. The card body does not duplicate that
  parent as a separate relation row.
- Exact source geometry revision is loaded from `data.derivedFrom.revisionId`
  and rendered as a compact `EntityInlineRef` when present.
- The footer DXF action downloads from
  `/api/cassette-designs/:id/export`, so saved designs can serve their own
  stored or regenerated DXF independently of their source template.

## Related

- [shared](../../shared/README.md) - entity card and thumbnail drawing rules.
- [EntityRevision](../EntityRevision/README.md) - source revision relation card.
- [server/features/cassette-designs](../../../server/features/cassette-designs/README.md) - Cassette design backend contract.
