# COMPONENT: Colors (Finish SKUs)

Specific material variants (SKUs) linked to a parent Catalog.

## v24 Architecture
- **SKU Identity**: Stores the manufacturer `code` and friendly finish name.
- **Visual Mapping**: Stores `hexCode` and optional `textureUrl` for UI rendering.
- **Lineage**: Strictly links to a `catalogId`.

## Data Structure
```typescript
{
  identity: { name, code },
  visuals: { hexCode, textureUrl },
  lineage: { organizationId, catalogId }
}
```