# COMPONENT: Catalogs

Master material definitions provided by Manufacturers.

## v24 Architecture
- **Pricing Source**: The definitive source for `pricePerSqm`.
- **Options Engine**: Defines the available `sheetThicknesses`, `foilThicknesses`, and `dimensions` for a material brand.
- **Physical Specs**: Stores the `material` type (ALUMINUM, STEEL, etc.) and `technicalSpecs` like `flexion`.

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