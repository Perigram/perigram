# COMPONENT: Stores

Pinia stores for client state and API orchestration.

Parent: [root README](../README.md).

## Client state model

Three cells; every surface derives from them, nothing else caches:

- `instances.js` — the single instance cache and transport boundary. Records
  are keyed by type key, then id: `{ [typeKey]: { [id]: { dto, instance } } }`
  where `dto` is the raw wire document and `instance` is the derived CTS §3
  shape (derived iff the registry knows the type's declaration; a record
  cached before the registry hydrated derives as soon as the declaration
  arrives — the pool is a reactive consumer). `canonicalTypeKey` maps every
  alias spelling (snake, camel) onto the registry's kebab id, the record-cache
  key the pool and the screens resolve against. List results
  are cached observations (`{ ids, stale }` per query key), concurrent
  lookups coalesce, and one `onInstanceChanged` subscriber reconciles every
  open surface. All reads flow through it: `fetchInstance` (single endpoint
  with list-and-find fallback, so no expected 403/404 probes),
  `listInstances`, `upsertRecord`/`removeRecord` for event application.
  Optional-reference lookups (`resolveReadableReference`) fall back to the
  directory card for the framework party types (`user`, `organization`),
  so cross-tenant references resolve to their name-level card instead of
  an id chip (see
  [the directory feature](../server/features/directory/README.md));
  a resolved reference serves from the record cache on later lookups —
  hover-driven resolvers call it on every trigger.
  Mutations go through it too: `runAction` posts process actions to the
  active-process action endpoint via the offline outbox (idempotent replay)
  and lands a create run's created entity in the pool eagerly — the local
  half of run-action reconciliation, so create-open destinations read the
  record immediately while the server-published event remains the
  cross-session backstop (the upsert marks the type's cached list
  observations stale so surfaces refetch) — and `mutateDirect` serves the
  framework/party/editor feature endpoints the
  same way. The CRUD verbs on top are optimistic: `updateInstance` and
  `removeInstance` preview the mutation into the pool before the request
  resolves — the wire patch merges with the instance service's leaf-set
  semantics (`name` plus `fields`/`lineage`/`relations` leaves, blocks
  merge, never replaced) — and roll back to the server-known DTO on any
  failure; an offline queueing reverts the preview rather than faking
  local state (the outbox replay re-lands the mutation later), and the
  server response lands as the reconciled truth. Creates keep the server
  round-trip: identity is server-assigned, and generated create dialogs
  apply the run result synchronously. A successful publication records
  the echoed event id so the publishing tab skips its own invalidation
  deliveries (see `instanceEvents.js` below). Mutations that do not
  ride the verbs — the revisioned editor payload transport — owe the
  same contract through `notifyMutated(typeId, id, { snapshot, reason,
  origin })`: it emits the browser-local event (carrying the acting
  surface's `origin` token so that surface can skip its own change)
  and publishes the typed invalidation for other sessions. Endpoint resolution is owned here, split by plane: READS
  resolve through the generic instance transport `/api/instances/:typeId`
  for every type the server resolver serves — party types included (their
  process bindings speak the same §3 wire); mutations keep the feature
  routes for types that own them (party administration, framework
  services, editor feature modules — pinned by spec to the mounted
  `server/api` routes), and everything else mutates through the transport.
  The team surface reads its feature DTO directly (`/api/users`).
  Icons and constructibility resolve from the registry bundle (render
  policy, declared construct operators) — the render-policy icon is the
  single icon source for every generated/shared surface (cards, pages,
  collections, trace links). Event type keys canonicalize to
  cache keys through the registry when the bundle knows them, else through
  `canonicalTypeKey` in this store.
- `registry.js` — the compiled CTS client bundle as first-class state,
  projected from auth hydration (`processPayload.bundle`) with `refresh()`
  re-hydrating through the auth store. Owns `typesById`, `typeRecord`,
  `statesOf`, `operatorsOf`, `iconFor`, `constructible`, the
  containment triples derived from declared children edges (keyed by the
  edge's declared `lineageKey` per CTS SPEC §6 — the value instances
  store, never the edge's authoring map key), and
  `projectedDomain` — the compiler-domain projection over the bundle (the
  same projection the server compiles with) consumed by client access
  previews so the resolver behaves exactly like auth hydration; the
  registry re-stamps org-scoped types with the bundle root's
  `organizationId` (the serialization carries it once, and an org type
  without its org never enters the tenancy view, so it would project
  nothing). The store
  also registers the declaration-derived field-access policies
  (`registerDeclarationFieldAccess`) into the shared display-access
  resolver: bundle types outside the hardcoded domain table get their fact-row
  access from the projection, re-featured to the class-collection grant
  the server's instance reads check. The
  process designer reads the same bundle from its own overlay; this store
  is the runtime/client consumption contract.
- `auth.js` — identity, memberships, and the compiled per-user access
  contract (`effectivePermissions`, screens, navigation, action manifest,
  field policies, lineage bindings, process bundle). The sole
  hydration boundary; see its entry below.

Direct feature CRUD lives on the instances store too:
`createInstance`/`updateInstance`/`removeInstance` wrap `mutateDirect`
with the shared instance-event emission contract (browser-local event plus
the typed invalidation other sessions poll). `dtoRegistry` is the wire-DTO
projection for handwritten card/detail surfaces.

## Optimistic write state

`writeStateFor(typeKey, id)` is the single per-record write state for
`updateInstance` and `removeInstance`. Writes for one record id run in
arrival order: the head previews and posts, later writes wait for it to
settle and preview when they become the head.

| From | Event/guard | To |
|---|---|---|
| `idle` | update or delete starts | `pending` |
| `pending` | response settles | `confirmed` |
| `pending` | request fails | `rolled-back` |
| `pending` | outbox queues the write offline | `queued` |
| `pending`, `rolled-back`, `queued` | server or outbox event for the record | `confirmed` |
| `confirmed`, `rolled-back`, `queued` | next update or delete | `pending` |

`pending` recovers through the response, the failure, or the offline
queueing. `queued` recovers through the outbox replay event. `confirmed`
and `rolled-back` are settled observations; the next write re-enters
`pending`.

## Core Stores

- `layerStandards.js`: Layer-standard catalog accessor over the generic
  instance transport (tech-drawing pack): system rows
  (`organizationId: null`) merge with org rows shadow-by-`code`, the
  effective default pen projects from the declared `defaultPen` relation,
  and pen overrides create/update the org shadow — system rows are never
  mutated. Lookups keep the editor contract (`data.code`/`data.category`,
  `getByCode`/`getByCategory`, `ensureStandards()`).
- `pages.js`: The organization's custom pages and sidebar sections (SPEC
  §26) over `/api/pages`: the tree projection (`pages`, `sections`,
  `pageById`), per-document block loads, and the create/rename/move/
  save/delete verbs, plus `ensureClassPage(typeId, name)` — the idempotent
  class-bound Page instance; the first read strips a legacy seeded
  collection block from its document. Mutations are direct fetches; an
  organization switch refetches (`reload`). The home sidebar and the
  custom page surface are the consumers.
- `views.js`: The organization's saved collection views (SPEC §26) over
  `/api/views`: the list projection (`views`, `viewById`), per-view
  state loads (`viewStates`) that drop the row on a 404 GET (a
  server-side delete leaves the cache), and the create/rename/remove
  verbs; `canSave` gates the collection header's save affordance on
  active-organization membership. The save affordance, the page view
  picker, and the page view embed are the consumers.
- `instance-overlays.js`: The organization's record-page overlays (SPEC
  §26) over `/api/instance-overlays/:type/:id`: a per-instance cache
  (`overlays`, `loaded` keyed `typeId:instanceId`), `ensureLoaded`,
  `save`, and `remove`. The record document's overlay composition and
  authoring session are the consumers.
- `penTemplates.js`: Pen-template catalog accessor over the generic
  instance transport (tech-drawing pack): system/org grouping by tenancy
  (personal pens become org pens), stroke data under `pen.data.stroke`,
  and editor form payloads map onto the wire row in
  `createPen`/`updatePen`.
- `supportChat.js`: Chats drawer conversation snapshot state, unread totals,
  and read acknowledgement for the app-shell chat badge and drawer inbox. The
  store loads `/api/support/conversations` only after `auth.userIsSet` is true
  and refreshes it on a short interval so login/auth hydration cannot leave the
  drawer with only its synthetic support row.
- `agentBots.js`: Org bot administration state for the chat bot panel
  (`/api/agent-bots` picker rows with per-conversation subscription flags,
  create/delete/token reveal); the server gates everything behind user
  management access and a 403 hides the surface.
- `calls.js`: Shared LiveKit call-activity state and the app's call line
  state machine (`idle → ringing → joining → in-call`). Connects once per
  app (mounted by the app layout) to `call.invite` on the user topic and
  `call.activity` on the user/org topics, keeps the
  `/api/livekit/active-rooms` snapshot fresh (debounced refetch, refetch on
  connections-stream reopen, last known snapshot kept on failed refetch),
  and owns incoming invites with a 30s TTL so accepting or declining
  anywhere stops the ring everywhere. The connected room is one session in
  the store — the LiveKit Room, a single event binder, and a reactive
  participant/track state block. The session state is explicit
  (`connecting`, `connected`, `reconnecting`, `failed`); `reconnecting` is
  the live state during a transport reconnect. Every call surface
  (workspace tab, dialog, floating window, mobile lane) renders the session
  as a view; `placement` is the explicit surface state (`tab`, `dialog`,
  `floating`, `dock`), and `pendingTabRoom`, `mountedRooms`, `callTabs`, and
  `floatingRoom` are facts the parking rule reads. Panels register in
  `mountedRooms` while mounted; open workspace call tabs register in
  `callTabs` (the tab is the session's surface, active or not). A live
  session with neither parks into the desktop floating window (SPEC §11)
  while mobile keeps the media-dock lane entry. Accepted calls park as a
  pending home-workspace tab. Ringing
  is room-scoped, not just time-scoped: an invite is dropped only after its
  room was observed running and then left the snapshot, so a caller hanging
  up before the callee answers stops the ring immediately while a caller
  still on the pre-join screen cannot dismiss it. The line machine tracks
  the local user's own participation; the room lifecycle ("anyone still in
  it") is carried by the snapshot and drives the sidebar
  rows and chat ongoing-call banner through `activeRoomForConversation`,
  which resolves through the shared room grammar
  ([`shared/call-rooms.js`](../shared/README.md)). The machine's canonical
  contract lives in
  [components/calls](../components/calls/README.md#call-line-session-and-placement-machines).
- `media.js`: The app's now-playing channel (see
  [components/media](../components/media/README.md)): exactly one media
  element plays across every surface (a starting element claims the channel
  and pauses the previous one), and a source surface unmounting mid-playback
  hands its descriptor — kind, streaming URL, title, position — to the
  app-shell dock, which resumes it in its own element.
- `instanceEvents.js`: Browser-local instance synchronization and the contract
  refresh hint: polls `/api/instance-events` by cursor and bridges returned
  changes into the browser-local event bus, and (via the connections org
  topic) re-hydrates auth once, debounced, when the server publishes a
  registry/process `contractChanged` marker. The app layout connects the
  store for a signed-in user and disconnects on sign-out, beside the calls
  and support-chat connections. The same org-topic subscription carries
  rapid events: `entityChanged` payloads are emitted the moment they
  arrive instead of waiting for the poll — visible tabs only, with hidden
  tabs holding them for the poll catch-up. The cursor advances past every
  realtime delivery (monotonically, across both paths) so the poll never
  re-delivers, and invalidations this tab published itself are skipped in
  both paths — the mutation already applied the fresher snapshot, and the
  same user's other tabs still reconcile because their publications carry
  different event ids. Browser-local
  instance mutation snapshots publish through the same store. Successful
  mutations publish a complete instance snapshot to the browser-local
  `utils/instance-events.js` contract used by shared stores and generated screens.

  Poll machine (`status`):

  | From | Event/guard | To |
  |---|---|---|
  | `idle` | `connect` | `polling` |
  | `polling` | `GET /api/instance-events` succeeds | `connected` |
  | `polling` | request fails | `error` |
  | `connected` | a later request fails | `error` |
  | `error` | 5 s retry timer fires | `polling` |
  | `idle`, `polling`, `connected`, `error` | `disconnect` | `stopped` |
  | `stopped` | `connect` | `polling` |

  `connected` means the last poll succeeded; `status` is the authoritative
  poll state and `connected` derives from it. A hidden document stops
  rescheduling after the in-flight request returns; becoming visible polls
  immediately with the last cursor. `disconnect` resets the cursor, so the
  next connect starts from the buffer's current end.

- `outbox.js`: Offline mutation queue and sequential replay; the operation
  machine (`pending`, `failed`), connectivity latch, and `Idempotency-Key`
  replay contract are canonical in the
  [root PWA section](../README.md#progressive-web-app).
- Generated surfaces resolve entity data through the instances store.

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
  `switchOrganization()` and `leaveOrganization()` re-hydrate through
  `setUser()`; leaving the active organization selects the server's fallback
  membership or no organization.
  State surfaces derive their vocabulary through
  [composables/useStatePolicy](../composables/README.md#usestatepolicy--the-flat-state-vocabulary-source),
  the flat contract over the hydration payload's compiled producer workflows.
- `navigation.js` owns route breadcrumbs. SSR callers must pass request
  headers through `fetchRouteHierarchy(path, query, fetchOptions)` so
  protected lookups use the same session cookie as auth middleware.
  Detail-screen detection reads the projected `instanceDetail` template
  vocabulary and the screen's `typeId`, so compiled process manifests keep
  detail screens out of hub siblings and breadcrumbs. Breadcrumb sibling options normalize canonical DTO labels before passing
  them to PrimeVue Select.
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
- Long-running operations start optimistic UI updates and polling until
  terminal states. Nesting solves run as process actions (`solveNesting`),
  and their async completion reaches open screens through the shared
  entity-event reconciliation like every other mutation.
- Internal demo pages may pre-seed the instances store with DTO-shaped mock records (`upsertRecord`) so shared trace components render examples without calling authenticated APIs.
