# COMPONENT: Colors

Standalone color/finish library for materials, separated from catalogs to allow cross-catalog browsing for customers.

## Core Files
- `repository.js`: Database operations on `colors` collection
- `service.js`: Business logic, ownership validation, and list operations
- API endpoints in `server/api/colors/`

## Data Structure
Collection: `colors`

Key fields:
- `name`: Color name (e.g., "Anthracite Grey")
- `code`: Visual code (e.g., "RAL 7016")
- `thumbnail`: URL to swatch image
- `colorFallback`: Hex code for UI display fallback
- `pricePerSqm`: Optional price override for this specific color
- `catalogId`: Reference to parent `catalogs` document
- `createdAt`, `updatedAt`: Audit fields

## Access Control
- Manufacturers: CRUD on colors linked to their catalogs
- Contractors: Read-only access to all colors for browsing and ordering

## Key Operations
- `create()`: Add new color to a catalog
- `list()`: List all colors (can be filtered by `catalogId`)
- `update()`: Modify color metadata
- `remove()`: Delete color swatch

## Related Components
- [catalogs](../catalogs/NEOLIT.md) - The material constraints this color belongs to
- [requisitions](../requisitions/NEOLIT.md) - Requisitions reference colors by ID
