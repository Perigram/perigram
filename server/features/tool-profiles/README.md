# COMPONENT: Tool Profiles

System and user-owned CNC tool definitions used by nesting, cassette processing, and layer/tool mapping flows.

## Core Files
- `service.js`: Validates tool profile data and exposes CRUD-style operations.
- `repository.js`: MongoDB access for `tool_profiles`.
- `index.js`: Public feature entry point exporting the service namespace.

## Data Structure
Collection: `tool_profiles`

Key fields:
- `identity.name`: Display name.
- `lineage.userId`: `null` for system tools, string user ID for user-owned tools.
- `data.diameter`: Positive numeric tool diameter.
- `data.angle`: Numeric angle; defaults to `0`.
- `data.kerf`: Cut width; defaults to `diameter`.
- `data.description`: Optional text.

## Key Functions
- `listAll(userId)`: Returns system tools plus tools owned by the user.
- `create(data, userId)`: Creates a system tool when `userId` is null, otherwise user-owned.
- `update(id, updates, userId)`: Updates a non-system tool.
- `remove(id, userId)`: Deletes a non-system tool.

## Seeding
`server/scripts/seed-system-tools.js` imports this feature directly from Node, so service imports must use relative server paths rather than the Nuxt `~` alias.

## Access

System tools use `lineage.userId: null` and are marked public-read with
`lineage.scope: "system"`, `lineage.public: true`, and
`data.visibility.public: true`. The shared access engine reads that marker
directly, so users do not need material grants just to view system tools.
`GET /api/templates/tools` is public-read; unauthenticated callers receive only
system tools, while authenticated callers also receive their own tool profiles.
Create/update/delete remain authenticated ownership operations.

## Related
- [Layer Standards](../layer-standards/README.md) - Layer categories map to tool and pen behavior.
- [Pen Templates](../pen-templates/README.md) - Visual layer styling.
