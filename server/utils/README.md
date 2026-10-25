# CODE: Server Utilities — Auth & Permissions API

Utility functions for authentication and multi-tenant permission enforcement. Used in all API routes and services.

Parent: [server](../README.md).

---

## Auth Context Object

Every API route has `event.context.auth` populated by the auth middleware
(JWT bearer or session cookie; see [middleware](../middleware/README.md)):

```js
{
  userId: string,         // OAuth user ID (string, NOT ObjectId)
  name: string,
  email: string,
  avatarUrl: string | null,
  organizationId: string | null,  // active organization
  role: string,           // Optional legacy compatibility label
  permissions: object,    // user-level grants
  memberships: [          // Array of organization memberships
    {
      organizationId,
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

When the active organization has an active process definition,
`resolveProcessAuth` widens the context with `effectivePermissions`,
`roleAssignments`, `process`, `screens`, and `navigation`
([process-definitions runtime](../features/process-definitions/README.md)).

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
The active organization scopes to a direct `lineage.organizationId` equality;
auth contexts without one fall back to a membership `$in` filter (empty
`$in` when there are no memberships).

## entity-redaction.js

### `serializeForAccess(typeId, entity, auth)` / `serializeManyForAccess(...)`
Serializes model instances or DTOs and applies shared field-level redaction
from `shared/instance-field-access.js` when an auth context is provided. Internal
service calls can omit `auth` to keep full domain objects for workflows, hooks,
and background tasks. API GET/list routes should pass `event.context.auth` so
entity cards only receive fields allowed by the current user's membership
permissions.

## auth-helpers.js

### `hashPassword(password)` / `verifyPassword(hash, password)`
Argon2 password hashing.

### `generateAccessToken(userId)` / `verifyAccessToken(token)`
JWT signing/verification (15min expiry). Tokens carry only `userId` — permissions fetched fresh from DB on each request.

### `hasPermission(user, entity, requiredLevel)` → `boolean`
Checks explicit `user.permissions[entity]`. Different from lineage-based — use
for non-entity system resources.

---

## Decision Guide

| Situation | Use |
|---|---|
| Any entity with a lineage block | `requireLineagePermission` |
| List query — scope to user's orgs | `getLineageFilter` |
| Admin capability route | A feature-level access check |
| Auth check only, permission later | `requireAuth` |
| Non-entity resource (system settings) | `hasPermission` |
| Password login flow | `hashPassword` / `verifyPassword` |

## extract-data-models.js

Exports `extractDataModels()`: the code-aware extractor that reads each
feature's `model.js`, `service.js`, and `repository.js` and builds a
block/`lineage.*`/`data.*` field inventory per collection, with `source` and
`issues` fields flagging suspicious generated fields. Its sole consumer is
`scripts/framework-inspect.js` (the framework manifest build).

## Related

- [server/features/README.md](../features/README.md) — Service layer patterns
- [server/core/blocks/README.md](../core/blocks/README.md) — Lineage block
