# COMPONENT: Material Piles

The "Source of Truth" for physical material inventory. Replaces the legacy multi-pile "Batch" collection with a flattened, single-pile document model.

## v24 Architecture
- **Specs Source**: The only document storing the primary physical DNA (`sheetThickness`, `foilThickness`, `flexion`).
- **Inventory Tracking**: Uses `stock: { total, used }` to manage availability.
- **Lineage**: Inherits ancestry from `Warehouse`, `Catalog`, `Color`, and `Requisition`.

## Key Logic
- `allocate()`: Atomically increments `used` stock and triggers state change to `DEPLETED` when finished.
- `updateStatus()`: Standardized state transitions with audit trail/notes.
- `create()`: Standardized block initialization with physical specs validation.

## Data Structure
```typescript
{
  identity: { name, serial },
  origin: StatusBlock,
  status: StatusBlock,
  lineage: { organizationId, warehouseId, catalogId, colorId },
  specs: { sheetThickness, foilThickness, width, height },
  stock: { total, used }
}
```

## Related Components
- [Catalogs](../catalogs/README.md) - Definitive material options.
- [Sheets](../sheets/README.md) - Individual units created from a pile.