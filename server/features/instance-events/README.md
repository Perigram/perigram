# COMPONENT: Entity Events

Authenticated in-memory entity change bus for app-session synchronization.

## Contract refresh hint

`publishOrgContractChanged(organizationId, kind, detail)` fans a
`contractChanged` marker onto the connections org topic when the
organization's registry view (`kind: 'registry'`, from cts-type writes) or
active process (`kind: 'process'`, from activation) changes. The event
carries no contract data — open tabs respond with one debounced auth
re-hydration (`stores/instanceEvents.js`), keeping per-user access
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

- `POST /api/state/transition` publishes `updated` events for the transitioned
  entity and synchronous transition effect entities.
- `useEntity()` publishes successful frontend CRUD mutations through
  `POST /api/instance-events` after the canonical API call succeeds.
- Active process actions publish events when generated screens create, update,
  or change status on entities through the process runtime.

`POST /api/instance-events` echoes the published event (including its
`eventId`): the publishing tab records that id and skips the event's
realtime/poll delivery, since its mutation already applied the fresher
snapshot. Other tabs and sessions of the same user reconcile normally —
their publications carry different event ids.

## Consumers

The app shell consumes events over two paths that never double-deliver:

- Realtime: the connections org topic receives every `entityChanged`
  publish as it happens; the client events store
  ([stores/README.md](../../../stores/README.md)) emits it into the
  browser-local event bus immediately and advances its cursor past it.
  Hidden tabs hold realtime events for the poll instead of dropping
  them.
- Catch-up: authenticated clients poll `GET /api/instance-events` by
  cursor (`after=<cursor>`; short completed requests deliberately, so
  they behave through dev-worker and production reverse proxies). The
  initial request establishes the cursor without replaying stale
  history. The poll remains the authoritative catch-up path for hidden
  tabs and dropped streams.

Incoming events are re-emitted through `utils/instance-events.js`, which
is the browser-local contract consumed by shared stores and components.

## Related

- [API routes](../../api/README.md)
- [Frontend utilities](../../../utils/README.md)
