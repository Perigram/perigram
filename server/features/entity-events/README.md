# COMPONENT: Entity Events

Authenticated in-memory entity change bus for app-session synchronization.

## Contract

Entity events are invalidation signals, not data replication payloads:

```json
{
  "type": "queue",
  "id": "queue-123",
  "change": "updated",
  "reason": "status-transition",
  "source": "server"
}
```

The bus deliberately does not broadcast full entity DTOs. Clients that receive
an event refresh through the normal entity APIs, so existing read access,
generated process scope, and field redaction remain the enforcement boundary.

Events are process-local and delivered over SSE to authenticated users in the
same active organization, to the actor's own sessions, and to admins. This is a
runtime synchronization channel, not a durable audit log. Status history remains
the persisted audit source.

The bus also exposes an in-process automatic-handler registration boundary.
The process orchestration plugin registers the active-process entity trigger
handler there. A normalized invalidation starts every effect whose start mode
is `entityChanged` for that entity type and passes the entity reference as run
input; the process runtime reloads the entity through its authorized feature
service before field evaluation. Handler
failures are logged and do not retroactively fail the mutation that already
produced the invalidation.

## Producers

- `POST /api/status/transition` publishes `updated` events for the transitioned
  entity and synchronous transition effect entities.
- `useEntity()` publishes successful frontend CRUD mutations through
  `POST /api/entity-events` after the canonical API call succeeds.
- Active process actions publish events when generated screens create, update,
  or change status on entities through the process runtime.

## Consumers

The app shell opens `GET /api/entity-events` once the auth store is hydrated.
Incoming server events are re-emitted through `utils/entity-events.js`, which is
the browser-local contract consumed by shared stores and components.

## Related

- [API routes](../../api/README.md)
- [Frontend utilities](../../../utils/README.md)
