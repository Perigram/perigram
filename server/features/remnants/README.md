# COMPONENT: Remnants

Waste material tracking system for reusable sheet remnants after cutting.

## Core Files
- `repository.js`: Database operations on `remnants` collection
- `service.js`: Business logic, reusability determination, nesting search
- API endpoints in `server/api/remnants/`

## Data Structure
Collection: `remnants`

Key fields:
- `remnantNumber`: Unique identifier (e.g., "REM-000001")
- `sheetId`: Source sheet (ObjectId)
- `warehouseId`: Storage location (ObjectId)
- `material`, `color`, `thickness`, `foilThickness`: Material specs
- `geometryDxf`: DXF geometry data for remnant shape (String)
- `area`: Remnant area in m² (Number)
- `width`, `height`: Bounding box dimensions (mm)
- `qrCode`: Optional QR code for tracking
- `isReusable`: Boolean flag (true if area ≥ 0.1 m²)
- `status`: "in_stock" | "used"
- `usedInQueueId`: Queue where remnant was used (ObjectId)
- `createdAt`, `createdBy`: Audit fields

## Access Control
- Users can access remnants in warehouses they have access to
- Write permission required to create, update, or mark as used

## Reusability Rules
- **Minimum reusable area: 0.1 m²** (100,000 mm²)
- Remnants below threshold marked as non-reusable (waste)
- Only reusable remnants shown in nesting search

## Key Operations
- `create()`: Create single remnant with auto-generated number
- `createMany()`: Bulk create remnants (used by sheets.finishMilling)
- `list()`: List remnants in accessible warehouses
- `searchReusable()`: Find reusable remnants for nesting (sorted by area desc)
- `markAsUsed()`: Mark remnant as used in queue, decrement warehouse count
- `remove()`: Delete remnant (only if not used)

## Integration with Sheets/Queues
1. When sheet is milled (`sheets.finishMilling`):
   - Extract waste polygons from nesting result
   - Calculate area for each polygon
   - Create remnant records with geometry
   - Mark as reusable if area ≥ 0.1 m²
2. When queue uses remnants:
   - Search for reusable remnants matching material/size
   - Call `markAsUsed()` to reserve remnant
   - Remnant geometry used as "hole" in nesting

## Business Rules
- Auto-generates unique remnant numbers (REM-XXXXXX)
- Stores full DXF geometry for use in future nesting
- Reusability automatically determined by area threshold
- Can't delete used remnants
- Warehouse counts updated on create/use/delete

## Related Components
- [sheets](../sheets/README.md) - Source of remnants
- [queues](../queues/README.md) - Can use remnants in nesting
- [warehouses](../warehouses/README.md) - Storage location
