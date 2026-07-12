# COMPONENT: Batch Pile UI

Cards for requisition/batch-sourced `material_pile` entries. This is not the same surface as the general warehouse material pile card: it emphasizes the received batch context.

## Files

| File | Purpose |
|---|---|
| `BatchPileCard.vue` | Entity card wrapper for a requisition-sourced pile. |
| `BatchPileSummary.vue` | Compact batch pile receipt/stock summary. |

## Contract

- Uses the same backend entity type and API collection as `material_pile`.
- Expects batch context in `lineage.requisitionId` plus normal `lineage.warehouseId` / `lineage.catalogId` ancestry.
- Displays `data.serial`, `data.stock`, and `specs` directly; it does not use `MaterialSummary`, because the card is about a received batch pile rather than a manual material pile.

## Related

- [components/entities/MaterialPile/README.md](../MaterialPile/README.md) - general material pile card
- [components/shared/README.md](../../shared/README.md) - EntityCard, DataBlock, SpecsBlock, EntityInlineRef
- [server/features/material-piles/README.md](../../../server/features/material-piles/README.md) - Material pile data contract
