# COMPONENT: Catalog UI

Catalog card/detail surfaces for manufacturer material offerings and available
sheet/foil options.

## Files

| File | Purpose |
|---|---|
| `CatalogCard.vue` | Entity card wrapper for catalog summary, pricing, option counts, and manufacturer relation. |
| `CatalogDetail.vue` | Detail view for catalog metadata and related colors/options. |

## Contract

- Expects a `catalog` DTO with `identity`, structured `lineage.manufacturer`, `data`,
  and `summary.colorCount`.
- Uses `DataBlock` for option/pricing facts and `EntityInlineRef` for the
  manufacturer relation.
- Catalog status is hidden; catalogs are master data, not workflow objects.
- `CatalogDetail` uses `EntityPage` with `showStatus=false` so identity, trace,
  and actions stay in the shared detail-page contract while avoiding workflow
  chrome for static master data.

## Related

- [components/entities/Color/README.md](../Color/README.md) - catalog color cards
- [components/shared/README.md](../../shared/README.md) - entity cards and relation refs
- [server/features/catalogs/README.md](../../../server/features/catalogs/README.md) - catalog service contract
