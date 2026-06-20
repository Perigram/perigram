# COMPONENT: Operational Hubs

Workflow-level Vue components that group several entity surfaces into a single
operational page.

## Files

| File | Purpose |
|---|---|
| `WarehouseHub.vue` | Warehouse management surface for selecting facilities, editing/deleting empty warehouses, adding/editing/deleting manual material stock, and viewing pile/sheet/remnant/cassette-instance inventory. Its page header is compact: selected warehouse context and counts stay above the tabs, while full warehouse detail belongs to `WarehouseDetail.vue` contexts. |
| `PilesTab.vue` | Manual/general material pile tab using `PileCard`. Emits create/edit/delete/view intents to the hub. |
| `SheetsTab.vue` | Physical sheet inventory tab using `SheetCard`. |
| `RemnantsTab.vue` | Reusable remnant inventory tab using `RemnantCard`. |
| `CassetteInstancesTab.vue` | Produced cassette inventory tab using `CassetteInstanceCard`. |
| `CatalogsTab.vue` | Catalog list tab used by material/library flows. |
| `RequisitionsTab.vue` | Requisition list tab used by procurement-oriented material flows. |

## Patterns

- Hubs compose entity cards, shared panels, `ActionToolbar`, `StateBlock`, and
  `StandardDialog`; they do not replace entity card/detail components.
- Standard CRUD/list operations use `useEntity`. Direct `$fetch` should be
  reserved for custom workflows not covered by entity endpoints.
- List tabs preserve entity-card click contracts: parent hubs listen to card
  intent events such as `view` rather than attaching raw click handlers to
  child components.
- `WarehouseHub` renders selected-warehouse facts through
  `EntitySurfaceContent` and the app `warehouse.workspace` surface. The hub
  merges its derived inventory counts into the selected warehouse DTO before
  rendering so the display remains constructor-driven while preserving the
  operational inventory calculation.
- `WarehouseHub` keeps the current workflow manual: users create warehouses and
  add stock piles directly from existing catalog/color references, or type
  material/color names to create minimal catalog/color records inline. Supply
  network and requisition fulfillment flows remain separate. Inline fallback
  catalog/color payloads are marked `source: 'WAREHOUSE_STOCK'` so the backend
  can allow users with material-write access without granting full catalog
  administration.
- Warehouse inventory counts in the hub are derived from loaded piles,
  available sheet rows, remnants, and cassette instances so the page does not
  depend on a separate stats endpoint. Already-cut queue output sheets are not
  shown as sheet inventory; produced cassettes and reusable remnants are the
  warehouse contents for that workflow. The backend still updates cached
  warehouse counters when manual piles are created, edited, or deleted so cards
  outside the hub do not stay stale.
- The hub must keep operational inventory tabs immediately reachable. It should
  not nest `WarehouseDetail` above the tabs because that detail component owns a
  full entity page surface and repeats identity/stat content that is secondary
  in the warehouse operations workflow.

## Related

- [components/entities/MaterialPile/README.md](../entities/MaterialPile/README.md)
- [components/entities/Warehouse/](../entities/Warehouse/)
- [server/features/warehouses/README.md](../../server/features/warehouses/README.md)
- [server/features/material-piles/README.md](../../server/features/material-piles/README.md)
