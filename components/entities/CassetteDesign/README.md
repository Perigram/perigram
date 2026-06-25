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
  design's own baked geometry over parent-template fallback sources. Baked
  dimension labels therefore render from the design geometry itself with
  measured numeric values.
- Raw parametric values such as `data.parameters.A` / `data.parameters.C` are
  not displayed as card facts; the thumbnail is the geometry signal.
- Parent template context is loaded silently from `lineage.templateId` and
  rendered as a compact `EntityInlineRef`; stale template ids should not flood
  the browser console.
- Exact source geometry revision is loaded from `data.derivedFrom.revisionId`
  and rendered as a compact `EntityInlineRef` when present.
- The footer DXF action downloads from
  `/api/cassette-designs/:id/export`, so saved designs can serve their own
  stored or regenerated DXF independently of their source template.

## Related

- [shared](../../shared/README.md) - entity card and thumbnail drawing rules.
- [EntityRevision](../EntityRevision/README.md) - source revision relation card.
- [server/features/cassette-designs](../../../server/features/cassette-designs/README.md) - Cassette design backend contract.
