# COMPONENT: API Endpoints

Parent: [server](../README.md).

## Structure
Routes are grouped into sub-directories corresponding to features:
- `agent-bots/`: The organization AI's conversation membership — AI chat
  thread creation, conversation subscriptions (wake rules, profile/model
  pins), the capability-gated contacts and wake-options reads, run stop,
  and the live run-state read (admitted like a conversation read). See
  [agent-bots feature](../features/agent-bots/README.md).
- `mcp/`: `POST /api/mcp` — the MCP streamable-HTTP endpoint over the
  shared agent tool catalog (single JSON-RPC messages, `application/json`
  replies; authenticated by whatever the auth middleware resolved — user
  JWT or session cookie). See
  [agent-bots feature](../features/agent-bots/README.md).
- `llm/`: `GET /api/llm/config` reports `{ available }` for the caller's
  organization so clients render the AI's chat affordances only when an
  LLM provider is configured (see [llm feature](../features/llm/README.md));
  `GET/PUT /api/llm/settings` administer the org's named model profiles
  and capability routes (keys never travel), `POST /api/llm/models`
  lists a provider endpoint's models, and `POST /api/llm/test`
  (`{ profileId? }`) is the one-round connection test.
- `web-search/`: `GET/PUT /api/web-search/settings` administer the org's
  public-web search provider (SearXNG base URL or Tavily key; keys never
  travel), and `POST /api/web-search/test` is the one-round connection
  test (see [web-search feature](../features/web-search/README.md)).
- `commands/`: Authenticated execution route for declared domain commands such
  as `generateAttachment`.
- `graph-executions/`: `POST /api/graph-executions/query` runs an authorized,
  snapshot-backed CTS query for procedural graph reads;
  `POST /api/graph-executions` records an immutable execution envelope against
  the exact saved graph revision; `POST /api/graph-executions/commit` applies
  a selected exact-instance CTS patch proposal with a revision precondition;
  `POST /api/graph-executions/bake` materializes one selected output to an
  explicitly selected Page, revisioned instance payload, declared Blob field,
  declared relation attachment, or new typed instance; and
  `POST /api/graph-executions/export` returns one selected output as a download
  while recording export provenance; the collection-outputs GET routes list
  readable collection outputs from successful executions and resolve one
  pinned output through its saved graph revision. All routes delegate to the
  [graph-executions feature](../features/graph-executions/README.md).
- `instances/`: The generic per-type instance transport (`/api/instances/:type`
  and `/api/instances/:type/:id`) serving every pack and org-authored type
  through the CTS instance machinery, including typed payload upload/download,
  revision restore (`POST /api/instances/:type/:id/restore-revision`),
  revision-checked relation link/unlink (`POST`/`DELETE
  /api/instances/:type/:id/relations/:key`, body `{ target, expectedRevision }`,
  [instances feature](../features/instances/README.md)), and the one blank-editor
  creation boundary (`POST /api/instances/:type/editor`, which creates an
  editor-protocol file instance and its first payload together).
- `files/`: Shared file transport — `POST /api/files/upload` and
  `GET /api/files/download/:id` for instance payloads and attachments; downloads require authentication and enforce the file's organization/uploader scope.
  Downloads serve HTTP byte ranges (`Range` → `206` + `Content-Range`,
  single ranges; unparseable or unsatisfiable ranges degrade to the full
  `200` body) because media playback and seeking refuse range-less
  responses, and `?download=1` flips the disposition to an explicit
  download. Disposition filenames are RFC 6266-encoded (ASCII fallback +
  `filename*=UTF-8''…`) — header bytes stop at Latin-1, so a raw
  non-ASCII stored name would otherwise fail the whole response. Big
  uploads ride resumable chunk-append sessions:
  `POST /api/files/upload-sessions` (`{ fileName, mimeType, size,
  bucket? }`, 5MB chunks, 1GB cap) returns `{ uploadId, chunkSize }`;
  `PUT /api/files/upload-sessions/:id/:index` appends one raw-bytes
  chunk idempotently; `GET /api/files/upload-sessions/:id` reports the
  received chunk indexes (the resume state after a disconnect);
  `POST /api/files/upload-sessions/:id/complete` assembles the chunks
  into the stored file, returns the `upload` descriptor shape, and
  deletes the session. Sessions and chunks are Mongo documents with a
  one-day TTL, so abandoned uploads reap themselves; the client
  transport lives in `composables/useChatFileUpload.js`.
- `process-definitions/`: Draft/activation endpoints, effect-free graph
  preview, and socket projection. The `active/` subtree serves the
  active contract's runtime surface: `POST active/actions/:id/execute`
  runs one compiled manual action, `GET active/actions/:id/options`
  resolves Link-picker candidates, and `POST active/exports/run`
  executes a declaration-derived export action (SPEC §21) with
  action-scoped grants. Route
  handlers delegate authorization, persistence, and effects to the
  process-definitions feature
  service. `POST /preview` evaluates pure/read nodes from an unsaved
  definition, bounds returned tree samples, and suppresses effects and
  control flow.
- `organizations/:id/billing`: Authenticated organization billing account,
  package catalog, Stripe checkout creation, and payment sync routes. Token
  packages come from runtime config.
- `instance-events/`: Authenticated entity invalidation channel. `GET` returns
  visible recent events after an optional numeric cursor, and `POST` publishes
  successful frontend CRUD mutations after their canonical entity API call
  succeeds.
- `tasks/`: Worker task queue protocol for claim, heartbeat, complete,
  fail, and cancel. Managed plugin workers also read pinned package assets
  and invoke declared server capabilities through the task claim boundary
  (see [core/tasks](../core/tasks/README.md)).
- `organizations/:id/plugins/:pluginId/capability`: authenticated,
  read-only host capabilities for browser Worker operations (see
  [plugins](../features/plugins/README.md)).
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
- `auth/leave-org`: Authenticated self-service membership removal. The
  active organization falls back to another active membership or none; the
  last active member/owner is refused (see the
  [users feature](../features/users/README.md)).
- `directory/`: Authenticated cross-tenant discovery over users and
  organizations. `GET /directory/search` returns grouped directory cards
  (name-only matching); `GET /directory/:type/:id` returns one card with
  caller-relative flags. The privacy contract lives in the
  [directory feature](../features/directory/README.md).
- `partnerships/`: Authenticated organization-to-organization partner
  relations: active-organization listing, request, accept, decline, and
  cancel/terminate, all gated by `organizations:admin` on the respective
  side (see the [partnerships feature](../features/partnerships/README.md)).
- `pages/`: The organization's custom pages and sidebar sections (SPEC
  §26): tree listing (content excluded), create, full read, one PATCH
  for rename/move/content, and delete with detach semantics. Members of
  the active organization read and write (see the
  [pages feature](../features/pages/README.md)).
- `views/`: The organization's saved collection views (SPEC §26):
  listing (`_id, name, typeId`, viewState excluded) with an optional
  `typeId` filter, create, full read, one PATCH for rename/state, and
  delete. Members of the active organization read and write (see the
  [views feature](../features/views/README.md)).
- `instance-overlays/:type/:id`: One record-page overlay per instance
  (SPEC §26): read (`null` when none), one PATCH that creates or replaces
  the whole document, and delete. Members read; writes take the record's
  write grant (see the
  [instance-overlays feature](../features/instance-overlays/README.md)).
- sheet designs ride the generic instance transport
  (`/api/instances/sheet-design`, SPEC §13): the editor recomputes the
  layout client-side and patches generically; DXF export rides
  `generateAttachment` with the installed plugin's export binding.
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
- `plugins/`: Plugin catalog read/admin routes and the installed-module
  proxy (`/api/plugins/:pluginId/module/**`) — covered by the
  [plugins feature](../features/plugins/README.md).
- `service/`: Deployment diagnostics — `GET /api/service/health` (Mongo
  ping) and `GET /api/service` (db status, caller, commit SHA).
- `livekit/`: Authenticated call endpoints — browser config, token minting
  with server-side room admission, call invites, the verified webhook
  receiver, the recordings lifecycle, and the active-room snapshot backing
  the home workspace's active-call list. See
  [the livekit feature](../features/livekit/README.md).
- `support/`: Authenticated support chat endpoints — user, direct, and
  group conversation snapshots, group create/delete, message routes with
  unread counts, inline `entityRefs`, transcribe, and forward; admin routes
  stay scoped to customer support conversations. See
  [support feature](../features/support/README.md).
- `transcription/`: `GET /transcription/config` reports `{ available }` for
  the caller's organization so clients surface transcription affordances only
  when a provider is configured (see
  [transcription feature](../features/transcription/README.md)).
- `instance-revisions/`: Authenticated revision listing and detail with
  the revision's primary attachment streaming (see the
  [instance-revisions feature](../features/instance-revisions/README.md)).
- `user/`: Current-user profile routes. Billing is organization-scoped under
  `organizations/:id/billing`.
- `users/`: Organization user listing, mutation, and single-user detail
  endpoints used by inline user references.
  `PUT/GET/DELETE /api/users/:id/avatar` owns authenticated user avatar upload,
  streaming, and removal through the users service.

## Conventions
- **Method Suffixes:** Files are named `[action].[method].js` (e.g., `index.get.js`, `create.post.js`).
- **Dynamic Segments:** sibling dynamic directories under one parent share
  one placeholder name (`invitations/[invitation]/…`). Radix3 selects a
  sibling placeholder by remaining path depth, so two names at the same
  position leave the deeper route unreachable.
- **Multipart Uploads:** Every upload route reads the binary from a form
  part named `file` (`files/`, `instances/` payload, and
  `users/:id/avatar`); clients must
  append the blob under that exact field name.
- **Thin Wrappers:** API handlers should be minimal, delegating all business logic to the corresponding [Server Features](../features/README.md).
- **Idempotency:** mutating routes honor the `Idempotency-Key` header through
  the cross-cutting middleware; replays of already-executed requests are
  short-circuited (see [core/idempotency](../core/idempotency/README.md)).
## Authentication
Most routes require authentication, which is handled by `server/middleware/auth.js`.
Responsibilities:
- Runs on ALL requests.
- Reads a Bearer JWT from the `Authorization` header, falling back to the
  `sessionId` cookie.
- Fetches user from the database.
- Attaches the canonical auth context (see [server/utils/README.md](../utils/README.md#auth-context-object) for the shape).

`auth/login.post.js` sets the `sessionId` cookie after password login. The cookie
is secure in production by default, but `SESSION_COOKIE_SECURE=false` can be set
for plain HTTP LAN deployments so browsers keep the session cookie.
`auth/register.post.js` is the public signup boundary. It accepts user
credentials only (name, email, password) and creates the account with
credentials alone. New users join an organization by invitation or create
their own after signing in through the authenticated organizations API used
by the profile page.

