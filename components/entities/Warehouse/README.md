# COMPONENT: Warehouse UI

Warehouse master-data card and detail surfaces.

## Files

| File | Purpose |
|---|---|
| `WarehouseCard.vue` | Entity card wrapper for warehouse type, address/contact, and stock summary. |
| `WarehouseDetail.vue` | Full detail view for warehouse master data and summary stats. It is not embedded above `WarehouseHub` inventory tabs. |

## Contract

- Expects a `warehouse` DTO with `identity`, `data.type`, `data.address`, and
  `data.stats`.
- Warehouse cards show master-data facts; stock inventory is displayed through
  material pile, sheet, and remnant entity surfaces.
- Status is hidden unless the domain workflow contract exposes warehouse
  lifecycle behavior.
  above its tabs; full detail-page content stays in `WarehouseDetail.vue` so
  inventory users do not scroll past repeated page chrome.

## Related

- [components/entities/MaterialPile/README.md](../MaterialPile/README.md)
- [components/entities/Sheet/README.md](../Sheet/README.md)
- [components/entities/Remnant/README.md](../Remnant/README.md)
- [components/shared/README.md](../../shared/README.md)
- [server/features/warehouses/README.md](../../../server/features/warehouses/README.md)
