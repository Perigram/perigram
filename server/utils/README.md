# CODE: Server Utilities — Auth & Permissions API

Utility functions for authentication and multi-tenant permission enforcement. Used in all API routes and services.

---

## Auth Context Object

Every API route has `event.context.auth` populated by the auth middleware after JWT verification:

```js
{
  userId: string,         // OAuth user ID (string, NOT ObjectId)
  role: string,           // 'SuperAdmin' | 'Admin' | 'User' | 'Viewer'
  memberships: [          // Array of organization memberships
    {
      organizationId: ObjectId,
      role: string,
      permissions: {      // Per-entity-type access levels
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

### `hasLineagePermission(user, lineage, entityType, level)` → `boolean`
Checks if user has the required access level for an entity based on its `lineage.organizationId`.

```js
// entityType: 'projects' | 'queues' | 'sheets' | 'material-piles' | ...
// level: 'read' | 'write' | 'admin'
if (!hasLineagePermission(user, entity.lineage, 'queues', 'write')) { ... }
```
SuperAdmin bypasses all checks. Levels are ordered: `none < read < write < admin`.

### `requireLineagePermission(event, lineage, entityType, level)` → `authContext`
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
SuperAdmin gets `{}` (no filter). Regular users get `{ 'lineage.organizationId': { $in: [...orgIds] } }`.

### `requirePermission(event, entity, level)` → `authContext`
Uses `hasPermission()` from auth-helpers (global role-based, not lineage-based). Use for system-level resources without lineage.

### `checkEntityAccess(user, entity, entityOrgId)` → `boolean`
Legacy organization-level compatibility helper. New v24 services should use
`hasLineagePermission()` / `requireLineagePermission()` instead.

### `requireRole(event, ...roles)` → `void`
Throws 403 if user's role not in allowed list. For admin-only routes.

```js
requireRole(event, 'SuperAdmin', 'Admin');
```

---

## auth-helpers.js

### `hashPassword(password)` / `verifyPassword(hash, password)`
Argon2 password hashing.

### `generateAccessToken(userId)` / `verifyAccessToken(token)`
JWT signing/verification (15min expiry). Tokens carry only `userId` — permissions fetched fresh from DB on each request.

### `hasPermission(user, entity, requiredLevel)` → `boolean`
Role-based check using `user.permissions[entity]`. Different from lineage-based — use for non-entity system resources.

### `canAccessEntity(user, entityType, entityId)` → `boolean`
Checks `user.restrictedTo` whitelist. Returns `true` if no restrictions.

---

## Decision Guide

| Situation | Use |
|---|---|
| Any entity with a lineage block | `requireLineagePermission` |
| List query — scope to user's orgs | `getLineageFilter` |
| Admin/SuperAdmin only route | `requireRole` |
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

The admin review page compares extracted collections against the committed framework manifest after excluding support/runtime collections. This keeps audit/auth/template data visible for cleanup without requiring those collections to become public framework entities.

## cassetteGraphBuilder.js

Builds Nodi graph JSON for parametric cassette rendering. Although it lives under
`server/utils`, `utils/cassetteRenderer.js` imports it into the browser bundle,
so it must avoid Node-only APIs and browser APIs that require secure contexts.
Graph ID generation falls back from `crypto.randomUUID` to
`crypto.getRandomValues`, then to a timestamp/random string for plain HTTP LAN
usage.

## Related

- [server/features/README.md](../features/README.md) — Service layer patterns
- [server/core/blocks/README.md](../core/blocks/README.md) — Lineage block
