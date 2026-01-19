# COMPONENT: Material Batches

Material batch tracking system for incoming sheet inventory with pile-based organization.

## Core Files
- `repository.js`: Database operations on `material_batches` collection
- `service.js`: Business logic, status workflow, **transaction support for allocation**
- API endpoints in `server/api/material-batches/`

## Data Structure
Collection: `material_batches`

Key fields:
- `batchNumber`: Unique identifier (e.g., "BATCH-000001")
- `receiptId`: Supplier receipt/invoice reference
- `supplierId`: Manufacturer/supplier (ObjectId)
- `warehouseId`: Destination warehouse (ObjectId)
- `requisitionId`: Optional requisition fulfilled (ObjectId)
- `piles`: Array of material piles
  - `_id`: Pile ID (ObjectId)
  - `partyId`: Supplier party identifier
  - `totalCount`: Total sheets in pile (Number)
  - `usedCount`: Sheets allocated from pile (Number)
  - `material`, `color`, `thickness`, `foilThickness`: Material specs
  - `width`, `height`: Sheet dimensions (mm)
  - `pricePerSqm`, `totalPrice`: Pricing
- `status`: "requested" | "assembled" | "sent" | "arrived" | "in_stock" | "partially_used" | "used_up"
- `statusHistory`: Array of status transitions with timestamps
- `notes`: Additional information
- `createdAt`, `createdBy`: Audit fields

## Access Control
- Manufacturers: Create and manage batches they supply
- Contractors: View batches in their warehouses, update arrival status

## Status Workflow
1. **requested** → **assembled**: Manufacturer prepares batch
2. **assembled** → **sent**: Manufacturer ships batch
3. **sent** → **arrived**: Contractor confirms delivery
4. **arrived** → **in_stock**: Contractor processes into inventory
5. **in_stock** → **partially_used**: Some sheets allocated
6. **partially_used** → **used_up**: All sheets allocated

## Key Operations
- `create()`: Create new batch with piles
- `createFromRequisition()`: Auto-create batch from approved requisition
- `list()`: List batches (filtered by organization role)
- `updateStatus()`: Transition through status workflow
- **`allocateSheets()`**: **CRITICAL - Uses MongoDB transaction** to atomically:
  1. Decrement pile `usedCount`
  2. Create sheet records
  3. Update batch status if fully used
  4. Update warehouse counts

## Transaction Example
```javascript
// allocateSheets uses MongoDB transactions to ensure consistency
await session.withTransaction(async () => {
  // 1. Check available sheets in pile
  // 2. Decrement pile.usedCount
  // 3. Create sheet records (done by sheets service)
  // 4. Update batch status (partially_used or used_up)
  // 5. Update warehouse counts
});
```

## Business Rules
- Only manufacturers can create batches
- Auto-generates unique batch numbers (BATCH-XXXXXX)
- Piles track total vs used sheets for availability
- Status auto-updates when all piles fully allocated
- Can't delete batch with allocated sheets

## Related Components
- [requisitions](../requisitions/NEOLIT.md) - Source for batch creation
- [sheets](../sheets/NEOLIT.md) - Sheets allocated from piles
- [warehouses](../warehouses/NEOLIT.md) - Storage location
- [organizations](../organizations/NEOLIT.md) - Manufacturer and contractor organizations
