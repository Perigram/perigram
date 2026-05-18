# COMPONENT: Core Blocks — v24 Entity Building Blocks

Canonical class library for all v24 entities. Every feature model extends `BaseEntity` and composes these blocks.

Implementation source is `@cutkit/core`; this directory is the application
compatibility import path and owns server-specific helpers such as ObjectId
attachment creation and flexible-ID lineage inheritance.

**Import path (always use this, not `server/utils/blocks.js`):**
```js
import { BaseEntity, Identity, Status, Lineage, Specs, registerService, getService,
         createIdentity, createStatus, createSpecs, createData, inheritLineage, createAttachment
       } from '~/server/core/blocks/index.js';
```

---

## Classes

### Identity
Unified naming and reference for every entity. `uid` is the MongoDB `_id`.

```
Identity { uid, name, slug, serial, reference }
```

| Field | Type | Purpose |
|---|---|---|
| `uid` | ObjectId \| string | The MongoDB `_id` (required) |
| `name` | string | Human-readable display name |
| `slug` | string | URL-safe identifier (auto-derived from uid if not provided) |
| `serial` | string | Short code / batch number displayed in lists |
| `reference` | string | External/customer reference code |

**Rules:**
- `serial` and `reference` belong **only** in Identity. Do NOT copy them into `data`.
- `name` and `slug` are always emitted flat by `BaseEntity.toJSON()` (legacy compat). Do not re-declare in subclasses.

---

### Status
Immutable state snapshot. Used for both `origin` (creation) and `status` (current lifecycle state).

```
Status { state, userId, timestamp, metadata, eventId, lifecycle }
```

| Field | Type | Purpose |
|---|---|---|
| `state` | string | Machine state key (e.g. `'OPEN'`, `'PROCESSING'`) |
| `userId` | string | OAuth user ID who caused transition; `'SYSTEM'` for automated |
| `timestamp` | Date | When this status was recorded |
| `metadata` | object | Event-local transition context (notes, reason codes, job/request ids) |
| `eventId` | ObjectId \| null | Reference to `status_events` collection entry |
| `lifecycle` | object | Current mutable facts owned by this lifecycle state |

`lifecycle` always serializes as `{ actors: [], attachments: {}, data: {} }` for legacy-safe reads. Use it for current lifecycle facts such as assigned actors, state-specific attachment refs, and measured/captured state data. Do not use `metadata` for durable facts that must be queried, diffed, or updated independently.

**Usage:** Created with `createStatus(state, userId, metadata, eventId, lifecycle)` or via `BaseEntity.applyStatus()`.

---

### Lineage
Flat, cumulative ancestor map enabling O(1) reverse lookups and multi-tenant isolation.

```
Lineage { organizationId, projectId, queueId, ... }  // keys depend on depth
```

Keys follow the convention `${type}Id` (e.g. `projectId`, `queueId`). Every parent's lineage is copied in full before adding the current parent — so every descendant carries its complete ancestry.

**Factory:** `inheritLineage(parentEntity, 'queue')` — copies parent.lineage and adds `queueId`.

**Usage in queries:** `{ 'lineage.projectId': id }` — works at any depth in the tree.

---

### Specs
Standardized physical dimensions for sheet/material entities.

```
Specs { sheetThickness, foilThickness, width, length, area }
```

All numeric (mm for dimensions, m² for area). `area` auto-computed from `width * length / 1,000,000` if not provided.
Created with `createSpecs(rawObject)`.

---

## BaseEntity

Root class for all v24 feature models.

```js
class BaseEntity {
  constructor(raw)   // raw = MongoDB document or params object
  get id()           // returns this._id.toString()
  applyStatus(state, userId, metadata, eventId)  // transitions status; sets origin on first call
  getAncestor(type)  // async; uses service registry to load parent
  toJSON()           // canonical serialization — all subclasses must call super.toJSON()
}
```

### toJSON() shape

```json
{
  "_id": "<ObjectId>",
  "id": "<string>",
  "identity": { "uid", "name", "slug", "serial", "reference" },
  "lineage": { "organizationId", "projectId", "queueId", ... },
  "origin":  { "state", "userId", "timestamp", "metadata", "eventId", "lifecycle" },
  "status":  { "state", "userId", "timestamp", "metadata", "eventId", "lifecycle" },
  "specs":   { "sheetThickness", "foilThickness", "width", "length", "area" } | null,
  "attachments": {},
  "data": {},
  "summary": {},
  "name": "<string>",   // flat alias for identity.name
  "slug": "<string>"    // flat alias for identity.slug
}
```

**Rules for subclasses:**
- Call `super.toJSON()` and spread it: `return { ...super.toJSON(), extraField }`
- Do NOT re-emit `name`, `slug`, `serial`, `reference`, `identity`, `lineage`, `status`, `origin`
- Feature-specific fields belong in `data` (mutable) or `specs` (physical dimensions)
- Computed aggregates belong in `summary`

---

## Service Registry

Enables cross-feature `getAncestor()` lookups without circular imports.

```js
registerService('project', projectService);  // in each feature's service.js
getService('project')                        // returns the registered service object
```

Register on module load. Each service must expose `getById(id)`.

---

## Factory Functions (from index.js)

| Function | Returns | Notes |
|---|---|---|
| `createIdentity(name, slug, serial, reference)` | `Identity` | `uid` generated; use when creating new entities |
| `createStatus(state, userId, metadata, eventId, lifecycle)` | `Status` | `eventId` and `lifecycle` optional |
| `createSpecs(rawObject)` | `Specs` | |
| `createData(object)` | `object` | Shallow copy; documents intent |
| `inheritLineage(parentEntity, type)` | `Lineage` | Copies parent.lineage + adds `${type}Id` |
| `createAttachment(type, fileId, name, metadata)` | `object` | Standard attachment entry for `attachments` |

## Related

- [server/features/README.md](../features/README.md) — Feature public API contract
- [server/core/machines/README.md](../machines/README.md) — State machine engine
- [composables/README.md](../../../composables/README.md) — Frontend entity composable
