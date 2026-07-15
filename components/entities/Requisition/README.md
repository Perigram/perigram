# COMPONENT: Requisition UI

Purchasing/requisition card and detail surfaces.

## Files

| File | Purpose |
|---|---|
| `RequisitionCard.vue` | Entity card wrapper for item counts, quantity, total, and manufacturer relation. |
| `RequisitionDetail.vue` | Detail page body for order composition, notes, and lifecycle timeline. |

## Contract

- Expects a `requisition` DTO with workflow status, `data.items`,
  `data.totalPrice`, and lineage to manufacturer/project where available.
- Related manufacturer context uses `EntityInlineRef`. Project ancestry stays
  in shared trace chrome through structured `lineage.project` and is not duplicated in
  the card body.
- Lifecycle transitions are rendered by `EntityCard`/`EntityPage` through
  `EntityStatus` using the workflow/status API. Non-status commands such as
  delete live in the card footer or page actions.

## Related

- [components/entities/BatchPile/README.md](../BatchPile/README.md)
- [components/shared/README.md](../../shared/README.md)
- [server/features/requisitions/README.md](../../../server/features/requisitions/README.md)
