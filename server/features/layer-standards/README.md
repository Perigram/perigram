# COMPONENT: Layer Standards

This component manages the system-wide catalogue of layer standards for DXF interpretation and generation.

## Scope
- Core files: `service.js`, `repository.js`
- Tech stack: Node.js, MongoDB
- Entry point: `index.js`
- Dependencies: `mongodb`

## Data Structure
### Layer Standard
```json
{
  "_id": "ObjectId",
  "code": "string",          // Unique identifier (e.g., 2_1_CUT)
  "category": "string",      // CONTOUR, CUT, BEND, MARKING
  "i18n": {
    "en": { "nameTemplate": "string" },
    "ru": { "nameTemplate": "string" }
  },
  "parameters": ["string"],  // e.g., ["diameter"]
  "defaultPenId": "ObjectId", // Link to pen_templates
  "isActive": "boolean"
}
```

## Key Functions
- `getAll()`: Returns all active layer standards.
- `getCount(filter)`: Counts layer standards; used by seed scripts.
- `seed(standards)`: Idempotently creates missing system standards keyed by `code`.
- `getByCategory(category)`: Filters standards by category.
- `getByCode(code)`: Finds a standard by its unique code.
- `generateLayerName(standard, parameters, locale)`: Generates a human-readable DXF layer name based on i18n template and provided parameters (e.g., `2_1_CUT_Cut_3,15`).

## Patterns and Conventions
- **System-Managed:** Layer standards are generally system-managed and read-only for regular users.
- **Flexible IDs:** Repository lookups and organization override records use `toFlexibleId()` because organization IDs can be string UIDs.
- **Naming Convention:** Generated layer names follow the pattern `{CODE}_{LocalizedName}`.
- **Decimal Formatting:** Numbers in Russian locale are formatted with commas (e.g., `3,15`).

## Related
- [Pen Templates](../pen-templates/) - Default visual styles for layers.
- [Cassettes](../cassettes/) - Uses layer standards for mapping.
