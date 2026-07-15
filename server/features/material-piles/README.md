# COMPONENT: Material Piles

The "Source of Truth" for physical material inventory. Replaces the legacy multi-pile "Batch" collection with a flattened, single-pile document model.

## v24 Architecture
- **Specs Source**: New and returned pile DTOs expose the standard `specs`
  block for dimensions (`sheetThickness`, `foilThickness`, `width`, `length`,
  `area`). Older records with only `data.specs` are normalized by the model.
- **Inventory Tracking**: Uses `data.stock: { total, used }` to manage
  availability and `data.stockMovements[]` as a bounded audit trail for
  receipts, manual adjustments, and allocations.
- **Status**: Uses the domain `material_pile` workflow. Piles start
  `STOCKED`; `allocate()` performs a system-authored transition to `DEPLETED`
  only when `used >= total`.
- **Lineage**: Inherits ancestry from `Warehouse`, `Catalog`, `Color`, and optional `Requisition`. A requisition id marks a received batch pile; manual warehouse piles can omit it.

## Key Logic
- `allocate()`: Atomically increments `used` stock, appends an `ALLOCATION`
  stock movement, decrements the parent warehouse cached `totalSheets` when
  the pile has `lineage.warehouseId`, and performs a system-authored state
  change to `DEPLETED` when finished. Counts must be positive whole-sheet
  values.
- `allocateSheets()`: Compatibility allocation helper used by tests/legacy
  callers; increments `data.stock.used`, appends an `ALLOCATION` movement, and
  returns placeholder sheet allocations. Counts must be positive whole-sheet
  values.
- `updateStatus()`: Standardized state transitions with audit trail/notes.
- `create()`: Standardized block initialization for manual warehouse stock.
  It requires warehouse, catalog, and color lineage, generates a serial when
  one is not provided, rejects negative quantity, and records a `RECEIPT`
  stock movement.
- `list()`: Applies organization access filters plus caller filters such as
  `lineage.warehouseId`, so warehouse and queue inventory views do not leak
  piles from other facilities.
- `update()`: Updates display fields, `data.stock`, and both `specs` /
  `data.specs` when dimensions change. It rejects stock totals where `used`
  would exceed `total` and records an `ADJUSTMENT` movement when stock totals
  change.
- Manual pile create/update/delete keeps cached warehouse `data.stats`
  counters in sync for total batches and sheet stock. Deleting is allowed only
  for unused piles.
- Choosing a completed nesting run for production calls `allocate()` for
  selected `PILE` material-pool sources, so manual warehouse stock and cached
  warehouse sheet counts are decremented while the parent queue remains
  `READY`. Queue and nesting-run ids are stored on allocation movements when
  the allocation comes from run acceptance.

## Data Structure
```typescript
{
  identity: { name, serial },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId, warehouseId, catalogId, colorId, requisitionId? },
  specs: { sheetThickness, foilThickness, width, length, area },
  data: {
    material?: string,
    color?: string,
    specs: { sheetThickness, foilThickness, width, length },
    stock: { total, used },
    stockMovements: Array<{
      at,
      type: 'RECEIPT' | 'ADJUSTMENT' | 'ALLOCATION',
      quantity,
      usedDelta?,
      userId?,
      queueId?,
      runId?,
      stock: { total, used }
    }>
  }
}
```

Frontend UI Lab keeps two card contracts over this entity type: `materialPile` for general/manual warehouse stock and `batchPile` for requisition-sourced received piles.

## Related Components
- [Catalogs](../catalogs/README.md) - Definitive material options.
- [Sheets](../sheets/README.md) - Individual units created from a pile.
