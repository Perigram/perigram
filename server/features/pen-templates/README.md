# COMPONENT: Pen Templates

This component manages the display styles (pens) for DXF layers, including color, weight, and line patterns.

## Scope
- Core files: `service.js`, `repository.js`
- Tech stack: Node.js, MongoDB
- Entry point: `index.js`
- Dependencies: `mongodb`

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
- `listAll(userId)`: Returns all system pens plus pens owned by the user.
- `create(data, userId)`: Creates a new user-owned pen.
- `update(id, updates, userId)`: Updates a user-owned pen.
- `remove(id, userId)`: Deletes a user-owned pen.

## Patterns and Conventions
- **System Pens:** Pens with `lineage.userId: null` are read-only and available to all users. `GET /api/templates/pens` is public-read; unauthenticated callers receive only system pens, while authenticated callers also receive their own pens.
- **Ownership:** User IDs are strings from OAuth providers.
- **Color Format:** Colors must be in 6-digit Hex format with `#` prefix.
- **Seeding:** `server/scripts/seed-system-pens.js` imports this feature directly from Node, so service imports must use relative server paths rather than the Nuxt `~` alias. It upserts system pens by `identity.name` and refreshes stroke data so existing layer-standard `defaultPenId` references keep working after pen color changes.
- **OCCS Pens:** The seed includes distinctive OCCS pens for contour, cut, fold, engraving, code, dimension, and envelope layers. Layer-standard seeding resolves those names to `data.defaultPenId`.

## Related
- [Layer Standards](../layer-standards/) - Layers are assigned a default pen.
