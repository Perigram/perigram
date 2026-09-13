# COMPONENT: LiveKit Calls

LiveKit calls are a capability module over the self-hosted `livekit` docker
service. Direct and organization rooms are derived, never free-form; group
call rooms derive from the persisted support group chat:

| Room | Who may join |
|---|---|
| `call:direct:<sorted-user-id-a>:<sorted-user-id-b>` | Conversation participants (mirrors the support conversation keys) or admins |
| `call:org:<orgId>` | Organization members or admins |
| `call:group:<groupId>` | Participants of the support group chat (or admins) — same contract as direct rooms |

## Group Calls

Group chats are persisted in the `chat_groups` collection by the
[support feature](../support/README.md); each group's call room is
`call:group:<groupId>`. Admission follows the direct-room participant
contract (group participants or admins) and deliberately does not require
the process `livekit` grant, so every invited member can always join their
group's call. Call buttons in `ChatSupport.vue` post
`POST /api/livekit/invite` with the conversation key; direct conversations
ring `call:direct:*`, group conversations ring `call:group:*`, and support
conversations ring the organization room.

## Active Calls

`GET /api/livekit/active-rooms` returns the currently joined call rooms the
caller may enter: the service calls the LiveKit server's
`RoomService/ListRooms` HTTP API with a signed `roomList` token, keeps only
`call:` rooms, and filters them through the same `authorizeRoom` admission
as token minting. The home workspace sidebar's "Calls" block renders this
snapshot (plus a `+` popover that rings any direct/group conversation
through the invite endpoint) and keeps it live by debounced refetches on
`call.activity` events arriving on the caller's own `user:` and `org:`
topics (which match room admission, so events only ever mention joinable
rooms). Calls open as ephemeral workspace-pane tabs hosting the LiveKit
stage beside the call's conversation chat, not as floating dialogs.

## Server Contract

- `service.js` mints LiveKit room tokens (`jsonwebtoken`, HS256, `iss` = API
  key, `video.roomJoin` grants) after `authorizeRoom` passes, resolves call
  invites on the support conversation contract, snapshots active rooms, and
  verifies + fans webhook events onto the connections layer.
- Access derives from org membership and conversation/group participation.
  Org rooms are a Process-Designer-declared service: when the organization
  has an active compiled process, `call:org:*` admission additionally
  requires a `livekit` feature grant (read level) in the process access
  rights, evaluated with the shared grant evaluator. The bundled process
  templates declare `livekit: 'write'` for their admin role; organizations
  with an already-active process definition must add the grant (re-instantiate
  a template or edit its role grants) before org rooms admit under process
  mode. Direct and group rooms keep the participant contract, which mirrors
  the process-aware support conversation keys.
- Webhooks: `POST /api/livekit/webhook` verifies the signed Authorization
  JWT including the `sha256` body-hash claim, then publishes `call.activity`
  events (org rooms → org topic; direct and group rooms → each participant's
  user topic). Configure the LiveKit server with `webhook.api_key: devkey`
  pointing at this endpoint inside the compose network.

## Environment

| Variable | Dev default |
|---|---|
| `LIVEKIT_PUBLIC_URL` | `ws://localhost:7880` (browser-facing) |
| `LIVEKIT_API_KEY` | `devkey` |
| `LIVEKIT_API_SECRET` | `devsecret` |

Dev keys are fixed in `livekit.dev.yaml`; production must override all three.

Browsers only expose `navigator.mediaDevices` (mic/camera) in secure
contexts: `https://` or exactly `http://localhost`. For two-device LAN call
testing, start the stack with `NUXT_DEV_HTTPS=true docker compose -f
docker-compose.dev.yml up -d --force-recreate app` and accept the self-signed
certificate once; the call panel surfaces a dedicated error when opened over
plain HTTP from another host.

## Client Contract

The call surfaces live in `components/calls/` (see their README): a pre-join
screen with device selection and preview, speaker/grid layouts with pinning
and screen-share spotlight, speaking levels, connection-quality and
reconnection states, raise-hand and floating reactions over the data channel,
mid-call device settings, and mic/camera/share/leave controls — all PrimeVue
+ shared primitives, `livekit-client` lazily imported. Chat integration lives
in `ChatSupport.vue`: the call button posts `/api/livekit/invite` which
publishes a `call` event on the conversation topic; counterparts get an
incoming-call banner and join the same room. The home workspace sidebar
lists active calls from `/api/livekit/active-rooms` with join buttons.
In-call chat is intentionally absent (app chat owns messaging);
recording/egress awaits server-side LiveKit egress configuration.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/livekit/config` | Browser-facing `{ url }`. |
| `POST /api/livekit/token` | `{ room }` → `{ token, url, room, kind }` after room admission. |
| `POST /api/livekit/invite` | `{ conversationKey }` → publishes the call invite on the conversation topic. |
| `GET /api/livekit/active-rooms` | `{ room, kind, participants }[]` snapshot of joinable active call rooms. |
| `POST /api/livekit/webhook` | Verified LiveKit webhook receiver → connections layer. |

## Migration

Retired `call_channels` documents move into `chat_groups` with
`node server/scripts/migrate-call-channels-to-groups.js`
(`--dry-run` supported); see [scripts](../../scripts/README.md).

## Related

- [Connections feature](../connections/README.md)
- [Support chat](../support/README.md)
- [API routes](../../api/README.md)
