# COMPONENT: Sheets

Sheet inventory tracking from allocation through cutting and milling.

## Core Files
- `repository.js`: Database operations on `sheets` collection
- `service.js`: Business logic, status transitions, milling integration
- API endpoints in `server/api/sheets/`

## Data Structure
Collection: `sheets`

Key fields:
- `sheetNumber`: Unique identifier (e.g., "SH-000001")
- `batchId`, `pileId`: Source batch and pile (ObjectId)
- `warehouseId`: Storage location (ObjectId)
- `material`, `color`, `thickness`, `foilThickness`: Material specs
- `width`, `height`: Sheet dimensions (mm)
- `status`: "in_stock" | "in_cutting" | "milled"
- `history`: Array of action history entries
  - `action`: Action type (allocated, marked_for_cutting, milled, etc.)
  - `timestamp`: When action occurred
  - `userId`: Who performed action
  - `operatorType`: "warehouse" | "queue" | "cnc" | "manual"
  - `note`: Additional details
- `queueId`: Queue assigned for cutting (ObjectId)
- `cassetteInstanceIds`: Cassettes produced from sheet (Array of ObjectId)
- `remnantIds`: Remnants created from sheet (Array of ObjectId)
- `createdAt`, `createdBy`: Audit fields

## Access Control
- Users can access sheets in warehouses they have access to
- Write permission required to allocate, assign to queues, or update status

## Status Flow
1. **in_stock**: Allocated from batch, available for cutting
2. **in_cutting**: Assigned to queue for processing
3. **milled**: Cutting complete, cassettes and remnants created

## Key Operations
- **`allocateFromBatch()`**: **Uses transaction** to create sheets from batch pile
- `list()`: List sheets in accessible warehouses
- `updateStatus()`: Change sheet status with history tracking
- `markForCutting()`: Assign sheets to queue, change status to in_cutting
- **`finishMilling()`**: Mark sheet as milled, record cassettes/remnants, update warehouse counts

## Integration with Queues
When queue is marked as "cut":
1. Call `markForCutting()` to assign sheets to queue
2. Process cutting
3. Call `finishMilling()` for each sheet to:
   - Create cassette instances
   - Create remnants with geometry
   - Update sheet status to milled
   - Decrement warehouse totalSheets
   - Increment warehouse totalRemnants

## Business Rules
- Auto-generates unique sheet numbers
- Tracks full lifecycle from allocation to milling
- History preserves operator type for audit trail
- Can't delete sheets not in_stock status
- Warehouse counts updated automatically

## Related Components
- [material-batches](../material-batches/NEOLIT.md) - Source of sheets
- [remnants](../remnants/NEOLIT.md) - Created after milling
- [queues](../queues/NEOLIT.md) - Cutting queue assignment
- [warehouses](../warehouses/NEOLIT.md) - Storage location
