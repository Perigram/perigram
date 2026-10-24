# COMPONENT: Connections

Connections is the canonical realtime layer: one Server-Sent Events stream per
authenticated browser tab, topic-based publish/subscribe, and organization
presence derived from the live connection registry. It is a capability module
like `support` — no Mongo collection, no v24 entity — because nothing here
persists. Feature services stay the persistence source of truth and publish
through this module when a write should reach connected clients.

Parent: [server/features](../README.md).

## Server Contract

- `service.js` owns the in-memory registry: connections keyed by id, each
  carrying the authenticated context, its topic set, and a push callback
  bound to the SSE stream. Nothing else in the app may hold references to
  live streams.
- The registry is per Nitro worker. All in-process publishes reach every
  connection served by that worker; there is no cross-worker bus, so features
  must not rely on delivery when producers and consumers sit in different
  workers behind a scaling load balancer. Dev and the current single-app
  compose deployment satisfy this assumption.
- `registerConnection({ auth, push })` subscribes the defaults
  `user:<userId>` and `org:<organizationId>` and broadcasts a presence
  snapshot to the organization topic. `unregisterConnection` mirrors it.
- `syncTopics(connectionId, requested)` replaces the requested topic set;
  defaults always survive and every requested topic passes admission:
  - `user:<userId>` — self only.
  - `org:<orgId>` — the connection's own organization.
  - `admin-support` — admins only.
  - `conversation:<key>` — delegated to the support feature through
    `registerTopicAuthorizer('conversation:', …)`, which resolves the
    conversation context and therefore rejects non-participants and
    non-admins. Other features register their own authorizers the same way;
    admission errors count as denial.
- `publish(topic, payload)` fans an envelope `{ topic, payload, ts }` out to
  subscribed connections. Publishing with no subscribers is a no-op.
- `userPresence(userId)` counts a user's live connections; `onPublish(fn)`
  registers a single publish observer used by the
  [notifications feature](../notifications/README.md) to deliver Web Push
  when a user-topic event finds the user with zero live tabs. The observer
  runs outside the delivery path and can never break fanout.
- Entity change events ride the `org:<organizationId>` topics as
  `entityChanged` payloads; the realtime/poll consumption contract is
  canonical in [instance-events](../instance-events/README.md).

## Client Contract

`composables/useConnections.js` holds one module-scoped `EventSource` per
browser tab. `useConnections().subscribe(topic, handler)` returns an
unsubscribe function; when the last handler of a topic goes away the topic is
dropped from the subscription sync. After every (re)connect the server's
`ready` event reports the new connection id and the current presence
snapshot, and the composable re-posts the active topic set, so EventSource's
native reconnect heals subscriptions without consumer involvement.
Presence arrives as `org:` topic events; `onlineUserIds` is a reactive Set of
user ids with at least one live connection.

## Chat Integration

Support chat is the first consumer:

- `POST`ed messages and read receipts publish `message` / `read` events on
  `conversation:<key>`, inbox pings on each participant's `user:` topic, and
  an `admin-support` ping for support-channel messages. Group conversations
  use the same `conversation:group:<id>` admission and fanout.
- LiveKit call activity arrives as `call.activity` events from the verified
  webhook receiver: org rooms publish on `org:<orgId>`, direct and group
  rooms on each participant's `user:<userId>` topic, matching room
  admission so events only ever mention rooms the recipient may join.
- The support store's badge/inbox refresh rides the user-topic
  subscription.
- `GET /api/support/messages`, `GET /api/support/admin/:user_id`, and
  `GET /api/support/admin/chatlist` are REST snapshots: initial state
  loads over REST, changes arrive over the connections stream.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/connections/events` | Authenticated SSE stream: registers the connection, answers a `ready` event (`connectionId`, `topics`, `presence`), heartbeats every 30 s, unregisters on close. |
| `POST /api/connections/subscriptions` | `{ connectionId, topics }` → replaces the requested topic set through `syncTopics` (403 when the connection belongs to another user). |

## Related

- [API routes](../../api/README.md)
- [Support chat](../support/README.md)
- [Composables](../../../composables/README.md)
