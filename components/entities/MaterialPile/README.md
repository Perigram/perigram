# COMPONENT: Material Pile UI

Cards for warehouse/manual `material_pile` inventory entries.

## Files

| File | Purpose |
|---|---|
| `PileCard.vue` | Entity card wrapper for general warehouse material piles. |
| `MaterialSummary.vue` | Material/spec/stock summary used by the general pile card. |

## Contract

- Expects a v24 `material_pile` DTO with `identity`, `status`, `lineage`, `specs`, and `data`.
- Uses `data.material`, `data.specs`, `data.stock`, `data.stockMovements`, and
  `data.serial` for the manual/warehouse pile summary. The card displays
  `identity.serial` when present and falls back to `data.serial` for older
  records.
- `EntityCard` owns the actual pile lifecycle status (`STOCKED` / `DEPLETED`).
  `MaterialSummary` displays the latest stock movement only as compact audit
  context for receipt, manual adjustment, or production allocation; it must not
  render movement facts as status badges.
- Warehouse and catalog lineage context renders as nested inline entity cards
  when those related DTOs can be fetched.
- Dimensions should be available through the standard `specs` block; backend
  DTO normalization mirrors legacy `data.specs` there for existing records.
- Leaves requisition/batch-specific context to [BatchPile](../BatchPile/README.md).

## Related

- [components/shared/README.md](../../shared/README.md) - EntityCard, DataBlock, SpecsBlock
- [server/features/material-piles/README.md](../../../server/features/material-piles/README.md) - Material pile data contract
