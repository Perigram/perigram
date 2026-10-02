# COMPONENT: Notifications

Browser notifications for user-scoped realtime events, delivered on two
tracks: in-page Web Notifications while a tab is connected, and Web Push
(VAPID) when the user has no live SSE connection.

## Event sources

All notifications derive from the canonical
[connections](../connections/README.md) `user:<userId>` topics plus the
`org:<organizationId>` entity bridge:

- Chat messages — `support.inbox` inbox pings (hidden tab or outside `/chats`).
- Calls — `call.invite` user-topic pings published by the LiveKit invite
  flow next to the conversation-topic ring. The client shows a persistent
  notification with a WebAudio ring loop that stops on call activity or
  after 45 seconds.
- Status changes — `entityChanged` events bridged from the instance-events
  feature onto the org topic; only events whose `reason` marks a status
  transition notify, and only while the tab is hidden.

## Web Push contract

- `server/plugins/notifications.js` configures `web-push` from
  `NUXT_VAPID_PUBLIC_KEY` / `NUXT_VAPID_PRIVATE_KEY` runtime config and
  registers the connections `onPublish` listener: user-topic events for a
  user with zero live connections are mapped to a push payload. Push stays
  unconfigured (and `/api/notifications/config` reports `enabled: false`)
  without both keys.
- Push targets are direct, user-scoped events only (`support.inbox`,
  `call.invite`). Org-wide entity events never push — every offline member
  receiving every queue transition is noise, not signal; they stay
  realtime-only.
- `push_subscriptions` persists one document per browser endpoint, keyed by
  endpoint, owned by the subscribing user; 404/410 sends prune dead
  endpoints, every other send failure logs with its status code (network
  errors included) instead of disappearing.

## API

- `GET /api/notifications/config` — `{ enabled, publicKey }` for the client
  subscription flow.
- `POST /api/notifications/subscriptions` — auth-bound save of a
  `PushSubscription` ( `{ subscription: { endpoint, keys } }` ).
- `DELETE /api/notifications/subscriptions?endpoint=` — removes one
  subscription.

## Client contract

`composables/useBrowserNotifications.js` owns permission state, the persisted
consent flag, and the push subscribe/unsubscribe flow (subscribing through
the registered service worker, whose `push`/`notificationclick` handlers show
and route the notification); on app start it also reconciles an enabled
consent with granted permission into a server-known subscription, so clients
that consented while the server ran without VAPID keys converge once push
becomes available. It also exposes the server's push availability
(`pushAvailable`, refreshed whenever the settings popup opens) so the toggle
surfaces in-tab-only delivery when the server runs without VAPID keys
(runbook: deploy README, Configuration). `plugins/notifications.client.js`
derives the three notification kinds from the connections stream and plays
the ring/ping sounds from `utils/notification-sounds.js`. The profile
preferences tab exposes the enable toggle; permission is only requested from
that user gesture.

## Files

- `service.js` - VAPID configuration, event-to-notification mapping, push
  sending with dead-endpoint pruning.
- `repository.js` - `push_subscriptions` persistence.
- `../../plugins/notifications.js` - boot wiring into connections publish.

## Related

- [Connections](../connections/README.md) - topics, presence, onPublish hook
- [Support chat](../support/README.md) - inbox ping producer
- [LiveKit](../livekit/README.md) - call invite producer
