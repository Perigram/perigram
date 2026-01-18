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
  "name": "string",
  "ownerId": "string",  // null for system pens, string (OAuth ID) for user pens
  "stroke": {
    "color": "string",  // Hex color code (e.g., #FF0000)
    "weight": "number", // Line weight (e.g., 0.25)
    "pattern": "string" // SOLID, DASHED, DOTTED
  },
  "createdAt": "Date"
}
```

## Key Functions
- `listAll(userId)`: Returns all system pens plus pens owned by the user.
- `create(data, userId)`: Creates a new user-owned pen.
- `update(id, updates, userId)`: Updates a user-owned pen.
- `remove(id, userId)`: Deletes a user-owned pen.

## Patterns and Conventions
- **System Pens:** Pens with `ownerId: null` are read-only and available to all users.
- **Ownership:** User IDs are strings from OAuth providers.
- **Color Format:** Colors must be in 6-digit Hex format with `#` prefix.

## Related
- [Layer Standards](../layer-standards/) - Layers are assigned a default pen.
