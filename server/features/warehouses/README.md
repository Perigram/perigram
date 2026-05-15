# COMPONENT: Warehouses

Warehouse management with inventory tracking for material batches, sheets, and remnants.

## Core Files
- `repository.js`: Database operations on `warehouses` collection
- `service.js`: Business logic, organization filtering, permission checks
- API endpoints in `server/api/warehouses/`

## Data Structure
Collection: `warehouses`

Key fields:
- `identity.name`: Warehouse name
- `lineage.organizationId`: Owner organization
- `data.address`: Physical address
- `data.contactPerson`: Contact information
- `data.stats.totalBatches`: Cached count of material batches
- `data.stats.totalSheets`: Cached count of sheets in stock
- `data.stats.totalRemnants`: Cached count of remnants in stock

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
- [material-piles](../material-piles/README.md) - Batches stored in warehouse
- [sheets](../sheets/README.md) - Sheet inventory in warehouse
- [remnants](../remnants/README.md) - Remnant inventory in warehouse
- [organizations](../organizations/README.md) - Warehouse owner organization
