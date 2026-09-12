# TODO

## Integrations

- [ ] **Excalidraw drawings: attachment kind + dedicated editor surface.**
  New standalone surface — not a `DesignerDialog`/`DrawingCanvas` reuse. The
  Excalidraw editor itself is incorporated into this project's stack; it is
  React-based, so decide at implementation start between the official React
  package mounted in an isolated island vs a maintained Vue wrapper, and record
  that decision in this task's Agent Notes.
  Scope:
  - Declare the drawing attachment kind through the `@cutkit/processes`
    attachment-kind contract; `.excalidraw` source JSON persists via the
    files feature.
  - `ExcalidrawEditor` surface with route + pane/dialog hosts following the
    `DesignerSurface`/`DesignerDialog` sizing contract.
  - Creation flow accepts an optional background image (upload or existing
    attachment ref) and an optional origin entity reference; both persist in
    drawing metadata.
  - Creating drawings from geometry entities via screenshot backgrounds is
    Process Designer orchestration and is OUT of scope here — this task only
    ships the bg-image + origin-ref contract that PD will later drive.
  - Preview thumbnails in cards/refs, i18n, access through grants.
  Acceptance: create/edit/reopen a drawing with and without background image
  and origin ref; attachment kind, storage, preview, and permissions follow
  existing contracts; no parallel preview pipeline.

- [x] **User connections architecture (shared realtime layer).**
  > Architecture note: implemented as a Server-Sent Events gateway, not a
  > WebSocket gateway. Chat already shipped h3 `createEventStream` streams and
  > EventSource clients, so SSE is the established in-repo transport; WS would
  > add Nitro's experimental websocket flag for no functional gain. Same
  > contract, same acceptance criteria.
  One canonical connections/presence architecture that chat and LiveKit both
  ride on:
  - SSE gateway as a capability module (`server/features/connections/`:
    `service.js` + spec, no v24 entity, nothing persisted), authenticated by
    the existing session, presence registry keyed by user + active
    organization.
  - Client composable (`useConnections`) exposing connection state, presence,
    and topic subscriptions; documented in `composables/README.md`.
  - Chat migrated onto it; the support repository remains the persistence
    source of truth.
  ### Agent Notes — 2026-09-12
  Implemented in `agent/connections-architecture-20260912-114913`. One SSE
  stream per tab (`GET /api/connections/events`) with server-side topic
  admission (self/org/admin built-in; `conversation:` delegated to the support
  feature authorizer); `POST /api/connections/subscriptions` resyncs topics
  after reconnects. Support chat publishes message/read/inbox events through
  the layer; the badge/inbox store dropped its 5 s REST poll, and the three
  per-conversation polled SSE endpoints became REST snapshots — no dual
  transport, `listMessagesSince`/`findSince` dead paths removed. Presence
  (online dot on direct-conversation rows) consumes `onlineUserIds`. Spec
  coverage: `server/features/connections/service.spec.js` (registry, fanout,
  admission, presence). LiveKit is the next consumer.
  Status: WAITING.

- [ ] **LiveKit integration (local docker, PD-declared service).**
  Depends on: connections architecture.
  - LiveKit server as a docker-compose service (dev + prod compose), dev
    config with fixed dev keys; documented in the README containers table.
  - `server/features/livekit`: token minting with room access derived from
    org membership + process grants, webhook receiver, room config.
  - Declare LiveKit as a Process Designer service so rooms provision and gate
    through active process access rights, aligned with the existing
    services/sockets contracts.
  - Rewrite LiveKit's UI in this stack (PrimeVue + shared primitives + token
    layer, no LiveKit default chrome), integrated with chat and users through
    the connections layer (shared presence, invite into call from chat).
  Acceptance: two org members join a room gated by process grants; UI is
  PrimeVue-native; presence shared with chat; containers documented.

## UI

- [x] **GSAP motion foundation: patterns + MotionDock cutover + cassette test flight.**
  ### Agent Notes — 2026-09-12
  Implemented in `agent/impl-design-epics-20260912-101759`. `composables/useMotion.js`
  ships `loadGsap` (lazy engine import) plus the three documented patterns
  (`useFollowValue`, `useEnterExit`, `useStateTransition`), all reduced-motion
  aware. MotionDock rewritten on the patterns with an unchanged behavior
  contract (unused `spring` prop dropped; no caller passed it). Test flight
  landed in the queue editor add-cassette dialog: a live `CassetteThumbnail`
  preview animates from the previous rendered state when cassette parameters
  change (`useStateTransition` crossfade, 250 ms input debounce). `motion-v`
  removed from dependencies — GSAP is the only engine. Patterns documented in
  `composables/README.md`; MotionDock and motion policy entries updated.
  Status: WAITING.
  GSAP becomes the project animation engine; `motion-v` is removed in the same
  task — no dual engines.
  - Add gsap following project dependency/bundle architecture (client-only,
    lazily loaded motion plugin; no global CSS animation layer).
  - Documented motion patterns as shared composables/utils: enter/exit, state
    transitions, and parameter→state animation (`fromTo` from the previous
    real state to the desired state, never from defaults); every pattern
    consumes `useReducedMotion()` and keeps Aura durations for generic states.
  - Replace MotionDock's `motion-v` implementation with GSAP through those
    patterns; dock behavior contract unchanged.
  - Test flight: queue cassette — changing cassette parameters animates the
    cassette preview from previous state to desired state.
  - Document the patterns in the `components/README.md` motion section; chat
    animations are the next consumer.
  Acceptance: MotionDock + cassette animated via GSAP; `motion-v` gone from
  dependencies; patterns documented; design-system spec green.

- [ ] **Chat redesign in PrimeVue-native components + animations.**
  Depends on: GSAP foundation; connections architecture.
  - Rebuild `ChatSupport` / `AdminSupportChat(List)` surfaces from PrimeVue
    primitives + shared blocks; `EntityInlineRef` message refs stay; no custom
    chat chrome.
  - Animations through the documented GSAP patterns (message enter, drawer,
    typing indicators), reduced-motion aware.
  - Delivery and read state over the connections layer.
  Acceptance: visual audit clean (no hand-rolled chat styling); animations
    follow the documented patterns; localization spec green.

- [ ] **Per-entity layout program: env-friendly variant layouts.**
  Supersedes `TODO_UI.md` (content folded here; that file is deleted).
  For each entity below, inspect real usage and design variant layouts
  (inline/compact/card/detail) that satisfy its usage flow and are
  env-friendly: mobile layouts, dataview-embeddable, container-size aware —
  no overflow, no unneeded full-width — reusing the `EntityWorkspace` /
  `ResponsiveGrid` container-query patterns. The generic entity component
  stays as fallback. Work one entity group per session; record progress in
  Agent Notes under this task.
  Entities: artifact, artifact_template, cassette, cassette_design,
  cassette_instance, catalog, color, entity_revision, facade, facade_pattern,
  geometry_capture, layer_standard, library, machine, material, material_pile,
  nesting_run, organization, pen_template, process_definition,
  profile_template, project, queue, remnant, requisition, sheet, sheet_design,
  tool_profile, user, warehouse.
  Acceptance per entity: variants cover its real usage flows; no overflow
  regressions in narrow containers; ui-lab coverage updated.
