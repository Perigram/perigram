# CODE: Server Utilities — Auth & Permissions API

Utility functions for authentication and multi-tenant permission enforcement. Used in all API routes and services.

---

## Auth Context Object

Every API route has `event.context.auth` populated by the auth middleware after JWT verification:

```js
{
  userId: string,         // OAuth user ID (string, NOT ObjectId)
  role: string,           // Optional legacy compatibility label
  memberships: [          // Array of organization memberships
    {
      organizationId: ObjectId,
      role: string,
      permissions: {      // Per-type-id access levels
        projects: 'read' | 'write' | 'admin' | 'none',
        queues:   'read' | 'write' | 'admin' | 'none',
        // ... other entity types
      }
    }
  ],
  restrictedTo: {         // Optional: entity-specific access restrictions
    projectIds: [string],
    queueIds: [string],
    // ...
  } | null
}
```

---

## permissions.js

### `requireAuth(event)` → `authContext`
Throws 401 if not authenticated. Returns `event.context.auth`.

```js
const user = requireAuth(event);
```

### `hasLineagePermission(user, lineage, typeId, level, options?)` → `boolean`
Checks if user has the required access level for an entity based on its `lineage.organizationId`.

```js
// typeId: 'projects' | 'queues' | 'sheets' | 'material-piles' | ...
// level: 'read' | 'write' | 'admin'
if (!hasLineagePermission(user, entity.lineage, 'queues', 'write')) { ... }
if (!hasLineagePermission(user, entity, 'projects', 'write', { action: 'create' })) { ... }
```
Levels are ordered: `none < read < write < admin`.

### `requireLineagePermission(event, lineage, typeId, level)` → `authContext`
Combines requireAuth + hasLineagePermission. Throws 401/403. Returns user.

```js
// Standard pattern for protected entity routes:
const user = requireLineagePermission(event, entity.lineage, 'queues', 'write');
```

### `getLineageFilter(user)` → `MongoFilter`
Returns a MongoDB filter for multi-tenant scoping. Plug into repository queries.

```js
// For list queries — always scope to user's organizations:
const filter = { ...getLineageFilter(user), status: 'OPEN' };
const results = await repository.findAll(filter);
```
Users without memberships get an empty `$in` filter; users with memberships get
`{ 'lineage.organizationId': { $in: [...orgIds] } }`.

## entity-redaction.js

### `serializeForAccess(typeId, entity, auth)` / `serializeManyForAccess(...)`
Serializes model instances or DTOs and applies shared field-level redaction
from `shared/entity-field-access.js` when an auth context is provided. Internal
service calls can omit `auth` to keep full domain objects for workflows, hooks,
and background tasks. API GET/list routes should pass `event.context.auth` so
entity cards only receive fields allowed by the current user's membership
permissions.

### `requirePermission(event, entity, level)` → `authContext`
Uses `hasPermission()` from auth-helpers against explicit `user.permissions`.
Use for system-level resources without lineage.

### `checkEntityAccess(user, entity, entityOrgId)` → `boolean`
Legacy organization-level compatibility helper. New v24 services should use
`hasLineagePermission()` / `requireLineagePermission()` instead.

## auth-helpers.js

### `hashPassword(password)` / `verifyPassword(hash, password)`
Argon2 password hashing.

### `generateAccessToken(userId)` / `verifyAccessToken(token)`
JWT signing/verification (15min expiry). Tokens carry only `userId` — permissions fetched fresh from DB on each request.

### `hasPermission(user, entity, requiredLevel)` → `boolean`
Checks explicit `user.permissions[entity]`. Different from lineage-based — use
for non-entity system resources.

### `canAccessEntity(user, typeId, entityId)` → `boolean`
Checks `user.restrictedTo` whitelist. Returns `true` if no restrictions.

---

## Decision Guide

| Situation | Use |
|---|---|
| Any entity with a lineage block | `requireLineagePermission` |
| List query — scope to user's orgs | `getLineageFilter` |
| Admin capability route | `requirePermission` or a feature-level access check |
| Auth check only, permission later | `requireAuth` |
| Non-entity resource (system settings) | `requirePermission` / `hasPermission` |
| Password login flow | `hashPassword` / `verifyPassword` |

## Deprecated Bridges

`server/utils/blocks.js` re-exports the core block API for legacy tests/callers
only. Feature code must import from `server/core/blocks/index.js`; the
architecture checker enforces this for v24 entity modules.

## extract-data-models.js

Generates the debug data-model inventory consumed by `/api/debug/data-models` and `server/DATA_MODEL.md`.

The extractor is code-aware but not a schema compiler. It reads feature `model.js`, `service.js`, and `repository.js`, then extracts:
- standard v24 blocks from `BaseEntity`
- `lineage.*` keys from literal lineage objects
- `data.*` keys from `data`/`params` object literals and `this.data.*` assignments

Extraction output includes `source` and `issues` fields so `/admin/data-model-review` can flag suspicious generated fields before refactoring. Treat `server/DATA_MODEL.md` as review input, not the final contract, when a field is marked with issues.

The command writes `server/DATA_MODEL.md` only when its generated content has
changed. This prevents Nuxt development file watching from restarting the app
for an unchanged generated document.

The admin review page compares extracted collections against the committed framework manifest after excluding support/runtime collections. This keeps audit/auth/template data visible for cleanup without requiring those collections to become public framework entities.

## cassetteGraphBuilder.js

Builds Nodi graph JSON for parametric cassette rendering. Although it lives under
`server/utils`, `utils/cassetteRenderer.js` imports it into the browser bundle,
so it must avoid Node-only APIs and browser APIs that require secure contexts.
Graph ID generation falls back from `crypto.randomUUID` to
`crypto.getRandomValues`, then to a timestamp/random string for plain HTTP LAN
usage.

## dxf-extractor.js

Parses uploaded DXF buffers for cassette import. `extractNestingPolygons()`
uses the DXF-to-OCCS layer mapping to find the source layer mapped to
`cut.outer` and returns only closed polygon parts for nesting. It rejects
degenerate two-point/zero-area curves so they remain available as source curves
only when mapped through `extractCurvesFromDXFLayer()`, not as nestable parts.
`extractCurvesFromDXFLayer()` preserves open and closed curves from mapped
layers for `layerData`, so folds, marks, dimensions, and other source drawing
layers can be projected into sheet-design previews after nesting.

## dxf-writer.js

Writes simple AC1015 DXF output from the app drawing contract. It accepts:
- DrawingCanvas-style preview layers with SVG-like `M/L/H/V/Z` paths and text
  path objects.
- OCCS `layerData` records with coordinates, text geometry, or dimension
  geometry.
- `polygonParts` as a fallback when only nestable outlines exist.

Sheet design exports and cassette template/design exports use this helper so
semantic layer names such as `cut.outer`, `fold.route`, `dimension.cassette`,
and `code.cassette_mark` survive into downloaded DXF files.

## Related

- [server/features/README.md](../features/README.md) — Service layer patterns
- [server/core/blocks/README.md](../core/blocks/README.md) — Lineage block
