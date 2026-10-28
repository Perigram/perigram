# COMPONENT: States

Centralized state management and audit logging system for all system entities.

Parent: [server/features](../README.md).

## Architecture

### Data Model: Status Block
Each entity uses a standardized `status` block for its current state snapshot.

```javascript
status: {
  state: {
    primary: String,             // main-axis active leaf path
    active: { [axis]: String },  // one active leaf path per independent axis
    regions: { [axis]: { state: String, path: [String] } }
  },
  userId: String,    // User or service who triggered the state change
  timestamp: Date,   // When the change occurred
  metadata: Object,  // Event-local transition context
  eventId: ObjectId, // Link to status_events record
  lifecycle: {
    actors: Array,       // Current state/capability assignments
    attachments: Object, // Generic state-owned attachment refs
    data: Object         // State-owned mutable facts
  }
}
```

`state.active` stores canonical leaf paths. Nested state paths use dot-separated
segments (for example `production.cut`); each axis is independent and a
secondary-axis transition leaves `states.main` untouched. The `regions` map is
the runtime snapshot of those axes.

`metadata` is for why/how the transition happened: notes, reason codes, source,
and request/job ids. Durable current-state facts belong in `lifecycle` so they
can be validated, audited, and updated without multiplying entity-specific
fields. When the target state allows lifecycle facts, existing lifecycle values
carry forward and incoming lifecycle values patch over them.

Current mutable location is a lifecycle fact. Store it as
`status.lifecycle.data.location` with a typed payload, for example
`{ type: 'warehouse', warehouseId }`, `{ type: 'coordinates', coordinates: { x, y, z } }`,
or `{ type: 'address', address }`. Do not store current location as static
card-only data; use `lineage` only for ancestry and `attachments` only for file
references.

### Audit Log: `status_events`
Every state change is recorded in the append-only `status_events` collection —
the Stamp law: no state without a stamp recording who, when, which operation,
with what evidence, at which station (see
[packages/cts/SPEC.md](../../../packages/cts/SPEC.md) §1).

```javascript
{
  _id: ObjectId,
  targetId: ObjectId,
  targetType: String,            // e.g., "organization", "invitation"
  fromState: String | null,      // null on initialize events
  toState: String,
  fromStatePrimary: String | null,
  toStatePrimary: String,
  region: String,
  status: Status Block,          // snapshot copy of the status block
  actor: {
    id: String,                  // user id or 'SYSTEM'
    label: String,               // display name, when the auth context carries one
    principalType: 'user' | 'service' | 'SYSTEM'
  },
  operation: {
    kind: 'initialize' | 'transition' | 'intent' | 'field_change' | 'payload_revision',
    intent: String,              // invoked or declared intent, when present
    region: String,
    changes: Array,              // field_change: changed leaves with from/to
    reason: String,              // payload_revision: the minting write
    revision: Object,            // payload_revision: { id, number } of the minted revision
    restoredFrom: Object         // payload_revision: { id, number } a restore re-entered
  },
  evidence: {
    description: String | null,  // transition note/description
    attachments: Object,         // slot -> normalized attachment refs
    lifecycle: Object            // normalized lifecycle (actors, attachments, data)
  },
  source: Object,                // caller-declared origin, when the boundary passes one
  timestamp: Date
}
```

- `actor` is the stamp's who, taken from the auth context at the write
  boundary. `operation.kind` is
  `initialize` for `setInitialStateForOrganization` events (which carry
  `fromState: null`), `intent` when the call arrived through
  `applyIntent`/`transitionWithResult({ intent })`, and `transition` for direct
  target-state calls. `field_change` records keep the instance's current
  state on both ends and list changed leaves (`appendFieldChangeEvent`);
  `payload_revision` records do the same for revision-scoped payload
  writes, naming the minted revision and a restore's source
  (`appendPayloadRevisionEvent` — both in
  [machines](../../core/machines/README.md)). Workflow transitions are anonymous — identified by
  region + from/to + intent — so no separate transition id is recorded.
- `evidence` carries the normalized transition payload produced by the status
  engine: the description, per-slot attachment refs (with `attachmentKey`,
  `fileId`, bucket, and download URL), and the full normalized lifecycle
  including captured relation snapshots. The event carries both the
  `status` block snapshot and the normalized `evidence`.
- `findStatusEventsAfter(lastId, limit)` is the cursor-based ascending read
  for lifecycle consumers: events strictly after the `_id` cursor, oldest
  first, projected to the wake-matching fields. The
  [agent bot wake scanner](../agent-bots/README.md) sweeps it; it is a
  read-only seam.
- `source` is caller-declared at the transition boundary; the process action
  runtime passes `{ kind: 'process-run', actionId }`. Like `producerOutputId`,
  it is lifted onto the event and stays out of `status.metadata`.
- The log is append-only: events written before the stamp keys existed
  carry none of `actor`, `operation`, `evidence`, and `source`, and
  consumers treat those keys as optional.

`getHistoryByTarget(typeId, instanceId)` returns persisted events sorted
newest-first and adds a response-only display `actor` resolved from
`status.userId`:

```javascript
actor: {
  userId: String,
  type: 'user' | 'system',
  name: String
}
```

The display actor stays response-only: the status block
keeps the immutable `userId` audit value, while UI surfaces can render the
human name when the user still exists. When the event carries the persisted
stamp `actor`, the display projection merges under it: the persisted `id`,
`label`, and `principalType` win and the display `userId`, `type`, and `name`
fill the UI vocabulary.

## Core Engine: State Machines
Transitions are governed by declarative machines in `server/core/machines/`.

- **Validation:** Ensures only valid `from` -> `to` transitions are allowed.
- **Access Guards:** Restricts transitions through explicit feature permissions and lifecycle actor/capability assignments.
- **Lifecycle Guards:** Validates lifecycle payloads against state schemas and honors actor/capability assignments when present.
- **Hooks:** Triggers side-effects (e.g., updating parent summaries or child states).

## Usage

### Reading Status
For history, use the specific status service or API.

### Updating Status
Status blocks are written only through `stateService.transition()` from
the machine engine.

```javascript
import { stateService } from '~/server/core/machines/service';

await stateService.transition(
  'organization',
  organization._id,
  'suspended',
  userId,
  userRole,
  { note: 'Billing hold' }
);
```

## Service exports

`server/features/states/service.js` is the status-event write seam for
collections the feature services own directly (partnerships and
invitations write through it); machine-governed transitions go through
`stateService.transition` above.

- `addStatus(collection, instanceId, status, userId, note?, metadata?)`
  — appends a `status_events` record.
- `initializeStatus(collection, instanceId, userId, note?)` — appends
  the initial event with the type's default state.
- `findLatest(collection, instanceId)` — newest event for one target.
- `getStateHistory(collection, instanceId)` — events newest-first plus
  the resolved `currentStatus`.
- `getHistoryByTarget(typeId, instanceId)` — persisted events
  newest-first with the response-only display `actor` (see above).
- `findStatusEventsAfter(lastId, limit)` — the cursor-based ascending
  read (see above).

## Related
- [server/core/machines/README.md](../../core/machines/README.md) (Engine details)
- [server/core/blocks/README.md](../../core/blocks/README.md) (Block definitions)
