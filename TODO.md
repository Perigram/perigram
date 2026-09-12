# TODO

## Integrations

- [x] **Sketch drawings: attachment kind + minimal drawing editor surface.**
  > Decision record, 2026-09-12: original scope said "incorporate the
  > Excalidraw editor". Excalidraw's editor is React-only; a lazily-loaded
  > React island was approved provisionally, then re-scoped when the real
  > toolset turned out to be "drawing tools only" (no transforms, hatches,
  > diagrams). Implemented instead with `perfect-freehand` (~5KB) + an
  > in-house editor: no React, we own the scene format, and the same contract
  > would host a full excalidraw island later if ever wanted.
  Scope:
  - `SKETCH` attachment kind in `@cutkit/domain-cnc`: `application/json`
    scene persisted via the files feature (`sketches` bucket), created
    through `creation.mode: 'editor'` (generalized
    `GeneratedArtifactCreator` initial-file contract), edited through
    `editor.mode: 'sketch'`.
  - `SketchEditor` surface inside `ArtifactDetail` (same inline-editor
    pattern as the text/CSV editors): pen/line/rect/ellipse/eraser,
    color/width, undo/redo, clear.
  - Creation accepts an optional background image (uploaded to the sketches
    bucket, referenced from scene JSON) and an optional origin entity
    reference persisted to `data.metadata.origin`.
  - Creating sketches from geometry entities via screenshot backgrounds is
    Process Designer orchestration and is OUT of scope here — this ships the
    bg-image + origin-ref contract PD will later drive.
  - Preview through `DrawingCanvas` (`sketch` source type + shared
    `utils/sketch.js` normalizer) — no parallel preview pipeline.
  ### Agent Notes — 2026-09-12
  Implemented in `agent/excalidraw-surface-20260912-132350`. Scene contract:
  `{ version, background: { fileId, url } | null, strokes: [{ id, tool,
  points, color, size }] }`; pen strokes render via perfect-freehand, shapes
  from two defining points; eraser is stroke-level hit-testing. Editor saves
  through `PUT /api/artifacts/:id/file` (same revision/access path as the
  text editor); origin through `PUT /api/artifacts/:id` metadata. Domain vue
  adapter now exposes the raw `surfaces` list for typed pickers. i18n en+ru.
  Status: WAITING.

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

- [x] **LiveKit integration (local docker, PD-declared service).**
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
  ### Agent Notes — 2026-09-12
  Implemented in `agent/livekit-20260912-143727` as a working vertical slice:
  `livekit` compose service (dev keys in `livekit.dev.yaml`, single UDP media
  port, app env `LIVEKIT_PUBLIC_URL`/`API_KEY`/`API_SECRET`); capability
  module with derived rooms (`call:direct:<sorted-ids>` mirroring
  conversation keys, `call:org:<orgId>`), token minting after server-side
  room admission, conversation call invites, and a verified webhook receiver
  (Authorization JWT + sha256 body hash) fanning `call.activity` onto the
  connections layer (spec: 8/8). Client: `CallPanel.vue` lazily imports
  `livekit-client` (WebRTC stack stays out of the main bundle), PrimeVue
  toolbar + semantic tiles; ChatSupport gained the call button, incoming-call
  banner over the conversation topic, and a full-size StandardDialog host.
  REMAINING subtask: Process Designer service declaration — rooms gated by
  the ACTIVE process access rights (today: org membership + conversation
  participation). PD services/sockets are process-graph node concepts, so
  that integration belongs with designer-contract work, not this slice.
  Status: WAITING.

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

- [x] **Chat redesign in PrimeVue-native components + animations.**
  Depends on: GSAP foundation; connections architecture.
  - Rebuild `ChatSupport` / `AdminSupportChat(List)` surfaces from PrimeVue
    primitives + shared blocks; `EntityInlineRef` message refs stay; no custom
    chat chrome.
  - Animations through the documented GSAP patterns (message enter, drawer,
    typing indicators), reduced-motion aware.
  - Delivery and read state over the connections layer.
  ### Agent Notes — 2026-09-12
  Implemented in `agent/chat-redesign-20260912-121420`. `ChatSupport.vue` is now
  a thin host: drawer mode is a PrimeVue `Drawer` (Aura transition, token width
  via allowlisted binding), embedded/full-page modes wrap the extracted
  `SupportChatSurface.vue` that owns all chat state. Inbox lists are PrimeVue
  `Listbox` (keyboard nav + Aura hover/selection chrome), headers are
  `ActionToolbar`, empty/loading rows are `StateBlock`, day dividers are
  `Divider`, composer is a bare Aura-chromed `Textarea`. Bubbles use
  `bg-subtle` / brand primary with `max-w-support-chat-message` tokens; all
  four chat components now carry ZERO visual-inventory findings (was
  46+3+4+1). Animations: streamed messages enter via the new `enterOnce`
  pattern, typing indicators via `useEnterExit`; typing itself is a new
  ephemeral `POST /api/support/typing` published on the conversation topic
  (never persisted).   Localization spec is green — added the 5 pre-existing
  missing keys (common.apply/rotate/settings, nesting.selectMachine/thickness)
  plus support.typing in en+ru.
  ### Agent Notes — 2026-09-12 (hotfix)
  User report: messages not delivered + layout regression. Root cause of
  delivery: `useConnections.syncSubscriptions` dropped topic syncs that raced
  an in-flight request, so conversation topics never subscribed server-side
  and published messages reached no one — fixed with a pendingSync re-run.
  Also fixed `__clearRegistryForTests` wiping feature authorizers (masked by
  tests; new `server/features/support/delivery.spec.js` pins the full
  subscribe→send→deliver chain). Layout: reverted the Drawer/Listbox/
  ActionToolbar redesign — ChatSupport is back to the original compact
  floating window and familiar structure (single file; SupportChatSurface
  removed), keeping only audit-clean classes (`bg-subtle`/`rounded-ui`,
  `max-w-support-chat-message` + `w-support-chat` token aliases), Divider day
  markers, bare Aura Textarea, typing indicator, and `enterOnce` message
  animation. All three chat components remain zero-finding.
  Status: WAITING.

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
  ### Agent Notes — 2026-09-12 (group 1/7: warehouse, material, material_pile)
  Reviewed the family's real surfaces: WarehouseHub tabs already render
  through ResponsiveGrid card variants (route-level, viewport-correct);
  Warehouse/Material/Pile cards carry tailored bodies (stats tags, specs,
  contract-driven DataBlocks) with meaningful inline/compact variants; the
  hub was already audit-clean. One genuine defect found and fixed:
  WarehouseDetail rendered its operational-stock facts as a hand-rolled
  viewport-breakpoint grid (md:2/xl:4) inside EntityPage — a container-query
  context where viewport breakpoints mispredict inside split panes — plus a
  duplicated wrapper div. Replaced with the canonical `MetricPanel`
  aggregate-facts primitive, which owns the responsive collapse itself.
  Group verdict: done; no overflow or full-width-grab issues found.
  ### Agent Notes — 2026-09-12 (group 2/7: project, queue, nesting_run)
  Cards and QueueEditor were already healthy (QueueEditor rides
  EntityWorkspace/WorkspaceLanes with min-w-0 flex hygiene; cards carry real
  bodies). Both detail pages repeated the group-1 defect class: hand-rolled
  `lg:grid-cols-4` + `col-span-3` sidebar splits inside EntityPage (viewport
  breakpoints in a container-query context) with plain card grids
  (`md:grid-cols-2/3`), custom section headers, and custom empty states.
  Rewrote both on canonical primitives: EntityPage `#sidebar` slot (with its
  own 48rem container track), `MetricPanel` for overview facts,
  `ActionToolbar` section titles, `ResponsiveGrid` (`wide` queues, `bounded`
  artifact refs, both `responsive-context="container"`), `StateBlock` for the
  empty state. Removed the deprecated DataTable `responsiveLayout` prop and
  raw opacity headers. Group verdict: done.
  ### Agent Notes — 2026-09-12 (group 3/7: sheet_design, sheet, remnant)
  Same defect class in all three details: nested Panel-in-Panel grids with
  `md:/lg:` viewport splits inside EntityPage. Rebuilt: SheetDetail moves
  source/history to `#sidebar` and flattens the swatch+specs row into a
  responsive flex (swatch bindings kept byte-identical for the data-driven
  inline exceptions); RemnantDetail consolidates pile/sheet/warehouse refs
  into one sidebar source panel, renders the recovered area via
  `MetricPanel`, keeps GeometryPreview as the main surface;
  SheetDesignDetail moves tracking/cassette-design/material/instance panels
  to `#sidebar` with the editor+DataBlock as a plain flex column. Scripts
  unchanged apart from the MetricPanel metrics. Group verdict: done.
  ### Agent Notes — 2026-09-12 (group 4/7: cassette, cassette_design,
  cassette_template, cassette_instance)
  Cards were already tailored (thumbnails, parameter chips, specs) with
  single-column `grid-cols-1` bodies that pose no container risk.
  CassetteInstanceDetail had the family defect: `lg:grid-cols-4` split with a
  `md:grid-cols-2` references grid and a custom icon-heading. Rebuilt:
  metadata/parent-design/template/material-source panels into `#sidebar`,
  tracking title via `ActionToolbar`, geometry thumbnail as the main column.
  Group verdict: done.
