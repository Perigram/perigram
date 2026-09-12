# COMPONENT: LiveKit Calls

LiveKit calls are a capability module over the self-hosted `livekit` docker
service. Nothing here persists; rooms are derived, never free-form:

| Room | Who may join |
|---|---|
| `call:direct:<sorted-user-id-a>:<sorted-user-id-b>` | Conversation participants (mirrors the support conversation keys) or admins |
| `call:org:<orgId>` | Organization members or admins |

## Server Contract

- `service.js` mints LiveKit room tokens (`jsonwebtoken`, HS256, `iss` = API
  key, `video.roomJoin` grants) after `authorizeRoom` passes, resolves call
  invites on the support conversation contract, and verifies + fans webhook
  events onto the connections layer.
- Access today derives from org membership and conversation participation.
  The Process Designer service declaration — rooms provisioned and gated by
  the active process access rights — is the tracked follow-up in TODO.md.
- Webhooks: `POST /api/livekit/webhook` verifies the signed Authorization
  JWT including the `sha256` body-hash claim, then publishes `call.activity`
  events (org rooms → org topic, direct rooms → both participant user
  topics). Configure the LiveKit server with
  `webhook.api_key: devkey` pointing at this endpoint inside the compose
  network.

## Environment

| Variable | Dev default |
|---|---|
| `LIVEKIT_PUBLIC_URL` | `ws://localhost:7880` (browser-facing) |
| `LIVEKIT_API_KEY` | `devkey` |
| `LIVEKIT_API_SECRET` | `devsecret` |

Dev keys are fixed in `livekit.dev.yaml`; production must override all three.

## Client Contract

`components/calls/CallPanel.vue` lazily imports `livekit-client` (the WebRTC
stack never enters the main bundle), joins with a minted token, renders
participant tiles through shared primitives (video or Avatar fallback,
semantic tile chrome, speaking/mute state), and owns mic/camera/leave
controls. Chat integration lives in `ChatSupport.vue`: the call button posts
`/api/livekit/invite` which publishes a `call` event on the conversation
topic; the counterpart gets an incoming-call banner and joins the same room.

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/livekit/config` | Browser-facing `{ url }`. |
| `POST /api/livekit/token` | `{ room }` → `{ token, url, room, kind }` after room admission. |
| `POST /api/livekit/invite` | `{ conversationKey }` → publishes the call invite on the conversation topic. |
| `POST /api/livekit/webhook` | Verified LiveKit webhook receiver → connections layer. |

## Related

- [Connections feature](../connections/README.md)
- [Support chat](../support/README.md)
- [API routes](../../api/README.md)
