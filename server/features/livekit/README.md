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
as token minting. Rooms with zero connected participants are skipped:
LiveKit keeps emptied rooms alive for the server empty_timeout (default
300s) after the last participant leaves, and an emptied room must not
appear as an active call while it waits to be reaped. The home workspace sidebar's Calls entry
lists ongoing rooms as persistent rows and toggles the popup flyout (see
`components/shared/CommunicationMenu.vue`) that rings conversations
through the invite endpoint, keeping the
snapshot live by debounced refetches on `call.activity` events arriving
on the caller's own `user:` and `org:` topics (which match room
admission, so events only ever mention joinable rooms). Calls open as
ephemeral workspace-pane tabs hosting the LiveKit stage beside the
call's conversation chat, not as floating dialogs.

## Recordings

Call recordings ride an **external egress plane**: a LiveKit server deployed
with Redis and a `livekit/egress` container, uploading finished MP4s to an
S3-compatible recordings bucket the app can read anonymously. Egress ignores
its own config-level storage for outputs that arrive without one
([livekit/egress#1254](https://github.com/livekit/egress/issues/1254)), so
the app attaches the upload target inline to every egress request; the
upload credentials and endpoints ride the app env like the LiveKit keys. The
upload endpoint is resolved by the egress plane itself (a plane-local
address), while the read endpoint is whatever the app can fetch anonymously
— typically the recordings path served by the app's public edge. Only rooms
with a conversation — direct and group calls — are recordable; org rooms
have no conversation thread to record into.

- `POST /api/livekit/recordings` `{ room }` starts a room-composite egress
  after the same `authorizeRoom` admission as token minting (org rooms
  additionally ride the `livekit` grant). The start persists a
  `call_recordings` document — `{ egressId, room, conversationKey,
  startedByUserId, startedAt, status }` — the app's own lifecycle record,
  surviving restarts.
- `POST /api/livekit/recordings/stop` `{ room }` stops every active egress
  for an admitted room.
- `GET /api/livekit/recordings` lists active recordings for rooms the caller
  may enter — the call panel's record toggle and indicator state.
- Egress lifecycle events (`egress_started`, `egress_ended`, `egress_failed`)
  arrive on the existing verified webhook receiver. On `egress_ended`, each
  finished file is fetched from the recordings store
  (`GET {endpoint}/{bucket}/{filename}`), persisted into the
  [files feature](../files/) (GridFS), and posted into the room's
  conversation as an attachment-only message of kind `video` sent by the
  recording starter (see
  [support attachments](../support/README.md#message-attachments));
  `egress_failed` — and any import failure — marks the recording failed.
  Egress events also fan out as `call.activity` payloads, so open call
  surfaces flip their recording state live. After the message lands, the
  org-configured [meetings pipeline](../meetings/README.md) may post a
  protocol-driven summary of the recording into the same conversation.

Recordings are not transcribed automatically: the deployed local STT is a
single-speaker service and call audio is multi-speaker. Transcribing and
summarizing recordings is the org meeting-protocol concern, to be built on a
diarization-capable provider.

## Server Contract

- `service.js` mints LiveKit room tokens (`jsonwebtoken`, HS256, `iss` = API
  key, `video.roomJoin` grants) after `authorizeRoom` passes, resolves call
  invites on the support conversation contract, snapshots active rooms, and
  verifies + fans webhook events onto the connections layer.
- Access derives from org membership and conversation/group participation.
  Org rooms are membership-based like the org chat; a `livekit` feature
  grant (read level) in the process access rights — evaluated with the
  shared grant evaluator — restricts admission only for organizations that
  actually declare the feature in their active process. Direct and group
  rooms keep the participant contract, which mirrors the process-aware
  support conversation keys.
- Webhooks: `POST /api/livekit/webhook` verifies the signed Authorization
  JWT including the `sha256` body-hash claim, then publishes `call.activity`
  events (org rooms → org topic; direct and group rooms → each participant's
  user topic). Configure the LiveKit server with `webhook.api_key: devkey`
  pointing at this endpoint inside the compose network.

## Environment

| Variable | Dev default |
|---|---|
| `LIVEKIT_PUBLIC_URL` | `ws://localhost:7880` (browser-facing) |
| `LIVEKIT_INTERNAL_URL` | `ws://livekit:7880` (server-to-server RoomService; defaults to `LIVEKIT_PUBLIC_URL`). The compose app container cannot reach the published `localhost:7880`, so `listActiveRooms` must use the network-internal address. |
| `LIVEKIT_API_KEY` | `devkey` |
| `LIVEKIT_API_SECRET` | `devsecret` |
| `LIVEKIT_RECORDINGS_S3_ENDPOINT` | — | Recordings bucket read endpoint (anonymous GET `{endpoint}/{bucket}/{filename}`); unset disables the ended-file import. On the zeus plane this is the app edge's recordings path (`https://perigram.sodalab.pro/recordings`). |
| `LIVEKIT_RECORDINGS_S3_BUCKET` | — | Recordings bucket name the egress plane uploads into. |
| `LIVEKIT_RECORDINGS_S3_ACCESS_KEY` / `LIVEKIT_RECORDINGS_S3_SECRET_KEY` | — | Bucket write credentials attached inline to egress requests (see Recordings). Unset disables uploads — egress then fails the output locally. |
| `LIVEKIT_RECORDINGS_S3_UPLOAD_ENDPOINT` | — | S3 API endpoint the egress plane uploads through — resolved on the plane host (e.g. `http://127.0.0.1:8333` for the garage plane on zeus), never by the app. |

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
In-call chat is intentionally absent (app chat owns messaging). Recording
is the call dock's record toggle (see [Recordings](#recordings) and
[calls](../../../components/calls/README.md)): conversation rooms (direct,
group) start/stop a room-composite egress, and the finished MP4 imports
into the conversation as a `video` attachment message.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/livekit/config` | Browser-facing `{ url }`. |
| `POST /api/livekit/token` | `{ room }` → `{ token, url, room, kind }` after room admission. |
| `POST /api/livekit/invite` | `{ conversationKey }` → publishes the call invite on the conversation topic. |
| `GET /api/livekit/active-rooms` | `{ room, kind, participants }[]` snapshot of joinable active call rooms. |
| `GET /api/livekit/recordings` | Active recordings (`{ room, egressId, startedByUserId, startedAt }[]`) for rooms the caller may enter. |
| `POST /api/livekit/recordings` | `{ room }` → starts a room-composite egress (conversation rooms only). |
| `POST /api/livekit/recordings/stop` | `{ room }` → stops the room's active egress; the ended file imports into the conversation. |
| `POST /api/livekit/webhook` | Verified LiveKit webhook receiver → connections layer. |

## Migration

Retired `call_channels` documents move into `chat_groups` with
`node server/scripts/migrate-call-channels-to-groups.js`
(`--dry-run` supported); see [scripts](../../scripts/README.md).

## Related

- [Connections feature](../connections/README.md)
- [Support chat](../support/README.md)
- [API routes](../../api/README.md)
