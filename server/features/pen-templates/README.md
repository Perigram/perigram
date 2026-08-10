# COMPONENT: Pen Templates

This component manages the display styles (pens) for DXF layers, including color, weight, and line patterns.

## Data Structure
### Pen Template
```json
{
  "_id": "ObjectId",
  "identity": { "name": "string" },
  "lineage": { "userId": "string | null" },
  "data": {
    "stroke": {
      "color": "string",
      "weight": "number",
      "pattern": "SOLID | DASHED | DOTTED"
    }
  },
  "status": "Status block"
}
```

## Key Functions
- `listAll(userId)`: System pens plus the caller's own pens.
- `create(data, userId)`, `update(id, updates, userId)`, `remove(id, userId)`:
  user-owned pen lifecycle. Pens with `lineage.userId: null` are read-only.

## Patterns and Conventions
- **System Pens:** Pens with `lineage.userId: null` are marked public-read with
  `lineage.scope: "system"`, `lineage.public: true`, and
  `data.visibility.public: true`. They are read-only and available through the
  shared public-system-data access rule rather than copied permission grants.
  `GET /api/templates/pens` is public-read; unauthenticated callers receive
  only system pens, while authenticated callers also receive their own pens.
- **Ownership:** User IDs are strings from OAuth providers.
- **Color Format:** Colors must be in 6-digit Hex format with `#` prefix.
- **Seeding:** `server/scripts/seed-system-pens.js` imports this feature directly from Node, so service imports must use relative server paths rather than the Nuxt `~` alias. It upserts system pens by `identity.name` and refreshes stroke data.
- **OCCS Pens:** The seed includes distinctive OCCS pens for contour, cut, fold, engraving, code, dimension, and envelope layers. Layer-standard seeding resolves those names to `data.defaultPenId`.

## Related
- [Layer Standards](../layer-standards/) - Layers are assigned a default pen.
