# COMPONENT: State Machine Engine

Centralized logic for governing entity lifecycles and enforcing business rules through validated transitions.

## Architecture
The engine consists of declarative definitions and a unified transition service.

- **`definitions.js`**: The source of truth for all state machines. Defines valid states, allowed transitions, required roles, and automation hooks.
- **`service.js`**: The orchestrator. Validates transition requests, updates entity status snapshots, and archives events to `status_events`.
- **`hooks.js`**: Side-effect registry (e.g., status propagation from Project to Queues).

## Key Patterns
1. **Self-Looping**: Transitions can target the same state code if `canUpdateMeta` is enabled, allowing for the addition of notes/attachments without a state change.
2. **Status Snapshots**: Entities store the result of the last transition in a `status` block for O(1) read performance.
3. **Audit Integrity**: Every valid transition is logged as a rich event in `status_events`.

## Usage
```javascript
import { statusService } from '~/server/core/machines/service';

await statusService.transition(
  'project', 
  projectId, 
  'ACTIVE', 
  userId, 
  userRole, 
  { note: 'Budget approved' }
);
```
