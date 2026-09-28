# COMPONENT: API Endpoints

## Structure
Routes are grouped into sub-directories corresponding to features:
- `artifacts/`: Metadata, deletion, and streaming for generated files.
- `artifact-templates/`: Organization-scoped DXF/PDF upload, parsed layout
  replacement, authorized source streaming, and deletion. Template-generated
  artifacts expose `PUT /api/artifacts/:id/layout` for revision-backed edits.
- `cassettes/`: Template upload (`POST /api/cassettes/upload`), artifact-based
  import (`POST /api/cassettes/import`), management, and template DXF export.
  The collection route forwards generated-screen lineage filters such as
  `libraryId` to the feature service so parent detail pages only list their own
  child templates.
- `commands/`: Authenticated execution route for declared domain commands such
  as `saveCassetteTemplate` and `generateAttachment`.
- `instances/`: The generic per-type instance transport (`/api/instances/:type`
  and `/api/instances/:type/:id`) serving every pack and org-authored type
  through the CTS instance machinery, including typed payload upload/download.
- `files/`: Shared file transport — `POST /api/files/upload` and
  `GET /api/files/download/:id` for instance payloads and attachments.
- `process-definitions/`: Draft/activation endpoints, effect-free graph
  preview, plus durable orchestration. `POST /:id/runs` starts a trigger,
  `POST /runs/:id/resume` advances a running or due-waiting run, and
  `GET /runs/:id` reads its status. Route handlers delegate authorization,
  persistence, scheduling, and effects to the process-definitions feature
  service. `POST /preview` evaluates pure/read nodes from an unsaved
  definition, bounds returned tree samples, and suppresses effects and
  control flow.
- `organizations/:id/billing`: Authenticated organization billing account,
  package catalog, Stripe checkout creation, and payment sync routes. Token
  packages come from runtime config, not from user records or database price
  collections.
- `instance-events/`: Authenticated entity invalidation channel. `GET` returns
  visible recent events after an optional numeric cursor, and `POST` publishes
  successful frontend CRUD mutations after their canonical entity API call
  succeeds.
- `tasks/`: Worker task queue protocol for claim, heartbeat, complete,
  fail, and cancel. No task executor is currently registered — the protocol
  is live for the next executor that ships beside an enqueue site.
- `admin/commands/` and `admin/tasks/`: Authenticated command/task definition
  and run listings (`command_runs`, `task_runs`). `admin/cts/` serves the
  org type registry view and declaration authoring API;
  `admin/domain/` serves system domain inspection.
- `state/`: Authenticated status action, transition, and history endpoints
  backed by the workflow runtime (`server/core/machines`). Successful
  transitions publish entity invalidation events through the shared entity
  event bus so other devices can refresh affected surfaces.
- `organizations/:id/invitations`: Authenticated team-management invitation
  listing, creation, and revocation. Handlers delegate authorization to the
  invitations feature so all invitation operations use the same process-derived
  user-management access contract and support string organization ids.
  Creation accepts an optional `inviteeUserId` to target one existing user
  (single-handshake direct invite) beside the unaddressed link invitation.
- `invitations/mine` and `invitations/:id/respond`: The invitee side of
  targeted invitations — the current user's pending invitations and their
  accept/decline response (see the
  [invitations feature](../features/invitations/README.md)).
- `directory/`: Authenticated cross-tenant discovery over users and
  organizations. `GET /directory/search` returns grouped directory cards
  (name-only matching); `GET /directory/:type/:id` returns one card with
  caller-relative flags. The privacy contract lives in the
  [directory feature](../features/directory/README.md).
- `partnerships/`: Authenticated organization-to-organization partner
  relations: active-organization listing, request, accept, decline, and
  cancel/terminate, all gated by `organizations:admin` on the respective
  side (see the [partnerships feature](../features/partnerships/README.md)).
- `sheet-designs/`: Lineage-scoped sheet design list/detail, direct DXF export,
  and `PUT /api/sheet-designs/:id` for write-authorized, revision-backed manual
  placement updates.
- `connections/`: Authenticated realtime layer. `GET /connections/events`
  is the single Server-Sent Events stream per browser tab; the server
  registers the connection with `user:`/`org:` topics and reports its
  connection id plus a presence snapshot in the `ready` event.
  `POST /connections/subscriptions` replaces the connection's requested
  topic set after every (re)connect; topic admission is enforced server-side.
  See [the connections feature](../features/connections/README.md).
- `notifications/`: Web Push subscription management. `GET
  /notifications/config` reports push availability and the VAPID public key;
  authenticated `POST/DELETE /notifications/subscriptions` save and remove
  browser subscriptions. See
  [the notifications feature](../features/notifications/README.md).
- `livekit/`: Authenticated call endpoints — config for the browser,
  token minting with server-side room admission, conversation call invites,
  verified LiveKit webhook receiver that fans call activity onto the
  connections layer, and the active-room snapshot
  (`GET /livekit/active-rooms`) that backs the home workspace's active-call
  list. Group call rooms derive from support group chats. See
  [the livekit feature](../features/livekit/README.md).
- `support/`: Authenticated support chat endpoints. User routes snapshot the
  current user's support conversation, a direct user-to-user conversation
  selected by `recipientUserId`, or a group conversation selected by
  `conversationKey`; admin routes remain scoped to customer support
  conversations. Group chats are created and deleted through
  `POST/DELETE /support/groups`. Conversation-list routes return unread
  counts from `supportConversationReads`. Messages may include structured
  inline `entityRefs` selected from readable generated-screen entity types and
  concrete readable entity options when a scoped list service exists. The
  instance-options route also accepts `recipientUserId` for direct-chat warning
  metadata. The shared chat message component renders both inline tokens and
  structured refs. Initial state loads over these REST routes; message, read,
  and inbox events arrive over the connections stream.
- `workflow-overrides/`: Authenticated organization-owned lifecycle override
  read and replace endpoints for entity status machines.
- `user/`: Current-user profile routes. Billing is organization-scoped under
  `organizations/:id/billing`.
- `users/`: Organization user listing, mutation, and single-user detail
  endpoints used by inline user references.
  `PUT/GET/DELETE /api/users/:id/avatar` owns authenticated user avatar upload,
  streaming, and removal through the users service.

## Conventions
- **Method Suffixes:** Files are named `[action].[method].js` (e.g., `index.get.js`, `create.post.js`).
- **Thin Wrappers:** API handlers should be minimal, delegating all business logic to the corresponding [Server Features](../features/README.md).
- **Idempotency:** mutating routes honor the `Idempotency-Key` header through
  the cross-cutting middleware; replays of already-executed requests are
  short-circuited (see [core/idempotency](../core/idempotency/README.md)).
## Authentication
Most routes require authentication, which is handled by `server/middleware/auth.js`.
Responsibilities:
- Runs on ALL requests.
- Reads `sessionId` from cookies.
- Fetches user from the database.
- Attaches the canonical auth context (see [server/utils/README.md](../utils/README.md#auth-context-object) for the shape).

`auth/login.post.js` sets the `sessionId` cookie after password login. The cookie
is secure in production by default, but `SESSION_COOKIE_SECURE=false` can be set
for plain HTTP LAN deployments so browsers keep the session cookie.
`auth/register.post.js` is the public signup boundary. It accepts user
credentials only (name, email, password) and creates the account without any
organization, membership, or process side effects. New users join an
organization by invitation or create their own after signing in through the
authenticated organizations API used by the profile page.

## Example Handler
```javascript
export default defineEventHandler(async (event) => {
  const userId = event.context.auth.userId;
  if (!userId) throw createError({ statusCode: 401 });
  
  const body = await readBody(event);
  return await service.create(body, userId);
});
```
