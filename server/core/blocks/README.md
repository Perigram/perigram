# COMPONENT: Core Blocks — v24 Entity Building Blocks

Canonical class library for all v24 entities. Every feature model extends `BaseEntity` and composes these blocks.

Implementation source is `@perigram/core` through the `#packages/core/src/index.js`
package import alias; this directory is the application compatibility import
path and owns server-specific helpers such as ObjectId attachment creation and
flexible-ID lineage inheritance.

**Import path (always use this, not `server/utils/blocks.js`):**
```js
import { BaseEntity, Identity, Status, Lineage, Relations, Provenance, Specs,
         createIdentity, createStatus, createSpecs, createData, inheritLineage,
         createInstanceRef, normalizeInstanceRef, createProvenance, createAttachment
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
- `name`, `slug`, `serial`, and `reference` are never emitted as root DTO aliases. Read and render them through `identity`.

---

### Status
Immutable state snapshot. Used for both `origin` (creation) and `status` (current lifecycle state).

```
Status { state, userId, timestamp, metadata, eventId, lifecycle }
```

| Field | Type | Purpose |
|---|---|---|
| `state` | object | v2 machine state snapshot with `primary`, `active`, and `regions` |
| `userId` | string | OAuth user ID who caused transition; `'SYSTEM'` for automated |
| `timestamp` | Date | When this status was recorded |
| `metadata` | object | Event-local transition context (notes, reason codes, job/request ids) |
| `eventId` | ObjectId \| null | Reference to `status_events` collection entry |
| `lifecycle` | object | Current mutable facts owned by this lifecycle state |

`state` always serializes as a v2 object:

```js
{
  schemaVersion: 2,
  primary: 'READY',
  active: { main: 'READY' },
  regions: { main: { state: 'READY', path: ['READY'] } }
}
```

Use `getPrimaryState(status)` and `getRegionState(status, regionId)` for reads;
do not compare `status.state` directly to a string. Mongo filters use
`states.main` for the primary lifecycle.

`lifecycle` always serializes as `{ actors: [], attachments: {}, data: {} }`. Use it for current lifecycle facts such as assigned actors, state-specific attachment refs, and measured/captured state data. Do not use `metadata` for durable facts that must be queried, diffed, or updated independently.

Current mutable location belongs in `lifecycle.data.location`, not in root data
or lineage. The frontend status surface supports typed location values such as
`{ type: 'warehouse', warehouseId }`, `{ type: 'coordinates', coordinates: { x, y, z } }`,
and `{ type: 'address', address }`.

**Usage:** Created with `createStatus(state, userId, metadata, eventId, lifecycle)` or via `BaseEntity.applyStatus()`. String input is normalized to the v2 object shape at construction boundaries.

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

### Relations

Typed non-owning entity references that should not grant containment access.

```
Relations { linkedLibrary: { type, id, revisionId? }, relatedItems: [{ type, id, revisionId? }] }
```

Each relation value is normalized through `normalizeInstanceRef()`. Use
`relations` for non-owning cross-links. Process Relations composers derive the
entry key and item/list cardinality from their connected entity socket; they do
not require a predefined owner-to-target domain relation. Do not add those
links to `lineage`; lineage is only for containment ancestry.

---

### Provenance

Immutable derivation or pinned-source evidence.

```
Provenance { derivedFrom: { source: { type, id, revisionId? }, ...facts } }
```

Use `createInstanceRef()` and `createProvenance()` when recording source
documents, revisions, or parent snapshots that must remain reproducible. Do not
use `provenance` for mutable workflow facts; those belong in `status.lifecycle`.

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
  constructor(raw)   // raw = canonical block document
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
  "identity": { "uid", "name", "slug", "serial", "reference" },
  "lineage": { "organizationId", "projectId", "queueId", ... },
  "relations": {},
  "provenance": {},
  "origin":  { "state", "userId", "timestamp", "metadata", "eventId", "lifecycle" },
  "states":  { "<axis>": "<active leaf path>", "userId", "timestamp", "metadata", "eventId", "lifecycle" } | null,
  "specs":   { "sheetThickness", "foilThickness", "width", "length", "area" } | null,
  "attachments": {},
  "data": {},
  "summary": {}
}
```

**Round-trip contract:** `toJSON()` is both the wire DTO and persisted
document shape — repositories store its output directly. The constructor
rehydrates the current `Status` block from every persisted state axis whenever
the document carries no `status` block, so stored documents round-trip
losslessly instead of surfacing `states: null` on re-read. `main` is the
primary-axis convention; other axes remain independent. Documents that still
carry a pre-migration `status` block parse unchanged, and `origin` always
round-trips as a block. Wire and storage speak `states`; the `Status` block is
the in-memory form and never leaks to the wire.

**Rules for subclasses:**
- Call `super.toJSON()` and spread it only when replacing a canonical block, for example to remove private fields from `data`.
- Do NOT re-emit root aliases such as `id`, `name`, `slug`, `serial`, `reference`, `type`, `geometry`, or `parameters`.
- Constructors accept canonical blocks only. Do not migrate from root fields or private `params` bags.
- Feature-specific fields belong in `data` (mutable) or `specs` (physical dimensions)
- Computed aggregates belong in `summary`

---

## App Registry

Entity service lookup is bound explicitly in `server/runtime/app-registry.js`.
Features do not self-register on module load.

```js
const registry = getAppRegistry();
registry.getInstanceService('project');
```

Entity, workflow, command, task, hook, and attachment-kind contracts are defined
through a `createRegistry()` instance from `@perigram/core`; server command/task
runtimes consume those registry definitions after access checks.

---

## Factory Functions (from index.js)

| Function | Returns | Notes |
|---|---|---|
| `createIdentity(name, slug, serial, reference)` | `Identity` | `uid` generated; use when creating new entities |
| `createStatus(state, userId, metadata, eventId, lifecycle)` | `Status` | `eventId` and `lifecycle` optional |
| `createSpecs(rawObject)` | `Specs` | |
| `createData(object)` | `object` | Shallow copy; documents intent |
| `inheritLineage(parentEntity, type)` | `Lineage` | Copies parent.lineage + adds `${type}Id` |
| `createInstanceRef(type, id, revisionId)` | `object` | Canonical typed reference |
| `normalizeInstanceRef(value)` | `object \| null` | Validates and normalizes typed refs |
| `createProvenance(source, facts)` | `object` | Source ref plus immutable derivation facts |
| `createAttachment(type, fileId, name, metadata)` | `object` | Standard attachment entry for `attachments` |

## Related

- [server/features/README.md](../../features/README.md) — Feature public API contract
- [server/core/machines/README.md](../machines/README.md) — State machine engine
- [composables/README.md](../../../composables/README.md) — Frontend entity composable
