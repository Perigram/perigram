# COMPONENT: Material Pile UI

Cards for warehouse/manual `material_pile` inventory entries.

## Files

| File | Purpose |
|---|---|
| `PileCard.vue` | Entity card wrapper for general warehouse material piles. |
| `MaterialSummary.vue` | Material/spec/stock summary used by the general pile card. |

## Contract

- Expects a v24 `material_pile` DTO with `identity`, `status`, `lineage`, `specs`, and `data`.
- Uses `data.stock` for the manual/warehouse pile summary. Material identity
  belongs to related catalog/material context, and dimensions belong to the
  standard `specs` block instead of duplicated chips.
- `InstanceCard` owns the actual pile lifecycle status (`STOCKED` / `DEPLETED`).
  `MaterialSummary` does not render latest stock movement/audit events; those
  belong in a movement/history surface.
- Catalog lineage context renders as a nested inline entity card when the
  related DTO can be fetched. Warehouse location remains lineage/detail context,
  not a repeated card fact.
- Dimensions should be available through the standard `specs` block; backend
  DTO normalization mirrors legacy `data.specs` there for existing records.
- Leaves requisition/batch-specific context to [BatchPile](../BatchPile/README.md).

## Related

- [components/shared/README.md](../../shared/README.md) - InstanceCard, DataBlock, SpecsBlock
- [server/features/material-piles/README.md](../../../server/features/material-piles/README.md) - Material pile data contract
