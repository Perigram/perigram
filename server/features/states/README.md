# COMPONENT: States Feature (v24 Standardized)

Centralized state management and audit logging system for all system entities.

## Architecture

### Data Model: Status Block
Each entity uses a standardized `status` block for its current state snapshot.

```javascript
status: {
  state: String,     // e.g., "DRAFT", "ACTIVE", "READY"
  userId: String,    // User who triggered the state change
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
  targetType: String,            // e.g., "project", "queue", "requisition"
  fromState: String | null,      // null on initialize events
  toState: String,
  fromStatePrimary: String | null,
  toStatePrimary: String,
  region: String,
  status: Status Block,          // legacy compatibility copy of the snapshot
  actor: {
    id: String,                  // user id or 'SYSTEM'
    label: String,               // display name, when the auth context carries one
    principalType: 'user' | 'service' | 'SYSTEM'
  },
  operation: {
    kind: 'initialize' | 'transition' | 'intent',
    intent: String,              // invoked or declared intent, when present
    region: String
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
  boundary (never re-resolved from the status block). `operation.kind` is
  `initialize` for `setInitialStateForOrganization` events (which carry
  `fromState: null`), `intent` when the call arrived through
  `applyIntent`/`transitionWithResult({ intent })`, and `transition` for direct
  target-state calls. Workflow transitions are anonymous — identified by
  region + from/to + intent — so no separate transition id is recorded.
- `evidence` carries the normalized transition payload produced by the status
  engine: the description, per-slot attachment refs (with `attachmentKey`,
  `fileId`, bucket, and download URL), and the full normalized lifecycle
  including captured relation snapshots. The legacy `status` block copy remains
  for compatibility; `evidence` is additive.
- `source` is caller-declared at the transition boundary; the process action
  runtime passes `{ kind: 'process-run', actionId }`. Like `producerOutputId`,
  it is lifted onto the event and never persisted into `status.metadata`.
- The log is append-only with no migration: events written before the stamp
  change simply lack `actor`, `operation`, `evidence`, and `source`, and
  consumers must treat those keys as absent.

`getHistoryByTarget(targetType, targetId)` returns persisted events sorted
newest-first and adds a response-only display `actor` resolved from
`status.userId`:

```javascript
actor: {
  userId: String,
  type: 'user' | 'system',
  name: String
}
```

The display actor is not written back to the status block: the status block
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
**NEVER** update `status` blocks manually. Always use the `stateService.transition()` from the machine engine.

```javascript
import { stateService } from '~/server/core/machines/service';

await stateService.transition(
  'project', 
  project._id, 
  'ACTIVE', 
  userId, 
  userRole, 
  { note: 'Started production' }
);

await stateService.transition(
  'cassette_instance',
  instance._id,
  'MILLED',
  userId,
  userRole,
  {
    metadata: { note: 'Measured after milling' },
    lifecycle: {
      attachments: { geometry: { fileId, bucketName: 'uploads' } },
      data: { measuredWidth: 1200 }
    }
  }
);
```

## Legacy Compatibility
The `server/features/states/service.js` provides lightweight wrappers for v24 blocks but is largely superseded by `server/core/machines/service.js`. 

- `addStatus()`: Logs to `status_events`.
- `getStateHistory()`: Aggregates history from `status_events`.

## Related
- [server/core/machines/README.md](../../core/machines/README.md) (Engine details)
- [server/utils/blocks.js](../../utils/blocks.js) (Block definitions)
