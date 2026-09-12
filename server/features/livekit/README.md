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
- Access derives from org membership and conversation participation, and
  org rooms are a Process-Designer-declared service: when the organization
  has an active compiled process, `call:org:*` admission additionally
  requires a `livekit` feature grant (read level) in the process access
  rights, evaluated with the shared grant evaluator. The bundled process
  templates declare `livekit: 'write'` for their admin role; organizations
  with an already-active process definition must add the grant (re-instantiate a template or edit its role grants) before org rooms admit under
  process mode. Direct rooms keep the participant contract, which mirrors
  the process-aware support conversation keys.
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
publishes a `call` event on the conversation topic; the counterpart gets an
incoming-call banner and joins the same room. In-call chat is intentionally
absent (app chat owns messaging); recording/egress awaits server-side LiveKit
egress configuration.

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
