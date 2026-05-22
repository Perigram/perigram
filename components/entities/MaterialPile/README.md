# COMPONENT: Material Pile UI

Cards for warehouse/manual `material_pile` inventory entries.

## Files

| File | Purpose |
|---|---|
| `PileCard.vue` | Entity card wrapper for general warehouse material piles. |
| `MaterialSummary.vue` | Material/spec/stock summary used by the general pile card. |

## Contract

- Expects a v24 `material_pile` DTO with `identity`, `status`, `lineage`, `specs`, and `data`.
- Uses `data.material`, `data.specs`, `data.stock`, and `data.serial` for the manual/warehouse pile summary.
- Leaves requisition/batch-specific context to [BatchPile](../BatchPile/README.md).

## Related

- [components/shared/README.md](../../shared/README.md) - EntityCard, DataBlock, SpecsBlock
- [server/features/material-piles/README.md](../../../server/features/material-piles/README.md) - Material pile data contract
