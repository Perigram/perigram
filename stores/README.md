# COMPONENT: Stores

Pinia stores for client state and API orchestration.

## Client state model

Three cells; every surface derives from them, nothing else caches:

- `instances.js` — the single instance cache and transport boundary. Records
  are keyed by type key, then id: `{ [typeKey]: { [id]: { dto, instance } } }`
  where `dto` is the raw wire document and `instance` is the derived CTS §3
  shape (derived iff the registry knows the type's declaration). List results
  are cached observations (`{ ids, stale }` per query key), concurrent
  lookups coalesce, and one `onEntityChanged` subscriber reconciles every
  open surface. All reads flow through it: `fetchInstance` (single endpoint
  with list-and-find fallback, so no expected 403/404 probes),
  `listInstances`, `upsertRecord`/`removeRecord` for event application.
  Mutations go through it too: `runAction` posts process actions to the
  active-process action endpoint via the offline outbox (idempotent replay),
  and `mutateDirect` serves the framework/party/editor feature endpoints the
  same way. Endpoint resolution is owned here: framework party/service types
  keep their feature routes (mirrors the server's framework service set),
  remaining pack feature modules keep theirs (pinned by spec to the mounted
  `server/api` routes), and every declared type without an explicit service
  resolves to the generic instance transport `/api/instances/:typeId`.
  Icons and constructibility resolve from the registry bundle (render
  policy, declared construct operators); event type keys canonicalize to
  cache keys through the registry when the bundle knows them, else through
  the mechanical case normalization in `utils/generated-screen-source.js`.
- `registry.js` — the compiled CTS client bundle as first-class state,
  projected from auth hydration (`processPayload.bundle`) with `refresh()`
  re-hydrating through the auth store. Owns `typesById`, `typeRecord`,
  `statesOf`, `operatorsOf`, `renderOf`, `iconFor`, `constructible`, the
  containment triples derived from declared children edges, and
  `projectedDomain` — the compiler-domain projection over the bundle (the
  same projection the server compiles with) consumed by client access
  previews so the resolver behaves exactly like auth hydration. The
  process designer reads the same bundle from its own overlay; this store
  is the runtime/client consumption contract.
- `auth.js` — identity, memberships, and the compiled per-user access
  contract (`effectivePermissions`, screens, navigation, action manifest,
  field policies, workflows, lineage bindings, process bundle). The sole
  hydration boundary; see its entry below.

Direct feature CRUD lives on the instances store too:
`createInstance`/`updateInstance`/`removeInstance` wrap `mutateDirect`
with the shared entity-event emission contract (browser-local event plus
the typed invalidation other sessions poll). `dtoRegistry` is the wire-DTO
projection for the remaining handwritten card/detail surfaces.

**Legacy seams (load-bearing, removal tied to their features):** the
delegated `useEntity` composable and entity store are deleted; five client
imports of `@cutkit/domain-cnc` remain because their concerns are still
owned by legacy server contracts, not by declarations —
`utils/status-engine.js` (status labels/severity for feature-served
types whose compiled workflows supplement the table),
`utils/entity-display-contract.js` (the legacy card surface registry),
`components/QueueEditor.vue` and `components/PermissionEditor.vue` (the
queue relation/construction contracts and the membership feature-key
vocabulary that membership grants are written against), and the designer
inspector's palette-surface metadata. Each dies when its feature
re-authors on declarations (queues) or when membership grants move to the
process vocabulary; none may gain new consumers.

## Core Stores

- `layerStandards.js`: Loads the canonical layer-standard catalogue. Lookups use
  `standard.data.code` / `standard.data.category` with root-field fallbacks only
  for migration compatibility, and pen overrides update `data.orgPenId`.
  Preview consumers call `ensureStandards()`, which shares an in-flight request
  and reuses the completed catalogue for the active user and organization;
  management surfaces retain `fetchStandards()` for an explicit refresh.
- `penTemplates.js`: Loads system and user pen DTOs. System/user grouping is
  based on `pen.lineage.userId`; stroke rendering data lives under
  `pen.data.stroke`. `ensurePens()` follows the same authenticated-scope cache
  contract as layer standards, while `fetchPens()` remains the explicit refresh
  operation.
- `batches.js`: Batch list/current batch, nesting actions, status polling.
- `artifacts.js`: Batch artifacts fetching and cache.
- `supportChat.js`: Chats drawer conversation snapshot state, unread totals,
  and read acknowledgement for the app-shell chat badge and drawer inbox. The
  store loads `/api/support/conversations` only after `auth.userIsSet` is true
  and refreshes it on a short interval so login/auth hydration cannot leave the
  drawer with only its synthetic support row.
- `calls.js`: Shared LiveKit call-activity state and the app's call line
  state machine (`idle → ringing → joining → in-call`). Connects once per
  app (mounted by the app layout) to `call.invite` on the user topic and
  `call.activity` on the user/org topics, keeps the
  `/api/livekit/active-rooms` snapshot fresh (debounced refetch), owns
  incoming invites with a 30s TTL so accepting or declining anywhere stops
  the ring everywhere, parks accepted calls as a pending home-workspace
  tab, and keeps live WebRTC rooms across surface transfers (tab ↔
  floating window) so a pop-out never drops the connection. Ringing is
  room-scoped, not just time-scoped: each refreshed snapshot drops invites
  whose room is no longer running (minus a grace window for stale
  snapshots), so a caller hanging up before the callee answers stops the
  ring immediately. The line machine tracks the local user's own
  participation; the room lifecycle ("anyone still in it") is carried by
  the snapshot and drives the sidebar rows and chat ongoing-call banner
  through `activeRoomForConversation`, which mirrors the server's derived
  room-name contract via `utils/call-rooms.js`.
- `entityEvents.js`: Browser-local entity synchronization and the contract
  refresh hint: polls `/api/entity-events` by cursor and bridges returned
  changes into the browser-local event bus, and (via the connections org
  topic) re-hydrates auth once, debounced, when the server publishes a
  registry/process `contractChanged` marker. Browser-local
  entity mutation snapshots publish through the same store. Successful
  mutations publish a complete entity snapshot to the browser-local
  `utils/entity-events.js` contract used by shared stores and generated screens.
- `cassettes.js`, `toolProfiles.js`, etc.: Related feature stores.

## Conventions
- Stores use `$fetch` to call Nitro API endpoints.
- `auth.js` accepts optional `$fetch` options in `setUser()` and
  `fetchUserOrgs()` so route middleware can forward SSR request cookies during
  direct page loads. `setUser()` owns organization hydration; app layouts should
  not re-fetch organizations after a successful auth hydration. Runtime app
  access comes from `activePermissions`, which prefers the active process
  compiled permissions. Tenant-management chrome can also check
  `tenantPermissions` through `hasTenantPermission()`, which reads explicit
  active membership grants for organization/team/process management recovery.
  It also exposes the active process's compiled lifecycle machines through
  `statusWorkflows`; entity UI uses this contract for workflow-derived status
  visibility and transitions.
- `navigation.js` owns project breadcrumb context. SSR callers must pass request
  headers through `fetchProjectContext(slug, fetchOptions)` so protected project
  lookups use the same session cookie as auth middleware. Breadcrumb sibling
  options normalize canonical DTO labels before passing them to PrimeVue Select.
  When auth includes an active process, hubs and breadcrumbs are built only from
  the compiled process screen manifest plus the active permission evaluator, so
  a user's app menu follows their compiled process assignment and scoped
  bindings. Generated `/screens/:screenKey` breadcrumbs use
  `utils/generated-labels.js` so raw process labels and entity ids are translated
  the same way as generated screen headers. Generated breadcrumb hub matching is
  exact for `/screens/:screenKey` routes, so a home screen does not duplicate
  itself as both hub and current screen and detail screens do not match a hub by
  string prefix. Static hub/tab lists are used only when no active process is
  present. Organization management breadcrumbs are not generated operational
  screens; they use `hasTenantPermission()` so admins can still reach team
  management and process design while ordinary process roles only see their
  compiled screens.
  Project routes include a store-resolved section breadcrumb for queues, sheet
  designs, data, artifacts, and details.
  Admin pages use a store-owned sibling list that includes workbench,
  workflow overrides, users, ConfigBot, and support. Admin workbench breadcrumbs also
  receive route query so `/admin?section=...` can expose
  Designer/Entities/Context/Commands as navigation siblings.
- `workbenchFixtures.js` owns the admin workbench fixture context. Manual
  entities and command/task outputs are upserted into the same context used for
  typed entity options; seeding preserves that context instead of regenerating
  fixtures and dropping manual entries. Preview status transitions update this
  context locally so draft/manual entities do not call the persisted status API.
- Long-running operations start optimistic UI updates and polling until
  terminal states. Queue nesting completion is emitted as an event object
  (`{ queueId, completedAt }`) rather than a bare queue id so repeated runs for
  the same queue still trigger component watchers and related entity refetches.
  Queue nesting polling reads lifecycle state through `getPrimaryState()` so it
  works for both legacy string statuses and v2 process/status-machine blocks.
  Fetched queue runs are sorted by `data.runNumber` before being written into
  the store so UI selectors can treat the last run as the newest run.
  Generated process queue actions that run `solveNesting` must start the same
  queue polling path as `/api/queue/:id/nest`; otherwise the UI will keep the
  freshly-created run snapshot and miss the asynchronous task completion update.
  Process-authored run statuses can be applied before the async nesting worker
  writes `data.results` and `data.sheetDesignIds`, so polling treats the latest
  run as active until it has solver output, even when its primary status is no
  longer the domain `NESTING` state. Older empty historical runs are ignored
  when a newer run already has results.
- Internal demo pages may pre-seed `entities.registry` with DTO-shaped mock entities so shared trace components render examples without calling authenticated APIs.
