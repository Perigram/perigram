# COMPONENT: Statuses Feature (v24 Standardized)

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
Every state transition is recorded in the `status_events` collection for full traceability.

```javascript
{
  _id: ObjectId,
  targetId: ObjectId,
  targetType: String, // e.g., "project", "queue", "requisition"
  fromState: String,
  toState: String,
  status: [Status Block],
  timestamp: Date
}
```

## Core Engine: State Machines
Transitions are governed by declarative machines in `server/core/machines/`.

- **Validation:** Ensures only valid `from` -> `to` transitions are allowed.
- **Access Guards:** Restricts transitions through explicit feature permissions and lifecycle actor/capability assignments.
- **Lifecycle Guards:** Validates lifecycle payloads against state schemas and honors actor/capability assignments when present.
- **Hooks:** Triggers side-effects (e.g., updating parent summaries or child states).

## Usage

### Reading Status
Entity status is available directly on the object. For history, use the specific status service or API.

### Updating Status
**NEVER** update `status` blocks manually. Always use the `statusService.transition()` from the machine engine.

```javascript
import { statusService } from '~/server/core/machines/service';

await statusService.transition(
  'project', 
  project._id, 
  'ACTIVE', 
  userId, 
  userRole, 
  { note: 'Started production' }
);

await statusService.transition(
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
The `server/features/statuses/service.js` provides lightweight wrappers for v24 blocks but is largely superseded by `server/core/machines/service.js`. 

- `addStatus()`: Logs to `status_events`.
- `getStatusHistory()`: Aggregates history from `status_events`.

## Related
- [server/core/machines/README.md](../../core/machines/README.md) (Engine details)
- [server/utils/blocks.js](../../utils/blocks.js) (Block definitions)
