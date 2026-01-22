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
- `material`: Material type (e.g., "Aluminium Composite")
- `foilThicknessOptions`: Array of available foil thicknesses (mm) [0.2, 0.3, 0.5]
- `sheetThicknessOptions`: Array of available sheet thicknesses (mm) [2, 2.5, 3, 4, 5]
- `widthOptions`: Array of available widths (mm) [1220, 1500]
- `description`: Catalog description
- `createdAt`, `updatedAt`: Audit fields

Collection: `colors` (Separated for cross-catalog browsing)
- `name`: Color name
- `code`: Color code (RAL, etc.)
- `thumbnail`: Swatch image URL
- `fallback`: Hex color
- `catalogId`: Reference to parent catalog

## Access Control
- Manufacturers: Manage their catalogs and associated colors
- Contractors: Browse all colors and material specifications

## Related Components
- [requisitions](../requisitions/NEOLIT.md) - Uses catalog constraints and selected colors to form orders.

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
