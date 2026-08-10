# COMPONENT: Catalogs

Master material definitions provided by Manufacturers.

## v24 Architecture
- **Pricing Source**: The definitive source for `pricePerSqm`.
- **Options**: Defines the available `sheetThicknesses`, `foilThicknesses`, and `dimensions` for a material brand.
- **Physical Specs**: Stores the `material` type (ALUMINUM, STEEL, etc.) and `technicalSpecs` like `flexion`.
- **Warehouse Stock Fallback**: Normal catalog creation requires `catalogs`
  admin permission. Payloads marked `source: 'WAREHOUSE_STOCK'` may be created
  by users with `materials` write permission so manual stock entry can create a
  minimal material reference without granting catalog administration.

## Data Structure
```typescript
{
  identity: { name },
  lineage: { organizationId }, // Manufacturer
  material: String,
  pricing: { pricePerSqm, currency },
  options: { sheetThicknesses, foilThicknesses, widths, lengths }
}
```
