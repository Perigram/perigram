# COMPONENT: Catalogs

Material catalog management for manufacturers to publish their sheet offerings.

## Core Files
- `repository.js`: Database operations on `catalogs` collection
- `service.js`: Business logic, manufacturer/contractor access control
- API endpoints in `server/api/catalogs/`

## Data Structure
Collection: `catalogs`

Key fields:
- `name`: Catalog name
- `manufacturerId`: Owner manufacturer (ObjectId)
- `description`: Catalog description
- `sheetTypes`: Array of sheet type offerings
  - `_id`: Sheet type ID (ObjectId)
  - `material`: Material type (e.g., "Aluminium Composite")
  - `color`: Color name
  - `thickness`: Sheet thickness (mm)
  - `foilThickness`: Foil coating thickness (microns)
  - `sizes`: Array of available sizes
    - `width`, `height`: Dimensions (mm)
    - `pricePerSqm`: Price per square meter
  - `notes`: Additional information
- `createdAt`, `updatedAt`: Audit fields

## Access Control
- Manufacturers: Full CRUD on their own catalogs
- Contractors: Read-only access to all catalogs

## Key Operations
- `create()`: Create new catalog (manufacturer only)
- `list()`: List catalogs (filtered by manufacturer if manufacturer user)
- `addSheetType()`: Add new sheet type to catalog
- `updateSheetType()`: Update sheet type details and pricing
- `removeSheetType()`: Remove sheet type from catalog
- `remove()`: Delete entire catalog

## Business Rules
- Only manufacturers can create/manage catalogs
- Contractors can browse all catalogs to create requisitions
- Sheet types have embedded IDs for referencing in requisitions
- Prices are snapshotted in requisitions (changes don't affect existing orders)

## Related Components
- [requisitions](../requisitions/NEOLIT.md) - Orders created from catalogs
- [organizations](../organizations/NEOLIT.md) - Manufacturer organizations
