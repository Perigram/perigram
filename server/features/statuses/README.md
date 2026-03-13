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
  metadata: Object,  // Optional notes, eventId reference, etc.
  eventId: ObjectId  // Link to status_events record
}
```

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
- **Role Guards:** Restricts transitions to specific user roles.
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
```

## Legacy Compatibility
The `server/features/statuses/service.js` provides lightweight wrappers for v24 blocks but is largely superseded by `server/core/machines/service.js`. 

- `addStatus()`: Logs to `status_events`.
- `getStatusHistory()`: Aggregates history from `status_events`.

## Related
- [server/core/machines/README.md](../../core/machines/README.md) (Engine details)
- [server/utils/blocks.js](../../utils/blocks.js) (Block definitions)