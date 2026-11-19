- [x] Remove `packages/mongo`, `packages/nitro`, `packages/vue` — zero
  consumers repo-wide (reference search over all js/vue/mjs excluding the
  packages themselves); `packages/vue/README.md` documents exports that do
  not exist. Same cut cleans `scripts/framework-inspect.js` PACKAGE_NAMES,
  regenerates `framework.manifest.json` (`npm run framework:write-manifest`),
  drops `tsconfig.json` path rows, and updates the `.codex` skill reference.
  Tracked in [packages/TODO.md](./packages/TODO.md).
  Landed 2026-10-25 (655938b35): folders gone, every reference cleaned,
  manifest regenerated.

# Archived 2026-11-19 — unified graph foundation

The following records are retained as implementation history. Their
completed outcomes are now part of SPEC §28.13 and the current graph
acceptance plan; they are not active work items.

## Completed: one graph surface and file-native graphs

## Priority: One graph surface and file-native graphs (SPEC §28.13, owner direction 2026-11-18)

Process authoring and graph documents must share one editor surface and one
creation mechanism. Graph documents are ordinary files, creatable from a
Page and editable in place. The bespoke `/organization/graphs` workspace
and the graph-specific first-save endpoint are removed, not preserved.

- [x] Remove `pages/organization/graphs.vue`, its process-dock link, and
  `server/api/instances/graph-document/editor.post.js`. Graph documents use
  the generic file creation/payload boundary and the registered
  `graph-editor` file surface.
- [x] Land graph documents in the normal file model: the `graph-editor`
  surface mounts from the file record, and a Page instance reference opens
  the editor in place.
- [ ] Add a browse surface for existing graph documents only if the owner
  wants one: a generated type collection over `graph-document`, never a
  hand-built page.
- [x] Add Page creation: the file insert flow offers **New graph**; it
  creates the graph document, inserts its instance reference, and opens the
  graph editor in place.
- [x] Make the process definition editor mount the same graph editor
  surface; delete `useProcessDesignerGraphSession`, the legacy process
  canvas model, and the duplicate process preview path. Process semantics
  become a domain profile over the canonical graph. Pre-alpha: delete, do
  not migrate stored process graphs.
- [x] Route CTS/organization-data nodes through the managed CTS executor and
  Documents nodes through the Documents runtime; one provider registry and
  one canonical evaluator for preview and execution.
- [x] Acceptance: create a graph from a Page, edit/save/preview it in place,
  and author a process on the same surface; no second graph route, session,
  or evaluator.

### Agent Notes (2026-11-18, one graph surface migration)

- The process page mounts `GraphEditorSurface` with the process profile.
  `useProcessDesignerGraphSession` is gone; `useProcessProfile` projects the
  shared graph authoring core and persists the canonical graph envelope.
- Process definitions store `perigram.graph`: nodes carry authored data and
  records in node configuration, process-wide records live in graph metadata,
  and the activation envelope stays top-level. The compiler and designer read
  the authored projection through `authoredProcessDataFromGraphDocument`.
- The process channel preview uses the process-definition preview endpoint;
  the duplicate browser process preview path is deleted. CTS reads resolve
  through the authorized data environment and services through their
  installed managed runtime.
- Validation: process-graph, process-profile, process-definitions, composable,
  package, shared designer, and graph-canvas suites pass.

### Agent Notes (2026-11-18, file-native graphs landed)

- `POST /api/instances/:type/editor` is the one blank-editor creation
  boundary: it validates the declared payload, stores it, and creates the
  instance through `createForHttp`. The graph-specific route and the
  `pages/organization/graphs.vue` host are gone; the static
  `instances/graph-document` directory is gone with them.
- The page file dialog's **New graph** creates a blank canonical graph,
  inserts an `instance_ref`, and opens the `graph-editor` file surface in a
  workspace pane. Clicking the instance reference opens the same record
  path later.
- `instancePayloadPersistence`'s blank first save now uses the generic
  editor boundary instead of a compiled construct, so editor-protocol file
  types share one creation mechanism.
- Validation: the graph Documents E2E file passes 3/3 through the file
  surface (no `/organization/graphs` navigation).

### Agent Notes (2026-11-18, surface inventory)

- `pages/organization/graphs.vue` was added 2026-11-16 (`295216885`) after the
  `graph-editor` file surface already existed (`caeea7c98`, 2026-11-14). It
  duplicates the file-surface mount with its own list, name, save, catalog,
  and first-save endpoint.
- The inventory recorded the two-editor split: the process page mounted
  `GraphCanvas` through `useProcessDesignerGraphSession` while the file
  surface mounted `useGraphDocumentSession`.


## Completed architecture extraction work (2026-11-14 onward)

## Architecture simplification (SPEC §30, active 2026-11-14)

Execution authority: [SPEC §30](./SPEC.md). This sequence tracks the
four-package contract workspace and separates completed source changes
from remaining proof and verification.

- [x] Capture and restore the architecture plan after the staging force-push.
- [x] Reduce the workspace from seven packages to the four §29 contract
  packages; move inspection and MCP implementation helpers into app tooling.
- [x] Move workflow lifecycle contracts into `@perigram/core`; keep CTS
  declarations and process runtime socket grammar distinct.
- [x] Centralize effective permission precedence in `shared/access-control.js`
  and delegate server access, field redaction, and the legacy adapter.
- [x] Update package inventories, framework inspection, docs, and the
  retired-workflow package-reference guard.
- [x] Remove the stale `@perigram/domain-cnc` lockfile entry; align the
  processes package version, root export, and workspace lockfile.
- [x] Scan all maintained package source imports and enforce the acyclic
  direction: `processes` → (`core`, `cts`); no sibling edges from the
  other three contract packages.
- [x] Ensure application registry composition happens once and resolver
  registration is idempotent; cover both behaviors with tests.
- [x] Record the verified CI baseline and distinguish existing test failures
  from regressions in SPEC §30.
- [x] Convert package-internal cross-imports to public package names and
  declare the `processes` → (`core`, `cts`) versioned workspace dependencies.
- [x] Replace the 175 inventoried application imports with public
  package specifiers through the declared export maps. The latest inventory
  records 175 package-name imports (processes 67, CTS 81, core 14,
  plugin SDK 13) and zero relative-source-path/root-alias imports.
- [x] Pin the zero-source-path invariant in CI: the package-consumer
  inventory now fails on any source-path or legacy root-alias import.
- [x] Split the core package barrel into focused entity DTO, registry, and
  result-contract modules; document the distinct ownership in
  `packages/core/README.md`.
- [x] Move screen inference, parent/child region composition, screen merging,
  and navigation implementation out of the process compiler core into
  `screen-compilation.js`; update its consumers and module inventories.
- [x] Separate process construction normalization, action caption/state
  projection, and graph/legacy-action normalization from `compiler-core.js`
  into focused modules; preserve the compiler barrel API and add focused tests.
- [ ] Complete the route/command/transition/feature authorization call graph
  and trace every feature persistence write path end-to-end.
  Progress: revision detail, list, and frozen-file endpoints now resolve each source through the ordinary instance read boundary, applying its compiled read grant in addition to revision tenant scope (commit `bfcb594`). Regression coverage for the shared source gate is added in `server/utils/revision-access.spec.js`; CI execution remains pending. Construction replay now also validates that a supplied revision pin belongs to the already-authorized source type/id and declared revision scope before reading frozen bytes (commit `5e391bc`); regression coverage added in `server/features/instances/construction-services.spec.js`. Construction preview now passes the authenticated principal into the same source-read resolver, rather than synthesizing an empty-membership context (commit `4b4f515`). Plugin endpoint command results are now opaque values and cannot populate platform `effects`, `events`, or entity/task result channels; a regression test verifies no effect dispatch (commit `e28a614`). Process-role transitions now enforce organization scope;
  generic HTTP and process-graph lists enforce read grants; process deletes
  route through the entity write gate and derive the declaration from the
  record's organization. Organization detail reads use the managed-organization
  gate. Field projection no longer accepts inactive caller memberships while
  preserving pending-member visibility for active tenant administrators;
  auth hydration derives tenant context and grants from active memberships
  only, organization switching requires active membership, and user-admin
  recovery rejects stale compiled grants when a membership is explicitly
  inactive. These are focused fixes, not completion of the route/command/
  transition/payload/relation/scheduled-run audit; those paths still need
  end-to-end verification.
  Follow-up authorization and persistence pass (2026-11-15):
  - Inventory-scanned all 103 mutating API handlers and 69 GET handlers.
    Non-user-auth routes were classified as explicit public auth/invitation/
    configuration surfaces, worker credentials, platform-operator credentials,
    signed provider callbacks, or the MCP service's own authentication. This
    closes the route inventory pass, not the internal service call graph.
  - Closed concrete gaps: party records are read-only in the process runtime
    (SPEC §2); plugin endpoint values and connector task completions cannot
    smuggle platform effects/events; realtime subscription sync now verifies
    connection ownership against the authenticated principal; agent-run stop
    now checks the support conversation context before cancellation.
  - Centralized user-membership writes in users/repository.js; the
    organizations repository no longer writes the users collection.
  - Centralized status_events persistence in core/machines/repository.js;
    features/states/repository.js is now a compatibility adapter. Added
    persistence-owner map and explicit cross-cutting exceptions in
    server/features/README.md.
  - Full Vitest passed on 4c2efd8 (270 files / 2,791 tests); SSR smoke,
    architecture, framework declaration, documentation, and plugin dependency
    checks also passed.
  - Still open: trace all direct service imports/callers, internal process
    effects, scheduled scanners, webhooks, and bootstrap writers end-to-end;
    reconcile the workflow-overrides repository's tested create/archive
    contract with its read-only public service (there is no current service
    caller). Page migration now preserves a legacy source row when its ID
    collides with an item owned by another tenant, and deletes source rows
    only after confirming a same-tenant canonical page (commits `93d71ad`,
    `212a92a`). Machine transition snapshot writes now include the loaded
    entity's tenant filter in both transactional and non-transactional
    paths (commits `17fb85b`, `ce58efd`, `d6a9269`, `a767fcd`).
    These changes have regression tests; their latest full CI run is pending.
  - Newly confirmed scanner concurrency gap: the process-run scanner reads
    due parked runs and pending events without a durable claim. The local
    `running` flag prevents overlap only inside one process; multiple app
    instances can resume the same run or deliver the same event concurrently.
    A failure after some event subscribers have started also leaves the event
    pending, so a retry can start those subscribers again. The process
    orchestrator already creates a per-step `idempotencyKey`, but the durable
    effect boundary drops it: `executeDurableEffect` forwards the request to
    `performDurableEffect`, whose argument destructuring consumes only
    `kind`, `record`, and `inputs`; command dispatch has no idempotency
    contract. Define durable leases, per-subscriber delivery records, and
    effect/command idempotency with crash recovery before claiming exactly-once
    process-run or event delivery.
- [ ] Verify package/executor contracts independently, including browser/
  Node compatibility and versioned extraction interfaces under §29.
  Current workspace manifests remain private and expose ESM entry points;
  independent publication/extraction is not yet verified.
- [x] Triage the accumulated Vitest failures and establish a clean full-suite
  gate. CI run 43687117806 passed all 264 test files / 2,726 tests; SSR,
  architecture, framework declarations, docs, and plugin dependency checks
  also passed. Follow-up screen-compilation run 43687533702 passed Vitest and
  all verification steps after correcting two shared-helper exports.


## Completed graph foundation stages G0–G2

- [x] G0 Shared canvas interaction model — canvas-top palette dock,
  collapsed socket rails, per-node preview visibility, selection actions,
  and whole-graph output channel.
- [x] G1 Resource and surface scaffolding — the `graph-document` file
  type, content revisions, editor surface registry, shared canvas
  presentation, and payload persistence.


## Superseded graph/artifact implementation plans

These earlier plans are preserved as history. Their active requirements
have been consolidated into the Documents graph acceptance section and
SPEC §§28 and 30. HAG is no longer an independent graph architecture.

## Node system rework — artifact composition on the one graph (SPEC §28 + archive/architecture/NOTES-templates.md, owner direction 2026-11-13)

One meta-feature: typed artifact composition from `archive/architecture/NOTES-templates.md`
(HAG) is delivered through the canonical graph system in root SPEC §28.
The graph document and evaluator are owned by `packages/core`; normalized
node definitions and provider registration are owned by `packages/plugin-sdk`.
Documents, Facade, and engine plugins contribute operations. CTS supplies
authorized data and persistence boundaries. Process-specific scheduling and
durable effects remain in `packages/processes`, but do not define the graph
calculus or a second procedural evaluator.

| HAG concept | Canonical home |
|---|---|
| Graph document / DAG evaluator | `perigram.graph`, graph interfaces and subgraph evaluator in `packages/core` |
| Node definition registry | Provider-neutral operation contracts and registry in `packages/plugin-sdk` |
| Ports with semantic types | Shared SDK port contracts, compatibility and conversion declarations |
| Artifacts, immutable + content-addressed | Core graph execution artifacts plus authorized CTS file instances and payload revisions |
| Pure-node cache | Provider-declared deterministic execution/cache policy; no HAG-only evaluator |
| Import/extract adapters | Documents/Facade/engine plugin operations |
| Diagnostics | Core graph diagnostics anchored to graph/node/port plus provider diagnostics |
| HTML/preview rendering | Shared graph preview channels and provider-declared renderers |

The process-definition canvas, process graph normalizer, process socket
algebra, and process dataflow evaluator are migration sources. They must not
be extended to implement generic graph-document, template, or plugin features.

Slices:

- [x] S1 Live value services in preview — an endpoint value service
  evaluates as a data node in preview scope (assembled parameters
  record, one memoized dispatch per output, claim-mode refusal naming
  the service; runtime scope unchanged); the canvas preview gate
  admits service nodes.
- [x] S2 File payloads as graph values — a file instance's payload
  enters the dataflow as a typed value (content-hash addressed) so
  extraction services compose without construction bindings.
  Landed 2026-11-13: a service input field declared `blob` receives the
  payload handle; the endpoint dispatch hydrates it with stored bytes
  (`payloadBase64`), declaration-driven, cache keyed on the raw handle;
  the documents extraction trio (`table-rows`/`table-cells`/`text`) is
  palette-wireable in the `table-data` section with deterministic
  cache, composing payload → rows → `csv-text` on the canvas.
- [x] S4 Documents vertical as the HAG MVP — markdown → flow document,
  dataset creation, report composition, HTML render: documents-plugin
  palette services with record signatures plus a report preview
  channel (HAG §16 phases 3-4 over the one graph).
  Landed 2026-11-13: `parse-markdown`/`export-markdown`
  (`text.flow-document@1` round-trip, drop diagnostics) and
  `compose-report` (`document.report@1`) in the `document-compose`
  section; the `report` preview channel renders every report value the
  whole-graph evaluation carries; the IR contracts live in the
  documents README. Reordered ahead of S3: the typing lands on the
  value kinds this vertical proves.
- [x] S3 Typed value contracts on sockets — plugin-declared value kinds
  (flow-document, table dataset) gate connections; conversion stays an
  explicit operation (HAG P1/P4).
  Landed 2026-11-13: a signature field may declare `kind` (namespaced
  value slug, listing-validated and schema-mirrored); the field seam
  carries it onto the socket and compatibility gates on it — kinded
  sockets take their own kind, unkinded json stays the universal
  acceptor, the toJson coercion skips kinded targets; documents v10
  kinds the report vertical (`text.flow-document`,
  `document.report`).
- [ ] S4 Documents vertical as the HAG MVP — markdown → flow document,
  dataset creation, report composition, HTML render: documents-plugin
  palette services with record signatures plus a report preview
  channel (HAG §16 phases 3-4 over the one graph).
- [x] S5 Generated node cards over discovered contracts and per-output
  preview visibility (the §28 canvas remainder).
  Landed 2026-11-13: the card already renders over the resolved socket
  contracts (rows, labels, types, inline fallbacks, fault states) — the
  remainder was the visibility control. Each data-output row carries the
  eye; the authored `previewOutputs` selection on the record feeds
  `visiblePreviewOutputs`, which filters the channel payload (absent
  selects every output; node errors survive).

- [ ] WAITING — owner verification: S1 — a draft carrying an endpoint
  value service previews its result per node and feeds downstream
  consumers; the preview tab's whole-graph evaluation carries service
  outputs to channel surfaces; a claim-mode service answers the node
  error; runtime execution is unchanged.

- [ ] S4 residual: DOCX report export for the supported block subset —
  blocked on a DOCX writer dependency decision (license + runtime
  check, HAG open decision), owner call.
- [ ] WAITING — owner verification: S2 — on the canvas, a file
  instance's payload handle (read `payload` field) wires into the
  documents extraction services and previews live; the palette
  `table-data` section lists rows/cells/text beside CSV text; running
  the composed service hydrates the payload once per distinct handle
  (deterministic replay).

- [ ] WAITING — owner verification: S4 — with the documents plugin
  installed, the `document-compose` palette section composes
  `parse-markdown` → `compose-report` (beside `table-rows` rows) and
  the Preview tab's `report` channel renders the composed report
  read-only; markdown round-trips through the flow-document IR with
  drop diagnostics.

- [ ] WAITING — owner verification: S3 — a `parse-markdown` output
  wires into `compose-report`'s flow input and `export-markdown`'s
  document input; a plain string or unkinded json refuses those sockets
  with the expected/received diagnostic naming the kind; every unkinded
  json consumer still accepts the kinded values.

- [ ] WAITING — owner verification: the per-node preview eye — a card's
  header eye (rendered when the node has data outputs) hides the node's
  outputs from the preview channels and restores them, the node's error
  survives hiding, and the authored `previewVisible` persists with the
  draft through save/reload.

- [ ] WAITING — owner verification: S4 export services —
  `extract-table` wires a markdown table onto the table operations,
  `render-html` returns a standalone escaped HTML document, and
  `render-report-pdf` returns the PDF payload named for the report
  title; all three kind-gate their report/flow inputs on the canvas.

### Agent Notes (2026-11-13, agent/nodes-report-export-20261113)

- S4 export residual landed (documents v11): `extract-table`
  (flow-document → first table block's rows), `render-html` (report →
  standalone HTML, all content escaped), `render-report-pdf` (report →
  PDF payload through `reportMarkdown` — the markdown assembly over the
  existing pdf writer, one PDF layout engine). All three deterministic
  and kind-gated (`text.flow-document` / `document.report`). DOCX stays
  open as an owner dependency/licensing decision.
- Validation: report spec 14 ✓ (escape pin, `%PDF` header bytes, table
  extraction refusals), documents services 5 ✓, fill 19 ✓,
  framework-packages ✓, `perigram-plugin validate` v11 ✓,
  `check-plugin-deps` ✓, `check-arch` ✓, `docs:validate` ✓. The 3
  process-definitions failures pre-exist on the merge base.

### Agent Notes (2026-11-13, agent/nodes-output-visibility-20261113)

- S5 landed. `previewOutputs` is an authored record key (writes through
  the ordinary `configure` assign, round-trips with the draft);
  `ProcessNode.vue` renders the eye on data-output rows (muted when
  visible, info-toned when hidden, icon-only); the page's channel
  preview filters the evaluation through
  `visiblePreviewOutputs(evaluation, definition)` before the payload
  reaches the channel surfaces. Locale keys en+ru.
- The card-contract half of the §28 sentence needed no code: the cards
  render generically over the resolved port specs (`record.inputs`/
  `outputs` from the catalog resolution) — no per-kind card UI exists
  to replace.
- Validation: composable spec 17 ✓ (visibility selection, error
  survival, record-less nodes), localization ✓, design-system ✓,
  process-page SSR smoke ✓, `check-arch` ✓, `docs:validate` ✓. The 3
  process-definitions failures pre-exist on the merge base.

### Agent Notes (2026-11-13, agent/nodes-value-kinds-20261113)

- S3 landed. `kind` is a json-only qualifier through the type algebra
  (`normalize`/`sanitize`/`sameQualifiedType`/`format`, validation
  refuses it off the json base); the universal `toJson` coercion skips
  kinded targets, which is the whole gate. `ctsFieldToProcessType` and
  its reverse carry the qualifier, so listing signatures and CTS field
  descriptors speak one shape. Documents v10 kinds the report
  vertical; `compose-report`'s flow input declares `nullable` (the
  service composes rows alone).
- Fixed in passing: `packages/cts/src/graph-protocol-construction.spec.js`
  carried a four-up relative import left by the compat-directory
  dissolution (744952172) — the file moved one level up and the import
  stopped resolving; the spec was dead on `local`. Three-up now, 10
  tests run and pass against the documents listing.
- Validation: types 8 ✓ (lattice, qualifier law), cts grammar 5 ✓
  (kind round-trips), sdk 16 ✓ (kind slug law), the full
  packages/processes + packages/cts + workers/documents +
  framework-packages sweep 714 ✓, `perigram-plugin validate` v10 ✓,
  `check-arch` ✓, `docs:validate` ✓. The 3 process-definitions
  failures pre-exist on the base.

### Agent Notes (2026-11-13, agent/nodes-report-vertical-20261113)

- S4 landed. `workers/documents/report.js`: markdown ↔
  `text.flow-document@1` (marked lexer as the adapter, replaceable
  behind the IR), `compose-report` → `document.report@1` refusing
  kind-mismatched inputs (parse/extract stay the graph's explicit
  operations). Listing v9 adds the `document-compose` services
  (deterministic, record signatures), the `report-preview` contract-1
  preview surface (render functions over the channel payload,
  `reportsOf` exported as its selection law), and the `report`
  preview channel. IR contracts canonical in the documents README.
- One-graph adaptation recorded: the report's table block carries row
  records inline — values are the artifacts on the graph, the HAG
  ArtifactRef indirection resolves to the value itself.
- Validation: report spec 10 ✓ (round-trip, diagnostics, compose
  refusals, services dispatch, surface check + selection + render),
  documents services 5 ✓, fill 19 ✓, framework-packages ✓,
  `perigram-plugin validate` v9 ✓, `surfaces` check ✓,
  `check-plugin-deps` ✓, `check-arch` ✓, `docs:validate` ✓. The 3
  process-definitions failures pre-exist on the merge base.

### Agent Notes (2026-11-13, agent/nodes-payload-values-20261113)

- S2 landed. The blob field is the payload's wire contract (SPEC §3's
  `{ fileId, mime, size, name }` handle, already a grammar base mapping
  to the attachmentRef socket): `hydrateBlobParameters` in the plugins
  feature hydrates declared-blob fields at endpoint dispatch — the one
  payload-read seam `resolveProjectionValue` and the construction
  dispatch already share — and the deterministic cache keys the raw
  handle. Documents listing v8: the extraction trio takes
  `record { payload: blob }`, outputs typed (`list<record>`/`string`),
  group renamed `tableData` → `table-data`, `cache: 'deterministic'`
  on the four value services; the executor normalizes the composed
  handle and the projection envelope through one `payloadSource`.
- Defect found and fixed: documents listing v7 was invalid under the
  group-slug law added with the palette-provenance slice —
  `perigram-plugin validate` refuses `tableData` on services and
  projections, so the catalog seed would have failed on the next run.
  The slug is kebab-cased across the listing and the prose that names
  the tab; facade, tech-drawing, and build123d listings validate clean.
- Installed organizations hold v7 pins: the upgrade path is the
  ordinary Plugins-page diff preview (declaration change only, no
  stored instance data migrates).
- Validation: documents services spec 5 ✓ (both dispatch shapes, typed
  xlsx/csv cells), fill 19 ✓, plugins 66 ✓ (hydration, raw-handle cache
  key), framework-packages ✓, `perigram-plugin validate` ✓ (all four
  built-ins), `check-plugin-deps` ✓, `check-arch` ✓, `docs:validate` ✓.
  The 3 process-definitions failures pre-exist on the merge base.

### Agent Notes (2026-11-13, agent/nodes-preview-services-20261113)

- S1 landed. `previewProcessDataflow` admits `cts.service` records
  when the environment carries a `previewService` channel;
  `evaluateNodeOutput` dispatches once per output (memoized on the
  preview token context) with list fields passing their whole list;
  without the channel the old opacity stands (services absent from the
  preview map). The server's `preview()` wires the channel to the
  plugins feature's `invokeEndpointValueService` (extracted from
  `executeConnectorService`'s endpoint branch: same dispatch, same
  deterministic-cache replay, claim-mode refusal, no `command_runs`
  write). Canvas: `selectedNodeSupportsPreview` admits service nodes.
- Specs: orchestration (dispatch, fan-out memoization, opacity outside
  preview), plugins (preview dispatch + cache replay + claim refusal +
  unknown-install 404), process-definitions integration (installed
  service previews end-to-end through the mocked install + fetch),
  composable gate table. The 3 `process-definitions.spec.js` failures
  (persisted producer migration, ambiguous sockets, activation
  fixture) reproduce on the clean merge base — untouched.
- Validation: orchestration 44 ✓, plugins 64 ✓,
  process-definitions 47/50 (3 pre-exist on base), composables 10 ✓,
  `check-arch` ✓, `docs:validate` ✓.

## One graph system (SPEC §28, owner direction 2026-11-12)

- [ ] WAITING — owner verification: adopt the build123d-flow dock on the
  process designer canvas (owner verification failed 2026-11-13 — the
  provenance-tier rail palette is not the dock; the work is G0 in the
  graph-documents program above).
- [ ] WAITING — owner verification: typed preview tabs —
  `previewChannels: [{ id, surface, label }]` in the listing contract
  (validated, schema-mirrored), resolved bindings served on
  `GET /api/admin/cts/types` (global channel-id uniqueness), and a
  designer Preview tab mounting each channel's plugin surface read-only
  (`PreviewChannelMount.vue`) over the whole-graph preview evaluation
  (no target node, effects suppressed).
- [ ] WAITING — owner verification: node-scoped canvas diagnostics —
  anchored validation diagnostics index by node (edge diagnostics mark
  their endpoints), the faulted card renders the danger border, a
  header glyph, and its message rows; re-stamped through the one
  enrichment pass on every validation arrival; whole-graph evaluation
  errors (the Preview tab's debounced run) fold into the same fault
  channel.
- [ ] WAITING — owner verification: content-addressed artifact
  contract — every `uploadFile` stamps `metadata.contentHash`
  (`sha256:<hex>`, all buckets); endpoint services may declare
  `cache: 'deterministic'` (listing-validated, endpoint-only) and
  replay through `plugin_service_cache` keyed on service identity +
  installed version + canonical input.
- [ ] WAITING — owner verification: real build123d engine bring-up —
  `workers/build123d/` introspects the installed build123d API and
  registers the discovered constructors, operations, and shape-algebra
  operators as deterministic endpoint services (provenance and palette
  placement per op, catalog → listing generated, generic dispatch on
  the real library; python executor :8793, seeded as a built-in
  listing).

### Agent Notes (2026-11-13, agent/b3d-engine-20261113)

- The real build123d engine bring-up landed. `workers/build123d/`:
  `discover.py` introspects the installed build123d (0.13.0 on this
  host) over its semantic modules (`objects_part/sketch/curve`,
  `operations_*`, `drafting`, `text`) plus the shape-algebra operator
  protocol (`Shape.__add__`/`__sub__`/`__and__` as
  union/subtract/intersect) — 64 ops, each carrying provenance
  (source+version), palette placement (7 sections derived from the
  discovered module), python target, signature, and doc summary.
  `generate-listing.mjs` compiles the catalog into `listing.json`
  (validated through `parseListing`); `dispatch.py` is the one
  evaluator over the real library (shape values ride STEP base64 +
  bounds + volume/area; the STEP round trip is spec-verified on real
  B-Rep: extruded circle = πr²h, union+intersect = sum of operands);
  `server.py` serves every op at `POST /<op>` (endpoint contract,
  python:3.14-slim image, dev compose `build123d-executor` :8793).
  Seeded as a built-in listing beside documents/tech-drawing/facade.
- Discovery gaps recorded in the catalog's `rejected` list: curve
  constructors with non-representable required params (JernArc,
  RadiusArc, TangentArc, … — point/vector-tuple annotations land with a
  VectorLike→json mapping in a later slice), builder-mode helpers
  (`add`, `insert`, `project_workplane`), subshape selectors
  (`chamfer`/`fillet` admit but need Edge/Vertex references the graph
  cannot address until a member-selection op exists).
- Stale owner doc found: `workers/SPEC.md` says "Four HTTP processes …
  three plugin executors" — the tier now counts five (build123d
  executor added); SPEC is human-write, left for the owner.
- Validation: worker spec 7 ✓ (live vertical on real engine),
  `perigram-plugin validate` ✓, `check-plugin-deps` ✓, `check-arch` ✓,
  `docs:validate` ✓.

### Agent Notes (2026-11-12, agent/graph-unification-20261112)

- Consultation session. Compared `archive/architecture/NOTES-typesystem-and-nodes.md`,
  `archive/architecture/NOTES-templates.md` (HAG), and github.com/1suo/build123d-flow against
  the process graph. Owner direction: keep one graph system — processes
  owns the calculus; build123d-flow contributes the canvas UX as a
  presentation adapter over the authoring seam; engines arrive as
  plugins owning palette sections; scripting stays CEL with user code
  quarantined in `s`; preview tabs per plugin-declared channel. SPEC §28
  written; implementation slices above. No code changed this session.

### Agent Notes (2026-11-12, agent/spec28-exec-20261112)

- First execution slice landed (42e451820, 91bff7bca): the palette
  renders two provenance tiers — plugin sections above platform
  categories, provenance declared by the palette-group projection
  (`source: 'pack' | 'framework'`) and mirrored in the SDK listing
  contract; `parseListing` now validates the palette-section `group`
  slug on services and projections (the registration gap the audit
  found — it was read but never validated); the SDK README documents
  the registration contract.
- Plugin-home audit fixes: deleted the dead facade schemas
  (`server/schemas/` — zero consumers); the chat snapshot fallback
  strip no longer hardcodes facade field names in platform code — a
  type without a declared §4 snapshot facet keeps its fields verbatim
  (support README updated; support suite green). Audit verdict
  otherwise: engines live in `workers/*` executors already (facade,
  documents, tech-drawing carry zero platform imports); palette
  sections, preview bindings, and surface mounts already register
  through the listing contract; `docs/PLUGIN_AUTHORING.md` references
  in `shared/plugin-surfaces.js` and `endpoint-executor.js` dangle —
  the docs tree was dissolved into the README system (4560e3b6b) and
  the pointers need re-homing (tracked below).
- Remaining slices: node-scoped canvas diagnostics surfacing, preview
  channels (listing key + designer tabs), artifact contract, build123d
  plugin vertical.

### Agent Notes (2026-11-12, agent/app-nodes-20261112)

- Owner correction: the build123d plugin vertical (box bake, hardcoded
  operation switch, `workers/build123d/`) was slop — engine node
  catalogs arrive parsed from the real library (build123d-flow's
  discovery model), never hand-authored per operation. The plugin is
  reverted whole (33b2199be); its WAITING item is void. The real
  engine bring-up is future work: introspect the installed build123d
  API and register discovered constructors/operators with provenance
  and palette placement, behind the same listing/service seams.
- Nodes-work slice landed instead: whole-graph evaluation errors now
  fold into the node fault channel — the Preview tab's debounced
  whole-graph evaluation (runs on tab open, re-runs on authoring
  changes while open) feeds `nodeDiagnosticIndex` beside anchored
  validation diagnostics, so an evaluation failure marks its node's
  card without selecting it. Spec-pinned in
  `composables/useProcessDesignerPreview.spec.js`.

### Agent Notes (2026-11-12, dangling docs pointers)

- `shared/plugin-surfaces.js` and
  `packages/plugin-sdk/src/endpoint-executor.js` cite
  `docs/PLUGIN_AUTHORING.md §1a/§executor`; that file dissolved into
  the README tree in 4560e3b6b. The plugin-authoring shapes should
  live in the plugin-sdk README (the authoring guide's home) — kept as
  tracked debt until the SDK authoring-guide slice runs.

### Agent Notes (2026-11-12, agent/preview-channels-20261112)

- Preview-channel slice landed (3e898e5ae, e107c8dca): listing key +
  `parseListing` validation + schema mirror + SDK spec; resolved
  channel bindings on the served org type view (global id uniqueness,
  preview-kind surface law); `servedPreviewChannels` in the designer
  types composable; Preview tab in the designer inspector rendering one
  read-only `PreviewChannelMount` per channel over the whole-graph
  preview (`previewDraft` with no target node evaluates every data
  node, effects suppressed). Validation: plugin-sdk/cts-types/plugins
  127 ✓, process-page SSR smoke ✓, check-arch ✓, docs ✓. The
  design-system spec's 3 ui-mapping failures and the custom-page SSR
  smoke's 2 failures pre-exist on the merge base (another session's
  in-flight ui-mapping work) — reported, untouched.
- SPEC-divide-and-conquer reviewed (owner session): sequenced AFTER the
  remaining §28 slices — the split freezes contracts, the build123d
  vertical and artifact contract decide the division lines, and the
  repo is already split-shaped (workers are external executors,
  packages are pure and guard-enforced). Recorded as SPEC §29.

### Agent Notes (2026-11-12, agent/spec28-remaining-20261112)

- All three remaining §28 slices landed. Diagnostics: the faulted card
  channel (`DesignerNodeCard` `faulted` prop, danger border, header
  glyph, leading message rows) fed by `nodeDiagnostics` in the preview
  composable; edge diagnostics mark their endpoint nodes; stamped
  through `enrichNodeData` (`diagnostics` joins `DERIVED_NODE_DATA_KEYS`)
  and re-stamped on validation arrival.
- Artifact contract: `contentHash` on every GridFS upload (one home in
  files service, all buckets); `cache: 'deterministic'` endpoint
  service declaration (listing-validated, endpoint-only,
  schema-mirrored) replaying through `plugin_service_cache` with the
  canonical-input key (spec covers reordered-key equality and
  single-executor-call). A representations registry was consciously
  skipped: immutable storage + content addressing + replay cover
  today's consumers; cross-representation dedup has none yet.
- build123d vertical: honest minimal engine — the box bake (exact
  bounds, watertight 12-triangle mesh — spec-verified edge parity)
  plus preview-mesh, both deterministic-cache-declared; `fromBake`
  construction (the install gate caught the undeclared mode — fixed by
  declaring it on the type); the `build123d` palette section; the
  `b3d-viewport` preview channel rendering every bake output as an
  orthographic isometric SVG (no runtime dependency). A drafted STEP
  export with dangling entity references was deleted rather than
  shipped fake. Executor at :8793 (8792 is tech-drawing's), compose
  `build123d-executor`, seeded as a built-in listing.
- Validation: plugin-sdk+plugins+files+cts-types+build123d 136 ✓,
  process-page SSR smoke ✓, localization/preview composables ✓,
  check-plugin-deps (5 executors) ✓, check-arch ✓, docs ✓. The
  ui-mapping design-system and custom-page SSR failures still pre-exist
  on the merge base (other session's work).


## Archived design notes (2026-11-19)

- `archive/architecture/archive/architecture/NOTES-typesystem-and-nodes.md` preserves the broad type/engine interoperability exploration. Its durable decisions are consolidated in SPEC §30.13.
- `archive/architecture/archive/architecture/NOTES-templates.md` preserves the HAG proposal. Its domain IR, adapter, fidelity, and rendering ideas are retained; its independent graph, evaluator, artifact-per-node, and project-package architecture is superseded by SPEC §§28 and 30.

### Completed G2 — canonical graph foundation

- [x] G2 Canonical graph foundation — core document codec, structural
  validation, Graph Input/Output boundaries, pinned Use Graph evaluator,
  preview-only procedural evaluation, plugin-SDK provider definitions and
  exact-version registry, and process data-operation adapter with tests.
