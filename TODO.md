# TODO

## Integrations

- [ ] **Creation-protocol picker in the designer palette.** Ninth slice —
  makes the protocols reachable.
  - The type catalog lists one construct variant per construction mode:
    the default mode keeps the plain type label, additional modes get
    `· mode` suffixes (`image`, `image · capture`) — the same variant
    pattern declared construct operators already use. This palette IS
    the artifact-era protocol picker.
  - The bare `construct` palette item drops unbound (no hardcoded
    `via: 'genericCreate'` preset — SPEC §20's no-pre-bound-drops rule);
    compile defaults a missing mode to the type's `defaultMode`.
  - Deferred (tracked): an inspector via-control for re-binding an
    existing construct node's mode; generateAttachment/convertArtifact
    operator declarations; artifact flow migration off artifact; artifact
    overload cut.

- [x] **Load-time construction-mode re-bind for persisted graphs.**
  Eighth slice — migrates existing definitions over the construct-mode
  hygiene change instead of failing them.
  - `resolveCtsDefinition`'s node lowering silently re-binds a persisted
    construction mode the type no longer declares to the type's current
    `defaultMode` (genericCreate on cassette/sketch → editor; on upload
    types → upload). Derived types keep failing validation with the
    existing clear message — a create node on an operator-produced type
    is a semantic change the author must make, not a rewriteable mode.
  - The rewrite is acceptance-time (in-memory, re-applied per load),
    the same seam as the v4→v5 identity migration; saving persists the
    re-bound mode naturally.
  - Deferred (tracked): generateAttachment/convertArtifact operator
    declarations; chat/proof/capture/upload flow migration off artifact;
    artifact overload cut.
  ### Agent Notes — 2026-09-21
  Implemented in `agent/cts-mode-migration-20260921` after live
  validation errors on persisted graphs (genericCreate on cassette and
  sketch). `resolveCtsDefinition`'s node lowering re-binds stale modes
  silently to the type's current `defaultMode` (the `slotOrDefault`
  contract-migration pattern — diagnostics are fatal at the seam, so the
  rewrite is silent); derived-type create nodes keep failing validation
  deliberately. New focused spec covers editor/upload re-binds,
  untouched modes, and the derived case. Validation: cts suites,
  v5-equivalence gate, cts-types, app-registry (minus the pre-existing
  generic-create dispatch failure), generated suites, arch, docs,
  framework:validate, SSR, localization — all pass. Status: WAITING.

- [x] **Construct-mode hygiene: protocols own payload constructs, derived
  types are not constructible, cassette creates through its editor.**
  Seventh slice — removes the slop from via-pickers.
  - Payload-bearing types offer ONLY their declared creation protocols
    (no `genericCreate` — the `editor` protocol already is the
    blank-first-save flow); default via is the first declared protocol.
    Payload-less types (reference data: pens, layer standards, colors,
    facade patterns) keep `genericCreate`.
  - `derived: true` declaration facet: operator/service-produced types
    (legacy semantics: system- or command-produced records) synthesize
    NO construction entry — they enter graphs as operator outputs.
    `sheet-design` is derived (nesting-run-produced, matching the legacy
    construction exclusion); its editor binding drops the create mode.
  - Cassette declares `creation: ['editor']` — the designer is the main
    entry (matches the legacy invariant that created templates open with
    the default OCCS document). Dual-world caveat: instance-path blank
    cassettes carry fields only until the designer flow migrates onto
    the instance payload path (tracked with the artifact flow
    migration).
  - Deferred (tracked): generateAttachment/convertArtifact operator
    declarations; chat/proof/capture/upload flow migration off artifact;
    artifact overload cut.
  ### Agent Notes — 2026-09-21
  Implemented in `agent/cts-construct-hygiene-20260921`. The projection
  synthesizes protocols-only construction for payload types
  (`defaultMode` = first protocol; `genericCreate` dropped — the editor
  protocol is the blank-create) and NO construction for `derived`
  types (new normalized declaration facet; `sheet-design` marked
  derived, editor binding narrowed to `edit`, matching the legacy
  system/command-produced exclusion). Cassette declares
  `creation: ['editor']` — the designer is the main entry. Instance
  capability literals mirror the static declarations; org-authored
  (async store) declarations keep the payload-less genericCreate
  literal with the projection authoritative — residual: an org payload
  type's literal lags until a sync org-declaration source exists (no
  consumer; noted here deliberately). Validation: cts (derived facet +
  protocols-only projection cases), cts-types, instances,
  app-registry (minus the pre-existing generic-create dispatch
  failure), generated suites, packs, localization, arch, docs,
  framework:validate, SSR — all pass. Status: WAITING.

- [x] **Payload creation protocols: upload / capture / editor as construct
  via modes.** Sixth slice — restores the artifact-era creation-protocol
  choice on create nodes, declared on file types.
  - Payload traits gain a `creation` facet (list of `upload | capture |
    editor`, normalized/validated by the registry, default `['upload']`).
    `image` declares upload+capture (mobile camera), `sketch`/
    `text-document`/`csv-table` declare editor (blank-first-save).
  - The domain projection emits each protocol as a construct `via` mode
    with mode inputs (`upload`/`capture` add a typed `file` input
    carrying accept/capture; `editor` constructs blank). The
    attachment-kind projection carries the first declared protocol.
  - Generic instance services register `upload`/`capture`/`editor`
    construction handlers: upload/capture require a payload reference
    (validated by the existing trait checks), editor allows a blank
    instance.
  - The generated create dialog renders a `file` control (accept +
    capture attrs, upload to the `files` bucket, submits the payload
    reference) — riding the existing prompted-field machinery, no
    kind-specific creator path.
  - Deferred (tracked): generateAttachment/convertArtifact operator
    declarations; chat/proof/capture/upload flow migration off artifact;
    artifact overload cut.
  ### Agent Notes — 2026-09-21
  Implemented in `agent/cts-creation-protocols-20260921`. `normalizePayload`
  validates/normalizes the `creation` list (default `['upload']`); the
  domain projection emits protocols as construct `via` modes with
  mode inputs (upload/capture add the typed `file` input, capture sets
  `capture: 'environment'`; editor constructs blank) and the
  attachment-kind projection carries the first declared protocol.
  Instance services register unconditional protocol construction
  handlers (upload/capture require the payload reference; editor is
  blank-first-save) while their capability literal derives exact modes
  from the static pack declaration — org-authored payload types gain
  modes through the authoritative projection (domain construction ∩
  service handlers). `GeneratedScreen`'s prompt map renders the `file`
  control: accept/capture attrs, upload to the `files` bucket, payload
  reference submitted on the construct path. The app-registry
  per-mode agreement spec was relaxed from handler-keys equality to
  per-declared-mode handler containment (handlers are shared machinery).
  Validation: cts (incl. new protocol normalization/projection cases),
  instances (protocol handler enforcement), app-registry (minus the
  pre-existing generic-create dispatch failure), generated suites,
  packs, localization, arch, docs, framework:validate, SSR — all pass;
  pre-existing audit drift on `GeneratedHomeWorkspace.vue` unchanged.
  Status: WAITING.

- [x] **Drawing vocabulary completes in tech-drawing: color type,
  palette edge, DXF/SVG homes.** Fifth slice — corrects the documents
  misfiling and gives colors/pens/layer standards their declared places
  (framework core stays domain-free; `domain-cnc` only shrinks).
  - `dxf-source` and `svg-file` move from the documents pack to
    tech-drawing (drawing/CAD vocabulary, not office documents); the
    documents pack keeps media/office types only.
  - `color` joins tech-drawing as a file-class catalog type
    (`code` shadow key, `name`, `hex`), seeded as §3 system instances
    (`organizationId: null`) through `server/scripts/seed-palette-colors.js`
    (registered in seed-all). The legacy material-`color` entity (catalog
    children with textures) is a different concern: it re-declares under
    the materials domain later, under its own id.
  - `pen-template` declares the `palette: [color]` relation
    (`onRemove: detach`) — the R2-legal home for catalog-ink references;
    arbitrary ink stays the `stroke.color` hex string with ColorPicker
    render policy.
  - Deferred (tracked): generateAttachment/convertArtifact operator
    declarations; chat/proof/capture/upload flow migration; payload
    upload creator; artifact overload cut.
  ### Agent Notes — 2026-09-20
  Implemented in `agent/cts-tech-drawing-20260920`. `dxf-source` and
  `svg-file` moved from documents to tech-drawing (documents is
  office/media only — checked by a spec that rejects drawing ids);
  `color` declared (code/name/hex, ColorPicker render policy on hex) with
  pen-template gaining the `palette: [color]` relation (`onRemove:
  detach` — catalog inks are edges, arbitrary ink stays the
  `stroke.color` string). Seeds: `server/scripts/seed-palette-colors.js`
  writes §3 system instances (`organizationId: null`) into `files`,
  upserting by code, registered in seed-all. Nothing entered
  `domain-cnc`. Direction decision recorded after challenge: framework
  core stays domain-free (framework-flagged types are excluded from the
  domain projection, so catalogs in core would vanish from screens;
  org-shadowing exists only for pack system instances); tech-drawing is
  the reusable drawing-vocabulary layer that fabrication domains
  require — it neither merges into core nor into CNC.
  Validation: documents/tech-drawing/generated/cts-types/instances
  suites (114), localization, arch guard, docs guard,
  framework:validate, SSR smoke — all pass. Status: WAITING.

- [x] **Documents pack: generic file types + text/csv editor surfaces.**
  Fourth slice of the entity-category cut (SPEC §21) — payload traits
  replace the artifact kind registry for common document/media kinds.
  - New `@perigram/documents` pack declares the generic file types with
    payload traits and preview modes matching the shared viewer modules:
    `image`, `pdf-document`, `text-document` (editor-replaceable,
    `revisions: 'content'`), `csv-table` (editor-replaceable,
    `revisions: 'content'`), `svg-file`, `dxf-source`, `xlsx-workbook`,
    `docx-document`.
  - `ArtifactTextEditor` takes a host-supplied persistence contract
    (`format: text|csv`), mirroring the sketch inversion;
    `ArtifactDetail` supplies the artifact-backed adapter, the file
    surfaces the instance-backed ones (`text-editor`, `csv-editor`
    surfaces bound to the new types). The instance persistence helper is
    generalized over the type id (the payload route is generic).
  - Deferred (tracked): operator declarations for
    `generateAttachment`/`convertArtifact` (signatures would describe
    soon-dead artifact refs; declare when outputs flip to file
    instances); migrating chat/proof/capture/upload flows off the
    artifact entity; payload upload creator; artifact overload cut.
  ### Agent Notes — 2026-09-20
  Implemented in `agent/cts-documents-20260920`. `@perigram/documents`
  (packages/documents) declares the eight generic file types; the pack
  mounts first in `server/packs/declarations.js` and its editors compose
  into the client-side binding list (documents + tech-drawing + cnc in
  mount order). `ArtifactTextEditor` now takes the persistence contract
  plus `format` (`text`/`csv`); `ArtifactDetail` passes the artifact
  adapter, the `text-editor`/`csv-editor` surfaces pass instance-backed
  adapters over `instancePayloadPersistence(entity, typeId, mime)` —
  the generic payload-transport helper that `sketchInstancePersistence`
  now projects from. `fileDetailOverloads` injects the derived `typeId`
  into detail props adapters so surfaces never hardcode their route
  type. Deferred with stated reason: generateAttachment/convertArtifact
  operator declarations.
  Validation: documents spec (5 cases), file-surfaces/overloads/
  cts-types/instances/tech-drawing suites, localization, arch guard,
  docs guard, framework:validate, SSR smoke — all pass. Status: WAITING.

- [x] **Revisioned instance payload replacement + sketch/facade-pattern editor
  surfaces.** Third slice of the entity-category cut (SPEC §21).
  - Instance service gains `replacePayload` (editor concern, SPEC §3): the
    route accepts a multipart file, validates it against the type's payload
    traits, stores the blob in the `files` bucket, records an immutable
    `entity_revision` under the type's declared revision scope, and swaps
    the payload slot. Requires the type to declare both payload traits and
    a revision scope; gated by `hasEntityAccess` on the class-collection
    feature with the type id as entity-type filter (fail-closed without a
    compiled grant).
  - The sketch editor surface binds the `sketch` file type (`edit` mode;
    the sketch type declares `revisions: 'scene'`). `SketchEditor` takes
    an explicit persistence contract; `ArtifactDetail` supplies the
    artifact-backed adapter, the file surface the instance-backed one.
    Create mode and the payload upload creator stay deferred; origin refs
    stay artifact-path-only.
  - `facade-pattern` joins the CNC pack file types with the
    `facade-pattern-designer` editor binding; the legacy static
    `facade_pattern` overload row is deleted (derived rows key by type
    id). The designer keeps its pack-internal feature route (cassette
    pattern); legacy `facade_patterns` data is abandoned (SPEC §19).
  - Deferred (tracked): model3d GLB preview (needs a viewer host for
    prepared Three scenes); artifact overload cut (framework file service
    stays).
  ### Agent Notes — 2026-09-20
  Implemented in `agent/cts-sketch-editors-20260920`. `replacePayload` on
  the generic instance service uploads to the `files` bucket, reuses the
  construct-time trait validation, records an `entity_revision` under the
  declared scope (revision attachment metadata carries the bucket), and
  swaps the slot — 409 on racing updates, blob cleanup on failure.
  Transport: `PUT /api/instances/:type/:id/payload`, gated by
  `hasEntityAccess` on the class-collection feature with the type id as
  entity-type filter (fail-closed). The sketch type declares
  `revisions: 'scene'` and binds the `sketch-editor` surface (`edit`
  mode); `SketchEditor` now takes a host-supplied persistence contract —
  `ArtifactDetail` passes the artifact-backed adapter (feature parity
  unchanged there), the file surface passes the instance-backed one
  (origin refs stay artifact-only). `facade-pattern` joined the CNC pack
  (`name`, `graph`) with the `facade-pattern-designer` binding; the
  static `facade_pattern` overload row is deleted (legacy key now null).
  Client-side pack editor bindings compose tech-drawing + cnc in mount
  order, mirroring the server composition.
  Validation: instances service spec (4 new replacePayload cases),
  file-surfaces/overloads/tech-drawing/cts-types specs, localization,
  arch guard, docs guard, SSR smoke, framework:validate — all pass.
  Pre-existing on `local` (verified on the primary checkout):
  `shared/design-system.spec.js` audit drift for files changed by other
  sessions (`GeneratedHomeWorkspace.vue` important-override counts,
  users.vue color-utility row) — those sessions did not regenerate
  `docs/UI_COMPONENT_AUDIT.md`. Status: WAITING.

- [x] **File payload previews in generated surfaces + sketch file type.**
  Second slice of the entity-category cut (SPEC §21): files used in
  process definitions get previews in the app, driven by declared payload
  traits.
  - Declared preview policy (render/payload traits, already compiled into
    the served type view) resolves the viewer mode for a file instance's
    payload; a generated detail preview panel renders it through the
    shared viewer modules (`ArtifactViewer` branches: dxf/svg/sketch/image/
    pdf/docx/table/workbook/text), falling back to a payload download for
    non-renderable modes.
  - Instance payload blobs use the `files` GridFS bucket (the §3 Blob
    home); the download URL builder lives beside the file-surface
    registry.
  - The `sketch` file type joins the tech-drawing pack (JSON scene
    payload, `sketch` preview mode — the draw-over-images scene renders
    through `DrawingCanvas`). Its editor binding is deliberately deferred:
    instance payloads are immutable after construct, so an editing sketch
    surface needs payload revisioning first.
  - Blocked/deferred (tracked here): sketch editor binding for CTS
    instances; preview for `facade-design` GLB payloads (needs a model3d
    viewer module); deleting the `artifact`/`facade_pattern` legacy
    overloads once those types are declared.
  ### Agent Notes — 2026-09-20
  Implemented in `agent/cts-file-previews-20260920`. `resolveFilePreview`
  in `components/generated/file-surfaces.js` is the pure decision helper
  (mode from the served type record's compiled `render.preview`, payload
  URL against the `files` GridFS bucket); `ArtifactViewer` gained an
  explicit `source` override so its viewer branches render CTS file
  payloads without artifact DTOs (artifact-entity path unchanged).
  `GeneratedFilePreview.vue` mounts the contract in
  `GeneratedEntityDetailBody`'s non-overload branch — non-renderable modes
  degrade to a download action, payload-less types render nothing.
  `useFileTypeView` caches the served org type view (one in-flight fetch
  per organization). The `sketch` file type joined the tech-drawing pack
  with preview mode `sketch`; its editor binding is deferred on payload
  immutability (risky assumption stated before implementation — the
  artifact-bound `SketchEditor` keeps serving SKETCH artifacts).
  Validation: file-surfaces + tech-drawing specs, cts-types/overloads
  specs, design-system (audit row regenerated via
  `scripts/ui-visual-inventory.js`), localization, SSR smoke, arch guard,
  docs guard, framework:validate — all pass. Status: WAITING.

- [x] **CTS file editors and preview contracts served with the type view.**
  First slice of the entity-category cut (SPEC §21): editors and previews
  bind to CTS file types, not entity types.
  - Pack editor bindings (`packages/domain-cnc/src/pack.js` `cncEditors`) are
    the single type→surface+modes source; sheet design is promoted from the
    view-only `sheet-design-preview` surface to the editing
    `sheet-design-editor` surface.
  - `GET /api/admin/cts/types` serves the composed pack editors beside the
    compiled bundle, so app surfaces resolve editors server-driven instead
    of importing pack modules.
  - One app-owned surface registry (`components/generated/file-surfaces.js`)
    maps surface ids to the app's editor presentations (detail-body overload,
    card/detail editor action, workspace page). The generated overload,
    editor-action, and workspace-page registries derive their file-type rows
    from the pack editor bindings through it; entity-keyed rows for
    cassette/sheet-design/facade-design are replaced by type-keyed derived
    rows (legacy pre-projection keys are abandoned data, SPEC §19).
  - The types registry browser consumes the served editors.
  - Later slices (not this task): image sketch-editor binding for image
    payload file types, runtime preview-mode resolution from payload traits
    replacing `utils/artifact-ui.js`, and deleting the remaining legacy
    entity overloads (`artifact`, `facade_pattern`) once those types exist.
  ### Agent Notes — 2026-09-20
  Implemented in `agent/cts-file-editors-20260920`. `composePackEditors()`
  composes the mounted packs' editor bindings in dependency order
  (malformed bindings are mount errors); `describeOrganizationTypes` and
  `GET /api/admin/cts/types` serve them beside the bundle. The pack
  binding for sheet design is promoted to `sheet-design-editor`
  (create/edit) — the surface registry's props adapter receives the
  caller's resolved `canEditSheetDesign` grant, degrading to view-only
  without it, exactly like the legacy overload did.
  `components/generated/file-surfaces.js` is the new single app-side
  surface registry (surface id → detail-body overload / editor action /
  workspace page); `overloads.js`, `entity-editor-action.js`, and
  `workspace-pages.js` derive their file-type rows from the pack editor
  bindings through it. Derived rows key by CTS type id, so the legacy
  `sheet_design`/`facade` keys no longer resolve an editor surface
  (SPEC §19 abandoned data — risky assumption stated before
  implementation). Workspace page ids stay the surface ids (`cassette-designer`),
  so persisted pane state is unaffected. The types registry browser reads
  the served editors instead of importing the pack module.
  Validation: focused specs (file-surfaces, overloads, cts-types), cts
  package suite, arch guard, framework:validate, SSR smoke, localization,
  docs guard — all pass. Pre-existing failures on `local` (unrelated,
  verified by baseline run): `shared/framework-packages.spec.js` (3 stale
  assertions vs the pack-mounting refactor) and one
  `server/runtime/app-registry.spec.js` generic-create dispatch assertion.
  Status: WAITING.

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
  ### Agent Notes — 2026-09-12 (PD declaration slice)
  Org rooms are now a declared process service: with an active compiled
  process, `call:org:*` admission requires a `livekit` feature grant
  (read level) through the shared grant evaluator over
  `auth.effectivePermissions`; without an active process, org membership
  still admits. All four bundled process templates declare
  `livekit: 'write'` for their admin role (spec covers grant/deny/no-grant
  paths). Existing active process definitions must gain the grant before
  their org rooms admit in process mode (re-instantiate template or edit
  role grants). Designer-palette authoring (graph node for the service)
  remains future designer-contract work; the access contract is complete.
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
  ### Agent Notes — 2026-09-12 (group 5/7: library, catalog, pen_template,
  tool_profile, profile_template)
  Asset cards are card-only surfaces with single-column bodies — no detail
  pages, no container risk. CatalogDetail carried the family defects plus a
  five-step viewport color-swatch grid (`2/4/6/8/10` cols). Rebuilt:
  sheet-options panel to `#sidebar`, description+DataBlock as the main
  column, visual-library title via `ActionToolbar`, and the color grid through
  `ResponsiveGrid variant="dense" responsive-context="container"` (token
  minimum track widths instead of viewport column counts). Group verdict:
  done.
  ### Agent Notes — 2026-09-12 (group 6/7: artifact, artifact_template,
  entity_revision, geometry_capture, facade, facade_pattern)
  Artifact surfaces are the detail-dispatch pipeline (viewer/editor per
  attachment kind) — no layout debt. Facade/ArtifactTemplate/EntityRevision
  are card-only. GeometryCaptureDetail carried the heaviest instance of the
  family defect: an arbitrary `xl:grid-cols-[minmax(0,1fr)_22rem]` split
  plus two more arbitrary/viewport grids. Rebuilt: extraction/traceability/
  diagnostics/history panels into `#sidebar`; revision cards through
  `ResponsiveGrid variant="bounded" responsive-context="container"`; the
  dimension-correction row as responsive flex. Group verdict: done.
  ### Agent Notes — 2026-09-12 (group 7/7: user, organization, machine,
  process_definition, layer_standard, color, requisition)
  User/Organization/LayerStandard/Color/Machine cards are card-only surfaces
  with no layout debt (machine and process_definition have no dedicated
  entity components — they surface through admin/process-designer screens,
  which own their own shells). RequisitionDetail carried the family defect;
  rebuilt: lifecycle to `#sidebar`, order-composition title via
  `ActionToolbar`, item panels through `ResponsiveGrid variant="wide"
  responsive-context="container"`. Group verdict: done — program complete.

  ### Agent Notes — 2026-09-12 (REOPENED, honest state)
  The closeout below overclaimed. What the 7 groups actually delivered is
  the ENV-FRIENDLY MECHANICS axis only (viewport grids → container-aware
  canonical primitives). The task's core deliverable — per-entity
  USAGE-FLOW variant design ("inspect usage, design variants that satisfy
  the usage flow; generic is fallback, can be done much better per case") —
  was NOT started: no flow inspection was performed for any entity, and
  group notes saying cards are "already tailored" never asked tailored to
  which flow. Mechanics: done for all 30 entities. Flow design: 0 of 30.
  ### Agent Notes — 2026-09-12 (flow-design pass 1, code-derived flows)
  First content pass grounded in render-site analysis (where each surface
  actually appears in code), not invention:
  CHANGED (usage gap found):
  - SheetCard — warehouse-browsing flow wants material identification:
    color swatch + color/material now lead card and compact bodies;
    removed 2 per-card entity fetches (pile/run provenance stays on the
    detail page). Swatches are allowlisted data-driven bindings.
  - RemnantCard — recovered-material flow: geometry+area already led;
    removed the per-card sheet fetch (provenance on detail).
  - CassetteInstanceCard — hub browsing: thumbnail + reference + status;
    removed duplicate design/template fetches (the thumbnail self-resolves
    the design) — 2 fetches × N cards saved in the instances tab.
  - ToolProfileCard compact — picker identification now D + kerf + angle,
    not angle alone.
  - MaterialCard compact — picker identification now code + thickness,
    not free-text description.
  VERIFIED FLOW-TAILORED (no change warranted): queue (run-count summary
  tags), nesting_run (results/failure/relation galleries, context reuse),
  cassette family (thumbnail-led), material_pile (MaterialSummary +
  catalog), library (cassette preview galleries), color (swatch header),
  pen_template (stroke preview + weight/pattern), layer_standard (resolved
  default pen inline), user (avatar + role/org tags), geometry_capture
  (preview-led), catalog, requisition, artifact (kind pipeline owns the
  visual depth), warehouse, project/organization/index cards.
  GENERIC BY DESIGN (no custom surface exists yet): facade,
  facade_pattern, artifact_template — pass-throughs rendering through
  EntitySurfaceContent; tailor when a custom surface consumes them.
  ### Agent Notes — 2026-09-12 (pass 1 correction: process-mode layer)
  User feedback exposed a layer miss: their organization runs in process
  mode, so static surfaces like `/warehouses` (WarehouseHub) are not part
  of their navigation — generated screens render from the display
  contract, which the card redesigns do not touch. Ported the emphasis to
  the contract layer: sheet now declares identity rows `specs.color` +
  `specs.material` (rendered beside the name on generated cards and
  popovers), remnant declares `specs.area`. Per-entity Card components
  still serve custom surfaces and inline-ref popovers. Lesson recorded:
  content changes for process-mode orgs must land in
  `cncEntityFieldGroups`, not only in card components.
  Task stays OPEN: these are code-derived flows; completion needs the
  user's real-world validation of the changed content.
  ---
  Superseded closeout (mechanics only): all 30 entities reviewed across 7
  groups; the recurring defect — viewport-breakpoint (often arbitrary)
  two-column splits and card grids inside EntityPage/EntityWorkspace
  container-query contexts — replaced with `#sidebar`, `ResponsiveGrid`
  container mode, `MetricPanel`, `ActionToolbar`, `StateBlock`.
