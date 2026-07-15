# COMPONENT: Colors (Finish SKUs)

Specific material variants (SKUs) linked to a parent Catalog.

## v24 Architecture
- **SKU Identity**: Stores the manufacturer `code` and friendly finish name.
- **Visual Mapping**: Stores `hexCode` and optional `textureUrl` for UI rendering.
- **Lineage**: Strictly contains a structured `catalog` parent reference and
  its inherited organization ancestry.
- **Access Filtering**: `list()` combines caller lineage permissions with
  optional filters such as `catalogId`, so stock-management color selectors do
  not leak finishes from other organizations.
- **Warehouse Stock Fallback**: Normal color creation requires `catalogs`
  write permission. Payloads marked `source: 'WAREHOUSE_STOCK'` may be created
  by users with `materials` write permission to support manual warehouse stock
  entry.

## Data Structure
```typescript
{
  identity: { name, code },
  lineage: {
    organization: { entityType: 'organization', entityId },
    catalog: { entityType: 'catalog', entityId }
  },
  data: { code, visuals: { hexCode, textureUrl } }
}
```
