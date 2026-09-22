# COMPONENT: Entity Events

Authenticated in-memory entity change bus for app-session synchronization.

## Contract refresh hint

`publishOrgContractChanged(organizationId, kind, detail)` fans a
`contractChanged` marker onto the connections org topic when the
organization's registry view (`kind: 'registry'`, from cts-type writes) or
active process (`kind: 'process'`, from activation) changes. The event
carries no contract data — open tabs respond with one debounced auth
re-hydration (`stores/entityEvents.js`), keeping per-user access
resolution server-side.

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

Events are process-local and retained in a bounded recent-event buffer. Authenticated
clients poll that buffer by cursor and receive only events visible to the same
active organization, to the actor's own sessions, or to admins. This is a runtime
synchronization channel, not a durable audit log. Status history remains the
persisted audit source.

The bus also exposes an in-process automatic-handler registration boundary for
explicit consumers. Process effects are not registered implicitly from node
configuration; entity-event process entry requires its own declared binding
contract.

## Producers

- `POST /api/status/transition` publishes `updated` events for the transitioned
  entity and synchronous transition effect entities.
- `useEntity()` publishes successful frontend CRUD mutations through
  `POST /api/entity-events` after the canonical API call succeeds.
- Active process actions publish events when generated screens create, update,
  or change status on entities through the process runtime.

## Consumers

The app shell polls `GET /api/entity-events` once the auth store is hydrated.
The initial request establishes the current cursor without replaying stale
history; subsequent requests pass `after=<cursor>` and return immediately with
new visible events. Short completed requests are used deliberately because they
work consistently through Nuxt's development worker proxy and production reverse
proxies. Incoming events are re-emitted through `utils/entity-events.js`, which
is the browser-local contract consumed by shared stores and components.

## Related

- [API routes](../../api/README.md)
- [Frontend utilities](../../../utils/README.md)
