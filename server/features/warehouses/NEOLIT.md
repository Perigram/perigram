# COMPONENT: Warehouses

Warehouse management with inventory tracking for material batches, sheets, and remnants.

## Core Files
- `repository.js`: Database operations on `warehouses` collection
- `service.js`: Business logic, organization filtering, permission checks
- API endpoints in `server/api/warehouses/`

## Data Structure
Collection: `warehouses`

Key fields:
- `name`: Warehouse name
- `organizationId`: Owner organization (ObjectId)
- `address`: Physical address
- `contactPerson`: Contact information
- `totalBatches`: Cached count of material batches (Number)
- `totalSheets`: Cached count of sheets in stock (Number)
- `totalRemnants`: Cached count of remnants in stock (Number)
- `createdAt`, `createdBy`: Audit fields

## Access Control
- Org Admins: Create/Update/Delete warehouses in their organization
- Users with materials write permission: Update warehouse details
- All org members: Read warehouses in their organization

## Key Operations
- `create()`: Create new warehouse, initialize counts to 0
- `list()`: List warehouses filtered by organization
- `update()`: Update warehouse details (name, address, contact)
- `updateInventoryCounts()`: Internal method to increment/decrement inventory counts
- `remove()`: Delete warehouse (only if empty)

## Inventory Management
Inventory counts are updated automatically when:
- Material batches arrive at warehouse (totalBatches++)
- Sheets allocated from batch (totalSheets++)
- Sheets consumed in cutting (totalSheets--)
- Remnants created after cutting (totalRemnants++)
- Remnants used in queue (totalRemnants--)

## Related Components
- [material-batches](../material-batches/NEOLIT.md) - Batches stored in warehouse
- [sheets](../sheets/NEOLIT.md) - Sheet inventory in warehouse
- [remnants](../remnants/NEOLIT.md) - Remnant inventory in warehouse
- [organizations](../organizations/NEOLIT.md) - Warehouse owner organization
