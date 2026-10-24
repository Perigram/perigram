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

Events carry entity identity only:

```json
{
  "eventId": 142,
  "type": "process-definition",
  "id": "6f1a2b3c4d5e6f7a8b9c0d1e",
  "change": "updated",
  "reason": "status-transition",
  "source": "server",
  "actorUserId": "6842f0a1b2c3d4e5f6a7b8c9",
  "organizationId": "6831e0b1a2c3d4e5f6a7b8c9",
  "timestamp": "2026-10-24T10:12:01.020Z"
}
```

Clients that receive an event refresh through the normal entity APIs, so
existing read access, generated process scope, and field redaction remain
the enforcement boundary.

Events are process-local and retained in a bounded recent-event buffer
(the 500 most recent). Authenticated clients poll that buffer by cursor
and receive an event when they share its active organization, are its
actor, or hold the admin role. Status history remains the persisted
audit source.

The bus also exposes an in-process handler registration boundary for
explicit consumers: process-side entity-event handlers declare their own
binding contract.

## Producers

- `POST /api/state/transition` publishes `updated` events for the transitioned
  entity and synchronous transition effect entities.
- The instances store (`stores/instances.js`) publishes successful frontend
  CRUD mutations through
  `POST /api/instance-events` after the canonical API call succeeds.
- Active process actions publish events when generated screens create, update,
  or change status on entities through the process runtime.

`POST /api/instance-events` echoes the published event (including its
`eventId`): the publishing tab records that id and skips the event's
realtime/poll delivery, since its mutation already applied the fresher
snapshot. Other tabs and sessions of the same user reconcile normally —
their publications carry different event ids.

## Consumers

The app shell consumes events over two paths:

- Realtime: the connections org topic receives every `entityChanged`
  publish as it happens; the client events store
  ([stores/README.md](../../../stores/README.md)) emits it into the
  browser-local event bus immediately and advances its cursor past it,
  so realtime and poll deliveries stay disjoint. Hidden tabs hold
  realtime events for the poll.
- Catch-up: authenticated clients poll `GET /api/instance-events` by
  cursor (`after=<cursor>`); requests complete short, so dev workers and
  production reverse proxies handle them. The initial request
  establishes the cursor at the buffer's current end. The poll is the
  catch-up path for hidden tabs and dropped streams.

Incoming events are re-emitted through `utils/instance-events.js`, which
is the browser-local contract consumed by shared stores and components.

## Related

- [API routes](../../api/README.md)
- [Frontend utilities](../../../utils/README.md)
