# TODO

## Priority: Documents and Facade plugin review/refactor (owner direction 2026-11-17)

This work is prioritized ahead of further breadth in the portable-runtime
migration, with correctness and security work retaining immediate priority.
Completion requires verified product behavior, listing validation, and
executor coverage for both plugins as product capabilities and graph-node
providers.

- [ ] Audit Documents end to end: every declared type, projection, service,
  construction, editor, preview, fill, import/export, and file/payload path.
  Compare listing declarations with actual runtime behavior and SPEC; align
  executor and endpoint assumptions with the managed local runtime.
- [ ] Audit Facade end to end against `workers/facade/SPEC.md`: six-type
  fabrication flow, OCCS evaluation, nesting, DXF import/export, editor
  surfaces, preview renderers, cross-plugin dependencies, data revisions,
  and every declared construction/service. Verify each workflow and close
  behavior/spec gaps.
- [ ] Migrate the two plugin service surfaces from per-service endpoint
  hosting. Current inventory: 8 of 28 Documents services and 2 of 7 Facade services remain
  `mode: endpoint`; Facade `nesting-solve` runs in the managed server runtime
  through the platform-owned `facade.nesting.solve` capability. Pure
  `bake`, `match-sheet`, `construct-sheet`, `generate-sheet-dxf`, and Documents `csv-text` run in the shared
  browser/server runtime; Documents `extract-table`, `compose-report`,
  `export-markdown`, and `render-html` run in the managed server runtime. `nesting-parts` remains a synchronous endpoint-backed
  projection pending a provider-compatible synchronous host boundary. Classify each operation by execution target: browser-local
  pure compute, platform-managed server compute, or explicit remote
  integration. Move local-eligible operations behind the shared
  provider/runtime contract; route nesting solver transport through a
  platform-managed server adapter. Preserve operation semantics across
  client and server execution where supported.
- [ ] Refactor the node catalog and palette around one coherent provider
  contract. Review discovery, grouping, search, filtering, socket/type
  compatibility, operation signatures, labels/descriptions, provenance,
  placement, and node configuration as one user-facing workflow. Platform
  UI discovers plugin nodes through provider declarations and keeps plugin
  identities out of platform-specific UI branches.
- [ ] Make palette grouping and presentation declaration-driven and
  consistent across operation, value, construction, editor, and graph-use
  nodes. Consolidate category vocabularies and source palette metadata from
  declarations; keep the same semantics across palette entries, canvas
  nodes, inspector, and preview/diagnostics.
- [ ] Give Documents a first-class authorable document graph value: typed block
  constructors, document composition/append, direct preview, and actual
  Markdown/HTML/PDF file outputs through generic Bake/Export. The flow value
  must not be a dead generic record; test create → compose → preview → export
  → materialize as a real file.
- [ ] Review every Documents and Facade node for useful inputs/outputs,
  correct typed sockets, defaults, optionality, dynamic references, and
  actionable validation errors. Verify palette search and compatibility
  filtering against valid and invalid operations.
- [ ] Add focused contract tests and representative graph-level tests for
  each plugin's major workflows, including discovery → palette → placement →
  configuration → execution → preview → commit/bake. Add regression tests
  for each defect found during the review.
- [ ] Update both plugin READMEs/SPECs and the platform SPEC/TODO after
  behavior verification; record remaining owner decisions explicitly.

Progress (2026-11-17): Documents list construction accepts typed `text.inline` values through the declared `inlineItems` input as well as plain text items.

Progress (2026-11-17): The Documents List node's plain-text `items` socket is now optional and labeled separately from typed `inlineItems`, so a formatted-only list is authorable without an unused required input. The listing version advanced to 18; a declaration-contract regression covers the optional typed-input path.

Progress (2026-11-17): Added a first-class `html-document` file type (`text/html`, content revisions, download-only preview, and a text projection) so `Export HTML file` output has a valid generic Bake destination instead of an unmaterializable MIME. Documents listing version advanced to 19; listing and graph-Bake regressions cover the type and materialization contract. A graph-level regression covers typed construction, document composition, preview rendering, and Markdown/HTML/PDF file payload generation; test execution remains unverified; a graph-executions regression now covers materialization into a `text-document` instance.

Progress (2026-11-17): Markdown table export escapes backslashes and pipe delimiters and flattens embedded cell line breaks.

Progress (2026-11-17): Markdown inline export now escapes literal Markdown punctuation, chooses code-span delimiters longer than any embedded backtick run, and encodes spaces/escapes parentheses in link destinations. A round-trip regression covers punctuation, code, and links. Documents Markdown/CSV editor surfaces and the report preview, plus Facade cassette/profile preview modules, now have SDK surface-factory/import-graph smoke tests; existing drawing normalization and cassette renderer suites cover the preview geometry paths. Documents and Facade managed-runtime tests also assert their declared operation inventories are implemented. Test execution remains unverified. Regression coverage checks parse/export round-trip; test execution remains unverified.

Progress (2026-11-17): Documents `extract-table`, `compose-report`, `export-markdown`, and `render-html` now run in the managed server runtime rather than per-service endpoints. Their shared, dependency-free `report-ir.mjs` module owns the report/flow contracts, table extraction, composition, Markdown serialization, and escaped HTML representation. Standalone HTML now strips unsafe link schemes while preserving safe HTTP(S), mailto, and local fragment/path links.

Progress (2026-11-17): Plugin connection settings now explain that executor origins apply only to separately hosted endpoint-mode services; the bearer-token field is hidden unless such services exist, uses password input, and explains that the secret stays server-side. Managed/local package installs no longer return an irrelevant auth token to the settings UI. This is a UX clarification, not completion of the endpoint-to-managed-runtime migration.

Progress (2026-11-17): Facade `nesting-solve` is the first operation moved off the plugin endpoint into the managed JavaScript server runtime. Its isolated runtime calls a plugin/version/operation-scoped host capability; the platform owns the configured nesting-worker URL and transport. Runtime and capability tests cover request normalization, dispatch, and adapter scoping. Pure sheet matching, sheet construction, and DXF export now share one browser/server runtime; the other 10 Documents/Facade services still need execution-target classification and migration.

Progress (2026-11-17): Facade nesting input normalization now clones authored item records, rejects invalid/non-finite counts and dimensions, and rejects unsafe aggregate sheet counts before contacting the external solver. Regression tests cover frozen input records and numeric boundaries.

Progress (2026-11-17): Facade nesting quantity normalization no longer truncates fractional physical counts or accepts booleans as quantities. Missing/empty values default to one; explicit zero and every other supplied quantity must be a positive safe integer. Focused regression cases cover fractions, negatives, NaN, infinity, overflow, and booleans.

Progress (2026-11-17): Documents and Facade palette contributions now use the actual listing declarations in contract tests (no synthetic fallback groups). Facade's graph-visible operations are grouped by workflow (nesting, sheet-planning, production-export); provider-authored operation labels and descriptions are now rendered by the shared palette projection. Internal construction/projection helpers stay out of the graph palette. Service execution migration is underway: Documents `csv-text` now runs in its browser runtime; 8 Documents operations remain endpoint-backed. Facade has five managed operations and two endpoint-backed operations.

Progress (2026-11-17): The graph-node palette and plugin listing now share
one declaration contract: `palette.group`, optional `label`, `keywords`,
and `visible`. The SDK validates the same shape on node definitions, plugin
services, and projections, and rejects the retired top-level `group` field.
Provider-qualified group and item IDs prevent cross-plugin collisions without
displaying plugin IDs as category labels. Search includes provider and
operation identity, signature fields, and declared aliases. Documents and
Facade explicitly hide construction/projection helpers while exposing
user-facing graph operations and extraction projections. Build123d's
generated catalog/listing uses semantic groups and declared labels, and its
discovery generator preserves the same shape.

Execution migration is a prerequisite to completing either plugin review.
The palette is a projection of the operation contract consumed by runtime
discovery and execution.

Review order: (1) inventory declarations and actual behavior; (2) trace
palette/provider discovery and graph execution; (3) validate end-to-end
workflows; (4) consolidate/refactor shared contracts and UI; (5) retire
obsolete paths and update docs. Keep the two plugin reviews coordinated so
shared palette changes are designed once.

### Agent Notes (2026-11-17, endpoint/runtime ownership audit)
- Plugin/node palette review (2026-11-17): unified the palette declaration across node definitions, plugin services, and projections; migrated Documents, Facade, and Build123d listings and Build123d discovery/catalog generation; provider-scoped IDs and item IDs prevent collisions; hidden helper operations no longer appear as graph nodes; ungrouped visible plugin services receive provider-owned Operations groups; search indexes provider/operation identity, signature fields, and palette keywords. The end-to-end Documents/Facade operation and socket audit remains in progress.

- Palette contract review (2026-11-17): provider-neutral graph nodes now require an explicit semantic `palette.group`; process and core-data providers declare their groups, and the graph editor no longer infers group labels from operation-id prefixes or displays provider ids as group labels. SDK, process adapter, and graph palette contract tests/docs were updated. Full plugin workflow review and Documents/Facade palette reconciliation remain open.


- Documents and Facade endpoint hosts now expose only services declared with `mode: endpoint`. Managed operations are covered by their browser/server runtime test suites; duplicate managed implementations were removed from the endpoint service modules.
- Documents endpoint dispatch derives from its listing. Facade's endpoint inventory remains `extract-geometry` and `nesting-parts`.
- Remaining migration gates are concrete: Documents table projections and Facade `nesting-parts` need the provider-compatible synchronous projection boundary; Documents fill/PDF/Markdown operations and Facade DXF extraction need their runtime dependencies packaged as organization-owned assets.
- The staging workflow has not produced jobs or a completed status for this batch; test verification remains open.

## Portable plugins and platform-managed execution (SPEC §20, owner direction 2026-11-16)

Installed plugins are versioned organization-owned package data.
Graphs carry environment-independent semantics; operations declare browser
and server targets. Perigram provides browser Workers and managed isolated
server runtime pools, with host-mediated capabilities and provider-level
external integrations. Documents is the first migration. Build123d
integration waits for the owner's completion of build123d-flow.

- [ ] Reconcile the plugin listing, install snapshot, settings, and runtime
  contracts: local services and browser engines must not acquire per-service
  endpoint/key settings; remote integration connections are declared and
  configured once at provider scope.
- [ ] Complete organization-owned package assets: materialize immutable
  versioned assets with content digests on install/upgrade, authorize reads
  by organization membership, and remove package data through the uninstall
  drain gate. Existing installs need one-time materialization and digest
  verification; remove the catalog asset fallback after migration.
  Progress (2026-11-16): new installs and upgrades materialize the catalog
  release into an organization-scoped GridFS bucket; install and upgrade
  snapshots explicitly mark organization ownership, record the content
  manifest, and module reads resolve that copy. Materialization computes
  digests from copied bytes and revalidates existing bytes before reuse.
  Repository tests cover digest creation, valid reuse, and repair of corrupt
  existing bytes. Uninstall cleanup runs only after the drain gate. The
  idempotent `migrate-plugin-assets-to-organization-storage.js` migration
  copies each existing org pin's exact version, verifies every manifest
  digest against stored bytes plus every declared runtime/engine/surface/local
  dependency asset, and records the organization marker only after
  verification. The migration still needs to run against the live database;
  the old catalog fallback remains until rollout is confirmed.
- [ ] Define the shared plugin execution contract in the SDK: operation
  targets, runtime/dependency requirements, capability declarations,
  invocation envelopes, result envelopes, cancellation, and execution
  evidence.
- [ ] Implement the versioned host capability contract for organization
  data, files, events, and provider integrations; authorize each invocation
  against the active principal, organization, and declared grants.
- [ ] Implement browser Worker execution for package operations and node
  providers, with a typed RPC bridge, lifecycle/cancellation, and explicit
  capability calls. Keep surface modules on the data-only host mount.
  Progress (2026-11-16): a dedicated Worker RPC harness and organization-
  scoped runtime binding exist; graph hydration exposes browser runtime
  bindings and provider metadata is returned from inside the Worker. Browser
  capabilities use an authenticated, read-only host route; operation
  declarations are checked again by the host. Node capability ids now require
  qualified, unique names. Custom preview renderer ids now resolve to
  declared preview surfaces through the host mount contract. Graph previews
  now share one execution id across node calls and finalize that id across all
  loaded plugin Workers on success and failure; focused lifecycle tests are
  queued for CI verification.
- [ ] Implement the platform-managed server runtime: shared scheduling,
  isolated runtime pools, package loading by organization/version, resource
  limits, network/filesystem policy, and validated result/effect commits.
  Progress (2026-11-16): managed JavaScript operations enqueue the shared
  `plugin-runtime` task type; the Deno worker loads the pinned organization
  package into a restricted child process, verifies package digests, and
  mediates declared host capabilities. Development Compose and production
  deployment start the shared worker; package resolution is owned by the
  plugin feature service, which rehydrates the actor, checks the pinned
  install version and server operation declaration, and verifies materialized
  asset digests. The task route validates the worker claim and delegates
  package loading. Instance update capabilities carry an expected revision
  into the generic instance compare-and-swap boundary. Durable effect
  evidence, transactionally validated commits, and runtime pool
  observability remain.
- [ ] Define graph placement and validation rules for browser-only,
  server-only, and dual-target operations; make server validation
  authoritative for durable effects and persist reproducibility evidence.
- [ ] Migrate documents projections, compositions, editors, and compute
  operations to the managed package runtime; remove its executor deployment.
- [ ] Keep build123d integration deferred until the owner completes
  build123d-flow; then adapt its browser Python/WASM runtime to the same
  package, graph, and capability contracts.
  Integration baseline checked 2026-11-16: [1suo/build123d-flow](https://github.com/1suo/build123d-flow)
  main at `3c62677065016ae166f50a176130b127ca35ef12`, package version
  `0.1.0`; build123d `0.13.0`, Pyodide `314.0.7`, and OCP.wasm
  `8.0.1.1.post202609241841` (upstream OCP.wasm 8.0.1.1). The upstream
  app already runs Python/OCP in a browser Worker and keeps exact B-reps
  in the interpreter; it is an early standalone shell, not yet a Perigram
  plugin. Extract/adapt its editor, catalog providers, worker/runtime and
  Three.js preview into the host's plugin surface and org-owned package.
  Its latest commit removed the test suite; restore browser-runtime,
  discovery, geometry, export and graph regression coverage before
  production integration. Recheck upstream main and all runtime pins
  before each plugin package release.
- [ ] Retire per-function endpoint settings and local-plugin connector
  tokens after all local packages migrate; retain explicit remote integration
  protocols through provider-level server adapters with server-held
  credentials and scoped capability handles.
- [ ] Remove the Documents executor deployment, seed wiring, and obsolete
  routes after its managed runtime migration; retain Build123d's transitional
  executor until its deferred browser integration is complete.
- [ ] Migrate existing installed plugin records and package assets without
  retaining the retired endpoint-per-service contract; verify install,
  upgrade, uninstall, organization isolation, authorization, and offline
  behavior.
- [ ] Update the plugin SDK, server, frontend, worker/package READMEs and
  deployment inventories; run focused tests plus architecture, docs,
  plugin-dependency, framework, SSR, and full Vitest guards.

### Agent Notes

- 2026-11-16: Added portable runtime declarations, browser Worker RPC,
  authenticated read-only browser capabilities, the shared Deno server
  worker, package digest checks, current-principal reauthorization, and
  development/production worker wiring. Remaining work covers effect
  evidence and transactional commits, preview renderer modules, Documents
  migration, existing-install asset migration, and end-to-end verification.
  Tests and repository guards have not been run in this environment.

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

## Internal-address scrub of tracked files (owner direction 2026-11-14)

Target law: [deploy/SPEC.md](./deploy/SPEC.md). The GitHub public
mirror ([Perigram/perigram](https://github.com/Perigram/perigram),
branch `staging`) already ships the sanitized snapshot; the canonical
tree still carries the addresses until the pipeline consumes secrets.

- [ ] Owner creates the Forgejo repository secrets (`NUXT_MONGODB_URI`,
  npm proxy endpoints, service base URLs) in the Forgejo UI.
- [ ] `.forgejo/workflows/deploy.yml` reads those values from secrets.
- [ ] Dockerfiles (root, nesting, plugin-executor, seed) take proxy
  and registry endpoints as runner-supplied build arguments.
- [ ] Concrete endpoint values move from deploy/README.md,
  k8s/README.md, server/features/livekit/README.md, docs/ops, and
  TODO.md_archive to an external infra runbook outside the repo;
  READMEs link it.
- [ ] Re-export the sanitized snapshot to the GitHub mirror after the
  canonical scrub lands on `staging`.

### Agent Notes

- 2026-11-14 — Mirror pushed: github.com/Perigram/perigram, public
  (private creation is blocked by the GitHub trade-controls
  restriction on the account), single orphan commit `c04933a2e` from
  `staging` at `3231aeb8b`; 14 internal literals mapped to
  documentation placeholders across 13 files; git history excluded.

## Node editor UI rethink (SPEC §28 amendment, owner direction 2026-11-14)

The canvas model follows the evolved build123d-flow UI (re-checked
2026-11-14): cards are socket manifests with authoring in a floating
inspector that shows live values; collapsed cards rail their sockets
top/bottom around a centered name; chrome floats over a fullscreen
canvas; sockets are generous targets with hover glow.

- [x] C1 Socket-manifest cards — the card body carries labeled socket
  rows (type, connection state) alone; inline typed editors leave the
  card; the header keeps collapse, description (tooltip affordance),
  error (popover), and the eye; collapse docks sockets on top/bottom
  rails around the centered name; card width is content-sized.
  Landed 2026-11-14: fault popover, description affordance,
  Blender-style top/bottom collapse rails around the centered name
  (content width was already law). Completed 2026-11-16: typed fallback
  editors and inline operation/literal configuration have been removed
  from cards; authoring lives in the inspector. A source-boundary test
  in `components/process-designer/ProcessNode.spec.js` prevents those
  controls from returning.
- [x] C4 Socket presentation — generous hit targets, hover grow + glow
  in the payload-family color, type hints on the rows. Landed
  2026-11-14: the handle is a 22×26 transparent target with the
  payload-family dot drawn by the design system
  (`--socket-color`), growing and ringing on hover; the handle
  primitive gains top/bottom sides for the collapse rails.
- [x] C2 Floating inspector with live values — unconnected sockets
  author through typed controls (structured values via a code dialog),
  connected inputs and all outputs display their live evaluation from
  the channel payload; the per-node Inspect action and inline fallback
  editor law are retired. Landed 2026-11-16: the inspector is a translucent
  floating rail over the graph editor canvas; preview resolves effect
  inputs without executing effects; the whole-graph channel payload feeds
  live input/output trees; structured JSON opens in the shared dialog.
- [x] C3 Floating canvas chrome — the category strip (provenance
  labels, category chips), inspector, and tool cluster ride floating
  translucent bars over the fullscreen graph editor canvas. The graph
  editor opts into the floating variant; the process page retains the
  default process-plane variant.
- [x] C5 Node glyphs — every process catalog entry carries a
  provider-neutral glyph key; the shared UI mapping renders monochrome
  glyphs in palette rows and node-card headers.
- [x] C6 Canvas status — a floating evaluation-state chip shows dot,
  label, and evaluated-node count; activating it switches directly to
  the activity/preview surface.

### Agent Notes (2026-11-14, agent/canvas-rethink-20261114)

- Study session (live app + component source: App.vue, ApiNode.vue,
  NodeInspector.vue, DataValue.vue, ViewportStatus.vue, style.css).
  The model moved past what G0 copied: inputs left the cards ("node
  inputs are edited in the inspector"), collapsed cards became
  Blender-style top/bottom socket rails around a centered title,
  chrome became floating translucent bars (canvas-topbar with
  provenance-grouped category strip + canvas-bottom-dock), the
  inspector floats and shows live values (DataValue trees for
  connected inputs and outputs), sockets grew 22×26 hit targets with
  color-glow hover, and a viewport status bar (dot + label + visible
  count + activity log) surfaced runtime state. Screenshots of both
  apps' current states: /tmp/opencode/b3dflow-01-boot.png,
  /tmp/opencode/client-engine-preview.png.
- build123d-flow's own style.css is accreted patch eras (three
  generations of collapsed-header rules overriding each other, dead
  inline-input rules left after inputs moved to the inspector) — the
  model is adopted, the file is written once clean.

## Local engines — client-side plugin execution (SPEC §20 "Client-carried", owner direction 2026-11-14)

A plugin may carry its engine in the package: the engine runs in the
browser, its services evaluate locally, and install is self-contained —
no endpoints, no origins, no keys. Connection settings exist only for
services that call remote systems. The build123d plugin is the first:
Pyodide + build123d + OCP.wasm in a Web Worker (the build123d-flow
model), catalog from the engine's own introspection, no executor
deployment.

- [x] E1 Listing contract — a listing declares a client engine (entry
  module, pinned runtime) and binds services to it (`mode: 'local'`);
  `parseListing` validates the shape, installs snapshot the engine
  binding, and the connection dialog renders no endpoint fields for an
  engine-only plugin.
- [ ] WAITING — owner verification: E1 — a listing with
  `declarations.engine` and `mode: 'local'` services validates and
  installs; an engine-less listing refuses a local service; an
  engine-only installed plugin renders neither the settings nor the
  connector button on the Plugins page; every server dispatch of a
  local service refuses with the client-engine message.
- [x] E2 Self-contained module serving — engine modules and pinned
  runtime assets ship in the published package and serve same-origin
  through the module proxy with no org-configured origin.
- [ ] WAITING — owner verification: E2 — an operator `PUT` of an engine
  asset keys it `pluginId/version/path`; an installed engine plugin's
  module proxy serves it same-origin to an org member (JS dependencies
  rewritten, binaries untouched, `ETag`/304) with no connection
  configured; a missing path answers 404; retract deletes the assets.
- [x] E3a Platform engine loader (owner direction 2026-11-14:
  platform-level code only, nothing build123d-direct) — the engine
  module contract (`createEngine() -> { dispatch(serviceId,
  parameters) }`), the served engine bindings on the org view
  (`clientEngines`: plugin, version, proxied module URL, local service
  ids), and the browser loader (`useClientEngines`).
- [x] E4 Client-side preview dispatch — a graph whose service nodes all
  bind served client engines evaluates in the browser through the one
  evaluator (`previewProcessDataflow` client-hosted, the engine loader
  as its preview service channel); graphs with endpoint services or
  `cts.*` species keep the server evaluation.
- [ ] E3b Engine bootstrap (plugin-owned, sequenced after the platform
  slices) — the runtime itself: worker bootstrap, pinned interpreter,
  wheel install, storage persistence — shipped as package assets by the
  engine plugin that needs them.
- [ ] WAITING — owner verification: E3a + E4 — an installed engine
  plugin serves its binding on the org view; a graph composing a local
  service previews in the browser (no server preview round-trip), a
  dispatch failure folds into the node error, and graphs with endpoint
  services keep the server path.
- [ ] E5 build123d plugin conversion — the listing carries the
  discovered op catalog and the engine; the python executor
  (`workers/build123d`, its dev compose service) retires. Supersedes
  the executor-deployment shape of the 2026-11-13 bring-up. Sequenced
  after E3b (owner direction 2026-11-14: platform-level code first).
- [ ] E6 Shape viewport (G4) — the engine's tessellated meshes feed the
  plugin's preview channel surface.

### Agent Notes (2026-11-14, agent/local-engine-e3a-20261114)

- Live dogfood (dev stack, a pure-JS stub engine — no build123d):
  operator-published `engine-demo` v4 with a packaged
  `engine/index.mjs` (`createEngine` + `dispatch`); after install the
  org view served the binding, the plugin's "Engine demo" palette
  section carried its service, and a one-node graph (authored `text`
  fallback) evaluated IN THE BROWSER in the Preview tab — the Outputs
  channel rendered `result · string · "engine:ping"` with the engine
  module loaded from the package store. Uninstalled and retracted.
- Three defects the live pass caught and fixed (all invisible to the
  suites): the served type view destructured `clientEngines` but never
  returned it (`fix: the served type view returns clientEngines`);
  the binding listed bare service ids while graphs reference
  plugin-qualified operators (`fix: engine bindings carry
  plugin-qualified service ids`); and the browser's structuredClone
  refuses the draft's reactive proxies — client evaluation crosses the
  draft through the JSON boundary, the same boundary the server
  preview POST always crossed (`fix: client evaluation crosses the
  draft through the JSON boundary`).
- E3a + E4 landed, platform-level only per owner direction (no
  build123d work). The engine module contract: default export
  `createEngine() -> { dispatch(serviceId, parameters) }`; the org
  view serves `clientEngines: [{ pluginId, version, url, services }]`
  (the module proxy URL resolves against the pinned version's package
  store); `useClientEngines` loads each binding once per version
  (failed loads forgotten and recorded). `useGraphChannelPreview`
  evaluates a graph client-side when every `cts.service` node's
  operator has a served binding and no other record is a `cts.*`
  species — the one evaluator (`previewProcessDataflow` +
  `serializeProcessResult` from the pure package) hosts in the browser
  over the projected domain with the loader as its preview service
  channel; every other graph keeps `previewDraft`. The server-side
  lowering adapter stays server-side: the designer's serialized draft
  already speaks the current species vocabulary.
- E3 re-sliced: E3a (platform loader) landed here; E3b (the runtime
  bootstrap — interpreter, wheels, storage) is plugin-owned and
  sequenced with the engine plugin that ships it.

### Agent Notes (2026-11-14, agent/local-engine-e2-20261114)

- Live dogfood (dev stack, operator-published throwaway package):
  listing v3 + `PUT` of a 42-byte `engine/index.mjs` stored under
  `engine-demo/3/engine/index.mjs`; after install the module proxy
  served it same-origin to an org member (200, `text/javascript`,
  byte-exact body, ETag, If-None-Match → 304), a missing path answered
  404, and the install configured nothing. Uninstalled and retracted
  after the pass.
- Defect found in the live pass and fixed (`fix: asset route resolves
  the plugins service at its nesting depth`): the new route's relative
  import was one level short — no spec loads API routes, so only the
  live request surfaced it (nitro 500, RollupError).
- E2 landed. `plugin_assets` GridFS bucket (filename
  `pluginId/version/path`, metadata for retraction) with repository
  store/find/read/delete over the shared
  [files](./server/features/files/README.md) bucket helpers
  (`findFileMetaByFilename`, `listFileMetasWhere` added there; the
  extension map gains `.js`/`.mjs`/`.wasm`). `PUT
  /api/plugins/catalog/:pluginId/assets/**?version=` (operator token,
  raw body, stored content type) publishes assets after the listing
  exists; retraction deletes them with the listing. The module proxy
  serves an engine install's paths from the pinned version's assets —
  JS dependency rewrite and ETag/304 preserved, binaries untouched —
  and 404s a path the package does not carry. The operator gate is one
  home now (`requirePlatformOperator` in server utils), shared by both
  catalog routes.
- Validation: plugins + files specs 77 ✓, `check-arch` ✓,
  `docs:validate` ✓, `framework:validate` ✓.

### Agent Notes (2026-11-14, agent/local-engine-e1-20261114)

- E1 landed. `declarations.engine: { module }` (root-relative entry
  module, `MODULE_PATH`-validated, schema-mirrored) parses into the
  layer and the normalized catalog document; a service of
  `mode: 'local'` requires it (`parseListing` refusal), the mode
  grammar gains `local`, and `cache` stays endpoint-only. Installs
  snapshot `engine` beside the declaration layer. `serviceModeOf`
  learns `local`; `executeConnectorService` and
  `invokeEndpointValueService` refuse local services (400, client
  engine / local-mode messages), and endpoint settings for one refuse
  (`no endpoint applies`). The Plugins page gates the settings button
  on endpoint services (unchanged) and the connector button now gates
  on remote services (`mode !== 'local'`) — an engine-only install
  renders neither.
- Live dogfood (dev stack, operator-published throwaway listing):
  `engine-demo` v2 (one type + `engine` + one `mode: 'local'` service)
  installs through the consent dialog and its installed row carries
  Remove alone — no settings, no connector, no token — while the
  documents/tech-drawing rows keep theirs. The install gate's trial
  composition refused a first listing whose type lacked the identifier
  field, exactly as the registry law demands. Uninstalled and
  retracted after the pass.
- Validation: sdk + plugins specs 110 ✓, SSR smoke 29 ✓, `check-arch`
  ✓, `docs:validate` ✓, `framework:validate` ✓.

### Agent Notes (2026-11-14, agent/local-engines-spec-20261114)

- Owner direction recorded after live inspection: the build123d
  Connection dialog renders one endpoint URL field per discovered op
  (64 fields) because every op registers as an endpoint-mode service —
  the per-service connection model (born on documents, 6 services)
  degenerates on engine plugins. In build123d-flow the engine is
  client-side (Pyodide worker, OCP.wasm, catalog via Python
  introspection, "no required Python server"); plugins like this must
  be all-included on install. SPEC §20 amended with the client-carried
  hosting mode; slices E1–E6 recorded above.

## Unified node graph system (SPEC §28, owner decisions 2026-11-16)

Graphs are organization-owned versioned programs in the canonical
`perigram.graph` JSON format. The procedural profile is the first
execution target; the process profile migrates after that foundation
is proven. Package ownership and migration sequence are in root SPEC §28.

- [x] G0 Shared canvas interaction model — canvas-top palette dock,
  collapsed socket rails, per-node preview visibility, selection actions,
  and whole-graph output channel.
- [x] G1 Resource and surface scaffolding — the `graph-document` file
  type, content revisions, editor surface registry, shared canvas
  presentation, and payload persistence.
- [ ] WAITING — owner verification: G1 resource creation, payload revision
  behavior, record/pane editor mounts, and read-grant presentation.
- [x] G2 Canonical graph foundation — core document codec, structural
  validation, Graph Input/Output boundaries, pinned Use Graph evaluator,
  preview-only procedural evaluation, plugin-SDK provider definitions and
  exact-version registry, and process data-operation adapter with tests.
- [ ] G3 Canonical graph editor — direct `perigram.graph` load/edit/save
  now uses a separate session and shared canvas presentation. Provider
  socket cards, graph inspector, Graph Input/Output, dedicated Use Graph
  palette group, and editable boundary semantic/transport/default
  declarations and pinned Use Graph interface hydration from an exact
  graph revision are wired. The organization graph catalog and historical
  revision picker feed both the inspector and Use Graph palette. Remaining:
  component-level tests for async catalog, revision hydration, and save lifecycle.
- [ ] G4 Procedural preview — core evaluator and process adapter are wired
  to the editor preview panel; JSON input-binding controls are implemented
  and boundary defaults are consumed by the evaluator. Browser runtime
  provider discovery/execution bindings now resolve worker renderer ids to
  declared preview surfaces and mount them through the read-only host.
  Remaining: end-to-end graph preview tests and robust per-node diagnostics.
  Preview remains read-only.
- [ ] G5 Commit, Bake, and Export — page-file Bake is implemented in the
  graph-executions service and exposed through its explicit API route; Export
  returns a selected output as a download and records a `procedural-export`
  execution. The first Commit adapter applies one exact-instance CTS
  name/field patch through the authorized instance service with an expected
  revision, after validating the preview read set. The instance mutation and
  `procedural-commit` evidence now persist in one Mongo snapshot transaction;
  a stable organization sequence is reserved by compare-and-swap. Transaction
  support is required and unsupported deployments fail before writes.
  Instance-field Bake now attaches a file handle to an exact declared `blob`
  field through the generic authorized patch boundary; its target can be an
  exact revisioned instance or a single-result preview query (e.g. newest by
  `createdAt desc`, with deterministic `_id` tie-break). Uploaded files are
  compensated on abort and the field mutation plus execution evidence share
  one transaction. Relation Bake creates a revisioned file instance and
  links it through the owner's declared typed relation inside that same
  transaction, enforcing relation target-domain and cardinality rules.
  Instance-payload Bake is also implemented for one exact
  revisioned CTS instance: the uploaded blob is compensated on abort, while payload swap,
  immutable revision, audit event, organization sequence, and execution
  evidence share one Mongo snapshot transaction. New-instance Bake now uses
  an explicit CTS type and draft; the host creates the record and attaches
  the output payload inside the same transaction. Remaining: end-to-end
  graph vertical-slice verification and owner acceptance.
- [ ] G6 Organization-data consistency — bounded typed CTS queries now
  support exact-instance detail reads, Mongo snapshot transactions where
  supported, sequence-bracketed fallback, and execution read sets that merge
  per-query snapshots only at a shared stable organization sequence. Bake and
  Export revalidate graph identity, consumed instance revisions, relations,
  and query-range sequences before materialization. The per-instance revision
  token and dry-run/apply backfill are implemented; production deployment now runs the backfill after the updated app starts, with live rollout verification still pending. The instance patch
  boundary now accepts an expected revision and performs an updatedAt
  compare-and-swap, including a second revision check when constraints require
  a fresh read; the managed plugin update capability forwards that
  precondition. Focused stale-revision and concurrent-write regression tests
  were added. The first graph Commit adapter now forwards the preview's
  expected revision through this same boundary and revalidates its read set
  before writing. Commit revalidation, target mutation, and evidence now share
  one snapshot transaction; the organization sequence fence rejects writes
  that race the preview. CTS declaration edits capture the sequence before
  validation and reserve it exclusively while unique indexes and migrations
  apply, advancing the sequence once per declaration mutation. Remaining:
  verify the deployment-run revision backfill and extend transactional
  query/range validation to multi-object writes.
- [ ] G7 Constraints — the typed boolean AST checks nested
  relation/containment traversal, finite quantifiers, aggregate result types,
  and boolean predicate results. Enforcement covers generic creation,
  constrained updates, re-derive, and flat CTS lifecycle transitions.
  Generic instance writes reject undeclared field ids. Explicit relation edges
  normalize `cardinality: one | many`; generic create and internal relation
  updates enforce cardinality shape, accepted target types, duplicate
  references, same-organization/system target scope, and declared target-domain
  predicates. Construction and process updates validate lineage against
  declared parent edges and existing parent instances; construction inherits
  only validated ancestor axes, and tenancy is kept out of stored lineage.
  Global and organization-scoped exact scalar uniqueness uses registry-derived
  Mongo unique indexes, partial scalar filters, and 409 conflict mapping.
  HTTP link/unlink run in snapshot transactions with relation updates,
  revision checks, field-change audit records, and organization sequence
  updates. Authorized delete transacts the declared-referrer sweep and delete;
  live refresh hints publish after commit. Constraint-bearing generic
  create/update, relation, delete, payload, lifecycle, and type-declaration
  writes capture the organization sequence before validation and reserve it
  exclusively at write time, serializing cross-record aggregate/cardinality
  checks. Remaining: audit import and type-migration direct repository writes.
- [ ] G8 Typed references and embeds — Page blocks now author live/pinned
  typed references, resolve them through the target read grant, render a
  shared unavailable state for inaccessible targets, and expose rebuildable
  org-scoped backlinks. Saved-query embeds can pin their definition revision
  while rendering live authorized results. Graph-output embeds can pin a
  successful execution and resolve its collection through the saved graph
  revision and target read grants. Remaining: parameter binding and frozen
  result data snapshots for referenced instances.
- [ ] G9 Procedural vertical slices — document/data and geometry workflows
  exercise provider registration, preview, Commit/Bake, and provenance.
- [ ] G10 Process migration — inventory all stored process graphs, produce
  a deterministic migration with dry-run report and recovery path, cut over
  all records, verify semantics and authorization, then remove the old
  runtime format.

### Agent Notes (2026-11-17, atomic graph Commit)

- The `commitProposal` and `commitOutput` paths revalidate the saved graph and preview read set, apply the authorized exact-instance patch, and insert the append-only `graph-execution` evidence inside one Mongo snapshot transaction.
- The instance repository and generic instance service propagate the transaction session through reads, constraint resolution, revision compare-and-swap, organization sequence reservation, and writes. A stable preview organization sequence is reserved with a zero-pending compare-and-swap and an exclusive token before the target mutation; ordinary organization writes cannot begin until that token is completed or cancelled. The execution record advances the same sequence inside the transaction.
- Mongo transaction support is a commit prerequisite. Unsupported deployments receive `503` before mutation; evidence-write failures abort the instance write with the transaction.
- Regression coverage verifies the session is shared by the patch and evidence insert, the expected sequence reaches the write boundary, and the sequence reservation rejects stale previews. CI passed the full Vitest, SSR, architecture, framework, documentation, operational-script, and plugin-dependency checks.
### Agent Notes (2026-11-17, CTS declaration sequence fencing)

- `defineType` and `removeType` now capture the organization sequence before preflight reads and reserve it by compare-and-swap for the authoritative write.
- The reservation spans unique-index updates and the complete covered instance migration. A concurrent org-data write rejects the declaration request with a stale-sequence conflict.
- Removed nested sequence reservations from the public wrappers so each declaration mutation advances the sequence once.
- Added a regression test for the single reservation and expected sequence.

### Agent Notes (2026-11-17, transactional relation mutation)

- Added a shared Mongo snapshot-transaction helper and reused it for graph Commit plus HTTP relation link/unlink.
- Authorized instance deletion now opens the same transaction boundary; the target delete, declared relation-referrer scan/rewrites, persisted field-change events, and organization change sequence share its session. In-memory refresh hints are deferred until commit succeeds.
- The relation routes forward an optional `expectedOrganizationSequence` fence as well as the exact owner revision. Unsupported Mongo deployments fail with 503 before the mutation.
- Regression tests cover session propagation through relation link/unlink, delete/referrer sweep, sequence fencing, and the authorized delete transport.

### Agent Notes (2026-11-17, serialized CTS constraint writes)

- Generic instance create and process-update capture the organization sequence before validation and pass it to the exclusive write reservation.
- Relation link/unlink capture the sequence before reading targets; authorized delete captures it before the referrer sweep; payload writes capture it before the target read.
- Lifecycle transitions capture the sequence before candidate validation and reject when another organization write completes before their reservation.
- A concurrent write therefore invalidates cross-record aggregate/cardinality validation before persistence.

### Agent Notes (2026-11-16, CTS relation write validation)

- Explicit relation edges now normalize `cardinality` to `one | many` (default `many`). Generic instance creates and internal relation updates validate declared relation slots, typed targets, cardinality shape, duplicate refs, same-organization/system tenancy, and target-domain `where` predicates. Nested relation/containment predicates use the bounded async CTS evaluator and a recursion guard. Generic HTTP PATCH still refuses structural relation writes; this validation protects internal construct/process paths that do write them.
- Added regression coverage for invalid cardinality, disallowed target types, cross-organization targets, undeclared relation slots, target-domain rejection, and trusted executor-output fields versus caller-supplied undeclared fields. The latest workflow's full Vitest, SSR, architecture, framework, docs, operational-script, and plugin-dependency steps all passed; cleanup was still running when recorded.

### Agent Notes (2026-11-17, CTS relation and lineage write integrity)

- Explicit relation-edge cardinality is normalized in `@perigram/cts` and rejects values outside `one | many`; field refs/lists retain their schema-derived one/many shape.
- Generic create and process-update relation writes resolve declared typed targets, enforce tenant/system scope, reject duplicate refs and invalid one/many shapes, and evaluate target-domain expressions with the bounded async evaluator.
- Construction lineage now resolves only declared parent types, validates parent scope/existence, and allows authored ancestor axes only when they are present on the validated parent's lineage. Internal process-update lineage writes reject undeclared keys and unresolved parents. The storage boundary ignores `lineage.organizationId`; organization ownership remains the top-level §3 slot.
- Regression coverage covers cardinality, target type/domain, cross-organization refs, undeclared lineage keys, missing parents, duplicate refs, scalar lineage storage, and tenancy-slot isolation. The structural-edge suite passed 291 Vitest files / 2,984 tests plus SSR, architecture, framework, documentation, and plugin-dependency checks.
- Open G7 work: audit import and type-migration direct repository writes; serialize cross-record aggregate/cardinality constraints.
### Agent Notes (2026-11-16, deployment migration wiring)

- `scripts/deploy.sh` now runs the instance-revision backfill and organization-owned plugin-asset migration after the updated app starts. It runs them from the standalone `perigram-seed` image, whose dependency closure now includes the CTS package import map, server DB/utils/features, MongoDB, Winston, and H3; this avoids relying on Nuxt aliases or source trees absent from the app runtime image. The deploy script's executable mode remains `100755`.
- A failed asset repair clears `packageAssets`/`assetStorage` only when the install still matches the exact snapshot inspected, restoring catalog fallback after a partial copy without clobbering a concurrent upgrade. The migration remains fail-closed for deployment, and the live database has not yet been migrated.

### Agent Notes (2026-11-16, graph Commit first slice)

- Added `POST /api/graph-executions/commit` and the first `cts.instance.patch` proposal adapter. It requires a successful preview, exactly one matching instance revision in the read set, no relation dependencies, and only exact-instance query observations for the same target. It revalidates the saved graph and read set, then calls the generic instance `patch` service with caller auth, organization, and expected revision. The generic service owns write-grant, field-policy, constraints, and compare-and-swap checks. It persists a `procedural-commit` execution with the resulting instance revision.
- The instance write and append-only execution evidence are not yet one Mongo transaction. If the write succeeds and evidence persistence fails, the API returns an explicit 500 with the committed instance identity/revision; durable recovery and atomic evidence remain blocking work. Multi-object/relation proposals remain refused.
- Added service regression coverage for successful commit, broad-read-set refusal, and unsafe field-path rejection. The latest staging workflow passed: 290 Vitest files / 2,969 tests, SSR smoke tests, architecture, framework, documentation, operational-script, and plugin-dependency checks. The live deployment migrations have not yet been run.

### Agent Notes (2026-11-14, agent/outputs-channel-20261114)

- Live dogfood (dev stack, e2e org): with zero plugin channels the
  preview tab renders on the process designer and a Current time node's
  output renders under its card labels (value · dateTime · branch/item
  counts · sampled value); the eye empties the channel to the
  no-visible-outputs state and restores it. After upgrading Documents
  5→11 the served `report` channel sections beside Outputs in its
  unavailable state — this org's plugin connection is unconfigured
  (`url: null`), the connector setup is an owner action. A stale dev
  chunk after the merge (`useAuthStore is not defined` on the process
  page) cleared on recompile.
- Defect found in the pass and fixed (`fix: session exports the
  context-palette connect handlers the canvas requires`): the G1b
  extraction destructured `beginSocketConnection`/
  `endSocketConnection` from the canvas composable — they live in the
  context-palette composable — so every GraphCanvas mount warned and the
  wire-drop palette lost its handlers. Pinned by
  `useProcessDesignerGraphSession.spec.js` and live-verified: zero prop
  warnings, and dragging a value output onto empty canvas opens the
  socket-filtered palette.
- The built-in outputs channel landed. `GraphPreviewPanel.vue` renders
  the platform channel first (`GraphOutputsChannel.vue`) beside the
  served plugin channels; both hosts (the process page and the graph
  editor surface) render the preview tab unconditionally and pass the
  live canvas nodes. `utils/processDesignerChannelOutputs.js` is the one
  preview-display home: the branch/value formatters
  (`useProcessDesignerPreview` re-exports them unchanged) and the pure
  `graphOutputEntries` derivation over the whole-graph channel payload —
  labels from the enriched node data (`groupLabel`, `kindLabel`, port
  specs). Locale keys en+ru (`previewOutputsChannel`,
  `noPreviewOutputs`; `noPreviewChannels` removed with its empty state).
- SPEC §28 "Preview tabs" amended with the outputs channel.
- Validation: utils + composables + localization 121 ✓, SSR smoke 29 ✓,
  framework-packages + design-system 39 ✓, `check-arch` ✓, `docs:validate`
  ✓, `framework:validate` ✓.

### Agent Notes (2026-11-14, agent/graph-editor-20261114)

- G1c landed. `components/generated/file-surfaces.js`: the registry
  carries `graph-editor` (lazy `GraphEditorSurface.vue`, label
  `processDesigner.graphDocument`, mount props `record`/`persistence`
  (`instancePayloadPersistence`, `application/json`)/`mode`
  (`editorMountMode`)); `frameworkEditorBindings` binds
  `graph-document` → `graph-editor` and `activeEditorBindings()` merges
  it beside the served plugin list (a served binding for the same type
  wins).
- The canvas presentation moved out of the page:
  `GraphCanvas.vue` (VueFlow templates, dock, context palette, selection
  dial, empty/validation states; `lane` and `inspector` slots; function
  refs hand the frame and the palette-search instances to the session),
  `GraphInspector.vue` (the node/edge inspector body), and
  `GraphPreviewPanel.vue` over the new
  `composables/useGraphChannelPreview.js` (the whole-graph evaluation,
  `previewVisible` filtering, one debounced schedule). The process page
  (2125 → 1958 lines) keeps the definitions/roles/screens tabs, lanes,
  and apply ceremony; the inline-style exception entry moved with the
  dial/context markup into `GraphCanvas.vue`
  (`scripts/ui-visual-inventory.js`).
- `GraphEditorSurface.vue` loads the payload as the graph data object
  (`serializeProcess()` shape, `loadDocument({ data })`; blank/missing
  payload seeds an empty graph; unreadable JSON renders the
  `processDesigner.invalidGraphPayload` state), saves through the
  instance payload transport (blank first save creates), binds the
  header chrome `{ name, dirty, saving, save, rename }` (name alone in
  read mode, canvas read-only), loads organization roles for grant
  authoring, and rides the process-definition preview transport for
  node/channel preview.
- `graph-document` creation protocols: `['upload', 'editor']` — upload
  stays the default (`attachmentKinds` creation mode reads the first
  entry), the editor protocol offers the blank editor create
  (`RefRowActions`) with no prompted rows
  (`graph-document.spec.js` pins the construction contract).
- Known scaffold gap (pre-existing, G1a): the blank first save runs the
  type's compiled construct (`runBlankFileConstruct`), so an
  organization whose active process authors no `graph-document`
  construct gets the create error until one is authored — the starter
  constructs own that seam (`starterConstructsForOrganization`).
- Live dogfood (2026-11-14, dev stack, fresh org): blank editor opens
  from the Graph collection's create (editor protocol), a palette node
  authors and syncs its inspector, the first save creates the instance,
  names it ("First graph"), and persists the payload as the serialized
  graph; reopening from the collection reloads the graph clean. The
  same pass caught and fixed a G1b defect the suites could not see:
  `useProcessDesignerGraphSession` imported `compileTreeDeclarations`
  from the cts barrel (it lives in the processes barrel) — Vite's dev
  ESM link throws on the missing export, killing every session mount
  (process page and graph surface alike), while Vitest's transform
  resolves it to `undefined` and no spec drives the declaration
  diagnostic path with class nodes (fix `048a617b6`).
- Validation: file-surfaces + graph-document + channel-preview specs,
  composables/processes/cts 779 ✓, components/generated 58 ✓,
  SSR smoke 29 ✓ (process page + new graph editor surface smoke),
  design-system 37 ✓, `check-arch` ✓, `docs:validate` ✓,
  `framework:validate` ✓. Full non-e2e run matches the base checkout's
  failure set (server suites, sidebar, region-header, generated labels —
  all pre-existing); the icon-font glyph spec additionally needs a
  `node_modules` symlink in a bare worktree.

### Agent Notes (2026-11-14, agent/graph-session-20261114)

- G1b landed. `composables/useProcessDesignerGraphSession.js`: the
  canvas authoring core (graph state, records, sync/enrichment, wire
  legality and decoration, placement, palettes, declaration
  diagnostics, inspector seams) with the host injecting the draft ref,
  roles, activeOrganizationId, preview persistence, the filtered
  graph-evaluation ref, and a placement seed. The process page
  (3320 → ~2130 lines) composes the session with lane seeding and keeps
  the process plane (definitions lifecycle, lanes/grants, roles,
  screens, apply ceremony, reconcile). No template change — every
  binding resolves from the session destructure.
- The session reproduces the page's ordering contracts: the
  late-bound sync wrapper, hoisted authoring functions, and the
  diagnostics re-stamp watcher; `loadDocument` carries the host's
  `seedNodes`/`onLoaded` hooks (the page seeds lane facts and takes its
  baselines there).
- Validation: composables + processes + cts + localization +
  design-system 814 ✓, full SSR smoke 27 ✓, `check-arch` ✓,
  `docs:validate` ✓. The page keeps no unit spec of its own (as
  before); G1c's surface will exercise the session a second time.

### Agent Notes (2026-11-14, agent/graph-doc-type-20261114)

- G1a landed. `graph-document` joins `frameworkTypes`
  (packages/cts/src/pack/framework.js) as an authorable system file
  type: JSON payload (5 MiB cap, upload creation), content revisions,
  `name` identifier. Spec `packages/cts/src/graph-document.spec.js`
  pins the declaration shape, the clean compile with an authorable
  projection, and the payload acceptance lattice.
- G1 scoped into G1a (landed) / G1b (canvas session extraction from
  the process page — the shared core is ~900 lines interwoven with
  process-plane code; moving it verbatim into one session composable
  is its own session) / G1c (the editor surface over the platform
  file-surface registry; `editorSurfacePersistence` and
  `instancePayloadPersistence` already cover load/save, blank-open,
  and write-grant mode, so G1c is surface + binding alone).

### Agent Notes (2026-11-14, agent/dock-cards-20261114)

- G0 landed. `PaletteDock.vue`: canvas-top strip (provenance tier
  labels, one chip per palette section) opening the popover palette —
  an empty query lists the section, a query spans the full catalog; the
  palette rail and its panel toggle are gone (the workspace `#palette`
  slot unused; the inspector rail keeps its toggle), and the workspace
  toolbar moved to the bottom line (shared chrome law updated). The
  context palette keeps `OperationPalette.vue` as its list.
- Operation cards: the header carries the collapse chevron, the palette
  section label above the node label (`groupLabel` derived in the one
  enrichment pass; one palette-entry match now feeds the label, the
  description, and the section), and the eye; a collapsed card folds
  its body and docks its handles on the card's left/right edges; H
  collapses the selection; `collapsed` rides canvas node data and
  round-trips with the draft.
- Defect found and fixed (blocking the canvas-model spec since
  3c1766120, 2026-10-28): that change cut the class-scoped state path
  but left the stale assertion (`state → class declare` wire and
  `states: 1`) in `useProcessDesignerCanvasModel.spec.js`, and the
  class card (`TypeNode.vue`) reading dead `fieldCount`/`stateCount`
  keys the live pass never writes — the class meta counts rendered
  nowhere. The spec now asserts the field count alone; the card reads
  the live pass's `fields`; the `states: 0` factory seed is gone.
- Validation: composables + packages/processes + localization +
  design-system 712 ✓, full SSR smoke 27 ✓, `check-arch` ✓,
  `docs:validate` ✓, `framework:validate` ✓.

### Agent Notes (2026-11-13, agent/node-eye-20261113)

- Owner verdict on the build123d-flow migration: nothing of the
  interaction model runs on the canvas except the eye, misplaced. The
  original (inspected at src/App.vue and src/components/ApiNode.vue of
  github.com/1suo/build123d-flow) carries one eye per node in the card
  header toggling viewer visibility, a canvas-top dock (provenance
  labels, category chips, popover palette with full-catalog search),
  collapse chevrons, `category · kind` card headers, and a side
  viewport panel. The dock WAITING item above records the failed
  verification; G0 carries the reopened work.
- Landed this session: the per-node preview eye — the header eye on
  cards with data outputs authors `previewVisible` (`false` removes the
  node's outputs from channel payloads; a hidden node keeps its error);
  the retired per-output `previewOutputs` key migrates at the record
  seam (`normalizeProcessNodeDefaults`: a selection that hid every
  output hides the node, any visible output stays visible);
  `visiblePreviewOutputs` filters per node; locale keys en+ru; SPEC §28
  and the process-designer README state the per-node law.

### Agent Notes (2026-11-13, agent/graph-instances-20261113)

- Session verified the §28 state on `local`: composition is authored on
  the organization process page alone; the real build123d engine listing
  (v1, 64 ops) declares no preview channel and no surface (the reverted
  first plugin carried `b3d-viewport`; the rewrite dropped it);
  `b3d-part` admits upload creation only; documents cover one-shot
  compose/render services, with no incremental document-op nodes and no
  persistence path for computed artifacts. SPEC §28 amended from owner
  words this session; slices G1–G5 recorded above.

## Node system rework — artifact composition on the one graph (SPEC §28 + NOTES-templates.md, owner direction 2026-11-13)

One meta-feature (owner ruling this session): the typed artifact
composition of `NOTES-templates.md` (HAG) delivered through the one
graph system of SPEC §28 — processes owns the calculus, format
operations arrive as plugin palette services, previews ride the channel
tabs; a second graph format, validator, or evaluator is the §28 defect
law. HAG concepts map onto existing homes:

| HAG concept | Perigram home |
|---|---|
| Graph document / DAG evaluator | Process definition + the dataflow evaluator (`packages/processes`), preview scope for live composition |
| Node definition registry | Operation catalog + plugin listing services (SPEC §8 signatures; palette `group` sections) |
| Ports with semantic types | Signature-derived data sockets (CTS V-grammar); typed value contracts ride `json` values |
| Artifacts, immutable + content-addressed | File instances + GridFS `contentHash` (§28 artifact contract); payload revisions |
| Pure-node cache | `plugin_service_cache` deterministic replay |
| Import/extract adapters | Plugin endpoint services over payloads (`resolve: { service }` projections; documents/facade executors) |
| Diagnostics | Anchored validation diagnostics + node fault channel |
| HTML/preview rendering | Preview channels + preview surfaces |

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

- Consultation session. Compared `NOTES-typesystem-and-nodes.md`,
  `NOTES-templates.md` (HAG), and github.com/1suo/build123d-flow against
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

## Class library and Page class (SPEC §27)

- [ ] WAITING — owner verification: registry-owned type lifetime — the
  definition-owned death gates and `confirmTypeDeath` are gone; classes
  live until explicit removal.
- [ ] WAITING — owner verification: class panels in the sidebar open
  the class page for every class (its collection carries the compiled
  create and link actions, the header type label opens the class dialog,
  and the page keeps the block editor), panel context menus open the
  dialog, the sidebar New class action creates a class, and the class
  dialog edits name, class, compact glyph select, fields, states, and
  children.
- [ ] WAITING — owner verification: child classes save with the parent
  (a draft dialog, group included), class states persist on the
  declaration and override compiled state policy, and the record pages
  carry no field/state authoring affordances.
- [ ] WAITING — owner verification: default Page class with block
  content; the pages feature adopts old `pages` rows into Page instances
  and backs the sidebar tree with that instance tree.

### Agent Notes (2026-11-08, agent/editor-mentions-20261108)

- A screenless class opens its bound Page instance: `fields.classTypeId`
  binds the page to the class, the pages service returns the existing
  page for a repeated create, and the class page carries its class
  collection above the block editor. It mounts the same page header and
  block editor as every custom page; class pages stay out of the sidebar
  page tree.

### Agent Notes (2026-11-08, agent/class-pages-chips-20261108)

- Every sidebar class entry opens its class page. The class page leads
  with the class's compiled `typeList` screen through
  `GeneratedScreenHost`, so create and link actions run through the
  ordinary action pipeline; a screenless class mounts the minimal live
  collection view. The wrapped sidebar rail follows the same open path.
- Focused: `view-embed`, `sidebar-pages`, `sidebar-explorer`, and the
  hierarchy spec green; `docs:validate` and `check-arch` green.

### Agent Notes (2026-11-09, class page document)

- The class collection is a surface section above the page document,
  mounted by `CustomPageSurface`; the page document carries blocks alone.
  `ensureClassPage` strips a legacy seeded collection fence on first
  read.
- The header carries the class dialog action alone: no class avatar or
  duplicate type label, and the save control renders while dirty.
- The class collection keeps its header and empty state when the class
  has no records: `GeneratedScreenHost` forwards `keepEmptyLists` into
  the screen composition, so the class list stays in the arrangement.

## Notion-like document blocks and collection views (owner direction 2026-11-08)

- [ ] WAITING — owner verification: in-place block rendering, collection
  view tabs in the header, and the document gutter controls. The editor
  authors flush at the click point, autosave keeps the editor open, the
  gutter plus opens the slash vocabulary, and the header carries the
  type's saved views as tabs.

### Agent Notes (2026-11-08, agent/notion-blocks-20261108)

- Block vocabulary moved to `block-vocabulary-data.mjs` (pure entries)
  with the action adapter staying in `block-vocabulary.mjs`; the slash
  panel and the gutter insert menu consume the same table. Added the
  image entry with the host address hand-off.
- Gutter lane widened to 3.5rem; plus and a six-dot grip share one
  1.5rem control shape, plus first, aligned with the section's first
  line. The shared insert menu carries the collection-view entry.
- Overlay text blocks author at the click point with crepe page chrome
  stripped; autosave leaves the editor open and late keystrokes reseed
  the draft. Read HTML and the in-place engine share the markdown
  recipe, so entering the editor keeps the block's typography.
- Collection headers keep the label, count, view tabs, search, filter,
  view settings, and create set on one row; selecting a saved tab
  suppresses preference writes.
- The collection-view picker is the type containment tree; a pick
  carries its type id and renders the type's live view with its header
  tabs. Saved views stay in the header tabs.
- Enter at the end of a text block starts the next block; an empty
  paragraph keeps Enter inside the same block, so sequential empty
  lines never stack. Backspace in an empty block removes it and resumes
  the previous text block. The
  document keeps a real inline editor at its foot, empty and type-ready.
  Enter commits its text as a block and leaves a fresh empty line. The
  trailing line is the single placeholder: empty text blocks render
  nothing and drop when their editor closes. Callout inserts an empty
  blockquote.
- Text blocks accept inline instance references through the Instance
  entry: the shared InstanceSelect picks a record and the shared
  InstanceInlineRef chip renders it in prose.
- The record measure keeps the page header's position; the gutter lane
  sits in the left margin.
- Validation: focused vitest (ui-mapping, generated, documents surfaces,
  overlay session, markdown fences) green; `check-docs` and `check-arch`
  green.

### Agent Notes (2026-11-08, agent/editor-mentions-20261108)

- Instance authoring uses the shared `InstanceTree.vue` (extracted from
  the chat attachment picker): typing `@` or picking Instance opens the
  same home-section/lineage tree with lenient search. A pick is an
  atomic `instance_ref` node rendered as the shared chip face; the first
  Backspace at its edge selects it and the next removes it. The node
  serializes to the same `#instance:` markdown link the read pipeline
  already renders.
- The collection picker now carries each collection's saved views under
  its containment node; choosing a collection inserts its live default
  view and choosing a saved view inserts that lens. View fences mount
  the live `ViewEmbed` inside the editor with a 1rem block frame, so
  adjacent collections keep the document's block rhythm.
- The image entry opens an upload-or-address dialog and inserts the
  engine image node. Link insertion keeps the captured selection.
- Validation: `server/features/pages` + framework manifest green;
  `components/generated` and `workers/documents` focused suites green;
  Playwright probe drives `@`, chip selection/deletion, collection view
  insertion, image insertion, and the class page.
- Slash hand-offs defer their overlay to the next task: the selecting
  click otherwise reaches the newly bound outside-click listener and
  closes the link and instance popovers immediately. Enter on an empty
  top-level paragraph keeps the caret inside it, so the page editor folds
  sequential blank lines like the inline blocks. Playwright probes pinned
  both behaviors.
- Instance chips render the shared `InstanceInlineRef` inside the editor,
  so they carry the chat chip face, peek, and record popup. Multiple
  chips keep a separating space; the first Backspace selects the chip
  even when the caret sits after that space.
- Page content mounts only after its document load resolves: opening a
  saved page after reload no longer starts the editor on an empty draft.
- The File entry accepts any upload or address and renders the shared
  `FileChip`; the read composition mounts the same chip from `#file:`
  links, carrying the label only in the chip. The engine reset no longer
  strips chip padding, so editor chips match chat.
- Writable record documents mount the engine in every text block; the
  read/edit renderer split is gone for writers. Focus restores through
  the ProseMirror view, so adding a chip or opening a block keeps the
  caret where the author put it.

### Agent Notes (2026-11-08, file chip glyphs)

- File chips render the file-type glyph family (mime or extension
  derived), and generated-family icons drop their standalone scale
  inside chips, so file and instance chip icons share one em box.
- Inline instance/file chips follow the inline-code layout in the UI
  font: `0.875em` text, `0.5em` horizontal padding with zero vertical
  padding, small surface radius, baseline alignment, and a line height
  of one; an unresolved instance reference wears the same face.

### Agent Notes (2026-11-08, agent/trailing-block-20261108)

- The trailing line renders only while no block editor holds focus:
  `OverlayTextBlock` reports focus through the overlay session's
  `activeBlockId`, and the trailing line hides while a block editor is
  active. Backspace in its empty line reopens the document's last text
  block through `resumeLastTextBlock`, and the resumed block focuses at
  its end.
- Arrow keys at a text block's visual edge continue in the adjacent text
  block through `moveCaret`; caret start/end travels with the focus
  hand-off, and non-editing sections between text blocks are skipped.
- Focused: `useRecordOverlay` spec green; `docs:validate` and `check-arch`
  green.

## Deslopification program (owner direction 2026-10-23)

Baseline: full-repo audit of 2026-10-24 (nine area reports, three
independent review passes; evidence is inlined below — the reports were
ephemeral). System law: [SPEC §23](./SPEC.md). Per-folder
deltas live in the folders' own TODO.md; this file carries the
repository-level cuts, the root documentation, and the guards.

Status legend per AGENTS.md: tasks move to WAITING for owner verification,
archived only on the owner's word.

### Repository shape (SPEC §23.1)

- [x] Remove `constants/` + `components/UserForm.vue` — the only import of
  `constants/` is `UserForm.vue:36` (`USER_ROLES`, a hardcoded legacy role
  set); `<UserForm` template usage: 0 matches repo-wide.
- [x] Remove `assets/rive/perigram-mark/` + `public/rive/` — `rive`,
  `perigram-mark`, `\.riv` search over all app code: 0 references;
  package.json carries no rive dependency. Drop the Documentation Map row
  in the same cut.
- [x] Remove the retired Swarm/Hetzner deploy plane:
  `.github/workflows/publish.yml` (builds absent `workers/fileprocessing`),
  `docker-stack.yml`, `docker-stack-external.yml`,
  `docker-stack-workers-only.yml`, `build-images.sh` (referenced only by
  `workers/README.md:30` — fix in the same cut), `start-dev.sh`, and the
  four legacy files `deploy/README.md` itself declares retired.
  `deploy/seed.Dockerfile` and the Forgejo workflow stay.

### Root documentation

- [x] `README.md` Development section: keep the durable operational
  contracts — PWA/service-worker laws, dev-stack filesystem runbook,
  WORKER_TOKEN, theme-token restart law, server-side `xlsx` ESM import
  law, `#packages` alias law — and cut the one-off history: the
  CutKit→Perigram rename runbook, the cutkit-network saga, the
  "/_nuxt/ was once excluded" parenthetical, and the agent-worktree
  watcher narration (root audit classification).
- [x] `README.md` Documentation Map: register the orphaned top-level
  READMEs (components, composables, stores, shared, utils, layouts,
  middleware, i18n, assets, packages, test-data, test-tools, k8s) — every
  one missing from the map at audit — plus this program.
- [x] `SPEC.md`: number the section headings; sweep the 36
  "SPEC §N" citations across READMEs to the new numbers (decided
  2026-10-25).
  Landed 2026-10-25: 23 `##` + 10 `###` headings numbered (§4 UI holds
  the §Files artifact-death sentence; Deslopification last as §23);
  citation map — §UI→§4, §Now playing→§11, §Server→§13, §Vocabulary→§14,
  §Process runtime→§19, §Plugin marketplace→§20, §Exports→§21,
  §Generative UI→§22, §Deslopification→§23(.1), §Agent access→§3,
  §Files→§4.

### Guards

- [x] `scripts/check-docs.js`: add `workers` to SOURCE_ROOTS
  (contract-shaped comments there are unscannable); make `resolveTarget`
  fail links resolving above the repository root (`video/README.md` passed
  the guard with 5 such broken links); add orphaned-README detection (a
  README no parent map registers).
  Landed 2026-10-25 (655938b35): `workers` in SOURCE_ROOTS; the link
  pass fails `..` resolutions; `findOrphanedReadmes` flags unlinked
  READMEs.
- [x] `scripts/check-arch.js`: delete the dead `descriptorRefFields`
  function (never called; its comment claims enforcement), the empty
  `PACK_OWNED_FEATURES` map with its dead branch, and the four phantom
  capability names (server/features audit).
  Landed 2026-10-25 (655938b35): `descriptorRefFields`,
  `PACK_OWNED_FEATURES`, and the four phantom names deleted.
- [x] `scripts/framework-inspect.js`: `mcp-smoke` probes the deleted
  `queue` type — repoint to a live declared type.
  Landed 2026-10-25 (655938b35): `mcp-smoke` probes `user`.

### E2E

- [x] Fix `home-default-screen`, delete `home-and-instance-ui` (decided
  2026-10-25) — both listed under e2e/README "Known-stale remainder";
  `home-calls` is live (its selectors were verified at review) and stays.
- [x] `home-default-screen` re-verified stale 2026-10-24: the spec asserts
  `/screens/home` URLs while `/home` is the live route — review-3 checked
  line 18 only; the rewrite spans the whole spec.

### Area documentation deltas (folders without their own TODO)

- [x] `scripts/README.md`: drop the dead duplicate-key check claim (the
  check does not exist), correct the framework-inspect contract line,
  move the four server/scripts file summaries to
  [server/scripts/README.md](./server/scripts/README.md) (their canonical
  home, per the server/core delta).
- [x] `deploy/README.md`: document `seed.Dockerfile` (the one live
  artifact deploy.yml builds), reconcile `cutkit-` container names with
  the `perigram-autodeploy` naming.
- [x] `deploy/deploy.yml`: move the inline LIVEKIT and garage S3 keys to
  Forgejo secrets; `deploy/README.md` states the sourcing (decided
  2026-10-25).
  Owner action: set `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `GARAGE_ACCESS_KEY`, `GARAGE_SECRET_KEY` as Forgejo repository secrets
  before the next staging deploy (the values left the workflow file).
- [x] `k8s/README.md`: rewrite in English; `deploy/` owns deployables,
  `k8s/` owns cluster state (decided 2026-10-25).

### Owner decisions wanted

- [x] `video/`: remove with git history as the archive, or move the
  renderer to its own repository first?
  decided 2026-10-25: move to its own repository — local repo created at
  ~/Projects/perigram-video; owner pushes to a remote.
- [x] `deploy/README` says "no credentials" while `deploy/deploy.yml`
  carries inline LIVEKIT and garage S3 keys — move to Forgejo secrets, or
  bless the inline lab keys and fix the sentence?
  decided 2026-10-25: move to Forgejo secrets; README states it.
- [x] Root SPEC numbering: number sections (36 "SPEC §N" citations start
  resolving) or rewrite the citations to section names?
  decided 2026-10-25: number sections; sweep the 36 citations.
- [x] Artifact-family cutover: SPEC §4 retires `artifact` when
  chat/proof/capture/upload move to file instances; support chat still
  rides artifacts (`support/service.js:2,40`). Schedule the cutover or
  record the cluster as the live file path
  ([server/features/TODO.md](./server/features/TODO.md)).
  decided 2026-10-25: schedule — the task section below owns the cutover.
- [x] `k8s/README` is Russian and overlaps `deploy/` on the hera
  production environment: which folder owns that contract canonically?
  decided 2026-10-25: English rewrite; deploy owns deployables, k8s owns
  cluster state.
- [ ] WAITING — owner verification: `test-data/factories.js` CNC-set
  confirmation: zero references to any deleted `createMock*` name
  repo-wide (31 deleted names across the file's git history vs the
  surviving set); the three live consumers use surviving exports only —
  ui-lab (`createMockHistory`, `MOCK_IDS.organizationId`), the
  design-system spec and util (`factories[entry.factoryName]` over the
  5-name manifest in `utils/design-system-contract.js`). The audit-era
  nine became seven at the artifact-family cutover; the README table
  matches the file. Dead residue deleted in the same cut:
  `createMockStatistics` (zero consumers) and 8 `MOCK_IDS` keys naming
  deleted factories.

  ### Agent Notes (2026-11-06)

  Session `agent/factories-cnc-confirm-20261106` (worktree
  `.agent-worktrees/factories-cnc-confirm-20261106`). Search surface:
  every `export function createMock*` that ever existed in
  `test-data/factories.js` (`git log --all -p`) minus the survivors,
  grepped repo-wide including docs and `.codex` — 0 hits. Dynamic
  dispatch checked at its one seam: the `factoryName` strings in
  `DESIGN_SYSTEM_ENTITY_CONTRACTS` (5 names, all resolve).
- [x] Registry naming: `getAppRegistry` vs `getPerigramRegistry` — ten
  core files import the legacy name
  ([server/core/TODO.md](./server/core/TODO.md)).
  decided 2026-10-25: `getAppRegistry` everywhere, direct imports,
  perigram-registry.js shim deleted — work item in server/core/TODO.md.
- [x] Event tier: register `frameworkEventDefinitions` into the framework
  domain or delete the emission and validation tier
  ([server/core/TODO.md](./server/core/TODO.md)).
  decided 2026-10-25: register into `defineDomain` + define the
  `convertArtifact` command — work item in server/core/TODO.md.

- [ ] WAITING — owner verification: read root README Development +
  Documentation Map and the five area READMEs (e2e, test-data, test-tools,
  scripts, deploy); guards, the video/ removal, and the repository-shape
  cuts landed (655938b35); the test-data decision, the
  artifact-family cutover, and the exhaustive code audit stay open;
  k8s/README rewritten (deploy owns deployables, k8s owns
  cluster state); root SPEC sections numbered §1–§23 with the citation
  sweep landed.

### Agent Notes (2026-10-25)

Session `agent/deslop-execute-20261025` (worktree
`.agent-worktrees/deslop-execute-20261025`). Executed: `constants/` +
`components/UserForm.vue` deleted; rive assets deleted (doc-map row
dropped); the Swarm/Hetzner deploy plane deleted (publish.yml, three
stack files, build-images.sh, start-dev.sh, four deploy/ legacy files —
deploy/README now states the surviving set); `.forgejo/workflows/deploy.yml`
LIVEKIT + garage keys moved to Forgejo secrets (README documents the four
required secrets — owner must set them on the Forgejo repo before the next
staging push); k8s/README rewritten in English with the deploy/k8s scope;
`home-default-screen` rewritten to `/home` + system-screen route
replacement, `home-and-instance-ui.spec.js` deleted with its coverage row
and the Known-stale paragraph.

### Agent Notes (2026-10-24)

Session `agent/doc-deslop-exec-20261024` (worktree
`.agent-worktrees/doc-deslop-exec-20261024`). Root documentation: README
Development section deslop'd — durable operational contracts kept,
one-off history cut; Documentation Map completed with the orphaned
top-level READMEs (landed earlier in the program commit). Area deltas:
e2e, test-data, test-tools, scripts, deploy READMEs executed; the four
server/scripts summaries moved to server/scripts/README.md. E2E:
`home-default-screen` re-verified stale (spec asserts `/screens/home`
URLs, `/home` is the live route, review-3 checked line 18 only);
`home-calls` verified live and delisted. OPEN: repository shape cuts,
guards, E2E rewrites, SPEC numbering, 8 owner decisions.

## Exhaustive first-party code audit (owner direction 2026-10-25)

Status: superseded as an execution plan by [Architecture simplification, SPEC §30](./SPEC.md). The open unbounded line-by-line sweep is not the active sequence; any historical finding must be re-verified against the current tree before action.

Scope: every first-party line read once — one deep pass per component
folder (~30 folders, ~177k lines; vendored bundles excluded). The
measured floor: 1.3–2.3% token duplication on the core planes, ~3k
proven cuts already executed. Findings must beat the tool floor.

- [ ] Per folder, read every module end to end and file findings in that
  folder's TODO with file:line evidence and the search that proves them.
  Categories: dead exports and unreachable branches (reachability
  search), duplication (token, near-miss, Vue-template),
  speculative abstraction, over-engineering, contract-shaped comments,
  synthesized wire fields.
- [ ] Items with conclusive reachability evidence and zero decision
  hooks execute in the same session (specs and docs die with code);
  everything else lands unchecked.
- [ ] Validation: guards and the touched areas' suites green on the
  session branch.
- [ ] Report: per-folder conformance table, findings by category, lines
  cut vs filed.

Session mechanics: parallel area waves with review agents re-verifying
every DEAD/DUPLICATE claim (the 2026-10-24 pattern); escalation and
status rules per AGENTS.md.

## Artifact-family cutover to file instances

- [x] Retire the artifact family: the `artifacts`, `artifact-templates`,
  `artifact-conversions` features, the artifact entity UI, and their
  routes/specs. `artifact` is legacy vocabulary and dies. What chat
  operates on after the cutover is the implementing agent's decision;
  CTS types with payload traits and the upload creation protocol are
  the seams. User-plane UX must not degrade.
  Landed 2026-10-25 (session `agent/artifact-cutover-20261025-1655`,
  worktree `.agent-worktrees/cutover`): the three features, their API
  routes, ArtifactCard/ArtifactTemplateCard, the ArtifactViewer
  artifact-entity branch (the component lives on as
  `components/shared/FilePayloadViewer.vue`, both mounts pass `source`
  only), `shared/attachment-kinds.js`, `utils/artifact-ui.js`, and
  `utils/artifact-viewer.js` deleted with their specs; the `artifact`
  framework type left `packages/cts/src/pack/framework.js`;
  `generateAttachment` moved to
  `server/features/plugins/operations.js` (binding-resolved export into
  the `files` bucket, write-gated on the source instance, result
  carries the file reference — the artifact record and template/value
  inputs died); the `convertArtifact` command, its REST route, and the
  listing `attachmentKinds`/`conversions` grammar (SDK parser, schema,
  install/upgrade gates) deleted; facade listing v18 drops the
  conversion service, renames the export kind `LAYOUT_DXF` → `dxf`,
  and `generateSheetDxf` reads the §3 values shape (`fields`); chat
  creator-only sources generalize to any payload-protocol creator type
  (support/service.js); stored data migrates through
  `server/scripts/migrate-artifact-family-retirement.js`.
  Validation: unit suites green (2096 tests; three pre-existing
  failures at HEAD: ui-mapping-random, agent-tooling-loop activation
  gate, invitations string-org ids), check-arch green, SSR smoke green,
  manifest regenerated. check-docs carries three filed links (below).

- [ ] WAITING — owner verification: UX parity on the live stack (chat
  attachments incl. instance-chat materialization, camera capture,
  uploads, sheet-design DXF export) and the post-merge e2e run
  (`e2e/chat-file-upload.spec.js`, `e2e/process-generated-screen.spec.js`,
  `e2e/order-process.spec.js`, `e2e/cassette-designer-3d.spec.js`,
  `e2e/definitions-pane.spec.js`, `e2e/invitation-page.spec.js`).

#### Agent Notes (2026-10-25, e2e repair session `agent/e2e-repair-20261025-1908`)

Ran the WAITING post-merge e2e list from the `e2efix` worktree against
the live stack. Findings and repairs:

- `753568f99` (default-plugins mechanism deleted) broke every spec that
  reads pack/plugin types without installing them — the failures
  surfaced as 404 `no instance service` / activation `unknown type`,
  silently, for 8 days. Fixed by porting the `installPlugins` /
  `connectPlugin` fixture helpers into `e2e/fixtures.js` (idempotent)
  and installing explicitly per spec: process-generated-screen,
  cassette-designer-3d, cassette-designer-parameters, home-calls,
  home-workspace-restore, md-editor-repair, order-process,
  process-designer-boot/getfield/placement, cassette-profile-editor.
  The install contract is now stated in `e2e/README.md` (Coverage).
- `e2e/chat-file-upload.spec.js` root cause: the §3 wire flattening
  (`51f1504af`, 2026-10-11) missed the support feature's materialization
  consumer — `materializeInstanceAttachments` still wrote the retired
  `identity: { name }` draft shape and read `created?.identity?.name`,
  so every materialized chat file child was created unnamed (verified
  live: ref snapshot `name: null`). The chip read "Unnamed", the spec's
  click landed on the inbox preview, and the record popup assertion
  timed out. Fixed to speak the §3 wire (`name`; support unit spec
  updated). The spec's retired `attachments.primary` read was updated
  to `payload` (instances README: the wire DTO is the stored §3
  document verbatim). The e2e goes green once the fix reaches the
  served checkout — the dev stack mounts the primary, which this
  session must not modify.
- `e2e/order-process.spec.js` was broken at import since the
  tech-drawing pack retirement (`fd9473d0c`) — it still imported the
  deleted `packages/tech-drawing`. Also fixed: the pairs join read the
  retired `identity.name` right key (now the wire `name` slot; the
  template cassette is named through the rename-channel PATCH —
  editor-protocol creates prompt no rows), and the designs' assertions
  moved to row-derived bounds + §3 provenance sources: the graph-wired
  construct Name input is retired law (`rewriteRetiredWirePaths` drops
  `data:name` edges into constructs), so baked designs are unnamed by
  design and carry their template ref in `provenance.sources`.
- `e2e/md-fresh-org.spec.js` deleted: its premise (a brand-new org's
  manifest carries the pack's starter screen) is unreachable through
  the public API since `753568f99` — starter constructs compose only
  when the initial process is created after the plugin install, and
  installs no longer happen at org creation. SPEC §Documents' "visible
  by default" owner direction (2026-10-14) predates that deletion and
  needs an owner reconciliation; `server/scripts/station-documents-types.js`
  remains the repair path for existing orgs. The editor round-trip it
  also covered is duplicated by `md-editor-repair.spec.js`.
- Spec-drift repairs against current contracts: process-generated-screen's
  inline edit drives the per-field pencil (record edit mode retired
  `3d784ce8f`); generated-state-surface seeds positioned canvas nodes
  (save-time graph integrity floor `c19295055`) and expects the
  attributed-rename audit step; md-editor-repair's dialogs fill the
  prompted identifier row and open the csv editor through the `Edit`
  action; cassette-designer-parameters' fold-edge test dismisses the
  profile picker and draws a rectangle (the Closed shape tool is gone).
- LiveKit 502 tolerance in `e2e/fixtures.js`: the dev stack's env points
  the media plane at the owner's remote deployment whose credentials
  currently 401 (ListRooms), so `/api/livekit/active-rooms` serves 502
  by design (livekit README) and every sidebar-loading spec's
  `expectCleanRuntime` failed suite-wide. The fixture tolerates exactly
  that route's 502. Fix the stale credentials (or recreate the app
  container with local dev keys) and the tolerance stays harmless.

- Owner edits wanted (SPEC law links dead with the family; SPEC files
  are agent-untouchable):
  - `components/SPEC.md:86` links the deleted `./artifacts/README.md`
    (L14 prose names the folder beside it) — drop the row and the word.
  - `shared/SPEC.md:99` lists the deleted `attachment-kinds.js` as a
    support contract — drop the line (payload traits own the
    vocabulary, per CTS SPEC §4).
  - SPEC §20's delivered-state paragraph (2026-10-10) names listing
    `attachmentKinds` and `conversions` as delivered grammar; this
    cutover retired both keys (payload traits are the upload contract,
    conversions died with the artifact family). Reconcile §20 when
    convenient.
  - `server/core/effects/service.js` keeps the `artifact` effect type
    (named in `server/core/SPEC.md`); post-cutover it has zero
    emitters — delete the branch with a SPEC touch, or keep.
  - `server/features/support/SPEC.md:73` still names `artifact` beside
    `user` as concrete option loaders; the loader set is `user` only.
  - `workers/nesting/README.md` links a missing `./jagua-rs/README.md`
    — pre-existing at HEAD, unrelated to this cut.

Session reads before any code: AGENTS.md; [SPEC](./SPEC.md) §4 (Files),
§13 (Server), §20 (Plugin marketplace — attachments/exports as
declarations); [CTS SPEC](./packages/cts/SPEC.md) §4–§5 (declarations,
payload traits); [instances](./server/features/instances/README.md),
[support](./server/features/support/README.md) (today's attachment
flows), [entities](./components/entities/README.md).

Acceptance: support chat attachments, proof, capture, and upload flows
operate on declared file types end to end; the retiring set above
deletes in the same cut with its specs and docs; the plugins/artifacts
seams that survive (generateAttachment, attachment kinds) either ride
the declared vocabulary or carry a filed migration item; guards green
(framework suites, check-arch, check-docs, SSR smoke) and e2e green
against a running stack; owner verifies UX parity on the live stack.

### Agent Notes (2026-10-25)

Session `agent/artifact-cutover-20261025-1655` (worktree
`.agent-worktrees/cutover`). Design: chat attachments keep their two
declared paths (common/party chats store plain GridFS descriptors in
the `files` bucket; instance chats materialize each file as the
accepting declared child type through the upload creation protocol —
both pre-existing and untouched); the chat create-and-attach affordance
generalized from the artifact special-case to every payload-protocol
creator type; proof attachments were already plain lifecycle refs and
needed nothing. Exports: `generateAttachment` survives under its SPEC
§21 name with plugin-owned internals — no artifact record, file lands
in the `files` bucket, command result carries
`{ kind, fileId, name, mimeType }`; the derived export surface's
duplicate write-gate collapsed into the handler (one gate home).
Attachment-kind vocabulary: `domain.attachmentKinds` (the payload-trait
projection keyed by type id) is the surviving table; the framework kind
list and listing-level kind declarations died. The two components/TODO
cutover-owned boxes closed (ArtifactViewer branch, artifact_template
UI). Framework manifest regenerated. Remaining artifact-family strings
in code: the SPEC files above (filed), `server/core/effects`'s
`artifact` effect branch (filed), the migration script, and English
"artifact" in e2e test-output comments.

### Agent Notes (2026-10-25, cutover review)

Review pass on the branch: unit suite base→branch is 4 failed/2131
passed at 713aa2396 → 3 failed/2096 passed (the fourth,
shared/process-designer-localization, fixed by the cutover — mechanism
in shared/TODO.md); no new failures. Baseline finding for this ledger:
test-data/ui-mapping-random.spec.js "produce instance values that
conform to their descriptors (CTS checkValue)" fails pre-existing at
713aa2396. Review fixes on the branch: e2e invitation-page
`waitForLoadState` typo, `artifact` in the check-arch entity-name
allowlist, `queue.confirmDeleteRun` artifact copy (en+ru), a `LAYOUT_DXF`
enum string in the processes availability spec, and the core README
AttachmentKind row.

## File-template fill flows (SPEC §24)

- [ ] WAITING — owner verification: platform seam — a service-backed
  construction executor may return `payload: { base64, mime, name? }`
  beside its `data` fields; the platform stores the bytes in the `files`
  bucket and the created instance carries them as its payload
  (trait-validated; a refusal deletes the blob; an executor payload
  overrides the draft's uploaded one).

  ### Agent Notes (2026-10-25)

  Seam implemented in `server/features/instances/construction-services.js`
  (`payloadFromWire` reused as the single trait validator, exported from
  `service.js`); focused spec `construction-services.spec.js`. Contract
  homes updated: instances README §Service-backed construction, plugin-sdk
  README listing contract (`constructions`).

- [ ] WAITING — owner verification: agent tooling for fill flows —
  `list_actions` rows carry their input contracts (construction mode and
  inputs, inputPolicy fields, run inputs; one row via `actionId`),
  `get_instance` rows carry the file payload reference, and
  `read_instance_file {type, id}` reads any readable file instance's
  payload through the attachment extraction families on both surfaces
  (chat and MCP).

  ### Agent Notes (2026-10-25)

  Implemented in `server/features/agent-bots/tools.js` (tool table row,
  manifest paragraph, read_instance_file paragraph in the agent-bots
  README); focused cases in `tools.spec.js` (payload-ref row, instance
  payload read on both surfaces, payload-less/blob-gone refusals,
  contract projection and single-action read).

  ### Agent Notes (2026-10-25, probe session)

  E2E probe `e2e/agent-mcp-template-fill.mjs` (API-only, node against
  E2E_BASE_URL): composes a fill definition through the MCP tools,
  activates, runs the compiled `content` action, reads the filled
  markdown back through `read_instance_file`. Bare
  `create_process_definition` (name only) now seeds the empty v4 draft;
  the seed's home is `emptyAuthoredDocument` in
  `packages/processes/src/authoring.js`.

- [ ] WAITING — owner verification: documents fills — `plugin.documents.fill`
  (markdown `{key}` substitution; xlsx `{key}` cells plus `{#key}`/`{/key}`
  repeated row sections; PDF template token masking/redraw) and
  `plugin.documents.render-pdf` (markdown/xlsx/csv/image/dxf → PDF) bound
  as `fill` constructions on `text-document`/`xlsx-workbook`/`pdf-document`
  and a `render` construction on `pdf-document`; documents requires
  tech-drawing for the `dxf-source` render source.

  ### Agent Notes (2026-10-26)

  `workers/documents/fill.js` (engines, PT Sans OFL fonts embedded via
  `@pdf-lib/fontkit`), service dispatch in `workers/documents/services.js`,
  listing v2 (services, constructions, requires). Token law and traps in
  the plugin README `## Template fills`. Focused spec
  `workers/documents/fill.spec.js` (19 cases).

  ### Agent Notes (2026-10-27, ledger repair)

  This box was deleted by the 2026-10-26 12:30 SPEC-restore session, which
  rewrote the section to its pre-landing shape; the template editors
  program then re-listed the landed engines as open steps. Restored; the
  program's stale steps (documents fill engines, PDF render engine, PDF
  template flow, per-kind field whitelist) close below or fold here.

- [ ] WAITING — owner verification: render-mode rename — the cassette-design
  construct renames `bake` → `render` (SPEC §24 two-mode law; facade v20);
  the engine and endpoint keep the bake id, the place-dxf precedent.

  ### Agent Notes (2026-10-27)

  Listing v20 (operator + constructions binding), Org1 seed authoring
  (`test-data/order-process-authoring.js` mode `render`). Authored
  definitions in other orgs carrying `mode: 'bake'` re-author or upgrade —
  the place→fill rename accepted the same exposure.

- [ ] WAITING — owner verification: sheet-design parts maintenance — editor
  saves commit the typed `parts` relation beside the geometry (SPEC §24
  app-canon law).

  ### Agent Notes (2026-10-27)

  `recomputeSheetLayout` returns `parts` (one flat ref per placement,
  `cassettePartsList` single-homed in `surfaces/lib/sheetLayout.js`,
  consumed by both the editor save and the `construct-sheet` executor
  path); the editor patches `{ geometry, parts }`. The stale
  `cassetteDesigns` local naming in the recompute died with it.

- [x] DXF spot placement engine (template DXF + referenced DXF payloads →
  composed DXF) — `place-dxf` in the tech-drawing executor; the facade
  nesting → construct-sheet → export flow is the reference geometry path.
  Landed bound to a bespoke `place` construct; superceded by the
  unification below (listing v3 renames the construct onto `fill`, the
  engine and its endpoint stay `place-dxf`).
- [x] Fill-mode unification (SPEC §24): the template construct is `fill`
  everywhere. Rename tech-drawing's construct onto it (listing v3), migrate
  authored `place` constructs with their definitions, and land documents'
  xlsx/md engines on the same mode beside the future PDF engine. Docs:
  tech-drawing README, plugin-sdk listing contract.
  Landed 2026-10-27 (session `agent/fill-mode-20261027`): tech-drawing v3
  renamed onto `fill` (engine and endpoint stay `place-dxf`), projection
  fixture and the create-dialog e2e migrated, Org1 upgraded, SPEC §24
  carries the mode law. Residue: operator input labels landed with v4
  (`Template`/`Parts`) beside `descriptor.label` support in the domain
  projection. The 2026-10-27 render amendment completes the vocabulary:
  `render` for derivations (cassette bake, PDF render), `fill` for
  template fills.
- [ ] Action ids are one org-wide namespace: two active definitions sharing
  a construct node id cannot coexist, and activation refuses with a
  dangling-edge error naming the other definition's graph instead of the
  collision. Surface the collision as its own diagnostic (or
  definition-qualify action ids in the manifest).
- [ ] Template editors program (SPEC §24 engines + §20 editor law):
  every template type rides the same three pieces — an editor binding in
  the listing, a revision scope on the type, and the revisioned payload
  channel for saves and replacement. Ordered steps:

  ### Agent Notes (2026-10-29, UX review pass)

  Product/UX review of the whole template surface (fill dialogs, DXF
  marker editor, record lifecycle) against the live stack. Fixed:
  `dtoToScreenInstance` dropped `provenance`, so derived records showed
  "Replace file" (SPEC §24 replace-free law) and the construct re-run
  row never rendered — provenance now rides the screen instance, the
  re-run button carries its own `uiMapping.rederive` caption; the
  preview pane surfaces hard failures (executor down, 5xx) as the
  offender list instead of a silent blank; the fill dialog's
  reference-slot create button names the created type beside "Create"
  (three same-named "Create" buttons broke voice/SR disambiguation);
  composed files are named for the operator's typed name
  (`draft.data.name`) in both executors — they silently kept the
  template's filename; documents listing v6 labels the render `source`
  input ("Source", matching "Template"/"Values"). Verified live: fill
  dialogs (md/xlsx/pdf/dxf), spot prefill, preview, DXF editor anchor
  authoring, revisioned save. Second round (post-merge): the re-run row
  gates on provenance sources (upload/editor records are replace's
  business — a refresh button on every uploaded file was noise); the
  composed-file name and Re-derive verified against the live stack;
  `payload-revisions.spec.js` learned that `request.post` ships POST
  whatever its `method` option says (fetch carries the replace PUT),
  beside the header-teardown race tracked under Revisioned references.
  Clean findings left as-is: dialog captions
  derive from the mode vocabulary ("New X from Fill", compiler label
  law, locale-overridable); spot-assignment submit gating delegates to
  the executor's structured refusal (client-side duplication of anchor
  law would drift); canvas-click point picking in the DXF editor is
  cue-less but focuses the name field on pick.

  - [ ] WAITING — Revision scope on template types: dxf-source declares
    `revisions: "geometry"` (tech-drawing v5); the revisioned payload
    channel then serves replace-in-place — new bytes onto the same
    instance, so a re-authored template keeps its identity, its pins, and
    its history.

    ### Agent Notes (2026-10-27)

    Declared on `dxf-source` in the tech-drawing listing (v5). The channel
    itself is generic machinery (instance-revisions + the payload
    patch law); the file-detail replace affordance rides the lifecycle
    step below.
  - [ ] WAITING — owner verification: DXF editor surface, marker-first:
    editor binding for dxf-source; a surface module over the CadCraft
    browser edition homed in this plugin (the cross-plugin dependency
    serves facade's cassette designer from the same host) that opens
    the template payload on the CAD canvas, authors and renames
    `{spot:<name>}` anchors — the part-matching vocabulary, authored
    where the drawing is drawn — and saves through the revisioned
    channel; full editing grows on the same surface.

    ### Agent Notes (2026-10-28, layer law)

    Strict CAD viewers resolve each entity's layer against the LAYER
    table; tables-less templates rendered a blank canvas (console:
    `layer 'FRAME' doesn't exist`). `withLayerTable` (dxf-markers.js)
    builds the canvas copy with every referenced layer plus layer 0
    declared over the CONTINUOUS linetype — existing tables gain only
    missing records; saves keep the authored bytes. Spec grows to 10
    cases; the rails e2e fails on any layer-resolution console error.

    ### Agent Notes (2026-11-01, CadCraft canvas)

    The canvas is the CadCraft browser edition, mounted by
    `assets/vendor/cadcraft/host.mjs` through the own-scope `cadcraft`
    dependency (tech-drawing v9). `CadCraftHost` creates the same-origin
    iframe, hides its chrome, opens the layer-normalized DXF, locks the
    template's layers, and converts canvas points through
    `view.toWorld` for the marker form. Saves stay on `saveDocument`.
    The facade cassette designer consumes the same host through its
    cross-plugin dependency (facade v40); its OCCS expressions, shape
    records and CSG fold stay the model. Surface harness: 9 seeded
    entities for the default hanger, 75 overlay annotations, shape
    selection expands the row, a drawn LINE extracts as a new chain
    shape. Validation: both listings, surface smoke, check-arch,
    framework:validate, docs:validate, SSR suite.
  - [ ] Fill dialog general rails (owner direction 2026-10-28): part
    inputs pick, create through the accepted type's declared creation
    mode, and open the picked instance's editor when its type binds one;
    the dialog previews the composed result through the created type's
    payload preview over the same construction service, persisting
    nothing. Ordered steps:
    - [ ] WAITING — Anchor read single-homing: the `{spot:}` parse law
      lives in the plugin's `dxf-markers.js`; the app-side pin renderer
      reads it through the served editor surface module.
    - [ ] WAITING — Construction preview seam: a non-persisting service
      invocation (`{ mode, draft }` → `{ payload, fields, failures }`).
    - [ ] WAITING — Rich part rows: create affordances dispatch by
      creation protocol (the compiled upload create runs inline, the
      editor protocol opens the blank tab, every other compiled create
      opens the nested dialog); edit affordance rides the file-surface
      registry.
    - [ ] WAITING — Preview pane in the create dialog over the composed
      payload.
    - [ ] WAITING — One fill-dialog shell (owner direction 2026-10-28):
      the form pane and the preview pane compose side by side in one
      wide dialog for every fill type, the preview rendering through the
      created type's payload preview mode.
    - [ ] WAITING — Per-token values form (owner direction 2026-10-28):
      a `template-values` pinned values input renders one scalar input
      per template token; the composition's ephemeral `meta` channel
      names the tokens and records never store them.
    - [ ] WAITING — Bounded shell and in-place editor (owner direction
      2026-10-28): the dialog never scrolls its body — the form pane
      owns its scroll and the preview pane stays viewport-bounded — and
      the reference-row editor opens over the dialog instead of
      navigating away.

    ### Agent Notes (2026-10-28, bounded)

    Session `agent/fill-dialog-fix-20261028-2110`. The composed dialog
    rides StandardDialog `fill` (viewport-capped, content owns layout):
    the form pane scrolls itself, the preview pane stays bounded, and
    stacked (narrow) layouts scroll within the shell. The reference-row
    edit pencil renders `GeneratedEditorPageAction` with `preferDialog`
    — the surface opens full-screen over the dialog and returns to it,
    replacing the navigate-home drop-out.

    ### Agent Notes (2026-10-28, token values)

    Session `agent/template-values-20261028-2000`. The documents fills
    harvest their template's token keys (per engine, homed in fill.js)
    and answer them beside the payload through the executor `meta`
    channel; the preview passes `meta` verbatim and the create merge
    never sees it (documents listing v5 pins the values inputs
    `template-values` — re-seed the catalog for existing stacks).
    `TemplateValuesRow` renders the per-token inputs inside the shell;
    the json editor stays only for unpinned free-form maps.

    ### Agent Notes (2026-10-28, shell)

    Session `agent/fill-dialog-body-20261028-1840`. `FillDialogBody`
    widens the create dialog (lg) and splits the form pane from the
    preview pane when the created type is payload-bearing and the action
    carries a construction mode; the shell renders transparent
    otherwise. En route, two rails gaps died: operator data inputs fell
    through the row resolver (a json `values` map never rendered — the
    generic branch maps the compiled `object` kind onto the json
    editor), and the documents fill inputs lacked labels (listing v4,
    re-seed the catalog for existing stacks). The documents markdown
    fill rides the same rails as the DXF fill (`documents-fill-dialog`
    spec: the preview renders in the text mode, the composed markdown
    round-trips; artifact `.playwright/md-fill-composed.md`). Focused:
    ui-mapping 107, SSR smoke, arch + docs + framework guards; e2e —
    both fill dialogs 4/4, md-editor-repair 4/4, plugin-surface 1/1
    (one cold-rebuild stall after the merge re-ran green warm).

    ### Agent Notes (2026-10-28)

    Session `agent/dxf-editor-20261028-1525`. Landed: `spotNamesOf`
    homes in `workers/tech-drawing/dxf-markers.js`, re-exported by the
    dxf-editor surface module — `SpotPartsRow` imports the served module
    URL and `shared/dxf-spots.js` is deleted. The DXF editor picks
    anchor coordinates by canvas click (the engine's view transforms,
    six decimals) and the reset-view button wears a fit icon.
    `POST /api/instances/:type/construction-preview` (write-gated, 204
    unbound) answers `{ payload, fields }` beside the structured
    refusal; `ConstructionPreview` debounces the dialog draft into it
    and renders the payload through the created type's preview mode.
    `RefRowActions` renders beside reference rows: the compiled
    upload-mode create runs inline over the files channel (the bare
    create transport refuses construction-declaring types), the editor
    protocol opens the blank page, other compiled creates open the
    nested dialog in `GeneratedMappingScreen`, and the picked
    instance's editor opens through the served registry. Focused:
    construction-services spec 23/23 (five preview cases), module
    imports, ui-mapping 107, SSR smoke 19, arch + docs + framework
    guards green; e2e — the fill-dialog file 3/3 incl. the rails test
    (preview pane renders the composed DXF, inline upload create,
    assignment, editor click-to-place, revisioned save round-trip;
    artifacts `.playwright/rails-preview-composed.dxf`,
    `.playwright/rails-template-reauthored.dxf`), md-editor-repair 4/4,
    plugin-surface 1/1.
  - [ ] WAITING — Create-dialog refusal surfacing: a construction service
    answers `{ failures: [...] }` (each failure naming its offender) and
    the dialog renders the named offenders (SPEC §24 law).

    ### Agent Notes (2026-10-27)

    Executor seam: tech-drawing `place-dxf` and documents `fill` return
    `{ failures: [{ message, name? }] }` for offender-named refusals
    (unmatched markers, unplaced parts, unknown tokens); platform
    `applyConstructionService` refuses with the structured body; the
    create dialog renders the list. Focused specs: construction
    services, both executors' engine specs.
  - [ ] WAITING — owner verification: Template lifecycle: replacement is
    the generic file-detail affordance on every revision-scoped file type
    (new bytes through the revisioned payload channel); retirement is a
    compiled remove construct owned by the process definition that
    stations the type.

    ### Agent Notes (2026-10-28, spot assignment)

    Owner direction (2026-10-28): name-matching as the only fill path
    forced part renames — degenerate. Landed: the fill operator's parts
    input carries the `spot-parts` control pin (tech-drawing v9); the
    dialog lists the picked template's anchors and picks any part per
    anchor (`SpotPartsRow` over `shared/dxf-spots.js`), name-equal parts
    prefilled; the assignment travels as `{ id, spot }` beside the
    resolved ref and the placement engine places explicit assignments,
    falling back to name matching for bare refs (unknown-spot, double,
    and claimed-name collisions join the structured refusal). En route,
    a pre-existing broadcast defect died: the mutation runner aligned
    every input per item, so a multi-part fill invoked the construct
    once per part — typeList construction inputs now solve as one value.
    Validation: 868 tests green across the touched planes (the 5
    fact-display failures pre-exist on local); fill-dialog e2e 2/2 on
    the live stack (assignment surface + API refusal); live-verified in
    Org1 — mismatched names composed through explicit assignments
    (artifact `.playwright/org1-assigned-composed.dxf`).

    ### Agent Notes (2026-10-27, replacement half)

    `ReplacePayloadAction` renders in every record header whose type
    declares payload + revisions (SPEC §24): new bytes through the
    revisioned `PUT /api/instances/:type/:id/payload` channel — the
    record keeps identity, pins, and history. Write-gated like the editor
    action (`resolveTypeFeature` + the shared grant evaluator); accept
    list narrows to the declared MIME set when it carries no wildcards;
    saves emit the shared instance event. Retirement (the remove
    construct) stays open — the compiler already compiles `cts.remove`
    as the admin-only manual delete action; verification below.
  Landed beside the program: the per-kind field whitelist (every gesture
  value validates against the node contract table — configure refuses
  `inputDefaults`, `setInputDefault` refuses undeclared sockets,
  compile-side normalize drops stray defaults, `b6cb68051`); the
  documents engines and the PDF template flow (the WAITING box above).
  Beside the program: the pinned-entity-ref palette source and the
  action-id collision diagnostic (tracked above) are the
  definition-design pieces the program composes with.
- [ ] Revisioned references (SPEC §24 version-fabric law, owner
  direction 2026-10-27): revisions are the version fabric — every file
  versions its content, derived records pin the revision they were
  derived from, and consumers read the pin. Ordered steps:
  - [ ] WAITING — owner verification: Every file type declares a revision
    scope (payload/geometry/content); types missing one gain it in their
    listings.
  - [ ] WAITING — owner verification: Ref fields carry revision pinning:
    a stored ref either pins the source revision or follows latest;
    pinning rides the ref shape, and pickers/ref chips surface which.
  - [ ] WAITING — owner verification: Construction-time ref resolution
    stamps the resolved revision beside the stored ref on the derived
    record.
  - [ ] WAITING — owner verification: Editor saves and payload uploads
    bump the source revision; every consuming flow (fills, renders,
    nesting, exports, previews) reads the pinned revision.
  - [ ] WAITING — owner verification: Re-derive rides the compiled
    construct action (owner decision 2026-10-27): a re-run over the
    stored inputs executes against current referenced revisions and
    updates the record's pins and derived fields/payload — one mechanism
    for "re-render when the template changed", "re-fill with new values",
    "re-derive the sheet when cassettes changed".
  - [ ] Record-header teardown race: a payload restore (and at times any
    local mutation reconciling through the screen) intermittently swaps
    the detail header subtree to a data-state surface for ~150ms and
    back, destroying open popovers (the revision picker closes after a
    restore). The pool never drops the record; the swap's trigger is
    unidentified (observed live 2026-10-29, `.surface-header` leaves the
    DOM between samples with a skeleton present).
    `payload-revisions.spec.js` reopens the popover around it.

    ### Agent Notes (2026-10-27, stack round)

    The live-stack e2e round (session `agent/e2e-refusal-20261027-2310`)
    verified the fabric end to end: the cassette upload minted geometry
    revision 1 and the bake pinned it — `provenance.sources` carries
    `{ type: cassette, id, revision: revision:cassette:<id>:geometry:1 }`
    (order-process pins the exact shape). En route repairs: the
    mutation-error serializer dropped refusal bodies and the action API
    returned the failure report as a settled result, so the create dialog
    closed over silent refusals — both fixed (the serializer carries
    `data.failures`; the action run refuses with the first mutation
    failure's body); the fill-dialog e2e speaks the current upload naming
    law (records name from the payload reference's file name — the
    name-ghost session's contract, untested until this round) and gains
    the refusal leg; every documents-first spec install order now
    installs tech-drawing first (documents v2 requires it; the catalog
    re-seed surfaced the drift — the catalog had not been re-seeded since
    v1). tech-drawing-fill-dialog 2/2 and order-process green on the
    stack; md-editor-repair and process-generated-screen 14/15 green.

  ### Agent Notes (2026-10-27, revision fabric session)

  Session `agent/rev-fabric-20261027-2155` (worktree
  `.agent-worktrees/rev-fabric`). All five steps landed:

  - Scopes: documents v3 (image, pdf-document, xlsx-workbook,
    docx-document → `content`), tech-drawing v6 (svg-file → `geometry`).
    Every payload-bearing file type now declares a scope. Payload-less
    catalog types (pen-template, layer-standard, color) stay unscoped:
    their content is fields and no channel writes field revisions today.
  - Ref shape: CTS `checkValue` accepts `{ type, id, revision? }`
    (absent pin follows latest); CTS SPEC §2 carries the wire law.
  - Stamping: `applyConstructionService` resolves each ref's pin
    (`getCurrentForEntity` on the source type's scope) and stamps
    declared ref/list-of-ref fields with the pinned object plus every
    causal ref in `provenance.sources` (the source slot survives
    `provenanceFromWire`). Undeclared operator inputs (documents'
    template/values) pin in provenance only — the closed row stays
    closed.
  - Bumps: `recordPayloadRevision` is the one mint home (creation
    `created`, replace `payload-replaced`, re-derive `rederived`);
    editor saves already rode the revisioned PUT payload channel.
    Pinned reads: `resolveRefValue` reads the frozen bytes through
    `pinnedRevisionFile`; a stored pin whose revision is gone refuses.
  - Re-derive: `rederive` on the instance service rebuilds the
    stored-inputs draft (`storedConstructionDraft`: declared ref fields
    with pins, replay parameters from provenance, source pins recovered
    from provenance.sources) and patches fields/payload/provenance. The
    compiled construct action is the entry: `rerun: true` beside the
    constructed record's instanceId on the action-run transport skips
    the graph and re-derives (explicit flag — a context instance alone
    stays parent context for a fresh create). `constructRerunAction`
    derives the refresh affordance on a constructed record's detail
    header and rows; the chip lock glyph surfaces pins
    (`common.pinnedRevision`).
  - Validation: 917 tests green across cts/processes/ui-mapping/
    instances/plugins/documents/tech-drawing; both listings validate
    (`perigram-plugin validate`); check-arch, framework:validate, SSR
    smoke 16 green; check-docs reports only the pre-existing worktree
    jagua-rs link. Live-stack verification pending (the re-derive run
    and the pinned chip render on the next stack pass).

- [ ] WAITING — owner verification: Pinned-entity-ref palette source: a
  `source` node emitting one authored entityRef (the "select exact
  instance" producer), so a graph can wire a pinned record into any
  construct's ref sockets. Authored socket defaults already supply ref
  inputs today (supplied fields drop out of the create dialog); the
  palette node is the visible authoring surface for the same law.

  ### Agent Notes (2026-10-28)

  The law pre-existed: a `source.literalItem` with an `entityRef` output
  type already carries the authored pick (`seedLiteralEntityBinding`
  seeds the type, the canvas node renders the type select beside
  `TypedValueControl`'s InstanceSelect — ids are never typed by hand),
  and the construct seam consumes the wired ref object (revision pinning
  stamps it at construction, SPEC §24). The palette entry is the whole
  delta: `pinnedEntity` in the `instances` group drops the literal
  pre-typed `entityRef` (`preset.type.base`), so the author picks the
  type and the exact instance on the node. Spec pins: the designer
  palette pin and the round-trip species pin carry the item.
- [ ] WAITING — owner verification: cross-plugin vendor dependency — the
  CadCraft host homes in tech-drawing and the facade cassette designer
  consumes it through a declared `plugin:tech-drawing/…` dependency
  (SPEC §20 law above).

  ### Agent Notes (2026-11-01)

  `workers/tech-drawing/assets/vendor/cadcraft/host.mjs` is served by
  the tech-drawing executor; facade listing declares
  `{ name: 'cadcraft', module: 'plugin:tech-drawing/assets/vendor/cadcraft/host.mjs' }`
  and the sketch editor imports the bare `cadcraft`. Mechanism:
  `parseListing` admits `plugin:<id><path>` modules when `<id>` is in
  `requires`; the module proxy rewrites the bare import to the required
  plugin's proxied scope; the surface check exempts cross-plugin modules
  from the own-root existence rule. Focused specs: sdk (validation),
  plugins (proxy rewrite).
- [ ] WAITING — owner verification: native profile annotations — the
  profile canvas's dimensions, face hatch and outline, zero axis and
  origin ride CadCraft entities on derived layers (locked decorations,
  editable dimensions); a dimension label opens its authored field in
  place; the edition's chrome, hint card and first-run tour stay out of
  every embedded surface.

  ### Agent Notes (2026-11-01, native annotations)

  `surfaces/lib/profileAnnotations.js` builds the native entities from
  one evaluated sketch and the folded face; `sketchEditor.mjs` swaps the
  derived layers through `CadCraftHost.annotate` on every model or face
  change, opens a primitive dimension's field through
  `CadCraftHost.pick`, and selects shapes through the engine's own
  selection. The host suppresses the edition's first-run tour/hint card
  and hides every child except the stage and the toggled command line;
  `zoomFit` can hold a layer out of the extents calculation so derived
  annotation geometry never changes the fitted window. Validation:
  profile-editor e2e (native dims, in-place binding, save/reopen).

## Generative UI arrangement foundations (owner direction 2026-10-25)

Law: [SPEC](./SPEC.md) §22.7 records the direction; the design — trait
records, decision procedure, placement slots — is
[shared/ui-mapping/SPEC.md](./shared/ui-mapping/SPEC.md). Engine home
`shared/ui-mapping`, materialization `components/ui-mapping`.

- [x] Data-trait record on every composed region node (SPEC → Data
  traits): `weight` (exists, `estimateRegionWeight`), `breadth`, `volume`,
  `shape`, `filledness` (inert empties exist), `growth` — one compose-time
  pure record in the region tree.
  Landed 2026-10-25: `regionDataTraits`/`shapeFamilyOf` in shared/ui-mapping;
  `composeScreen` nodes carry `dataTraits` (the top-level `weight` field
  folded into it); random-world spec pins the domains over every composed
  node.
- [x] Container-trait seam at the materialization layer (SPEC → Container
  traits): width steps, height boundedness, scroll ownership, density per
  host (page, pane, dialog, popup, mobile tab), measured box over host
  profile; the sanctioned scoped-CSS container homes, `ResponsiveGrid`
  container queries, and measured track engagement materialize the one
  step vocabulary.
  Landed 2026-10-25: `CONTAINER_WIDTH_STEPS` (medium 40 / wide 60 — the
  form grid and record split materialize them) + `HOST_PROFILES` in
  tables.js, pure `resolveContainerTraits`, app seam
  `composables/useContainerTraits.js`; the peer-column engagement in
  RegionChildren measures through it. Height/scroll resolve in the record;
  their materializations are the existing host structures (pane/dialog
  scroll columns).
- [x] The arrangement decision procedure (SPEC → Arrangement decision
  procedure) as ordered total rules over data × container traits, outcomes
  carried per width step so one composed tree serves every host.
  Landed 2026-10-25: `arrangeChildren` rewritten by ordered rule with the
  full-row claim (breadth-`full` siblings claim rows, `fullRow` on the
  columns outcome; full rows stay out of the side rail); the stack
  fallback beside columns carries per-step engagement (CSS container
  steps + the seam's measured grant).
- [x] Placement-aware composition (SPEC → Placement-aware composition):
  slot-picked presentations; nested class refs render as instance chips
  everywhere (`InstanceInlineRef`).
  Landed 2026-10-25: the stub slot renders one compact line (icon, label,
  count, its own create action — RegionBlock `stub` prop, loading/denied/
  error keep RegionDataState); ref fields, relation chips, and table
  relation cells already chip; ObjectSummary instance-ref subfields now
  chip too (FieldControl).
- [x] Pin audit (SPEC → Pins): layout thresholds named in the one
  budget/layout table; type-keyed layout branches, component-local magic
  numbers, and private breakpoints in app code deleted or pinned through
  the declared seams.
  Landed 2026-10-25: `TABLE_VIRTUAL_SCROLL_REM` replaces the table's
  hardcoded 26rem; `LAYOUT.previewBand` replaces five PreviewBox band
  literals; the scoped-CSS homes carry the step materializations
  (60rem = the wide step) with one-fact comments; no type-keyed layout
  branches found (the create-label collapse is the action contract, not
  layout).

Session reads before any code:
[shared/ui-mapping/SPEC.md](./shared/ui-mapping/SPEC.md),
[shared/ui-mapping](./shared/ui-mapping/README.md),
[components/ui-mapping](./components/ui-mapping/README.md),
[assets/tokens](./assets/tokens/README.md), SPEC §22.

### Agent Notes (2026-10-25)

Session `agent/genui-traits-impl-20261025-1752` (worktree
`.agent-worktrees/genui-traits-impl`). All five program items landed;
specs: ui-mapping (91), screen (15), test-data (128 total incl. the new
totality walk), design-system (33), SSR smoke (14) green. Found and fixed
en route: the random-world generator rolled fractional currency values
against the CTS minor-unit law (SPEC §18) — currency quantities now roll
integers; the failure was pre-existing at base on
`test-data/ui-mapping-random.spec.js`. Behavior notes for owner review:
two light table children of a record now stack full-width under the body
(the full-row claim) instead of sharing squeezed columns; inert children
render the compact stub line instead of an empty-state Message.

- [ ] WAITING — owner verification: the five landed items above; check a
  generated detail with mixed children (a table child beside light peers)
  and the stub strip on the live stack.

### Agent Notes (2026-10-25, visible round)

Session `agent/genui-visible-20261025-1812` (worktree
`.agent-worktrees/genui-visible`). The consumer round the foundations
unlock: hosts declare container profiles through the seam
(`provideContainerTraits` — the pane measures its scroll column, EntityPopup
provides the popup profile; `useHostContainerTraits` resolves the host
record, page profile as the providerless default); budgets consume the
width step (compact table columns in narrow/medium hosts —
CollectionTable; compact card facts in narrow hosts — CardGrid,
BoardCollection); screen top-level sections arrange through the one ladder
(`regionsArrangement` = `arrangeChildren`, materialized by RegionChildren
with a `regionProps`/`regionEvents` passthrough; `regionsMode`/
`childrenModeFor` retired with their consumers migrated in the same cut).
Full-row refinement: full-breadth children within the column cap stack,
past it the set tabs (the page-height bound). SPEC addendum in
shared/ui-mapping/SPEC.md (host declaration law, budget law, screen-level
ladder rule). Specs: 160 unit/fixture/random + 14 SSR green; design-system
guard green.

- [ ] WAITING — owner verification (visible round): a typeList screen with
  several sections in a wide pane vs a narrow one (columns engage/shed);
  a table inside a pane or the record popup (compact columns); the record
  popup's card facts.

### Agent Notes (2026-10-25, everyday-page round)

Session `agent/genui-look-20261025-1945` (worktree `.agent-worktrees/genui-look`).
The everyday record page finally moves: SPEC §22.2 fill amendment (content
width is the floor, the host grants growth); `ck-facts-grid` fills in
tracking columns; `ck-body-grid` blocks grow into spare row width; the
record preview renders in the stepped hero band (7/11/14rem by container
step, `LAYOUT.previewHero` + `PreviewBox fill`) instead of the fixed
stamp. The ladder provably engages: the random world's guarantees are
structural now — projection floors (gantt/calendar/board types), two peer
hosts with claimed columnable and heavy peers, the empty type reserved
before claiming and spared by the state matrix; the column-engagement pin
holds across all seeds (previously zero engagements anywhere — the
moderate host's guaranteed table peers were full-breadth by law, so
columns were dead code). En route: several order-dependent generator bugs
fixed (host discovery order, empty-type fallback claiming a peer,
lineage stamps landing under the wrong host). Specs: 129 unit/random +
14 SSR green (board/gantt/calendar/columns/facts-grid/body-grid asserted
in rendered markup); design-system + localization green.

- [ ] WAITING — owner verification (everyday round): any generated record
  page on a wide screen — facts spread, sections grow, preview band
  taller; the showcase (`/test/ui-mapping`) — column arrangements render
  between peer collections.

### Agent Notes (2026-10-25, arrangement rework)

Session `agent/genui-arrangement-rework-20261025-2117` (worktree
`.agent-worktrees/genui-rework`). Owner review found the three earlier
rounds left §22.7's core unimplemented; this session rebuilt it. The
composed tree now carries one arrangement outcome per width step
(`arrangeChildren` → `{ narrow, medium, wide }`); RegionChildren engages
the step the host record grants. Ladder fixes: light peers share columns
at medium/wide (the under-budget stack shortcut is gone); the side rail is
rule 4 at wide over any light non-full child set (it previously required
the stack outcome — inverted order); the dominant child's remainder
carries its own stepped arrangement (previously pinned stack);
`REGION_COLUMNS_MAX` is deleted — any peer count columns, and the measured
engagement (`trackCount × REGION_COLUMN_EARNED_REM`) sheds tracks the box
cannot grant (4+ light peers previously fell through to tabs). Placement
is measured: each column track and the record side column is a
`PlacementBox` providing its own container record, so tables and card
grids inside them take the compact budgets for the width they have; the
routed screen root provides the measured page record when no host
declared one, so narrow viewports and the designer preview arrange
narrow. The record split engages through the seam (RegionBlock's
scoped-CSS home retired; `scripts/ui-visual-inventory.js` exception
tables follow). Component hygiene: SurfaceBody/StatGrid literal utility
strings collapsed into LAYOUT tokens; main.css fill-grid thresholds
(22rem track floor, 46rem content cap) named in their home. Specs:
129 unit/random green with the new totality pin (every composed node
resolves an arrangement at every width step, across all seeds) + 14 SSR,
design-system, check-arch, framework:validate green; check-docs green on
the integration tree (a fresh worktree lacks the `jagua-rs` submodule, so
the guard reports its README link broken there only).

- [ ] WAITING — owner verification (rework round): a record page with two
  or three light child collections on a wide screen (columns below the
  body, side rail for the lightest set), the same record dragged into a
  narrow pane (stacks, compact table columns), and the record popup.

### Agent Notes (2026-10-25, rail budget round)

Owner verdict on the rework: worse in many cases, too little care. Two
causes found. (1) Real defect, fixed: the side rail was a half-page
monster — SIDE_MAX_WEIGHT 16 let 11-16-row sets grab the rail and
REGION_SIDE_SPANS granted 4-6 of 12 tracks (33-50% of the record grid),
starving the record body. The rail is now a minor column: light sets only
(≤ 10 rows), span 3-4 of 12 (≤ a third). Heavier columnable sets column
below the body where peers earn real width. (2) The dev server was
serving a stale `ui-mapping-random` transform — showcase pages composed a
world from the pre-everyday-round vocabulary ("Tin Riddles" names removed
by 2544b7068) 90 minutes after that merge, with the on-disk file
byte-identical to the host; `docker compose restart app` cleared it. Any
owner verdict rendered between the everyday-round merge and the restart
partly judged a frankenbuild. Verification this round is visual, not just
spec-based: per-section showcase screenshots (side span 3 beside the
body, columns pairs below, tabs for heavy tables) at
`.playwright/genui2-*.png`, plus a real org record page; the look probes
live at `e2e/zz-genui-look-probe*.spec.js`.

- [ ] WAITING — owner verification (rail round): record pages on a wide
  screen — the rail reads as a minor column (~quarter page), record body
  keeps its fact columns; if anything still looks wrong, name the record
  and width.

## Generated UI language (owner direction 2026-10-26)

Law: the generative UI task is to define the generated UI language —
foundations, atomic elements, and the procedural rules that compose
layouts. The canonical definition is
[shared/ui-mapping/SPEC.md](./shared/ui-mapping/SPEC.md) → Layout
language; root SPEC §22.7 delegates to it. The ui-mapping subsystem is
the instrument: edit it to fix bugs or to match the defined contracts.

- [x] The language defined: two trait records as the only decision inputs;
  a nine-atom closed vocabulary (`stack`, `row`, `grid` with
  earned/floor/steps track derivations, `band`, `well`, `tabs`,
  `placement`, `stub`, `pack`) plus the ambient sets atoms compose under
  (cells, clamps, chrome, data-driven geometry); nine composition rules
  (value cells, fact grammar, open sections, chip rows, the body floor
  grid, the record ladder, the screen ladder, scroll ownership, placement
  sizing).
  Landed 2026-10-26: SPEC → Layout language; `LAYOUT_ATOMS`/`LAYOUT_AMBIENT`
  registries in tables.js assign every LAYOUT recipe to its atom or set;
  the engine spec pins the partition and the nine-atom set — the
  vocabulary is closed by guard.
- [ ] WAITING — owner verification: the atom set and the composition
  rules in shared/ui-mapping/SPEC.md → Layout language; a recipe the
  vocabulary cannot express is a pin to record there.

### Agent Notes (2026-10-26, language round)

Session `agent/ui-language-20261026-0005` (worktree
`.agent-worktrees/ui-language`). The language is now named and guarded
where the mechanics lived scattered: the LAYOUT recipes were already
atom instances in practice — the registries make the assignment explicit
and the spec pins that nothing enters LAYOUT outside the vocabulary. No
component behavior changed; the definition, the registries, and the
partition pin are the whole delta. Specs: 92 engine green; design-system
guard green.

## Agent vocabulary construction modes (SPEC §3)
- [ ] WAITING — owner verification: the authoring vocabulary serves
  per-type construction modes with defaults (`detail: 'construction'`)
  off the process-definitions projection; the guide's configure law
  points at it.

### Agent Notes (2026-10-26, agent/construction-detail-20261026-0833)
- Served `domain.construction` rows `{modes, defaultMode}` through
  `listConstructionModes`; dialog-shaped `inputs`/`modeInputs` stay
  designer-side (construction.inputs derives from declared fields).
- Validation results in the session handoff report.

## Arrangement foundations restored (owner direction 2026-10-26)

The rollback of 10:08 is itself reverted on the owner's direction: the
SPEC §22.7 law, `shared/ui-mapping/SPEC.md`, the traits/atoms engine,
the container-trait seam (`useContainerTraits`), `PlacementBox`, and the
random-world totality specs stand again. The owner's 2026-10-26 tabs
direction is integrated into the restored ladder: tabs sit at any tree
level; a tab arrangement at a step excludes tabs in its descendants at
that step (`arrangeChildren` carries a per-step `insideTabs` context;
`withArrangement` threads it top down).

- [ ] WAITING — owner verification: record pages and section screens on
  a wide host — the side rail, peer columns, and weight-ordered tabs
  compose from content; nothing under a tab tabs again; the showcase at
  `/test/ui-mapping` reads per the restored SPEC.

### Agent Notes (2026-10-26, agent/genui-restore-20261026-1219)
- `git revert` of the rollback commit `5d96bcc88`, conflicts resolved
  toward the program with the tabs law re-applied on top
  (`arrangeForStep(childRegions, step, insideTabs)`, `TAB_ANCESTOR_NONE`).
- The 11:52 tabs session's flat-ladder engine is superseded by the
  restored stepped engine; its SPEC 22.1/22.3/22.6 wording amendments
  stand.
- Specs: 118 green across `shared/ui-mapping/` and the random-world
  totality spec; guards in the session handoff report.

## Arrangement engaged on real screens (verification 2026-10-26)

The restored program verified against live surfaces, structure-dumped
per width step (browser probes; the model-side artifact is JSON, the
screenshots ride beside):

- Showcase (`/test/ui-mapping`): at 1680px a record page carries the
  weight-proportional `9fr/3fr` body + side-rail split, weight-ordered
  tabs, the facts/body fill grids, and a packed inert stub; at 480px the
  split and peer columns disengage — one composed tree, re-engaged by
  host width.
- Real workspace (seeded org process: a group type with two child
  collections): the heavy record (12+12 children) tabs its collections
  in weight order with resolved type labels and tables inside the
  panels; the light record (1+1) rides the `9fr/3fr` side rail. Live
  pane host, live instances, live compiled screen.
- Probes: `e2e/zz-genui-structure-probe.spec.js` (width steps) and
  `e2e/zz-genui-real-arrangement.spec.js` (seeded real path); artifacts
  `.playwright/genui-structure.json`, `.playwright/genui-real-structure.json`.
- Probe pitfall recorded: `executeAction` silently drops unknown payload
  keys — a child create binds its parent only through the declared
  edge's `lineageKey` (`lineage.<lineageKey>`), discovered by reading the
  stored children edges, not the action's graph input list.

## Procedural create-action names (owner direction 2026-10-26)

Generated create actions render as icon buttons and carry procedural
names (root SPEC §4): an authored label wins; a generic one derives
`New <Type>` and folds a distinguishing construction mode —
`New <Type> from <Mode>`. A collection offering several creates for one
type renders one create control; its form opens with the creation-mode
selection followed by the selected mode's inputs.

- [ ] WAITING — owner verification: multi-mode create captions on every
  action surface and the mode-selecting create dialog.

### Agent Notes (2026-10-26, agent/create-action-names-20261026-1430)

- Caption law single-homed in the processes package: `creationModeLabel`
  derives the mode display name (`convertDxf` → `Convert Dxf`); the
  compiler's `displayActionLabel` folds a distinguishing construction
  mode into generic create captions (`Create <Type> from <Mode>`), and
  `projectUiAction` translates that family to the manifest vocabulary
  (`New <Type> from <Mode>`); authored labels keep winning verbatim.
- `createActionControls` (shared/ui-mapping) collapses same-type creates
  to one control; RegionBlock's toolbar and stub line render it, the
  sibling group rides the run context, and the engine's create dialog
  opens over the group with a leading creation-mode row (`Select`,
  options from `creationModeLabel`; switching reseeds the draft; the
  dialog header carries the selected action's caption). A grouped create
  opens its dialog whatever the lead action's launch.
- Drive-by: `instance-select.spec.js`'s enum-select allowance was already
  red at base (ChatComposer, ChatSearchPanel import `primevue/select`);
  both added beside the new creation-mode row entry, and the Select-law
  sentences in components/ui-mapping + components/shared READMEs now
  state the allowance.
- Specs: ui-contract (captions), ui-mapping (controls), 917 tests across
  shared/components/processes/composables green except the pre-existing
  `useProcessDesignerNodeSync` legacy-draft failure (reproduced at base);
  SSR smoke 16 green; check-arch, framework:validate green; docs guard
  reports only the pre-existing `workers/nesting/jagua-rs` submodule
  link (submodule uninitialized in worktrees).
- Visual verification of the mode-selecting dialog needs an authored
  definition with two same-type create actions (cassette-design carries
  upload/bake/convertDxf modes) — left to the owner against the running
  dev stack after merge.

### Agent Notes (2026-10-26, agent/genui-rail-20261026-1617 + close)

- Owner defect "items hang in right column when nothing else exists":
  fixed and geometry-verified. The side rail now engages only when the
  record body carries at least the rail's weight (SPEC rule 4); a thin
  body keeps its children below at full width. Live pane measurement
  after the fix: the thin record renders one full-width block
  (x279 w1378 h170) — no split, no hanging column; the heavy record
  (12+12 children) keeps weight-ordered tabs.
- Screen-level inert partition implemented (SPEC rule 1): a section
  resolved empty leaves the ladder as a compact stub strip below the
  arranged sections; loading/denied/error sections keep their state
  surfaces. Empty home sections no longer claim column/tab tracks.
- Probe false alarm recorded: icon-only tabs with empty textContent in
  desktop dumps are the hidden mobile bottom bar (labels live on
  aria-label/title) — a layout law, not a defect.
- Specs 122 green (rail gate pins incl. thin-body negative, screen
  stub partition, random-world totality over the new shape); guards:
  arch, docs, SSR smoke, design-system pass.

### Agent Notes (2026-10-26, agent/create-inputgroup-20261026-1655)

Owner rework of the UI half: the mode selection lives in the toolbar
control, as the direction named it — `CreateControl.vue` renders one
PrimeVue `InputGroup` (creation-mode `Select` + create `ActionButton`)
for a same-type create group; the button dispatches the selected action
through the ordinary launch contract (params dialog, or direct run for a
mode without prompted inputs). The dialog's mode row and the engine's
group branch from the first session are removed; `createActionControls`,
the caption law, and the i18n key stand. The PrimeVue MCP was consulted
for the InputGroup composition this round (buttons as direct group
children; Select `size`/`ariaLabel`).

## Sidebar explorer carries one hierarchy (owner direction 2026-10-26)

Root SPEC §4: an instance lists beside its type node only while no loaded
instance parents it — parented children nest beneath their parent rows,
and relation-linked children nest with the link glyph.

- [ ] WAITING — owner verification: the seeded org's sidebar (queue with
  its four child types) — child instances nest beneath their parent
  instances, the child type nodes keep unparented rows only, and
  relation-nested rows wear the link glyph.

### Agent Notes (2026-10-26, agent/sidebar-hierarchy-20261026-1735)

- The malformed panel was the README's own law violated in code: "a child
  never appears both beneath its parent and beside it" was cut only for
  self-containment (`selfContainmentKeys`); a child type's home section
  listed every instance under its abstract type node. The cut is now
  `parentContainmentEdges` over the merged containment (self pairs and
  cross-type children edges alike) against a loaded pool of every
  section's raw items plus the lazy pool — cut children re-enter beneath
  their parent row through the existing lazy child load, the same
  mechanics the self-recursive case always used.
- Relation-nested rows: `entityNode` marks its relation children
  (`data.linked`) and `entityPanelItem` renders `pi pi-link` in place of
  the type glyph.
- The source-level root cuts stand: `filterRootSourceItems`
  (composables README) and `shouldRenderHomeSection` — both key off
  compiled `lineageBindings`, which the seeded child-type sections carry
  none of; the component-level cut closes that gap.
- Specs: components/generated 45 green; SSR smoke 16; arch guard green;
  docs guard reports only the pre-existing jagua-rs submodule link; the
  one failing test repo-wide is the pre-existing
  `useProcessDesignerNodeSync` legacy-draft spec.

### Agent Notes (2026-10-26, agent/sidebar-hierarchy-2-20261026-1805)

- Owner follow-up ("didn't fix"): the containment root-cut was correct
  but addressed the wrong shape — a mounted-model reproduction spec
  (`sidebar-explorer.spec.js`, renderToString over the real component
  with mocked stores) proved the cut works, and the live nesting under
  parent instances is relation-driven. The actual defect is the nested
  child-type row carrying its whole section list beside the instance
  tree.
- `typeNode` now attaches home-section instances to ROOT panels only; a
  nested child-type row opens its typeList screen with no instance rows.
  The reproduction spec pins the law (root panel rows, child row without
  rows); the cross-type root cut stays (it is what lets section-loaded
  children re-enter beneath parent rows).

### Agent Notes (2026-10-26, agent/genui-owner-review-20261026)

- The pane record page's missing header was SPEC §22.3's own wording
  ("title surfaces stay with the pane strip") — the owner review
  amends it: the record identity block renders in every host;
  `hideTitle` and the state-only header branch are gone. The routed
  typeList now passes `pane-hosted` (its StandardPage titles it), so a
  list screen's label renders exactly once through its host; the list
  header's count became a quiet muted figure.
- The tabs/columns/mixed duplication was a broken v-if/v-else chain in
  RegionChildren: the `pack` branch started a second chain, so every
  arranged outcome rendered beside the stacked fallback. Live evidence
  before the fix: a record with two 12-row child collections rendered
  four tables (`.playwright/genui-real-structure.json`).
- The cross-cut flag composes at compose-time (`crossCut` on the node);
  CardGrid/CollectionTable consume it as a `parented` prop, and scoped
  lists skip the lazy parent-type overlay load entirely.
- The identifier exclusion moved to the group projection in
  SurfaceDetailBody (the structural-section leak for long-string
  identifiers) and to `factsFor` in the design-system fact contract
  (compact/entity cards).
- GalleryCollection: raw PrimeVue Galleria (item band + caption link +
  thumbnail strip); thumbnail count derives from the container record;
  the item band steps with its container (`.ck-gallery-item` in
  main.css). The matcher takes `gallery: true` (visual payload preview)
  at large size; `VISUAL_PREVIEW_MODES` is the signal home. The
  random-world volume file type deterministically carries a visual
  preview — a late `rnd.pick` shifted the seeded world and tripped the
  SSR id-leak smoke.
- Spacing: density tiers on HOST_PROFILES, narrow-box cap at 0.75,
  `spacingCoefficientFor(container, screenWeight)` tightens past
  `SPACING_WEIGHT_AT`; GeneratedMappingScreen derives the coefficient
  (explicit `spacingScale` overrides); `GAP_BY_LEVEL` covers depth 2.
- InstanceInlineRef chips and compact micro cards carry
  `hover:bg-subtle` beside the pointer cursor.
- Specs: ui-mapping 131, random world 10, fixtures/module-imports,
  design-system + framework-packages 37, SSR smoke 16, localization 4,
  check-arch, framework:validate, docs:validate (the worktree-only
  jagua-rs link aside) — all green. Live re-verification probe:
  `e2e/zz-genui-owner-review-probe.spec.js` (untracked, per the
  zz-probe convention).

### Agent Notes (2026-10-26, owner-review closeout)

- Follow-up fix `2f864c7d0`: the derived coefficient exposed a latent
  trap — the provided rhythm set was a reactive proxy over the FROZEN
  scale table, so the first coefficient change (pool load crossing the
  weight budget) threw "Cannot assign to read only property 'stack'"
  and 500ed the routed detail. The provided set is a mutable copy now;
  the showcase slider path shared the same landmine.
- Live verification on the dev stack
  (`.playwright/genui-review-after.json`, screenshots beside):
  routed heavy record — header title present, 2 child collections
  render 2 tables inside weight-ordered tabs (was 4 pre-fix), zero
  parent tokens inside the parent detail; unscoped child-type list —
  9/10 rows carry the parent token (the tenth is the other project's
  child); workspace pane detail — full header with the record title,
  same single-outcome tabs.
- Probes: `e2e/zz-genui-owner-review-probe.spec.js` (untracked,
  zz-convention), artifacts `.playwright/genui-review-after*`.

### Agent Notes (2026-10-26, agent/sidebar-types-gone-20261026-1850)

- Second owner follow-up: the live probe (`e2e/zz-sidebar-hierarchy-probe.spec.js`,
  artifact `.playwright/sidebar-probe.json`) rendered the real seeded
  sidebar — the children edge arrives in the served bundle (scope org,
  lineageKey stamped) and the child type rendered as a bare nested row
  after the previous cut. The owner's law reads stricter: type rows never
  render inside a panel at all.
- `explorerNodes` now panels one per stationed type that no other
  stationed type contains; contained types never panel on their own and
  carry no type row — their instances reach the sidebar beneath their
  parent instances. `typePanelItem` maps entity rows only. The pinned
  mounting spec asserts the panel rows exactly.

## Agent tooling extensions (owner direction 2026-10-27)

SPEC §3 (plugin-declared agent tools, the assistant guide) and §20 (the
listing's `tools` declaration). DWG stays out — the owner decision of
2026-10-13 stands.

- [ ] Listing `tools` declaration: `parseListing` / `normalizeListing` /
  `listing.schema.json` in the plugin SDK, descriptor-to-service binding
  (endpoint mode only), plugin-qualified ids `plugin.<id>.<tool>`; catalog
  publish and install snapshot in the plugins feature (the pinned
  declaration layer); install-gate refusals (unknown service, shadowed
  name). Docs: plugin-sdk and plugins feature READMEs.
- [ ] Catalog composition and dispatch in agent-bots: installed plugins'
  tools compose into `chatToolDescriptors` and `mcpToolDescriptors`
  org-scoped (the `web_search` availability law — an org without the
  install offers them nowhere); `executeTool` dispatches through the
  connector under the delegated principal; focused specs on both surfaces.
  Docs: agent-bots README catalog table.
- [ ] DXF agent tools, the first consumer, on the facade executor's
  vendored DXF engine: a geometry digest read (entities, layers, extents)
  over file-instance payloads and declared transforms, bound as plugin
  tools. Docs: workers/facade README service table.
- [ ] The assistant guide: org settings storage behind the models-screen
  settings gate, the models-screen block beside the search provider, and
  the ride in `runtime.js` `systemPrompt` (platform instructions first,
  guide after) for chat runs and wakes alike. Docs: agent-bots, llm, and
  pages/organization READMEs.

## Design language lands in pixels (owner direction 2026-10-27)

Law: SPEC §4 (type-and-ink ladder). Token home `assets/tokens/index.js`,
preset home `assets/presets/re_l.js` over it, rhythm homes
`shared/ui-mapping/tables.js` and `assets/css/main.css`, guard
`shared/design-system.spec.js`. Owner decisions this session: small tier
15px; values in ink, monochrome language unchanged.

- [x] Small tier 15px: `label` and `technical` roles `0.875rem` →
  `0.9375rem`; PrimeVue small controls (`formField.sm.fontSize`) and
  tags (`tag.root.fontSize`) to `0.9375rem`; small-table body cells
  breathe (`datatable.bodyCell.sm.padding` `0.5rem 0.75rem`).
  Landed 2026-10-27 in `assets/tokens/index.js`.
- [x] Ink ladder: light-scheme text color `surface.700` → `surface.800`,
  `--ck-primary-ink` to zinc-800; muted stays `surface.500`.
  Landed 2026-10-27 in `assets/tokens/index.js`.
- [x] Fact-row recipe: `LAYOUT.labelCell` and the structural-field label
  row in `SurfaceDetailBody` render `text-label text-muted`.
  Landed 2026-10-27 in `shared/ui-mapping/tables.js`,
  `components/ui-mapping/SurfaceDetailBody.vue`.
- [x] Host profiles: `dialog`/`popup` density `1`, and the narrow-box
  density cap removed from `resolveContainerTraits` (it re-tightened
  exactly the popups the profile change relaxed).
  Landed 2026-10-27 in `shared/ui-mapping/tables.js`,
  `shared/ui-mapping/index.js`.
- [x] Guard: `shared/design-system.spec.js` pins the tier size, the ink
  tokens, the label-cell recipe, and the host-profile densities;
  `framework.manifest.json` regenerated (it embeds the design tokens).
- [x] Docs: `assets/tokens/README.md`, `shared/ui-mapping/README.md`,
  `shared/ui-mapping/SPEC.md` match the landed values.

### Agent Notes (2026-10-27, generator consumption audit)

Follow-up audit of what the generator's materializations actually
consume, surface by surface:

- Values land in ink: `FieldControl` renders every value face as
  `text-body`/`text-technical` (inherit), so the `surface.800` ink
  flip reaches table cells, fact rows, card/board facts, dialogs, and
  popups through one token. Muted spans in the materializations are
  labels, placeholders, overflow counts, and axis chrome.
- One defect fixed: the timeline projection rendered a non-openable
  record name as `text-supporting text-muted` — a value muted, now
  `text-body` with the shared clamp recipe.
- The chrome contract was dead and is removed
  (`CHROME_ROLES`/`CHROME_TABLE`/`DEGRADE`/`resolveChrome`, the
  `node.chrome` field, SurfaceBody's chrome/parentRole props and
  Divider branch): no materialization consumed the surface/padding/
  border token names, and `flattened` could never fire (compose
  hardcodes the parent role, nested regions render as sibling cards).
  Surface chrome is owned by the preset component tokens and the
  `LAYOUT` recipes; rhythm by the spacing coefficient. Specs and the
  three contract READMEs updated in the same cut.

### Agent Notes (2026-10-27)

Diagnosis before the change: a computed-style audit of the live
showcase (301 text elements) showed the contract layer never reached
the pixels — half the rendered text muted zinc-500, the 14px tier
split between the app `label` role and PrimeVue small controls, and
popups double-compacted (profile 0.75 plus a narrow-width density cap).
That is why tidy-up passes moved nothing: the levers are global tokens,
and the previous agent work stayed per-surface.

Status: WAITING owner verification. The running dev container serves
the primary checkout; theme tokens bake at boot, so the change is
visible after `docker compose -f docker-compose.dev.yml restart app`
once merged (the primary checkout carries unrelated uncommitted edits,
so the restart is the owner's call).

## Generative UI layout sanity round 1 (owner direction 2026-10-27)

Law: SPEC §22.8. Engine home `shared/ui-mapping`, materializations
`components/ui-mapping`. Owner findings this session: crammed stacks,
stub clutter, bad side-rail splits, kitchen-sink rows, noisy fact
structure, wrong preview bands, dashboard widgets in ordinary records.

- [x] Page rhythm: weight tightening applies to bounded hosts only —
  `spacingCoefficientFor` keeps page hosts at their profile rhythm.
- [x] Stubs render the create affordance alone (packed row, no
  icon-label-count strip) — `RegionBlock` stub branch.
- [x] Side-rail span fallback 5 → 3 (an unspecified rail stays a
  quarter of the record grid) — `RegionBlock` splitTracks.
- [x] Rows carry identity, status, one fact: `ROW_FIELD_BUDGET` max 1,
  relation chips leave the row variant — `tables.js`, `SurfaceBody`.
- [x] Single-group record bodies render no group titles —
  `SurfaceDetailBody`.
- [x] Seeded placeholder preview art removed; payload-less instances
  render the quiet type glyph band — `PreviewBox` (the `seed` prop and
  its callers went with it).
- [x] Dashboard widgets gate on `quantitative` (`typeIsQuantitative`:
  the type's statlike shape): Knob, MeterGroup, Chart, Rating match
  quantitative types alone; plain values elsewhere — `tables.js`,
  `index.js`, `FieldControl`, `InlineField`, and the detail/row
  callers.
- [x] Guards and docs: ui-mapping spec pins updated; ui-mapping and
  components READMEs match.

### Agent Notes (2026-10-27, layout round 1)

Root causes found for the owner's findings: heavy page screens
tightened their own rhythm to the 0.75 coefficient (gap-3 sections on
pages); every empty collection advertised itself with an
icon-label-count strip; a missing side-rail span fell back to 5/12 of
the record grid; rows carried three fields plus relation chips; every
fact group printed its title; payload-less image/geometry types
rendered invented seeded SVG art; and the widget derivations fired on
field shape alone, putting dials and charts inside ordinary text
records.

Status: WAITING owner verification — live look at the showcase
(`/test/ui-mapping`) and real record pages after the app picks up the
change. Expect a round 2 from what still reads wrong.

## Generative UI layout sanity round 2 (owner direction 2026-10-27)

Law: SPEC §22.8 (carousel retired; section labels in natural case).
Owner findings: the galleria projection is the wrong component for
in-page collections; uppercase section labels read as artificial.

- [x] The `gallery` projection is retired: matcher entry, layout
  vocabulary (`galleryItem`/`galleryThumb`), `GalleryCollection.vue`,
  the `ck-gallery` styles, `VISUAL_PREVIEW_MODES` (its dominance signal,
  no remaining consumer), the random-world gallery guarantee, and the
  declaration inspector's redundant union. Preview-dominant collections
  render the card grid.
- [x] Section labels render in natural case: `sectionTitle` drops the
  `uppercase` stamp across `LAYOUT` and every spacing scale; the
  entity-card section label the same.

### Agent Notes (2026-10-27, round 2)

Status: WAITING owner verification.

## Generative UI layout sanity round 3 (owner direction 2026-10-27)

Law: SPEC §22.8 (round-3 amendments). Owner findings this session:
array values stacked mid-line, uppercase remnant in the ui-lab chrome,
file chips rendering MIME strings and instance chips borderless against
the chat standard, SurfaceHeader layout/spacing, and the hierarchy tree
duplicating child collections on record pages.

- [x] Structural values render as labeled blocks (label line, value
  below), list summaries wrap inline — `SurfaceDetailBody`,
  `FieldControl`.
- [x] Uppercase leaves the ui-lab chrome; the design-system guard bans
  the transform (`uppercase|lowercase|capitalize` across
  components/pages/layouts).
- [x] File chips centralize on the chat recipe (shared `FileChip`:
  name label, mime-aware icon, bordered subtle chip, `name · size`
  title); `MessageAttachments` and the generator's blob fields consume
  it; `InstanceInlineRef`'s default chip adopts the bordered recipe.
- [x] `SurfaceHeader` rhythm: tighter identity-to-actions gap, the type
  label rides the label tier.
- [x] `HierarchyTree` leaves the record body (child collections are the
  children surface); component retired.

### Agent Notes (2026-10-27, round 3)

The blob chip previously rendered the raw MIME string as its label;
that plus the borderless default instance chip were the divergence from
the chat recipes. The record body rendered the descendant tree above
the same children the child collections listed below it.

Status: WAITING owner verification.

## Generative UI layout sanity round 4 (owner direction 2026-10-27)

Law: SPEC §22.8 (no app surface applies a case transform; internal
vocabulary stays internal). Owner findings: the showcase rendered the
compiled template name as a Tag beside every screen heading and the
random-world fixture labels narrated their own purpose ("<Type> list —
empty state"); plugin editor surfaces still stamped uppercase labels.

- [x] The showcase header drops the template Tag (internal vocabulary);
  fixture labels render `<Type> list` / `<Type> detail`; the random-world
  spec finds the empty screen structurally (typeList over a type with
  zero instances), by label.
- [x] Plugin editor section labels render in natural case (cassette
  designer, sheet editor); the case-transform guard now scans plugin
  surface modules and package editors beside the app tree.

### Agent Notes (2026-10-27, round 4)

Status: WAITING owner verification.

## Design-system centralization pass (owner direction 2026-10-27)

Law: SPEC §22.8; the ui-mapping layout-language law ("materializations
never declare their own stacks") and the chip recipe home.

- [x] `LAYOUT.labeledBlock` owns the label-line/content-below recipe;
  the four hand-rolled stacks in `SurfaceDetailBody`/`JsonEditor`
  consume it; structural field labels ride `sectionTitle`.
- [x] `components/shared/chip-surface.js` is the one chip recipe home
  (`CHIP_LABEL_PT`, `FILE_CHIP_CLASS`, `INSTANCE_CHIP_CLASS`);
  `FileChip`, `InstanceInlineRef`, and `InstanceCard` consume it; the
  chat's identical instance-chip override is gone.

### Agent Notes (2026-10-27, centralization pass)

Recipe duplication measured before the cut: the truncating chip
passthrough lived in three components; the chat passed an instance
chip class byte-identical to the new default; four generator stacks
hand-rolled `flex w-full flex-col gap-1` against the layout-language
law. All now resolve through the vocabulary and the recipe module.

Status: WAITING owner verification.

## Generative UI layout sanity round 6 (owner direction 2026-10-27)

Law: SPEC §22.8 (boolean checkbox states; no per-card type names in
homogeneous collections). Owner findings: booleans rendered a Tag with
glyph characters; every card in a single-type grid repeated the raw
authored type name as its subtitle.

- [x] Booleans render as the readonly checkbox state (`BooleanCheck`:
  checked / unchecked / indeterminate, binary, no glyph characters);
  the pure text fallback prints `true`/`false`.
- [x] CardGrid drops the per-card type-name subtitle — the collection
  header names the type; only containment context (ParentRef) earns
  the line.

### Agent Notes (2026-10-27, round 6)

Status: WAITING owner verification.

## Generative UI layout sanity round 7 (owner direction 2026-10-27)

Law: SPEC §22.8 (count law); §22.3 (the host owns the name). Owner
finding: a denied list screen rendered the screen title and the region
label (the type name twice) beside a "0" count and the denial message.

- [x] The count renders only for loaded, accessible, non-empty
  collections — denied, failed, missing, and empty sources carry no
  count — `RegionBlock`.
- [x] The showcase passes `pane-hosted` (§22.3): its section headings
  own the screen names; region headers stop repeating them.

### Agent Notes (2026-10-27, round 7)

The routed screens page already carried `pane-hosted`; the showcase was
the duplicating host.

Status: WAITING owner verification.

## Generative UI spacing ladder (owner direction 2026-10-27)

Law: SPEC §22.9. Owner demands this session: one spacing system for the
generative UI; counts that look designed; showcase headings that stop
narrating templates.

- [x] The ladder: steps 4/8/12/16/24/32px (Tailwind 1/2/3/4/6/8) declared
  at the layout vocabulary; the rhythm interpolator (SPACING_SCALES)
  owns sub-steps alone; calendar cells and six materializations
  normalized off half-steps; the guard pins LAYOUT and the ui-mapping
  tree.
- [x] Counts render as the count chip (`COUNT_CHIP_CLASS` in the chip
  recipe home): region headers and arrangement tabs.
- [x] Showcase headings follow the host law: list sections name the
  type, detail sections name the record they open; fixture labels lose
  the `list`/`detail` suffix narration.

### Agent Notes (2026-10-27, spacing ladder)

Status: WAITING owner verification.

## Generative UI rhythm step-down (owner direction 2026-10-27)

Law: SPEC §22.9 (amended). Findings from the first layout-geometry dump
(`e2e/zz-layout-geometry-probe.spec.js` → `.playwright/geometry-*.json`):
headless count chips on pane-hosted headers (round 9's own slop), a
uniform 24px rhythm at every tree level, gantt axis labels overflowing
their 16px row, and the showcase defaulting to the denied/error state
matrix.

- [x] Hosted regions render no count — a count rides beside its
  heading or not at all.
- [x] The screen root separates sections on the ladder's top step
  (`LAYOUT.stackSection`, interpolated as `screenRoot` in the rhythm
  sets) — hierarchy reads through spacing.
- [x] The gantt axis row hosts its month labels (h-6).
- [x] The showcase reviews the natural world by default; the state
  matrix opts in (`?state=on`).

### Agent Notes (2026-10-27, geometry round)

The geometry probe is the session's feedback loop for layout: measured
box trees read as text, so layout defects are found without eyes.

Status: WAITING owner verification.

## Collection title bars and the table floor (owner direction 2026-10-27)

Law: SPEC §22.3 (amended) — a collection region carries its own title
bar in every host; SPEC §22.9 count line amended to match. Owner
finding: datatables rendered with a floating icon row and no title —
the pane-hosted label suppression (rounds 7/10, applying the 2026-10-26
amendment too broadly) stripped collection titles from hosted
surfaces.

- [x] Every collection region renders its title bar (icon, label,
  count chip, controls) in every host; the `paneHosted` plumbing is
  removed end-to-end (RegionBlock, GeneratedMappingScreen,
  GeneratedScreenHost/Pane, the routed page, the showcase).
- [x] The random world guarantees the default table projection: the
  volume type is a plain item type (short scalars, one numeric) so the
  >50 collection renders a real DataTable — the showcase reaches every
  projection; the random-world spec asserts the layout.

### Agent Notes (2026-10-27, round 11)

Status: WAITING owner verification.

## PrimeVue owns component internals (owner direction 2026-10-27)

Law: SPEC §22.10. Owner finding: the generator added spacing inside
PrimeVue collections that space themselves — a 4px separated-border
wedge between DataTable rows, a hardcoded dense-grid gap beside the
grid-gap token — double rhythm on top of the preset.

- [x] The DataTable row wedge (scoped `border-spacing`) and its wrapper
  class die; rows ride the component's own rhythm, flush.
- [x] The dense card grid rides `--ck-grid-gap` (one token home for
  grid gaps); the last hardcoded `gap-4` grid joins it.
- [x] The scoped-style exception registry entry dies with the block.

### Agent Notes (2026-10-27, round 12)

Status: WAITING owner verification.

## Table virtualization retires (owner direction 2026-10-27)

Law: SPEC §22.10. Owner finding: the showcase's first large table
rendered as an internal scroll box with sticky headers floating over
the rows (transparent header backgrounds over a scroll viewport) —
the dormant virtualization mode, tripped by round 11's 60-row volume
guarantee.

- [x] The generator's tables page, they never scroll-box: the
  virtual/scrollable mode, `TABLE_VIRTUALIZE_AT`,
  `TABLE_VIRTUAL_SCROLL_REM`, and the pagination contract's
  `virtualizeAt` die together.

### Agent Notes (2026-10-27, round 14)

Status: WAITING owner verification.

## Generative UI raw-chips deslop (owner direction 2026-10-27)

Law: SPEC §4 (raw PrimeVue), §22.8 (chip recipe), §22.9 (spacing
ladder). Owner verdict: the generative UI follows no reasonable design
system, violates the raw-PrimeVue rule, reads ugly overall.

- [x] Chips ride the preset: `FILE_CHIP_CLASS`/`INSTANCE_CHIP_CLASS`
  drop the hand-rolled re-skin (border, background, 12px supporting
  face) and carry the clamps alone — raw PrimeVue Chip chrome and
  inherited typography; the compact ref header label inherits the body
  face. SPEC §22.8's "bordered default" sentence reconciled with the
  chat law (§7: raw PrimeVue Chips, no hand-rolled chip chrome).
- [x] One count surface: `COUNT_CHIP_CLASS` dies; region headers and
  arrangement tabs render `Tag severity="secondary"` — the board's
  existing count materialization.
- [x] StatGrid: the raw per-card `type?.name` subtitle dies (§22.8
  no-type-name law, one type-label chain); identity renders the standard
  openable link (the stats projection was the only closed one).
- [x] The rhythm interpolator rides declared steps: `gap-5` (20px) at
  the 1.25/1.5 densities moves to the ladder neighbors (4/6); the guard
  scans `SPACING_SCALES` for off-ladder full steps.
- [x] Vocabulary and hygiene: `LAYOUT.well` owns the quiet inset recipe
  (PreviewBox's file-facts band consumes it); the dead spacing inject in
  CalendarCollection dies.

Follow-up sweep (post-merge audit re-run still showed 50 record names
at 12px muted — the same value-face defect in three more homes):

- [x] ParentRef: the parent record's name renders in ink at the
  inherited face (the muted type icon alone marks context), and the
  unloaded-parent fallback resolves through the one type-label chain
  instead of the raw bundle `type.name`.
- [x] BreadcrumbTrail drops the trailing current-record crumb — it
  duplicated the header identity line below it at 12px muted; the trail
  carries ancestors alone.
- [x] FileUploadControl renders the chosen file through the shared
  `FileChip` (was a bare 12px muted span) and localizes its labels
  (`common.upload`, `errors.uploadFailed`).

### Agent Notes (2026-10-27, round 15)

Session `agent/genui-raw-chips-20261027-1915` (worktree
`.agent-worktrees/genui-raw-chips`). Diagnosis was measured, not
guessed: the live showcase audit (`e2e/zz-design-audit-probe.spec.js` →
`.playwright/design-audit-showcase.json`, 362 text elements) put 22% of
all text at 12px — the chip classes stamped the supporting role on
record and file names (data values), and re-skinned PrimeVue Chips with
utility chrome. The board already used `Tag` for counts while headers
and tabs used a hand-rolled pill — two count surfaces. StatGrid rendered
the raw authored type name per card and was the only projection whose
identity could not open a record. `SPACING_SCALES` carried `gap-5`
(20px) at two densities — a step the §22.9 ladder does not declare
(16→24 is the designed jump); the spacing guard scanned LAYOUT and the
component tree but never the interpolator table. All now fixed; the
design-system guard pins the chip classes and scans the interpolator.
Specs: 151 unit (design-system, ui-mapping, screen, module-imports,
timeline) green. Visual verification is the owner's: chips and counts
step up to preset size on the showcase (`/test/ui-mapping`) and in chat
after the dev container restarts.

Status: WAITING owner verification.

## Create dialogs prompt the contract alone (owner direction 2026-10-27)

Law: [SPEC §UI generated creates](./SPEC.md). A create dialog's row list
is its compiled construction contract — exactly the inputs the authored
declaration and graph compose. The "naming law" injections that prepended
a required identifier/Name row to every create dialog (including
registry-minted identity rows a declaration never authored, and beside
upload/capture/content protocol inputs) are slop and die.

- [x] `protocolModeInputs` (cts domain projection): upload/capture carry
  the payload input alone; content carries the text body alone.
- [x] `resolveCreateDialogInputs` (shared ui-mapping): rows come from the
  policy/construction inputs; drop the identifier unshift and the bare
  `name` ghost row.
- [x] Upload/capture constructs fill the record's `name` from the
  uploaded file's name (extension stripped) when the draft carries none
  (`createWithPayloadProtocol`).
- [x] Specs re-pinned (domain-projection, graph-protocol-construction,
  ui-mapping, instances service); md-editor-repair drops its dead
  identifier-fill loops.
- [x] Docs: SPEC §UI amended; shared/ui-mapping, components/ui-mapping,
  processes, instances READMEs; e2e README.

### Agent Notes (2026-10-27, agent/create-dialog-name-ghost-20261027)

Session worktree `.agent-worktrees/create-dialog-name-ghost`. The slop
had two injection sites contradicting four standing contracts (SPEC §UI
"upload/capture creates prompt only the file", compiler "No
identity.name ghost", e2e fixtures "protocol creates prompt none of the
rows", and the projection's own comment): `protocolModeInputs` rode an
identifier row into every protocol mode, and `resolveCreateDialogInputs`
derived identifier rows beyond the contract plus a ghost row for a bare
`name` id resolving no declared field. Registry-minted identity rows
(`constructible: false`, "authors nothing" per the registry comment)
were prompted too — a Name field for a field the declaration never had.
Records stay named for uploads by deriving the name slot from the
uploaded file's name at the construct seam; content/editor creates and
graph-supplied creates name through authored rows, composition, or the
rename channel. `packages/processes/README.md`'s construction-contracts
paragraph still described the retired always-promptable `name` compile
and was rewritten against current pins. Validation: cts + processes +
shared + instances suites green (887/891 — the 4 failures are
`shared/fact-display-vocabulary.spec.js`, pre-existing on `local`,
identifier-exclusion work in flight by another session); root guards,
SSR smoke, and architecture guard green. E2E not run (no live stack in
this session); md-editor-repair and order-process cover the changed
dialogs on the next stack run.

Status: WAITING owner verification.

## Generative UI owner corrections (owner direction 2026-10-27)

Law: SPEC §22.8 (chip recipe), §22.10 (the preset token layer is a
sanctioned spacing channel), the list-layout matcher. Owner findings on
round 15 and earlier rounds: the bordered instance/file chips were the
intended recipe; the small-table cell padding was the intended preset
deviation; a table must never render with no data column beside
identity (and status).

- [x] The bordered chip recipe is restored (round 15 over-reached):
  `FILE_CHIP_CLASS`/`INSTANCE_CHIP_CLASS` and the compact ref header
  label carry the border, surface, and supporting face again; SPEC
  §22.8's "bordered default" stands; the guard pins the restored
  classes.
- [x] The small-table cell padding is restored at its token home:
  `datatable.bodyCell.sm.padding: '0.5rem 0.75rem'` (removed by the
  §22.10 round 12 cleanup, which swept a preset token — the layer
  §22.10 itself sanctions); the design-system guard pins it and the
  tokens README deviation table carries the row.
- [x] The list-layout matcher demotes name-pile tables: a `columns: 0`
  signal (filled non-identifier short scalars + the first declared
  relation — the value-aware count of data columns a table would show
  beside identity and status) renders the `list` projection instead.
  `listLayoutOf(node)` is the one region-level derivation — compose
  traits, weight estimation, and RegionBlock resolve the same layout
  over the same node.

### Agent Notes (2026-10-27, round 16)

Session `agent/genui-corrections-20261027-2000` (worktree
`.agent-worktrees/genui-corrections`). The demotion is value-aware by
design: a type whose declared scalars no instance fills also demotes
(the census showed a detail screen rendering a one-column "Record"
table). Arrangement follows automatically — the demoted peers carry
chip breadth and share columns instead of claiming full rows. Specs:
175 unit (design-system, ui-mapping, screen, fixtures, random world,
module-imports, timeline) green; the traits fixture and the
relation-children composition fixture now fill a non-identifier scalar
so the table projections they pin derive over a shown data column.
Token change bakes at boot: the padding is visible after
`docker compose -f docker-compose.dev.yml restart app` once merged.

Status: WAITING owner verification.

## Group surfaces carry their membership (owner direction 2026-10-27)

Law: SPEC §22.11. Owner direction: group-class instances render as
groups in their collection surfaces, showing their children — flat, no
tree projection.

- [x] Group collections derive the card grid (matcher entry beside the
  file class): the class identity law — identity is its membership —
  makes membership the card's content.
- [x] A group card carries its children as budgeted reference chips
  (`InstanceInlineRef` over `childrenOfParent`, the surface contract's
  children slot: max 6, show-more per card) ahead of its facts; a child
  opens its own surface — one level, never a tree.
- [x] Child types lazy-load through the `loadType` overlay seam the
  containment cross-cut already owns (the parent-type overlay
  generalizes to overlaid types); an unloaded type renders without its
  context.

### Agent Notes (2026-10-27, round 17)

Session `agent/genui-corrections-20261027-2000` (worktree
`.agent-worktrees/genui-corrections`). The `children` slot existed in
the surface contract since the class archetypes landed (collection,
collection-card, collection-row with per-variant budgets) — no
materialization consumed it; group instances rendered as plain records.
Answer to the owner's question: yes — the correct way is the class
surface's own children slot over the one hierarchy matcher, budgeted
like relation chips, with the lazy overlay for pool data. The fixtures
spec's folder pin moves with the law (the stale comment asserted the
table default). En route, two latent defects surfaced and died:
`childrenOfParent` dropped the edge map key (edges authoring no
explicit `lineageKey` never matched — the same law the cross-cut's
`incomingChildrenEdges` already carries), and the live probe caught a
500 (the card expansion set read through its ref). Specs: 176 unit
green (design-system, ui-mapping, screen, fixtures, random world,
module-imports, timeline); SSR smoke 16; live verification
`e2e/zz-round1617-verify.spec.js` → `.playwright/genui-round1617.json`:
no identity-only tables, group cards carry membership chips at the
budget cap.

Status: WAITING owner verification.


## Contextual creates derive their lineage chain (owner direction 2026-10-27)

Law: [SPEC §UI contextual creates](./SPEC.md). The stored lineage is the
full ancestor chain (§3 read model: filters, access facts, breadcrumbs).
That chain vocabulary leaked into the write model: construction contracts
prompted a picker per ancestor axis, so creating a child inside its parent
still asked for the grandparent — and skipping it stored a broken chain.

- [x] `orgLineageFields` splits: construction addresses immediate parent
  axes; the fieldSchemas pass keeps the recursive ancestor chain (read
  model).
- [x] `createValidated` derives the chain: every referenced parent
  contributes its own lineage, authored axes win, ref objects scalarize,
  cross-org parents refuse.
- [x] Specs: projection pins immediate-only construction + deep schemas;
  instance service pins derivation, precedence, and the cross-org refusal.
- [x] `normalizeConstruction` reconciles authored construction inputs
  against the current contract on every mode (stale ancestor-axis stamps
  persisted in authored definitions die at compile; block-composed
  constructs keep their canonical block entries).
- [ ] Optional repair for legacy rows whose prompts allowed skipping
  ancestors (chains written incomplete before this law) — owner decides.

### Agent Notes (2026-10-27, agent/lineage-context-20261027)

Session worktree `.agent-worktrees/lineage-context`. Diagnosis came from
the live org (org-6a05940e manifest over the API): the xlsx-workbook
create inside a queue detail carried `lineage.queueId` AND
`lineage.projectId` prompts — `orgLineageFields` recursed through
ancestors and `edgeFieldsFor` fed the whole list into construction
inputs. All axes were optional, so a skipped grandparent stored a broken
chain (project-scoped access facts and filters silently never matched).
The dialog's scoped seeding (SPEC §UI "never prompts that binding")
hid only the axis matching the screen's type; ancestors still prompted.
The read model keeps the chain; the write model now derives it at the
construct seam. Authored explicit ancestor values survive (draft axes
overlay the derived chain). Validation: cts + instances suites green
(154); processes/shared/server sweep green except 15 pre-existing
failures on `local` head (4 fact-display, 11 agent-tooling-loop /
invitations — another session's in-flight work, reproduced without this
change). Guards: check-arch, framework:validate, docs:validate, SSR
smoke green. E2E not run (dev stack serves the primary tree; contextual
create is covered next stack run by process-generated-screen's child
region leg).

### Agent Notes (2026-10-27, agent/lineage-context-2-20261027)

Owner reported the symptom persisting. The live manifest confirmed the
projection fix served clean for protocol modes (xlsx upload: payload +
queueId alone) while `mkAttempt` (genericCreate) still prompted
`lineage.projectId`: the authored definition document persisted
construction inputs machine-stamped from the retired recursive contract
(`authoring.js` stamps node inputs from the contract of the moment), and
`normalizeConstruction` only dropped stale authored extras for declared
modes — on genericCreate they survived verbatim as prompts. The
reconciliation now runs on every mode: an authored input the current
contract leaves unaddressed dies at compile (a block-composed construct
keeps its canonical block entries), so the stale stamps self-heal at
serve and the stored drafts clean on their next authoring touch — no
definition rewrite needed. Compiler pin added; processes 545 green, cts/
shared/instances green (4 known fact-display failures pre-exist).
`packages/processes/README.md` already states the law ("compilation
discards construction inputs the current domain contract has retired") —
the cut makes the sentence true.

Status: WAITING owner verification.

## Table row rhythm, card overflow, and icon noise (owner direction
2026-10-27)

Law: SPEC §22.8 (glyph law, card overflow), §22.10 (row-surface
separation), §22.11 (membership overflow). Owner findings: the row gap
the table had is still gone; a card's show-more should open the
instance popup, not unwrap the card; typography is ugly with instance
icons sprayed at random.

- [x] The row gap returns as the row-surface recipe's other half:
  `LAYOUT.rowSurfaceTable` (`border-separate border-spacing-x-0
  border-spacing-y-1`) through the pt table channel — the recipe owns
  the clip and the separation, §22.10 names it, and the scoped-style
  wedge stays dead. (Round 12's cleanup had swept both the cell-padding
  token and the separation; the token returned in round 16, the
  separation now.)
- [x] Card overflow opens the record popup (§22.8): the group
  membership overflow and the board card's fact overflow open the
  instance's record popup through `useEntityPopup` — the record surface
  carries the full set — with the screen's open channel as fallback and
  the `+n` count when nothing opens; the per-card unwrap state dies.
- [x] The glyph follows the round-6 name law (§22.8): homogeneous
  collections repeat neither the type name nor the type glyph per card
  — the icons die on card-grid, board, stat, gantt, and row/detail
  surfaces; the collection title bar, the record header avatar,
  ParentRef, and reference chips keep their icons (mixed-type and
  containment context).

### Agent Notes (2026-10-27, round 18)

Session `agent/genui-rowgap-20261027-2100` (worktree
`.agent-worktrees/genui-round18`). The icon noise was the round-6 law
half-applied: names died per card, glyphs stayed — every identity row
in every projection carried a type glyph the collection's own header
already states.

Status: WAITING owner verification.

### Agent Notes (2026-10-27, agent/lineage-context-3-20261027)

The reload asymmetry explained the persisting symptom: the dev server
externalizes workspace packages (`#packages` law), so the running nitro
process kept the pre-merge `packages/processes` module in its Node
module cache while the `packages/cts` change served fresh — protocol
modes healed (xlsx), the compiler reconciliation did not. While
verifying, one more seam surfaced and closed: lineage axes are contract
vocabulary on every construction path — a block-composed construct
reconciles its authored `lineage.*` entries against the contract's
lineage set (the immediate axes), so a stale ancestor stamp dies there
too; composed `fields`/`name` entries stay authored. Compiler pins for
both; processes 546 green; the running stack needs an app-container
restart to drop the cached module.

Status: WAITING owner verification.

## Identifier icons and the groups projection (owner direction
2026-10-27)

Law: SPEC §22.3 (bare title bars), §22.8 (identifier icons), §22.11
(groups projection). Owner findings: icons belong on exact instance
identifiers, never on type names — the state was inverted (bare card
titles, iconed table titles); and round 17's membership chips dumped
every child of every type into cards.

- [x] `InstanceIdentity.vue` is the one instance-identifier surface:
  the record's icon (authored glyph, the record's declared thumb
  winning) beside its identity link, consumed by every projection
  (card-grid, board, stat, table identity cells, gantt, timeline,
  calendar, row/detail bodies). The collection title bar drops its
  icon — type names render bare (§22.3 amendment).
- [x] The `groups` projection replaces membership cards: a group-class
  collection renders each group instance as a group — its identifier
  heading a section, its members beneath as identifier rows (every
  children edge's instances over the overlaid pool), member count
  beside the header, budgeted per group, overflow opening the group's
  record popup. The class outranks incidental field shape in the
  matcher; `LIST_LAYOUT_VALUES` and the row weights carry `groups`.
- [x] The random world gains a prose floor (a long-body file type) so
  the timeline projection stays reachable — groups now outrank
  incidental chronology on group types; the world spec pins it.

### Agent Notes (2026-10-27, round 19)

Session `agent/genui-identicon-20261027-2140` (worktree
`.agent-worktrees/genui-ident`). Round 17's card-grid-for-groups was the
wrong reading of "rendered as groups in their dataviews" — the group
instance IS the group: a section of members, one level, no tree, and
the chips-in-card presentation dies with it. The identifier component
centralizes what nine projections hand-rolled.

Status: WAITING owner verification.

### Agent Notes (2026-10-27, agent/lineage-row-20261027)

The persisting dialog symptom lived client-side: the served policy types
lineage inputs `entity`, and `resolveCreateDialogInputs` ran its
operator-reference branch before the lineage branch — the row rendered
as a plain ref picker with the `lineage` binding stripped, so the launch
context could seed and hide nothing and the parent prompted by hand
inside the parent's own surface. The lineage branch now owns `lineage.*`
ids first; the served-shape policy pin (entity-typed lineage field)
joins the suite, closing the fixture gap that let this survive (specs
fed bare construction strings, the served shape arrived typed).
Verified against the live org's served manifest + bundle: inside the
queue detail, `mkAttempt` prompts `fields.label` alone and the xlsx
upload prompts its file alone. shared suites green (4 known fact-display
failures pre-exist), SSR smoke 16, check-arch green; app container
restarted to serve the module.

Status: WAITING owner verification.

## Group membership leaves the collection (owner direction 2026-10-27)

Law: SPEC §22.11 (rewritten). Owner verdict on the groups projection:
pure slop, awful, not an appropriate approach in the collection at all.

- [x] The `groups` projection dies whole: `GroupCollection.vue`, the
  class matcher entry, the `groups` layout value and row weight, the
  RegionCollections branch, and the group child-type overlay loading.
  A group-class collection is its record collection like any other —
  the standard matcher derives its projection over shape, size, and
  data columns.
- [x] Membership renders on the record surface alone: the record
  ladder arranges the child collections on the record page and popup.
  The identifier-icon law (§22.8) and the record-popup overflow stand
  untouched.
- [x] The random world's prose floor stays (a structural timeline
  guarantee, now standing on its own); the fixtures folder pin returns
  to the plain table.

### Agent Notes (2026-10-27, round 20)

Session `agent/genui-groups-revert-20261027-2230` (worktree
`.agent-worktrees/genui-groups-revert`). Two attempts at membership in
the group collection (chips in cards, then member-row sections) both
failed review; the collection is the wrong place. The record surface
already arranges members through the ladder — that is the whole
membership story.
Status: WAITING owner verification.

## Display-aware columns, editable tables, picker repair (owner
direction 2026-10-28)

Law: SPEC §4 (the collection-cell pencil), §22.8 (the table floor).
Owner findings: identifier+state data still becomes a datatable (field
or component selection wrong); the list contract should carry generated
buttons and editable nulls so tables edit; pickers show "[object
Object]" for selected data; instance picking needs the proper pickers
everywhere; the identifier icon has a huge gap to its title.

- [x] The column floor is display-aware: `resolveListControls` carries
  `relationColumn` (the first declared relation, a column only when any
  loaded instance carries its refs — the table renders it on the same
  law and the `columns` signal counts it filled-only), and `isFilled`
  treats a null-valued quantity as unfilled (it renders the fallback
  dash). A declared-but-unfilled relation or a column of dashes no
  longer keeps a name pile in the table projection.
- [x] Tables edit (SPEC §4): scalar cells are `InlineField` in a new
  cell variant (the hover zone without the padded look — preset cell
  padding stands), editing in place through the per-field pencil on
  patchable surfaces — nulls included — and patching through the
  region's `inline-change` channel (`emitPatchFor(instance, changes)`
  generalizes the body's patch to the row's instance). Rows carry the
  per-instance ellipsis menu (the card-grid run contract) when quick
  actions exist.
- [x] The instance picker's AutoComplete displays its selection: the
  model `{ type, id }` ref resolves to the option carrying it, so the
  input shows the record's label (a bare ref stringified to
  "[object Object]"). The chat's prompted instance fields already ride
  the shared `InstanceSelect` wrapper; the audit found no other raw
  instance pickers.
- [x] The identifier's icon-to-title gap was the preset's link-button
  horizontal padding (12px) compounding the identifier's own 8px gap —
  measured 21px. `InstanceIdentity` strips the link's horizontal
  padding: the identifier surface owns its spacing.

### Agent Notes (2026-10-28, round 21)

Session `agent/genui-tablefloor-20261028-0110` (worktree
`.agent-worktrees/genui-tablefloor`). The identity+state table survived
round 16's floor through two leaks: the relation column counted by
declaration (an empty column with a header kept the table alive and
rendered) and null-valued quantities counted as filled (columns of
dashes). Both now follow the one law the floor already claimed: a
column renders what displays, or it stays out. Gap measurement and the
relation/quantity pins live in the spec; `.playwright/genui-identgap.json`
records the 21px measurement.

Status: WAITING owner verification.

## Projection floor everywhere, honest menus and refs (owner direction
2026-10-28)

Law: SPEC §22.8 (the table floor). Owner findings: an ellipsis opening
an empty menu in table rows; label-with-state collections still forming
tables; "Н/Д" chips; flat label lists where the instances are the most
data-rich.

- [x] The ellipsis renders per row/card only where that instance has an
  applicable action (`actionAppliesToEntity` per instance) — a
  type-level action set never opens an empty menu (table, card grid,
  board alike).
- [x] The stored board→table projection preference obeys the table
  floor: a boardable type with no data column beside identity and
  state stays a board — the latched per-type view state no longer
  overrides what displays.
- [x] Relation refs normalize through the one app resolver at every
  generator site (table relation column, detail relation sections, ref
  field values): stored shapes without a type adopt the relation's
  single declared target (the descriptor's first accepted type for ref
  fields), so chips resolve instead of rendering the locale's Н/Д; the
  compact ref's unresolved fallback rides the one type-label chain (raw
  type ids stay internal).
- [x] The handful-size rule retires (`size: small → list` and the size
  signal): the display-aware columns floor subsumes it — a small rich
  collection renders its data (table/cards), a small name pile still
  stacks. `SMALL_LIST_AT` dies with it.

### Agent Notes (2026-10-28, round 22)

Session `agent/genui-projections-20261028-1035` (worktree
`.agent-worktrees/genui-round22`). Н/Д was `common.notAvailable`
rendering on relation references the chip could not type — stored
relation refs without a type component; the resolver that handles every
stored shape existed all along (utils/instance-relations.js — the
explorer's), the generator surfaces simply never consumed it.

Status: WAITING owner verification.

## The projection switch is the user's explicit view (owner direction
2026-10-28)

Law: SPEC §22.8 (the table floor governs derivation). Owner finding:
collections that had the view switch render only the board — the table
view became unreachable.

- [x] Round 22 over-reached: binding the table floor to the STORED
  preference blocked the user's explicit choice on floor-failing board
  types. The floor governs the default derivation alone; a stored
  preference is the user's view and renders.

### Agent Notes (2026-10-28, round 23)

Session `agent/genui-switch-hotfix-20261028-1115` (worktree
`.agent-worktrees/genui-hotfix`).

Status: WAITING owner verification.

## Ref chips recognize every stored shape (owner direction 2026-10-28)

Law: the one relation-ref resolver owns ref recognition. Owner finding:
Н/Д badges persist — the generative UI fails to recognize stored data
shapes.

- [x] FieldControl's ref dispatch and ObjectSummary subfield refs
  normalize through `resolveInstanceRelationRefs`: alternate id keys
  (`instanceId`, `_id`, `value`), bare ids, and typeless refs resolve
  (the descriptor's first accepted type as the fallback), with the
  revision channel passing through. The Н/Д badge stays the last
  resort for genuinely empty values.

### Agent Notes (2026-10-28, round 24)

Session `agent/genui-refshapes-20261028-1140` (worktree
`.agent-worktrees/genui-refshapes`). The audit of every
`InstanceInlineRef` call site: the table relation column and detail
relation sections normalized in round 22; the ref FIELD dispatch read
`.type/.id` alone — stored shapes the app's own resolver knows
(`instanceId`, `_id`, bare ids) fell to the Н/Д badge. All generative
ref consumption now rides the one resolver.

Status: WAITING owner verification.

## Relation-grammar columns and the N/A retirement (owner direction 2026-10-28)

Law: SPEC §22.8 (the table floor) + SPEC §6 (one relation grammar).
Owner findings: N/A badges in generated collections; flat
identifier-only lists on top-level data-rich types; card footer
whitespace.

- [x] Ref fields join the relation column: `resolveListControls`
  derives `relationColumn` over explicit edges ∪ declared ref fields
  (their wire values ride `relations.<name>` — the storage law now
  stated in the instances README). The typeless-shape fallback adopts
  the ref field's first accepted type. A filled ref field alone earns
  the table projection — facade-order, project, and every ref-carrying
  group render the chip column.
- [x] The structural summary column: the first filled json/record/map
  field derives `summaryColumn` and renders a bounded inline summary
  cell (narrow hosts shed it); `tableDataColumns` counts it —
  nesting-attempt (label + result json) renders its data.
- [x] The N/A badge dies in generated ref display: `FieldControl`'s
  ref dispatch renders nothing when the value resolves no reference
  (empty and unrecognized shapes alike); `SurfaceBody` row facts read
  ref values from `relations.<name>`.
- [ ] Card footer whitespace: NOT reproduced. Measured on a live card
  grid (probe `.playwright/genui-round25.json`): 0px gap below every
  card's last child, 20px card-body padding, no stretch (the grid is
  `items-start`). Needs the owner to name the surface (screen + type)
  — the board columns, the record popup, or the entity-card family are
  the unprobed candidates.

### Agent Notes (2026-10-28, round 25)

Session `agent/genui-round25-20261028-1500` (worktree
`.agent-worktrees/round25`). Diagnosis was measured on a live org
reproducing the owner's type shapes (`e2e/zz-round25-probe.spec.js` →
`.playwright/genui-round25.json`): the project list rendered one N/A
badge per row (the row fact read `fields.libraries` while the value
lives in `relations.libraries`), and all four ref/json-rich types
rendered zero tables (the columns signal counted short scalars and
explicit edges only). Fixes land in the contract
(`resolveListControls`/`tableDataColumns`), the materializations
(CollectionTable relation target + summary cell, SurfaceBody row read,
FieldControl ref render-nothing), and the storage law is now stated in
the instances README beside the §3 shape. Specs: the two new
relation-grammar pins + the summary pin in ui-mapping.spec; the new
`ui-mapping-refcolumns.ssr-smoke.js` mounts the real engine over the
live shapes and asserts the columns render, chips resolve, and no
N/A text exists. 177 unit + 19 SSR green; check-arch green; check-docs
green except the pre-existing jagua-rs submodule link.

Status: WAITING owner verification.

### Agent Notes (2026-10-28, round 25 follow-up)

The live probe's verification pass exposed a second stored shape: the
construct boundary scalarizes ref drafts to bare ids under
`fields.<name>` (the dialog boundary law) while relation operations
write ref objects under `relations.<name>` — the probe org's projects
stored the first, the owner's order data the second. The column
filledness, the table relation cell, and the row fact now read both
blocks through the one resolver; the instances README states the
two-block storage law beside the §3 shape.

Live verification (after `docker compose -f docker-compose.dev.yml
restart app` cleared a stale `#shared` transform — the documented
dev-server trap): the probe org's project list renders the
`Record | Libraries` table with resolved chips (both stored shapes),
the attempt list renders `Record | Result`, identifier-only types stay
the bare list, and the N/A census is zero across every screen
(`e2e/zz-round25-probe.spec.js` → `.playwright/genui-round25.json`).
The card footer measured clean on the live card grid: 0px below every
card's last child, 20px body padding, no grid stretch.

## Relation action placement repair (owner direction 2026-10-28, SPEC §22.12)

Owner findings: the "Link {type}" button renders in the top-level list
page header (assigned before, seemingly ignored); no Unlink option
anywhere; linked instances display in the parent table while children
do not.

- [x] The class-list link button dies: `RegionBlock`'s section link
  control now requires the §22.12 relation-section binding
  (`relationParent`) — the delivered gate existed for unlink alone, and
  the compiler legitimately carries the link action on typeList regions
  (every role action targeting the type), so the materialization owns
  the scoping. Link renders in the relation section toolbar on the
  record detail; a class list renders none.
- [x] Unlink reaches the bare-list projection: relation-scoped sections
  whose target type derives the `list` projection (identity-only
  records — the common linked-library shape) render their unlink
  actions in the row's ellipsis menu (`SurfaceBody` row carries the
  `{ parent, actions }` contract like the table and card rows; the run
  context binds the parent record and the row's relation ref).
- [x] Record-body chip menu repair: `inlineRefEntries` read `ref.type`
  off the normalized refs (they carry `typeId`), so multi-target
  relations never bound their chip menus and the run context carried no
  type — now reads `typeId` in both the filter and the payload.
- [x] Children placement verified, not changed: children render on the
  record surface (the detail's children-slot sections — pinned by the
  new SSR smoke) and in the workspace explorer; a class list stays
  flat (SPEC §22.11, the rounds 17/19/20 owner verdicts). A children
  column in the parent table is an explicit owner decision away.

### Agent Notes (2026-10-28)

Session `agent/genui-round26-20261028-1700` (worktree
`.agent-worktrees/round26`). New
`test-tools/ui-mapping-relation-actions.ssr-smoke.js` mounts the real
engine over a parent/child world with a declared relation and pins all
three laws: no link on the class list, link in the relation section
toolbar + unlink row menus, children sections on the record detail.
Validation: 22 SSR green (16 prior + the new 3 + the refcolumns 3),
178 unit green (ui-mapping, design-system, module-imports, test-data),
check-arch green, check-docs green except the pre-existing jagua-rs
submodule link. Live spot-check: the probe org's parent table renders
`Record | Libraries` with resolved chips.

Status: WAITING owner verification.

## Children display in parent collections (owner direction 2026-10-28)

Owner confirmation over the round-26 report: children ARE wanted in the
top-level parent table, symmetric with the relation column.

- [x] The children column: a type declaring children edges renders its
  loaded children as chips beside identity in the table projection —
  every children edge's instances whose lineage points at the row
  (`childrenOfParent`, the one containment matcher), budgeted like the
  relation chips (`ROW_RELATION_BUDGET` + `+n`). Presence derives live
  over the pool: the compose-time `childrenColumn` signal counts toward
  the table floor, and the materialization derives live so the lazily
  overlaid child types (the ParentRef overlay seam, generalized to
  child types) light the column when they land. Label: the single
  children edge's key label; `uiMapping.childrenColumn` when several.
- [x] Class lists stay flat in ROWS (no tree projection) — the children
  column is the parent's data beside identity, the relation column's
  mirror.

### Agent Notes (2026-10-28)

Session `agent/genui-children-column-20261028-1745` (worktree
`.agent-worktrees/round27`). The SSR smoke gained the children-column
pin (the relation-actions world already carried parent + children);
chip labels resolve against the served type view, so the SSR harness
asserts structure and the live probe asserts labels. SPEC §22.11's
"membership renders on the record surface" sentence now reads against
the children column — owner direction this session overrides; SPEC
reconciliation is an owner edit (SPEC files are agent-untouchable).

Status: WAITING owner verification.

## Chip-cell overflows open the record (owner direction 2026-10-28)

Owner findings on the children column: the `+N` badge does nothing, and
the chip cells are flat piles with no route to the full structure.

- [x] The relation and children chip cells' overflow controls open the
  row's record popup (`useEntityPopup`, the round-18 overflow law — the
  record surface carries the full relation and child sets); the
  screen's open channel is the fallback. The inert `+n` Tags die.

### Agent Notes (2026-10-28)

Session `agent/genui-overflow-20261028-1815` (worktree
`.agent-worktrees/round28`).

Status: WAITING owner verification.

## One children column per edge (owner direction 2026-10-28)

Owner verdict on the single children column: one flat dump of every
child type is slop.

- [x] `childrenColumns` — one column per declared children edge: the
  edge's key labels its column, only that edge's instances ride it,
  per-edge filledness (an unfilled edge renders no column), each with
  its own chips budget and record-popup overflow. The generic
  `uiMapping.childrenColumn` locale key dies with the dump. The floor
  signal counts every filled children column.

### Agent Notes (2026-10-28)

Session `agent/genui-children-peredge-20261028-1850` (worktree
`.agent-worktrees/round29`). `childrenOfParent` gains the per-edge
filter option (still the one containment matcher).

Status: WAITING owner verification.

## Random world decorruption (owner direction 2026-10-28)

Law: the random UI world generator rolls its world; nothing overwrites
a rolled type, edge, or count with hand-authored shapes or vocabulary.
Owner verdict on the accreted "guarantee" machinery (projection
floors, forced class list, the Stage/Batch/Amount/Holder/Note
volume-type stamp, peer-host claiming with rolled-edge deletion, the
reserved empty type, concentrated lineage, weight-sized peer counts,
forced 60/0 instance counts, the forced empty/missing screens): sabotage
— delete it all.

- [x] `test-data/ui-mapping-random.js`: classes, fields, edges, and
  instance counts are pure seed rolls again (the 2026-09-19 law).
  Post-roll touches are validity floors alone (authored name/glyph,
  an identifier flag somewhere, a control pin somewhere, nullable
  marking on refs whose targets rolled empty). Transition actions
  author no label — the resolver names them from their target state.
  The `sourceStatesMatrix` stays (an opt-in showcase overlay, it
  mutates nothing).
- [x] Spec migrated: determinism, CTS `checkValue` conformity,
  whole-world composition, traits/arrangement totality, and the
  validity-floor/matrix pins stand; the guarantee pins (volume table,
  prose floor, peer columns, empty/missing screens, >50 collection)
  die with the machinery. The SSR smoke's pinned seed 37 carries
  board/gantt/calendar naturally — no pin needed.
- [x] Docs: test-data, shared/ui-mapping, pages/test READMEs state the
  rolled-world law.

### Agent Notes (2026-10-28)

Session `agent/random-world-decorrupt-20261028-1405` (worktree
`.agent-worktrees/decorrupt`). Corruption timeline established before
the cut: `1eb7248ee` (10-21) introduced the volume/peer/empty
machinery; `2544b7068` (10-25) forced the class list and projection
floor stamps; `3b6e882a8`+`c26963809` (10-27, round 11) stamped the
hardcoded Serial/Stage/Batch/Amount/Holder/Note field set over the
rolled volume type; `ecdf27f02` (round 19) added the prose floor. All
deleted. Post-cut verification across seeds 1–400: every world
composes; natural layout coverage per seed spans table/card-grid/
timeline/stats/gantt/calendar/board with no stamps (seed 37 alone
carries board+gantt+calendar+table+timeline); empty types occur
naturally. Validation: random-world spec (8), test-data+ui-mapping+
design-system suites (175), SSR smoke 16, check-arch green; check-docs
reports only the pre-existing jagua-rs submodule link.

Status: WAITING owner verification.

## Plugins upgrade affordance defect (owner report 2026-10-28)

The owner's session saw the installed-plugins table (facade v17) and the
catalog list (facade v24) with install buttons on catalog rows, and no
upgrade tag or button on the installed row — while the same page through
the same app rendered both for a headless probe with an identical
install. The upgrade went through the console transport, so the
consent-diff surface was bypassed once. Unreproduced; re-probe with the
next catalog version bump.

- [x] Root cause (2026-10-28, same day): an inert bare `<template>`
  wrapper inside the installed-row actions cell — hidden by UA style,
  it zero-sized every action button (upgrade, connector, settings,
  uninstall) since it landed; the catalog rows' install buttons sit
  outside it, which is why those rendered. The wrapper is deleted and
  `e2e/plugins-upgrade.spec.js` pins the whole consent workflow
  (affordance renders → diff dialog → confirm → version lands); the
  upgrade gate now also refuses removed types still bound by authored
  definitions, so a rename can never again strand an org's compile.

## Facade domain model — template, design, instance (facade SPEC, owner direction 2026-10-28)

The facade flow becomes a six-type family (cassette-template,
cassette-design, cassette-instance, sheet-design, sheet-cut-plan,
sheet-instance) composed through declared constructs, relations, and the
generic machinery; the sheet-design editor edits the opened record on
one canvas (multi-sheet retracted, owner direction 2026-10-28 evening).
Ordered steps:

- [ ] WAITING — owner verification: Face parameter tables and shared
  canvas navigation (owner direction 2026-11-04): a face sketch carries
  its authored table and its placement instance table apart, like a
  profile workpiece; its add shapes author the face, while a subtract-only
  set cuts the face's base host, so it needs no closed add outline. The
  selected face's details carry the parameter fields,
  and the face editor folds the placed values into its view. The
  cassette assembly canvas uses CadCraft's wheel zoom and middle/right
  drag pan, the same navigation as the profile and face editors.

  ### Agent Notes (2026-11-04, face parameter tables and shared navigation)

  Session `agent/cassette-editor-unification-20261104`. Face sketches now
  carry `node.sketch.parameters` (authored) and `node.instance`
  (placement overrides); `normalizeCassetteV2Face` returns both tables and
  the derived table, the renderer evaluates the derived table in the
  cassette scope, the selected face details render the same parameter
  fields as a placed profile, and the face editor folds placed values
  into its view. Add shapes author the face; a subtract-only set cuts the
  face's base host. Multi-shape sets no longer require one closed add
  outline.
  `normalizeCassetteV2Face` keeps a trapezoid face's sketch empty instead
  of injecting the profile template. Placement override expressions now
  resolve in the cassette scope first, so a chip naming cassette R reads
  the cassette's R even when the sketch authors R; authored shape
  expressions keep their inner rows. Global renames rewrite face instance
  rows and sketch bindings. Sketch edits now commit to the cassette live;
  Back keeps them and the explicit save actions write library records
  only. `DrawingCanvas` gained `cadcraftNavigation`
  (exponential wheel zoom at the cursor, middle/right drag pan, middle
  double-click refit) and the designer passes it, so the assembly and
  sketch canvases use one navigation contract. Focused tests:
  `cassetteV2Renderer.spec.js`. Guards: `check-arch.js`,
  `framework:validate`, `plugin-deps:check`,
  `perigram-plugin validate workers/facade/listing.json`.
  `docs:validate` still reports the pre-existing broken
  `workers/nesting/README.md` link.

- [ ] WAITING — owner verification: Smart dimensions on the cassette
  assembly canvas (owner direction 2026-11-04): a selected face or profile
  draws its inner shape dimensions on the dimension layer in the sketch's
  CAD dimension style; a dimension label edits its authored shape field in
  place, the same editing the profile and face sketch editors carry.

  ### Agent Notes (2026-11-04, assembly smart dimensions)

  Session `agent/smart-dimensions-20261104`. `selectionDimensionAnnotations`
  maps the selected target's `buildProfileAnnotations` rows into the
  assembly drawing's `dimensionAnnotations`;
  `cassetteV2AssemblyEntitiesFromDrawing` carries each row's kind, diameter
  center and dimension style; the designer opens the shape field through
  `profileDimensionField` and commits it to the cassette. Face selection
  renders the assembly so the face's frame matches its inner dimensions.
  Profile sketch reads resolve through `cassetteV2ProfileSketch`, so a
  workpiece-level `sketch` opens in the editor and its dimensions edit;
  the first write stores the sketch in `profileSnapshot.sketch` and drops
  the workpiece-level copies. A sketch face carries its dimensions on the
  sketch layer; the cassette dimension layer holds the trapezoid faces'
  rows only. Validation: facade surface specs,
  `cassette-profile-editor` e2e.

- [ ] WAITING — owner verification: Parametric faces and shared edges
  (owner direction 2026-11-02; profiles 2026-11-03): faces author as
  parametric sketches in the profile shape model and store the evaluated
  OCCS polygon with the authored sketch in the face extension; child
  faces share a host edge through free-shard allocation with expression
  `edgeStart`/width; open profiles place by their array settings across
  the whole edge and reserve no interval; folds use each face's owned
  interval; closed profiles cut without consuming edge space.

  ### Agent Notes (2026-11-02, face shapes and edge shards)

  Session `agent/face-shapes-20261102` (worktree
  `.agent-worktrees/face-shapes-20261102`). `cassetteV2FaceSketchFromNode`
  seeds a sketch from the current outline; `updateCassetteV2FaceSketch`
  writes or clears it; `resolveCassetteV2FaceSketchRegion` folds the
  shape list from empty and requires one outline. `buildCassetteV2TreeCurves`
  is async and emits sketch faces as polygons; OCCS face extensions carry
  the authored sketch. `edgeStart` is a trapezoid parameter and
  `cassetteV2FreeEdgeShards` allocates child faces to disjoint
  intervals; open profiles place across the whole edge.
  `profileTerminalEdgesForTree` and the terminal edge exclusion are
  retired. The canvas draws one + per free shard and skips the face's
  own base edge; the face actions popup carries edge start plus Fill
  edge / fixed width, and the clicked shard is the interval the face
  takes. The face editor's datum
  is the parent edge line in shard coordinates, with the parent face
  ghosted around it. Focused tests: `cassetteV2Renderer.spec.js`,
  `profileAnnotations.spec.js`, `profileEmbedding.spec.js`,
  `evaluate.spec.js`.

  ### Agent Notes (2026-11-02, face subtract cuts)

  Session `agent/face-shape-parent-cut-20261102`. A sketch face's add
  shapes resolve the face; its subtract shapes emit parent-face cut
  entities through `faceSketchCutEntitiesForTree`, placed by the face's
  shard frame and consumed by the 2D drawing, folded 3D, and OCCS
  document passes. The evaluated add ring rotates so E0 is the datum
  edge, keeping fold routes and edge indexes stable through conversion.
  Face cuts ride the face's shard frame; profile footprints reserve no
  shared edge interval.

  ### Agent Notes (2026-11-02, face/profile placement coordination)

  Session `agent/face-profile-overlap-20261102`. Fold-edge refusal is
  edge-based: `profileFoldEdgeRefusalsForTree` refuses an open profile on
  an edge carrying a fold. Faces place on free shards and closed profile
  cuts ride the host edge independently. Assembly face fills carry every
  face's outer ring and holes with `evenodd`, so profile and face cuts
  stay open in assembly previews.

  ### Agent Notes (2026-11-02, face material cuts the parent)

  Session `agent/face-cut-child-subtract-20261102`. A face sketch folds
  through the full ordered sequence: adds form the face, subtracts cut
  it and ride `cut.inner`. The child face clips to its side of the datum;
  the parent-side material emits parent cut entities through
  `faceSketchCutEntitiesForTree`, so a custom face shape crossing the
  datum cuts the parent without doubling the child panel over it. The
  fold route uses the child's owned interval on the host edge; the 3D
  fold consumes that same interval. Nested cut paths fill with `evenodd`
  and the authored fold edges carry the fold route, so a notch stays open
  and the bend line stays continuous. A subtract shape also cuts the
  parent wherever it lands; the parent cut footprint is the union of the
  adds and subtracts. Face fills stay per face, so adjacent faces keep
  separate fills. Closed profiles cut across a fold interval with the
  authored bend route intact. The sketch editor's rect and circle
  boundary grips resize the authored shape by drag (axis-aligned rects;
  circle diameter), with one history entry per drag and live reseeding;
  plain clicks still select on pointerup.

  ### Agent Notes (2026-11-03, profiles use the whole edge)

  Session `agent/profile-whole-edge-20261103`. Child faces alone occupy
  edge shards (`faceEdgeIntervalsForChildren`); `addCassetteV2ProfileWorkpiece`
  places every open profile across the whole edge with no span
  allocation, and the attachment popup carries array edge, rule, and
  value without span fields. Profile footprints leave `designerEdges`
  shards free. Open profiles arrange only on fold-free edges
  (`profileFoldEdgeRefusalsForTree` checks `getCassetteV2FoldEdges`);
  closed footprints still cut across a fold interval. Focused tests:
  `cassetteV2Renderer.spec.js`, `profileEmbedding.spec.js`.

- [ ] WAITING — owner verification: Attachment array definition (owner
  direction 2026-11-04): placement modes are point, edge array, and face
  array over one versioned definition. Each axis carries count, step, gap,
  or span rules with start/end offsets; face arrays add grid padding,
  stagger, frame rotation/mirror, radial rings with center/radius/ring
  spacing/start/sweep, item orientation, suppression by copy key, and
  clipping. Open profiles stay edge-only. Edge arrays include the copy
  footprint in the span and refuse an impossible rule.

  ### Agent Notes (2026-11-04, canonical array engine)

  Session `agent/array-engine-20261104`. `patterns.js` owns the versioned
  array definition, edge/grid/radial geometry, copy keys, suppression, and
  clipping; `hardware.js` keeps hardware copy bounds. The renderer,
  folded preview, and profile embedding consume the same definition.
  Legacy flat patterns normalize on read, while the editor writes nested
  `pattern` patches. `attachmentErrors` carries refusals, and the
  production document refuses invalid arrays. Focused tests:
  `patterns.spec.js`, `profileEmbedding.spec.js`,
  `cassetteV2Renderer.spec.js`, `cassetteV2FoldedPreview.spec.js`.

- [ ] WAITING — owner verification: Face and profile sketch grips
  resize the authored shape by drag, and the shape panel fields mirror
  the dragged values.

- [ ] WAITING — owner verification: Profile editor isolation (owner
  direction 2026-11-02): the profile editor edits and evaluates the
  authored sketch alone; placement instance rows never enter it, saving
  preserves them, and cassette globals are never serialized as profile
  or override rows.

  ### Agent Notes (2026-11-02, profile editor isolation)

  Session `agent/profile-isolation-20261102`. The designer stops passing
  `instanceParameters` to `ProfileSketchEditor`; the editor component no
  longer has an instance channel. Save preserves
  `profileDraft.preservedInstance`, and the draft gate evaluates the
  authored sketch. `normalizeCassetteV2Profile` prunes scope-named
  instance rows, so existing polluted records clean on read/save.
  External-scope bindings no longer mint override rows in the editor.
  E2E `cassette-profile-editor` asserts the reopened editor measures the
  authored parameter, not the cassette chip.

- [ ] WAITING — owner verification: Listing compliance: delete the dead
  `states`/`transitions` blocks from cassette and cassette-design — CTS
  `normalizeType` drops the keys silently, so they are declaration slop;
  SPEC §7 owns state vocabularies at the process graph.
- [ ] WAITING — owner verification: Type family: rename `cassette` →
  `cassette-template` (id, glyphs already say it; stored installs +
  instances migrate), add `cassette-instance`, `sheet-cut-plan`,
  `sheet-instance` as item types (icons already in the ck-entity font),
  make `cassette-design.template` nullable (DXF imports carry none),
  align `sheet-design` identifier to `fields.name` (rename-field
  migration).
- [ ] WAITING — owner verification: Placements relation:
  `sheet-design.fields.parts` (flat cassette ref list) becomes a
  declared relation edge to cassette-design, `onRemove: detach`, one ref
  per placement, stored under `relations.parts` with the derived index;
  executor-returned relations merge through the construct boundary.
- [ ] WAITING — owner verification: Nesting provenance: solve input
  items are keyed by `designId`, placements without one refuse; solve
  output groups identical design multisets into (layout, count) pairs.
- [ ] WAITING — owner verification: `fromLayout` construct: consumes
  typed cassette-design refs (resolved, revision-pinned,
  provenance-stamped), validates the layout against them, emits geometry
  + the parts relation; an empty layout constructs a blank sheet.
- [ ] WAITING — owner verification: Nesting composition, cuts, and the
  sheet stack (owner direction 2026-10-31): the solve groups layouts by
  the full composition — sheet shape and the placement design-key
  multiset — and stamps `compositionKey` on both the group and the
  constructed sheet design. The org process nests the row's physical
  cassette count, constructs one sheet design per composition under the
  nesting attempt, reuses a stored design matching the composition key,
  and cuts every layout through a sheet instance and cut plan. The
  sheet-design editor splits a stack into another sheet design and moves
  one cut plan onto the copy.

  ### Agent Notes (2026-10-31, nesting composition and cuts)

  Session `agent/order-family-20261031` (worktree
  `.agent-worktrees/order-family-20261031`). Listing v29 adds
  `sheet-design.compositionKey` and the solve item's `designKey`;
  `groupNestingLayouts` keys on the normalized placement transforms +
  design keys + sheet polygon, so rotated or differently-sheeted
  layouts stay apart. `construct-sheet` stores the layout's
  compositionKey. `test-data/order-process-authoring.js` declares
  sheet-design/sheet-instance/sheet-cut-plan as attempt children, reads
  the row count into the nesting item, loops the solved layouts,
  branches on a stored composition match, and constructs the sheet,
  its physical sheet, and its cut plan; the replay path reuses the
  stored design. The sheet editor's tile carries the split action when
  more than one cut plan references it. E2E
  `e2e/order-process.spec.js` pins the family and the reuse.
- [ ] WAITING — owner verification: Queue entries are the physical
  cassette lines (owner direction 2026-10-31): `nesting-entry` is an org
  child type holding `design` and `count`; the queue creates one entry
  per physical cassette, and nesting reads those entries. The entry
  constructs its `cassette-instance` child. No repeat node, facade, or
  platform code carries the queue vocabulary.

  ### Agent Notes (2026-10-31, queue entries)

  Session `agent/queue-entry-clean-20261031` (worktree
  `.agent-worktrees/queue-entry-clean-20261031`). The order process
  declares `nesting-entry` under the order with `label`, `design`, and
  `count`, constructs one entry per table line, and constructs one
  cassette-instance per entry under the order. E2E
  `e2e/order-process.spec.js` pins three entries and three physical
  cassettes for three table lines, and the same on replay.
- [ ] WAITING — owner verification: Cassette designs are baked geometry
  with two authoring modes (`render` template+parameters, `upload` DXF);
  construction names derive so design pickers list readable records;
  the `nesting-polygons` projection emits one item per design carrying
  `designId` and every workpiece's parts; queue entries drive nesting by
  joining the entry's design ref to that item; XLSX rows become designs
  and entries through the order process. Existing Org1 process
  definitions re-author against the item-shaped projection; the
  name backfill is `server/scripts/backfill-cassette-design-names.js`.

  ### Agent Notes (2026-11-12, queue-entry join repair)

  Owner report: quantities rendered as "12 undefined" and org1's
  queue-entry creation left the nesting solve dead. Root causes, both
  reproduced live: (1) the create dialog's InputNumber wrote
  `{ value, unit: undefined }` for plain `number` rows and the payload
  scalarize keyed on `unit`'s presence, so `{ value }` objects stored
  verbatim and `formatQuantity` rendered the undefined unit —
  `numericControlWrite` (shared/ui-mapping) now owns the numeric write
  (quantity wraps, number stays scalar) and the scalarize reads
  `value` presence; (2) the 2026-11-09 re-authoring joined
  `fields.design.id` over typed refs, but the platform's construct law
  scalarizes ref-field drafts to bare ids (instances README), so every
  UI-created entry stored a bare id and the solve died on
  `entryParts: unmatched left keys` — `author-org-sheet-machine.js`
  joins `fields.design` (the fixture's lawful spelling) and its
  normalize pass now restores bare ids and scalar counts on stored
  entries. Org1 repair: re-run the script with
  `--org org-6a05940e --apply`.

  #### Agent Notes (2026-11-13, entry design column repair)

  Owner verdict after the 2026-11-12 session: count fixed, the entry's
  design still "not linked". Browser probe on the live stack found the
  read-side half: `resolveInstanceRelationRefs` (utils) silently dropped
  every bare stored id — its dispatch only recursed into
  `normalizeRelationRef` for objects and array items, never for a
  top-level string, so the construct boundary's lawful bare-id storage
  (`fields.design`) rendered as an empty Design cell on tables, detail
  surfaces, and cards (pinned by `utils/instance-relations.spec.js`).
  The write path and the dialog were correct all along; the browser
  probe (queue detail → New → pick design → Create) now lands the entry
  (`count` scalar, `design` bare id) and the Design column resolves
  every row's label. The design picker renders the ancestry tree
  (Project ▸ Queue ▸ designs) by the lintree law; deep leaves are
  reachable by expanding.

  #### Agent Notes (2026-11-13, record child section key)

  Owner report: no create buttons for empty child classes on record
  pages, despite access. Browser probe on the owner's exact flow (home
  → sidebar project → pane → queue) reproduced it: the Cutting queue
  pane showed ONE child section (Queue entry) where the compiled screen
  composes four. Root cause: `recordChildSectionKey` keyed every
  lineage-scoped child by its lineage key alone (`children:queueId`),
  so the four children of one queue edge collapsed to one key in
  `childRegionByKey` — the record document's section flow (live for
  every write-granted user through the overlay session, SPEC §26)
  rendered only the last child and the stubs never entered the flow.
  The key now composes lineage key + child type
  (`children:queueId:queue-entry`), pinned by screen.spec and the
  record-overlay spec; the pane now renders XLSX workbook, Cassette
  design, Nesting run, and Queue entry with their create buttons.
  Stored overlays carry the retired key in their authored orders:
  `migrate-overlay-child-keys.js` rewrites them (the child type
  resolves from the stored definitions' compiled screens; an
  ambiguous edge — two child types under one key — drops the entry,
  composition appending declared sections). Dev data repaired: 22
  orders rewritten, 2 ambiguous library entries dropped. Session
  incident, reported plainly: while drafting the migration an
  exploratory `updateMany` ran against the dev database and stamped a
  literal `:TYPEID` placeholder into 24 orders — the one-line repair
  pass above cleaned all of them; the runbook stays
  dry-run-by-default.

  ### Agent Notes (2026-11-09, cassette designs and queue entries)

  Session `agent/cassette-queue-designs-20261109` (worktree
  `.agent-worktrees/cassette-queue-designs-20261109`). The facade
  services name baked designs from template+parameters and imported
  designs from the DXF file; the projection returns one design item
  instead of a flat part list, so entries join by design ref and a
  multi-workpiece design reaches the solver as one item.
  `test-data/order-process-authoring.js` now declares `queue-entry`,
  builds one entry per XLSX row with the row count, projects the order's
  designs, joins entries to those items, and nests the entries; E2E pins
  the counts, the entries, and the sheet family. Backfill and rerun the
  order flow on a live org after the definition is re-authored.
- [ ] WAITING — owner verification: Nesting vocabulary — org-level
  `sheet` (width/height) and `machine` (tool diameter) types replace the
  solve's manual sheetWidth/sheetHeight/space prompts. The nesting
  attempt carries a `sheet` relation and a `machine` relation; the solve
  reads the attempt's sheet dimensions and machine tool diameter.
  `server/scripts/author-org-sheet-machine.js` authors this into an org
  through the definition API.

  ### Agent Notes (2026-11-09, org sheet and machine)

  Session `agent/org-sheet-machine-20261109` (worktree
  `.agent-worktrees/org-sheet-machine-20261109`). Ran the script on Org1
  (`org-6a05940e`, definition `process-6aca6604d2c6b24e605bf9c2`):
  `sheet` and `machine` types, one each per root; the nesting attempt's
  create form prompts both relations; `sheet`/`machine` create actions
  are exposed; the solve action carries no prompt rows (dimensions and
  tool diameter arrive by wire, and the tool diameter feeds the solve's
  `space`). Relation construction inputs are scalar for cardinality one
  and labelled by the target type name. The solve action carries no state
  gate, so a solved attempt keeps its run button for a re-run. The solve
  evaluates sheet stock from the item counts and prompts no sheet count;
  installed facade snapshots are repaired by
  `server/scripts/retire-nesting-sheet-count.js`. The design source
  projects every cassette design, so a queue entry may reference a
  library design outside the queue; entry design refs are normalized to
  typed refs for the join.

  ### Agent Notes (2026-10-28, family slice)

  Session `agent/facade-family-20261028` (worktree
  `.agent-worktrees/facade-family`). Listing v22 carries the six-type
  family with the `parts` relation edge and the design-keyed solve
  signature; `construct-sheet` validates placements against the resolved
  `designs` refs, copies their revision pins into `relations.parts`,
  and constructs blank sheets from an empty draft;
  `construction-services.js` merges executor-returned `relations`
  beside computed fields; `groupNestingLayouts` joins same-design
  layouts with counts; the editor palette patches geometry and the
  relation together over `queries.list('cassette-design')`;
  `migrate-facade-type-family.js` renames stored cassettes/refs/authored
  type ids before the v22 upgrade (the gate refuses removed types with
  live instances). The nesting-polygons projection output itself is
  unchanged — the design key enters at composition (the demo process
  wires `getField('_id')` from the bake result into `designId`).
- [ ] WAITING — owner verification: Cassette-design DXF import (owner
  direction 2026-10-31): the upload create prompts the file plus one
  layer-mapping control; the mapping assigns every DXF source layer to an
  OCCS target and requires `cut.outer`; the record stores the mapping
  beside extracted geometry. Template and source stay off the upload
  form; template-based creation is the `render` construct.

  ### Agent Notes (2026-10-31, cassette-upload)

  Sessions `agent/cassette-upload-20261031` and
  `agent/cassette-upload-fix-20261031`. `payload.inputs` is the
  type-level declaration for extra upload construction inputs; facade
  v34 declares `mapping` with the `layer-mapping` control pin and the
  OCCS target list, and the render operator's `parameters` input carries
  `cassette-parameters`. `LayerMappingRow` reads the uploaded DXF's
  layers and assigns them; `CassetteParametersRow` reads the picked
  template's OCCS parameter table through the served designer module and
  renders one input per parameter. A control pin on a declared field row
  now wins over the plain field descriptor (the earlier resolver branch
  dropped it). `extract-geometry` consumes `draft.data.mapping`,
  extracts every mapped target layer, stores the mapping on the record,
  and names the available layers when no source polygon maps to
  `cut.outer`. Constructible-false refs stay out of every create form
  (`constructible` rides the construction-input projection), so
  cassette-design `template`/`source` prompt only on their operator
  modes. Org1 runs facade v34; its upload action resolves `payload` +
  `mapping`, and its `bake` action renders from a template with the
  parameter table. The render dialog's template row loads
  cassette-template instances on demand when the screen does not source
  them; Org1's stale `templates → bake` data wire is removed so the
  template prompts instead of arriving from the graph. The Playwright
  probe drove the live upload dialog through file pick, layer
  assignment, and submit; the request carried `{ payload, mapping }`
  and the record stored both.

- [ ] WAITING — owner verification: Multi-sheet canvas, second pass
  (owner direction 2026-10-28 evening): explicit working set — sheets
  added from the sheet-design picker or as all siblings, one canvas
  with wheel zoom, drag-to-pan, and fit-to-set; cross-sheet placement
  drags; the instance behind a placement or sheet selection in the
  inspector. Surface contract 5 stays retired; the generic
  `DELETE /api/instances/:type/:id` transport and its ref sweep stay.
- [ ] WAITING — owner verification: Rename coverage on plugin upgrades
  (owner direction 2026-10-28 evening): a listing type's
  `renameFrom: <retired id>` makes the upgrade a covered migration —
  the preview reports the rename, the apply rewrites stored instances,
  typed refs, and authored type bindings to the new id before the
  per-type steps run; the drain gate refuses removals alone. The
  facade's `cassette` → `cassette-template` rides it (listing v26) and
  the one-shot migration script retires.

  ### Agent Notes (2026-10-28, rename coverage)

  Session `agent/rename-coverage-20261028` (worktree
  `.agent-worktrees/rename-coverage`). SPEC §20 carries the law.
  `buildUpgradePlan` maps a retired old id to its `renameFrom`
  successor: a `renamed` plan entry replaces the removed/blocked
  outcome (breaking shape gates still block as before; zero-instance
  successors re-break freely), the successor leaves the `added` list,
  and the shape diff lands in `changed` keyed by the new id so the
  existing §11 step loop consumes it. The apply runs
  `applyTypeRename` (`server/features/plugins/type-rename.js`, the
  migrations-module placement the arch guard demands) after the pin
  snapshot write and declaration invalidation, before the step loop —
  the step scanner matches on the new discriminator. Rewrites: class
  collections `type` discriminators org-scoped, typed refs
  (`{type, id}` objects under `relations`/`fields`, probe + deep walk)
  and authored `typeId` bindings in `process_definitions` drafts;
  bare-id refs ride the unchanged record id. The persisted pin strips
  `renameFrom` beside `migrate`. SDK grammar + validation cases,
  plugins service spec (plan + apply, 60 green), upgrade dialog gains
  the renamed row. `migrate-facade-type-family.js` deletes — the
  upgrade is the migration.

  ### Agent Notes (2026-10-28, chrome round)

  Session `agent/sheet-chrome-20261028` (worktree
  `.agent-worktrees/sheet-chrome`), owner review of the second-pass
  canvas. Zoom/pan adopt the DrawingCanvas law (wheel at the cursor
  x1.1/x0.9, dock x0.8/x1.25, shift-drag pans anywhere, fit-to-set).
  The inspector panel now owns composition: the working set's sheet
  rows and add/add-all picker, the cassette-design picker, and the
  instance behind a selection through `InstanceInlineRef` (added to
  the surface component pack); the palette keeps margin and layers.
  Pickers pass `typeId` on options so InstanceSelect renders the
  §22.13 instance option rows — the earlier flat unnamed list was the
  missing `typeId`, and the nameless rows were real data:
  construct-sheet never named its sheets. `constructSheet` now returns
  `data.name` (the construction boundary merges it into
  `fields.name`); existing dev rows backfill out-of-band.

  ### Agent Notes (2026-10-28, sane chrome round)

  Owner feedback on the chrome round: the rail read as visual hell.
  Kept by owner call: §22.13 preview thumbs and the compact micro cards
  in the inspector. Landed: `InstanceSelect`'s closed trigger renders
  the derived identifier label (one-line control rhythm; the option row
  rides the open list), the editor pickers pass `entity`+`typeId` and
  no hand-rolled label, working-set rows sit in one bordered row
  (`border-primary` marks the active sheet; the old wrapper's bg tint
  painted behind the borderless card and never showed), section labels
  carry the count chip, and both rails space on the ladder's 24px step.

  ### Agent Notes (2026-10-29, trigger repair)

  Owner feedback: the label-only trigger was worse — cassette designs
  (nameless records) rendered an empty trigger, sheets a bare text
  line, and the add-all icon button meant nothing. Landed: the closed
  control renders the selected instance's identity chip (chip-surface
  recipe + type glyph), the label chain is total (identifier title →
  wire name → option label → unnamed), `dtoToScreenInstance` absorbs
  the wire name into a null identifier row (the empty-value law),
  add-all is a labeled full-width button shown only when sibling sheets
  exist, and the trigger/filter/rows were verified live in the dev
  stack against `org-6a05940e` (chip + glyph confirmed in DOM; trigger
  52px one line). Finding: this org's five cassette-designs carry no
  name in any slot — records created before the designer's
  save-time rename; the picker shows their unnamed chip honestly.
- [ ] WAITING — owner verification: Demo process, seeds, and e2e
  recomposed onto the family (design refs threaded through the solve;
  grouped layouts consumed as sheet designs with counts).

  ### Agent Notes (2026-10-28, canvas slice)

  Session `agent/facade-canvas-20261028` (worktree
  `.agent-worktrees/facade-canvas`). Contract 5 mounts `construct.run`
  and `remove.record` over two new gated transports
  (`POST /api/instances/:type/construct`, `DELETE
  /api/instances/:type/:id` — the remove gate loads the entity and
  checks the compiled grant, fail-closed like patch); the instances
  store carries `constructInstance` through the outbox. The editor
  surface (listing v23, contract 5) renders one panel per sheet-design
  record, drags placements within a sheet magnetically, moves them
  between records on cross-panel drops (the source item travels, the
  target's free sweep re-clamps, both records commit on save),
  constructs blank sheets and deletes records through the transports,
  and keeps one canvas-wide undo stack. E2E corpus renamed onto
  cassette-template (the pairs-join table column stays `cassette` —
  it keys by template name, the join's leftKey); live E2E needs the
  running stack.

  ### Agent Notes (2026-10-28, retraction)

  Session `agent/unslop-sheet-editor-20261028` (worktree
  `.agent-worktrees/unslop-sheet-editor`). The owner rejected the
  canvas slice on delivery. The editor surface restores the
  single-record canvas (contract 4, listing v25); contract 5 leaves the
  supported set with its construct route, `constructInstance`, and
  mount transports; the `addSheet` locale keys go. The generic
  `DELETE /api/instances/:type/:id` transport and `removeForHttp` stay —
  the §22.12 ref sweep rides them and the store's `removeInstance`
  spoke that path before the slice.

  ### Agent Notes (2026-10-28, canvas second pass)

  Session `agent/sheet-canvas-v2-20261028` (worktree
  `.agent-worktrees/sheet-canvas-v2`). One canvas over an explicit
  working set: the opened record alone on mount; sheets join from the
  palette's sheet-design picker or the add-all button; a sheet leaves
  the canvas from its inspector row (blocked while dirty). Navigation:
  wheel zoom anchored at the cursor, left/middle-drag pan, dock
  zoom/fit; the view model is `{ cx, cy, k }` over measured svg size
  (ResizeObserver). Dragging a placement inside its sheet keeps the
  magnetic sweep; over another sheet it free-follows, and the drop
  moves it between records through the target's free sweep (the
  retraction session's `movePlacementToSheet`, gated per-record by
  `access.canWrite`). The inspector resolves the record behind the
  selection: the cassette-design behind a placement (with open), the
  sheet-design behind a sheet. Undo spans the working set; save
  patches each dirty record. Listing stays v25 (module bytes are live
  executor assets; no declaration changed).

## Relation link lifecycle (owner direction 2026-10-28, SPEC §22.12)

- [x] Link actions render in their target relation's section toolbar
  (beside the create affordance) on parent details; the record header
  carries a link action only when no section exists for its relation.
  Composition injects the detail's link/unlink actions into the
  matching relation-scoped child regions (`shared/ui-mapping/screen.js`).
- [x] Unlink renders on the linked rows of relation-scoped sections
  (row menus of the table and card-grid projections) with the parent
  record and relation ref as run context, mirroring the record-body
  relation chip menus.
- [x] Replace affordance law (SPEC §24 refinement): construct-derived
  payloads (provenance sources non-empty) carry no replace button; the
  button renders labeled.
- [ ] WAITING — owner verification: per-relation unlink policy — compiler
  vocabulary (`detach` default | `delete`), server execution, authoring
  surface.
- [ ] WAITING — owner verification: deletion ref-cascade — deleting a
  referenced instance removes the refs pointing at it
  (`server/features/instances` remove path sweeps relation refs).
- [ ] WAITING — owner verification: Revision selector on revision-scoped
  details — lists prior payload revisions, opens one read-only, restores
  a prior revision as a new one (SPEC §24 owner decision 2026-10-28).

  ### Agent Notes (2026-10-28, ref sweep)

  Session `agent/ref-sweep-20261028-2100` (worktree
  `.agent-worktrees/ref-sweep`). `remove(id, { actor, organizationId })`
  sweeps before the delete: relation edges derive per target type over
  the same per-org view the lineage keys use (explicit `edges.relations`
  entries and ref fields alike, cached beside the declaration cache and
  invalidated with it; `*` wildcard ref fields join every target set);
  the referrer scan covers both storage blocks
  (`relations.<key>.id` and bare `relations.<key>` / `fields.<key>`,
  string and ObjectId id forms), a single ref nulls, arrays drop their
  matching entries, the typed filter keeps other-type refs sharing the
  id, and each swept referrer publishes the entity event with reason
  `ref-sweep`. A system target derives its edges from the static view
  alone (the instances README states the boundary). En route repair:
  `remove` resolved the declaration with a null organization, so
  org-authored types deleted from the `files` fallback collection — the
  transports now pass the organization (`removeForHttp` the doc's own,
  `processDelete` the run's). Validation: instances suite 79 green
  (+6 sweep cases); check-arch green; check-docs carries only the
  pre-existing jagua-rs submodule link; the 17 process-definitions spec
  failures reproduce at base 11c687e99 (concurrent merges, untouched).

  ### Agent Notes (2026-10-28, unlink policy)

  Session `agent/unlink-policy-20261028-1930` (worktree
  `.agent-worktrees/unlink-policy`). Vocabulary: `unlink: 'detach' |
  'delete'` on relation entries — explicit `edges.relations` validate at
  edge normalize (`UNLINK_POLICIES` in edges.js), ref-field entries at
  the registry check; absence means detach (no stamped default). The
  domain projection carries authored policies onto relation rows; the
  compiler rides the policy onto the compiled Unlink action's
  `relationMutation.unlink` alone (Link carries none) from either
  contract minting path (composer entries and construction inputs).
  Execution: the unlink action with `unlink: 'delete'` deletes the
  unlinked target through its entity service after the reference write
  (the `cts.remove` delete/event path; reason
  `relation-unlink-delete`); the delete itself sweeps refs through the
  landed remove path. Authoring: `DescriptorEditor`'s ref branch offers
  the policy over `UNLINK_POLICIES` (`typeCanvas.unlink`, en+ru).
  Specs: cts vocabulary + projection pins, processes compiler pin (the
  policy rides Unlink alone). Validation: cts 96, processes 548,
  instances 79, design-system, localization, SSR smoke 23 green;
  check-arch, framework:validate green; check-docs carries only the
  pre-existing jagua-rs link. FINDING (pre-existing at base, reproduced
  by stash): 21 spec failures across
  packages/cts graph-protocol-construction, packages/processes
  ui-contract, and server/features/process-definitions — the
  facade-family `cassette` → `cassette-template` rename left their
  fixtures naming the dead type; the owner should schedule the fixture
  sweep.

  ### Agent Notes (2026-10-28, placement delivery)

  SPEC §22.12 + §24 refinement written from owner words this session.
  Delivered: composition-time injection (link and unlink actions land
  on the relation-scoped child node with the parent instance attached),
  `RegionBlock` toolbar link controls, row-menu unlink entries through
  a `context.data` run-context channel (the chip path's contract
  generalized), replace gating on `provenance.sources`.

  ### Agent Notes (2026-10-28, revision picker + restore)

  Session `agent/payload-revision-picker-20261028` (worktree
  `.agent-worktrees/payload-revision-picker-20261028`). SPEC §24 owner
  decision added from owner words this session: the revision selector
  is the record's version surface; restore mints a new revision and the
  fabric is append-only. Delivered: `PayloadRevisionPicker` on the
  record header (popover over `GET /api/instance-revisions` filters,
  newest-first rows with the current revision marked, read-only dialog
  previewing the frozen bytes through the shared payload download URL,
  restore behind the replace affordance's write grant and
  authored-content law); `restorePayloadRevision` in the instances
  service re-running `replacePayload` over the frozen bytes (ownership
  check: record, type, and declared scope; reason `payload-restored`)
  with `POST /api/instances/:type/:id/restore-revision` as transport;
  revisions mint `data.createdAt`, and the entityRevision read policy
  adds `data.reason` and `attachments.primary` (the frozen bytes
  reference preview surfaces resolve). E2E
  `payload-revisions.spec.js` drives list → read-only preview → restore
  over the tech-drawing `dxf-source` type, artifact
  `test-results/payload-revisions-live.json`.

  ### Agent Notes (2026-10-28, revision read access repair)

  Session `agent/revision-read-access-20261028` (worktree
  `.agent-worktrees/revision-read-access-20261028`). Owner report: the
  picker listed nothing for any record. Two access gates keyed a
  vocabulary no grant table carries: `canReadRevision` resolved the
  source feature through `pluralize(typeId)` (a name only the legacy
  cassette/project features ever had — compiled grants key the class
  collection), and the routes serialized through the entityRevision
  field-policy gate (feature `files`), which orgs without file grants
  never pass — stricter than the records' own reads, which are org-scoped
  with verbatim DTOs. Repair: revision reads follow the source records'
  read law (org-scoped, system rows admitted beside org rows, cross-org
  refused — `canReadRevision` compares the revision's lineage
  organization to the caller's active organization) and the two revision
  routes return the service DTOs verbatim. Specs:
  `instance-revisions/service.spec.js` pins list/getById org-scope
  behavior (4 cases, red at base). Validation: instance-revisions +
  instances suites green (50), shared/design-system, module-imports,
  SSR smoke 23, check-arch, framework:validate green; check-docs
  carries only the pre-existing jagua-rs link.

  ### Agent Notes (2026-10-29, picker rows render the contract)

  Session `agent/picker-row-render-20261029` (worktree
  `.agent-worktrees/picker-row-render-20261029`). Owner report: rows
  carried mint-reason wordings as labels with no previews. Rows now
  render through the shared preview contract: the frozen payload
  reference (`data.snapshot.payload`, the wire payload block the mint
  stored) names the row and previews its bytes through
  `InstancePreviewMedia` in the standard band (renderable modes only —
  bands render real content); the meta line keeps the creation stamp,
  the minting principal, and a restore's source (`restoredFrom`). The
  picker stops reading the audit vocabulary's reason keys (StateHistory
  keeps them — the status trail is their surface). E2E asserts the
  name, the row preview band, and the restored-from line.

## Chat heals after a stream gap (owner report 2026-10-28)

The owner's session saw the chat agent stop answering after switching
browser tabs. The run persists server-side; the connections stream drops
under tab suspension, and events published during the gap were
unrecoverable for an open thread — the reply stayed invisible until a
manual reload, and the live run block plus a suspended `ask_user`
question had no pull path at all.

- [x] WAITING — owner verification: Reconnect reconcile. The connections
  composable exposes `epoch` (advances on every `ready`); an open chat
  thread refetches its tail and the room's in-flight run snapshot
  (`GET /api/agent-bots/live?conversationKey=`, admitted like a
  conversation read) on epoch change, restoring missed messages, the
  live run block, the pre-step typing presence, and a suspended
  question. Law: chat SPEC Live state row.
- [x] WAITING — owner verification: A live reasoning disclosure
  collapses once the run moves past it — a later step or a streaming
  answer; the persisted chronology starts open. Law: chat SPEC Live
  thought row.

### Agent Notes (2026-10-28, chat reconnect reconcile)

Session `agent/chat-reconnect-reconcile-20261028` (worktree
`.agent-worktrees/chat-reconnect-20261028`). Diagnosis from the owning
READMEs (connections client contract, agent-bots streaming events,
support lazy history): delivery is fire-and-forget to live connections
with no replay, and the thread reconciles live events only — the chat
SPEC already declared "a reconnect refetches the page" and the code
never implemented it; the contradiction is resolved by this delivery.
The runtime keeps the run's last published snapshot on its in-flight
entry (both reply and wake runs) and serves it through the live
endpoint; `AgentActivity` collapses a live thinking disclosure once a
later step or the answer exists (the Fieldset `collapsed` prop seeds
initial state only, so the v-for key carries the seed). Spec:
`agent-bots.spec.js` pins the snapshot's lifecycle (mid-run active
under the assistant identity, org boundary, cleared at run end).

## Class-scoped state authoring is cut (owner direction 2026-10-28)

Owner report: composed graphs wire state declarations into type
declarations and generally misuse the declaration tree. Root cause: a
class-scoped state authoring path (state→class `declares` wires,
`declareState` `ownerClassId`/`typeId` scoping, per-type state
vocabulary) lived in the legality table, the gesture, and the READMEs
against CTS SPEC §7 — states wire into create/transition operations
only, and the bot's authoring guide taught the slop as law.

- [x] WAITING — owner verification: The state wiring grammar is
  `entry` (state → construct/transition, the wire is the value) and
  `nested` (parent state → child state) only; the legality table, the
  `declareState` gesture, wire interpretation, tree diagnostics, and
  the bot's authoring guide carry that law; `retireStateScopeAuthoring`
  strips the retired wires and scope fields from persisted drafts at
  the resolution/save seam.
- [x] WAITING — owner verification: the bot's authoring skill teaches
  field descriptor law (identifier, nullable/required), the glyph
  palette, effect lanes, and instance/list work (finding, filtering,
  navigating, shaping).

### Agent Notes (2026-10-28, authoring-skill completeness)

Session `agent/authoring-skill-20261028` (worktree
`.agent-worktrees/authoring-skill-20261028`). Delivered: `configure`
reaches declaration nodes with the inspector's own writes (state
value/label/severity/icon — a state rename re-authors its entry wires;
class name/glyph; field name/descriptor with the nullable and
identifier flags), the compact vocabulary serves `fieldBases`, a
`detail:'glyphs'` view serves the icon-font palette, and the guide's
FIELD/CLASS bullets plus composition law 6 teach field properties,
glyph authoring, and instance/list work (allEntities, edge navigation,
filterList with a compare/logic condition, sortItems). The 13 KB compact
budget pin held — the guide additions were trimmed to fit beside the new
payload fields. Specs: `authoring.spec.js` pins the declaration-node
configure (including refusals), `tools.spec.js` pins fieldBases in
compact, glyphs on request, and the guide's instance/list law.

### Agent Notes (2026-10-28, state wires law)

Session `agent/state-wires-law-20261028` (worktree
`.agent-worktrees/state-wires-law-20261028`). Diagnosis: CTS SPEC §7
already stated the owner's law ("States are authored in the process
graph, never in the type declaration"); the class-scoped path was a
SPEC violation implemented across `declarationWireLegality`
(state→class `declares`), `declareState` scoping, wire interpretation
(state typeId follows the class), per-type diagnostics, and the
AUTHORING_GUIDE's state bullets. Cut: the legality row, the gesture's
scope params, interpretation and count writes, the per-type target
check (now draft-local values, message "not declared in this draft"),
the class card's `states` count; `nested` and `entry` stay (owner
ruling). Migration: `retireStateScopeAuthoring` joins
`rewriteRetiredWirePaths`/`orientChildrenEdgesChildFirst` in the
save-boundary chain. Specs updated across processes/cts/
process-definitions; `test-data/persisted-acceptance.js` carries the
post-migration shape. Pre-existing reds on `local` verified unrelated
(cassette domain: ui-contract, graph-protocol-construction,
process-definitions service/runtime specs — 12 failures at base,
identical after this change).

## Instance tiles and picker closed controls (owner direction 2026-10-29)

Owner report: the sheet editor panel carried flat serialized facts and
panel-invented "cards" for sheets and cassettes; the single picker
rendered the selected instance inside a text input; cassette previews
in embedded refs drew without the layer standards.

- [x] WAITING — owner verification: the instance tile is the one
  small-card face for an instance reference on a panel (`InstanceInlineRef`
  `variant="tile"`: preview, identity, state, lineage breadcrumb, compact
  facts; `active`/`selectable`/`trailing` carry working-set row
  semantics) — SPEC §22.13 amendment.
- [x] WAITING — owner verification: the single entity picker's closed
  control is a trigger (button + popover Listbox of §22.13 option rows,
  filter in the overlay); the selected instance renders as the tile
  beside the control.
- [x] WAITING — owner verification: the sheet editor inspector runs on
  instance tiles with pick-to-add pickers and no count badges (facade
  SPEC, owner decision 2026-10-29); the panel-local card chrome and
  fact-row identity displays are gone.
- [x] WAITING — owner verification: embedded refs mount plugin preview
  modules — `resolvePluginPreview` normalizes the requested type id to
  the kebab CTS id, so option rows, compact cards, and tiles render
  cassette previews with the OCCS layer-standard pens.

### Agent Notes (2026-10-29, instance tiles round)

Session `agent/instance-tile-20261029` (worktree
`.agent-wt-tile-20261029`). Root cause of the unstyled cassette
previews: `InstanceInlineRef` normalizes type ids to snake case before
passing them down, while `resolvePluginPreview` compared the raw string
against the kebab binding id — plugin previews never mounted inside any
embedded ref, and the fallback channel carried no pens. The tile, the
picker rework, and the sheet editor rework ride the shared contracts
above. E2E `sheet-editor-panel.spec.js` pins the panel (tiles,
pick-to-add, pen strokes `#DC2626`/`#D97706` on the option-row
preview) with the `.playwright/sheet-editor-panel.png` artifact.

## Sheet editor family scope, rack, pens, and the id ban (owner direction 2026-10-29)

Owner report: the sheet cards on the multi-sheet canvas are slop (one
centralized procedural row); the editor offers "add all sheets" from
the whole org pool; it should edit the child sheets of entities
instead. Cassette previews in the sheet editor's design picker still
miss layer standards. Raw record ids leaked onto cards — strictly
prohibited.

- [x] WAITING — owner verification: the working set is the opened
  record's lineage family (declared containment keys scope the list
  transport's lineage filters; the family joins beside the opened
  record) and the sheet picker is the explicit add channel — any org
  sheet, family members first — with add-all covering the family alone;
  the org-wide mass add stays gone (facade SPEC, owner decision
  2026-10-29 amended 2026-10-30).
- [x] WAITING — owner verification: the inspector carries the placed
  cassette-designs as the actual instance tiles beside the sheet tile;
  the hand-rolled fact rows (size, position, rotation, placement and
  design counts) are deleted — placement geometry reads on the canvas
  (facade SPEC, owner direction 2026-10-30).
- [x] WAITING — owner verification: the family canvas is a wrapped
  rack — a sheet moves by its label band, rotates a quarter turn about
  its center from its action dial, placements ride in sheet-local
  frames (rotation preserved through moves). E2E pins the move, the
  remove/re-add cycle, and the family scope; the dial-driven rotate
  stays manually verified (the animated dial resists Playwright's
  actionability checks — probe-verified interactions).
- [x] WAITING — owner verification: layer-standard pens resolve the
  org `defaultPen` relation over the OCCS base, and a standard whose
  pen does not resolve keeps the base for its code (the plugin's
  `applyLayerPens`; pins in `surfaces/lib/drawingPreview.spec.js`, e2e
  pins the org pen on the picker preview and the placed geometry).
- [x] WAITING — owner verification: no surface renders raw record ids
  — `TraceLink` falls back to the entity type label when an ancestor's
  name never resolves (the shared README's trace law), the cassette
  designer's load rows read as unnamed (e2e sweeps the editor for
  24-hex text with a deleted parent dangling the lineage).
- [x] WAITING — owner verification: the instance tile is the §22.8
  side-preview anatomy at row scale — `LAYOUT.previewSideRow`,
  `rowBetween`, `labeledBlock`, ladder gaps only; the invented tile
  stylesheet block (10/6/2px gaps, bespoke 64×60 thumb) is deleted and
  the compact gallery face rides ladder gaps (SPEC §22.13 amendment).
- [x] WAITING — owner verification: the panel's lineage context renders
  as one `TraceChain` at the working-set section (the trace law: card
  bodies carry no lineage; §22.8: a homogeneous panel carries its
  context once), tile rows carry no breadcrumb, and the working-set
  remove is the chip-removable × at the row's trailing end (SPEC
  §22.13 amendment).

### Agent Notes (2026-10-30, breadcrumb restoration)

Session `agent/tile-crumb-20261030` (worktree
`.agent-worktrees/tile-crumb-20261030`). Correction round: the 10-29
"row menu" answer degenerated into an ellipsis menu carrying one
action, and the breadcrumb deletion mis-read the owner's "make it
compliant" (the breadcrumb is owner-ordered §22.13 content — the fix
is its design). The tile now carries `TraceChain`'s compact variant
directly and the remove returns as the chip-removable × on the
identity line; `InstanceActionsPopover` leaves the surface pack. E2E
re-pins the parent name on the tile breadcrumb and the type-label
fallback under a deleted parent.

### Agent Notes (2026-10-30, family chain)

Session `agent/family-chain-20261030` (worktree
`.agent-worktrees/family-chain-20261030`). The tile-crumb round
re-shipped the previous agent's per-row TraceChain verbatim — the exact
design the owner rejected. The compliant shape per the trace law and
§22.8: card bodies carry no lineage, a homogeneous panel renders its
shared context once — the working-set section now renders one
`TraceChain` (compact, expandable) under its label, tile rows carry no
breadcrumb, and the remove × returns to the row's trailing end (the
chip-removable convention). `TraceChain` joins the surface pack. E2E
pins the section chain's parent name and the deleted-parent type-label
fallback.

### Agent Notes (2026-10-30, explicit adds and the tiles-only inspector)

Session `agent/sheet-add-20261030` (worktree
`.agent-worktrees/sheet-add-20261030`). Two owner reports closed. The
family-only picker left no add path in orgs without declared
containment: the sheet picker returns as the explicit add channel (any
org sheet, family members offered first, one at a time) while add-all
covers the family alone. The inspector's serialized fact rows (size,
position, rotation, placement and design counts) are deleted — the
active sheet's placed cassette-designs render as the actual instance
tiles beside the sheet tile; "CAS <id> WP 1" is the cassette mark
text (the OCCS mark template carries the template id), drawn production
content on the canvas. The four dead sheetDesign locale keys ride
along. E2E pins: the stranger offered and pickable, add-all taking the
family alone, and the placed design's instance tile.
- [x] WAITING — owner verification: the cassette designer's load picker
  lists templates again (the surface queried the retired `cassette`
  type id; the picker was empty and
  `e2e/cassette-load-previews.spec.js` red).
- [ ] Centralize payload-document migrations at the load boundary (owner
  direction 2026-10-30): one version normalizer every stored OCCS
  document passes through before any surface renders it — the cassette
  designer's `hydrateDefinition`, the cassette preview's payload read,
  and the sheet editor's item sources all feed documents through it;
  engines and renderers see only the current document shape, and the
  scattered legacy read paths inside the renderer retire. Evidence: a
  cassette from an older plugin version opens through the designer and
  the CAD engine dies in its worker (`document is not defined` — the
  vendored bundle's `CSS2DObject` default constructs DOM in a worker
  context on a legacy-shape render branch); the oldest templates carry
  no payload reference at all (pre-plugin records, type ids preserved
  by the migration script). The record-level `migrate` steps in the
  listing stay the transport for instance fields; this pipeline owns
  payload documents. En route: the designer's open-template path
  queried the retired `cassette` type id and could not hydrate.
- [x] WAITING — owner verification: The demo order process composes
  sheet-design children under its nesting attempt and constructs them
  from the solve output (lineage-keyed family; the editor scope above
  rides it) — flow authoring follow-up in
  `test-data/order-process-authoring.js`.

### Agent Notes (2026-10-29, family round)

Session `agent/sheet-family-20261029` (worktree
`.agent-worktrees/sheet-family-20261029`). The id leak's carrier:
`TraceLink` rendered `label || fallbackLabel || id`, so any lineage
ancestor whose name failed to resolve (the owner org's sheets carry
`nestingAttemptId` parents that are deleted) printed the raw 24-hex id
on every tile — the shared README already banned it. The pens gap: the
plugin's `applyLayerPens` read the standard's pen from `fields`
(`orgPenId`/`defaultPenId`) while the wire row carries
`relations.defaultPen`, and a standard row that resolved without a pen
skipped the OCCS base — the covered code rendered `currentColor`
(probed: canvas placement `currentColor` while fold kept `#D97706`).
The rack replaces the single accumulating row; `frameState` holds
per-sheet `{x, y, rotation}`, `reflowSheets()` wraps new sheets into a
near-square grid, hit tests invert the frame rotation. E2E
`sheet-editor-panel.spec.js` rewritten: lineage-less editing, family
join with an org-declared `probe-family` parent (children edge
`lineageKey: familyId`), stranger sheet never offered, remove/re-add
through the picker, move by label band, rotate via dial, deleted
parent leaves the type label.

## Card-grid media tile and markdown text preview (owner direction 2026-10-29)

Owner report: the identifier-plus-preview card shape lost its full-size
preview to the panel instance tile, and the text preview mode renders
plain text where every other markdown surface (the text editor, agent
answers) renders markdown.

- [x] WAITING — owner verification: a card whose type shape is
  identifier plus preview (visual preview, no card facts) renders the
  overlay media tile — the preview fills the card at full width, the
  identifier chip rides over the media, status and the row menu float
  on top (SPEC §22.8 restored); a visual preview with facts renders the
  side-preview card; the §22.13 instance tile stays the panel/picker
  face.
- [x] WAITING — owner verification: the `text` preview mode renders
  through the one markdown pipeline under the one element recipe on
  every surface — record preview, card band, fill-dialog pane, and the
  attachment peek — like the text editor and agent answers; mime
  sniffing no longer gates the text render.

### Agent Notes (2026-10-29, cardfix2 round)

Session `agent/cardfix2-20261029` (worktree `.agent-worktrees/cardfix2-20261029`).
The identifier+preview card is the overlay media tile again (preview at
full card width, identifier chip riding the corner under the instance
chip recipe `CHIP_LABEL_PT` + `INSTANCE_CHIP_CLASS`, status and row
menu floating on top); preview+facts keeps the side-preview card; the
§22.13 instance tile stays the panel/picker face. The text preview
mode renders through the one markdown pipeline on every surface, and
the one element recipe is now `ck-markdown-body` (assets/css/main.css)
— the markdown editor's reading typography (serif headings at crepe's
2.625/2.25/2/1.75em scale, paragraph rhythm, code, quote, rule, table)
on the app tokens, so file previews and agent answers read like the
editor; the retired Tailwind recipe string and the mime-gated
`isMarkdownDocument` detection are gone. En route: the generated-screen
spec rides the renamed `cassette` type and flags its seed identifiers
(the v26 rename and the identifier-flag law landed without migrating
it — all 11 tests were red at base; 9 pass now, the home-screen panel
locator and the create-form settled wait stay pre-existing drift).
Focused: markdown 2, ui-mapping 110+16, design-system 34,
module-imports, framework-packages, SSR smoke 23, arch + framework +
docs guards at parity with base (the jagua-rs link break is
pre-existing). E2E: documents-fill-dialog green (the composed markdown
previews in the text mode); live probe pins the tile (h-40 media, chip
badge) and the preview h1 at 42px IBM Plex Serif — the editor's own
h1 metrics.

## State values may repeat across types (owner direction 2026-10-30)

Owner report: the process designer refuses "duplicate state name DRAFT"
when two classes in one draft each carry the value — ordinary domains
(queue DRAFT, design DRAFT) were unauthorable. SPEC §7 defines the state
vocabulary per type; the designer's draft-global uniqueness check
contradicted it, while the server binding check and machine compilation
resolve values per wiring.

- [ ] WAITING — owner verification: a state value token may repeat across
  a draft; each type's vocabulary is the set of values wired into its
  operations, and the designer raises no duplicate-value diagnostic.

### Agent Notes (2026-10-30, state value repeats)

Session `agent/state-dup-20261030` (worktree
`.agent-worktrees/state-dup-20261030`). Cut the draft-global `duplicate
state name` diagnostic in `declarationDiagnostics` — the rule's one
home; the server binding check (`graph-protocol.js`) and machine
compilation resolve state values per wiring. SPEC §7 states the repeat
law; `designer.spec.js` pins repeats legal within and across classes.

## Instance picker create and search (owner direction 2026-10-31)

Owner direction: instance pickers offer creation inside themselves when
the compiled contract carries create actions for the accepted types, and
every picker searches its options, hierarchical pools included — SPEC
§22.13 create amendment.

- [ ] WAITING — owner verification: the generated-screen pickers (fill
  dialog lineage rows, relation link dialog, per-spot part rows) and the
  shared entity picker's popover carry the create affordance with
  protocol dispatch (upload inline, editor blank page, construct through
  the nested dialog), the created record selects into the picker with a
  resolved label, and the hierarchical picker filters (`common.search`).

### Agent Notes (2026-10-31, picker create)

Session `agent/picker-create-search-20261031-094030` (worktree
`.agent-worktrees/picker-create-20261031`). `RefRowActions` is the one
create affordance: type records resolve through the served type view
(the `bundle` prop is gone), its `select` carries the created record,
its protocol menu mounts in the affordance root (a popover-hosted
create keeps its subtree alive through the async run — the menuitem
click stays inside the popover), and both pickers compose it —
`InstanceSelect` renders it under the popover's option list
(`createActions` prop; `create-select` / `construct-create` events; the
type set derives from the `typeId` prop or the entity options' own
types), `InstancePicker` trails it beside either branch and filters the
TreeSelect branch. Created and pool-external model refs supplement the
picker options so the closed control resolves labels (the entity store
backs the construct path).
`GeneratedMappingScreen` wires create into the fill dialog's lineage
rows and the link dialog (a construct create opened from the link dialog
applies its record as the link target; `openNestedCreate` gained an
`apply` target). `SpotPartsRow`'s per-spot picker carries create — the
created part lands on that spot — and the standalone create row below
loaded spots is gone (the no-spots branch keeps its create). The rails
e2e rides the new flow: the part create runs from the picker's popover
and the composed-preview pin skips the transient spinner svg (the
stale `.p-select` pick pin had been broken since the closed-control
rework). Focused: instance-select 8, utils instance-select 4,
design-system 34, framework-packages 5, SSR smoke 24, arch, framework
and docs guards green; e2e — tech-drawing fill dialog 3/3 (rails test
green through popover create, tile, preview, editor),
documents fill dialog 1/1, plugin-surface 1/1.


## Ref resolves once and the hover peek survives its fetch (owner report 2026-10-31)

Owner report: hovering a chip raises the peek, the peek's fetch completes
and the panel closes; the next hover refetches — and chip-bearing lists
re-render continuously. Cause: the optional-reference lookup refetched
every completed resolve, the ref's watch keyed on the entity object
identity, and its refresh blanked the resolved record — so every store
upsert re-triggered the fetch and unmounted the open peek.

- [ ] WAITING — owner verification: a chip resolves its record once, an
  open hover peek survives the record's fetch, and chip-bearing tables,
  dataviews, and relation lists hold still (no continuous refetch or
  reload strips).

### Agent Notes (2026-10-31, ref resolve once)

Session `agent/peek-refetch-loop-20261031-1100` (worktree
`.agent-worktrees/peek-loop-20261031`). `resolveReadableReference` serves
a cached readable match before fetching (misses stay uncached);
`InstanceInlineRef` keys its resolve watch on the record id and type
(pool re-renders pass fresh entity objects for the same record), so a
store write no longer re-resolves or blanks the chip; the dead
`hydrated` cell is gone. Focused: instances store 15, SSR smoke 23,
instance-select 8. The `shared/design-system.spec.js` three
`GeneratedScreenHost.vue` findings predate this round on `local`
(another round's frame).

## Instance page header breadcrumbs (owner direction 2026-10-31)

Owner direction: the instance page header carries the record's
breadcrumbs.

- [ ] WAITING — owner verification: a record with declared containment
  ancestors renders the ancestor trail above its identity line, each
  crumb opens its resolved instance through the surface's instance-open
  channel, and the trail resolves labels through the instances store.
- [ ] WAITING — owner verification: the breadcrumb trail is compact with
  a transparent background, and the identity line carries a subtle type
  label under the title.

### Agent Notes (2026-10-31, type label under title)

Session `agent/instance-type-under-title-20261031` (worktree
`.agent-worktrees/instance-type-under-title-20261031`). The identity
block stacks the title row and its type label; state and history remain
on the title line.

### Agent Notes (2026-10-31, compact header trail)

Session `agent/instance-header-compact-20261031` (worktree
`.agent-worktrees/instance-header-compact-20261031`). The Breadcrumb root
carries zero background and padding with a tight list gap; crumb links
ride the supporting text step. The record identity line carries the
subtle type label through `generatedEntityLabel`.

### Agent Notes (2026-10-31, instance header crumbs)

Session `agent/instance-crumbs-20261031` (worktree
`.agent-worktrees/instance-crumbs-20261031`). `BreadcrumbTrail` derives
ancestry from `containmentAncestors` over the effective containment
contract and resolves each ancestor through `resolveReadableReference`;
the tree is reactive to both loaded records and the served type view.
The header's unused pool prop is cut. `process-generated-screen.spec.js`
pins the parent crumb on a child detail surface.

### Agent Notes (2026-11-09, peek trail)

- The peek header renders the record's lineage trail above its compact
  identity line, the same `TraceChain` every record surface mounts.

### Agent Notes (2026-11-08, canonical ancestor types)

- `containmentAncestors` keeps the declaration's canonical parent type id
  on each crumb; `TraceChain` canonicalizes through the instances store
  before resolving the served type record, glyph, label, and popup
  target, so kebab registry ids keep their spelling.

## Ref type aliases resolve to the registry id; peeks host the served id (owner report 2026-10-31)

Owner report: a relation chip's hover panel opens but writes that no record
is opened. The peek composed its screen with the ref's display alias
(snake `cassette_design`), while the record cache, pool, and screen
vocabulary key the registry's kebab id — the scoped instance resolved no
pool entry, and `canonicalTypeKey` kept snake aliases as dead cache keys.

- [ ] WAITING — owner verification: relation chips' hover panels render
  the record (identity, facts, preview) in the owner's organization, and
  alias spellings resolve through the registry id everywhere.

### Agent Notes (2026-10-31, ref aliases)

Session `agent/peek-type-key-20261031-1200` (worktree
`.agent-worktrees/peek-type-key-20261031`). `canonicalTypeKey` maps snake
and camel aliases onto the kebab registry id (registry-known ids win);
`InstanceInlineRef` hosts the peek with the served type id (the pool key
and screen vocabulary, the same law `useEntityPopup.open` follows) and
reads its state policy through the same id; `instanceOf` derives a
record's instance lazily, so a record cached before the registry
hydrated joins the pool when the declaration arrives instead of staying
unopenable. Focused: instances store 16, SSR smoke 23. The
`shared/design-system.spec.js` three `GeneratedScreenHost.vue` findings
predate this round on `local`.

## Profile workpiece: two parameter tables and shape identity (owner report 2026-11-01)

Owner report: the profile editor stores one table — authored parameters
plus instance values — inside `sketch.parameters`. The dialog drafts that
sketch, so it shows instance values as authored rows; the workpiece row's
chips read the same table and filter it by its own key set, so each side
starves the other. Shapes also decompose on the canvas: a filleted
rectangle returns as chains, its parameter bindings fall back to the
drawn numbers, and every returned piece carries its own dimensions.

- [ ] WAITING — owner verification: a placed profile keeps its authored
  rows in the snapshot's sketch and its overrides in `instance`; the
  dialog shows authored values, the chips show the derived ones, and a
  filleted rectangle round-trips the canvas as the same rectangle with
  `W`/`H`/`R` bindings intact.

### Agent Notes (2026-11-01, profile tables and shape identity)

Session `agent/profile-tables-lifecycle-20261101-1400` (worktree
`.agent-worktrees/profile-tables-20261101`). `normalizeCassetteV2Profile`
returns the authored table (`sketch.parameters`), the instance table
(`instance`), and the derived table the chips render; the stored snapshot
carries the first two. The dialog drafts the authored table and passes the
instance table as `instanceParameters`, so the canvas renders the derived
geometry while the model stays authored. Extraction rebuilds a tagged
group as its authored kind (rect corners from the two parallel side-line
crossings, fillets from the arcs) and reads untagged geometry alone; the
merge epsilon is one constant at 0.05 mm, which is what stopped filleted
rectangles from fragmenting into chains. Migration:
`server/scripts/migrate-profile-parameter-tables.js`. Focused: facade
suite 179. `npm run docs:validate` reports the pre-existing broken link
`workers/nesting/README.md -> ./jagua-rs/README.md` and the contract-homing
backlog; `node scripts/check-arch.js` passes.

## Profile library management in cassettes (owner direction 2026-11-02)

The profile dialog manages the origin library record inside the cassette
session: Save to library overwrites the origin record, Save as
creates a new record and makes it the draft's origin, and Delete removes
the origin record. Delete confirms in an anchored popover; placed
workpieces keep their snapshots.

- [ ] WAITING — owner verification: the profile dialog's library actions
  save to the origin record, save as a new record, and delete the origin
  record; the picker reflects every change.

### Agent Notes (2026-11-02, profile library management)

Session `agent/profile-library-20261102` (worktree
`.agent-worktrees/profile-library-20261102`). `records.delete` joins the
contract-2 surface write transports over `removeInstance`; the profile
dialog's compact row carries Save to library (origin overwrite), Save as
(new origin), and Delete (anchored confirmation), with the authoring
surface unchanged. Save-to-origin writes the draft name beside kind,
process, and sketch; saved workpieces carry their library origin through
`profileTemplateId`; updated and deleted records drop their cached
thumbnails.

## Profile management on the cassette canvas (owner direction 2026-11-02)

Placed profiles are canvas objects. Their placed section geometry is the
hit area: a click selects the profile and opens one compact popup carrying
the placement fields, name-and-value parameter fields, and the edit and
delete actions. Add profile moves to the canvas toolbar. The palette keeps
profiles as assembly rows and leaves authoring, parameter editing,
placement, and removal to the canvas.

- [ ] WAITING — owner verification: clicking a placed profile on the
  canvas opens its compact placement-and-parameters popup; edit, delete,
  and Add profile work from the canvas; the palette's profile controls are
  gone.

### Agent Notes (2026-11-02, profile management on the canvas)

Session `agent/profile-canvas-20261102` (worktree
`.agent-worktrees/profile-canvas-20261102`). The tree renderer emits
`designerProfiles` hit paths for closed section operations and open-chain
embedding copies; `DrawingCanvas` highlights and selects them through
`selectedDesignerProfileId` / `designer-profile-select`, gated off while
an attachment editor owns face clicks. The cassette designer opens the
existing attachment inline editor from a profile hit and adds the
profile's parameter fields, edit, and delete there; Add profile rides the
canvas toolbar; the palette's profile add, parameter chips, placement,
edit, and delete controls are removed. Parameter fields show their
derived values beside the stored expressions. The drawing normalizer
carries `designerProfiles` and the attachment markers through to the
canvas, so the hit overlays survive the geometry-preview projection.

### Agent Notes (2026-11-02, compact profile popup)

Session `agent/profile-popup-primevue-20261102` (worktree
`.agent-worktrees/profile-popup-primevue-20261102`). The profile popup is
a two-column field grid built from PrimeVue `IftaLabel` over native
`InputText` and `Select` controls; parameter rows use the parameter name
as the infield label. A PrimeVue `Divider` separates placement from
parameters, mirror controls are icon buttons labelled X/Y, and expression
values ride PrimeVue's native invalid state with the reason in the title.

## In-place profile and face sketch mode (owner direction 2026-11-02)

Profile and face shape editing happen on the cassette designer's canvas at
the target's placement. The assembly drawing and its camera stay in place, so
the selection survives the edit. Save returns with the edited target's popup
restored; Back returns unchanged.

- [ ] WAITING — owner verification: editing a face or a placed profile
  opens the existing CadCraft sketch editor in the cassette canvas area;
  Save returns with the target's popup open, Back restores the assembly
  unchanged, and the assembly viewport survives both.

### Agent Notes (2026-11-02, in-place sketch mode)

Session `agent/cassette-sketch-mode-20261102` (worktree
`.agent-worktrees/cassette-sketch-mode-20261102`). The cassette designer
holds one sketch mode over the assembly canvas; the sketch editor mounts
on first use and stays mounted while the assembly canvas owns the surface.
`sketchEditor.mjs` gains an `active` prop so its keyboard scope only owns
shortcuts while the mode is open. Profile and face saves restore the
assembly selection and its floating editor. Validation: 74 facade surface
specs green; `check-arch`, `framework:validate`, and listing validation
green. E2E `cassette-profile-lifecycle` and `cassette-profile-editor` pass.
`cassette-designer-parameters` passes 2 and fails 2 on unchanged
attachment/parameter assertions that also exist at the pre-change commit.
The docs guard reports the pre-existing `workers/nesting` link and
contract-homing debt; the design-system suite reports the pre-existing
`GeneratedScreenHost.vue` findings. The surface checker cannot resolve the
cross-plugin `cadcraft` import in this checkout.

## Shared cassette canvas session (owner direction 2026-11-02)

The cassette designer runs one canvas session over the assembly canvas and the
CadCraft sketch editor. The session carries the assembly selection through the
edit, and the assembly camera is the camera both modes use. Back and Save
return the assembly to the session's selection and restore the assembly
document.

- [ ] WAITING — owner verification: opening a sketch does not move the
  camera or the target; Back restores the assembly selection; reopening the
  same target opens at the assembly camera.

### Agent Notes (2026-11-02, shared canvas session)

Session `agent/cassette-canvas-session-20261102` (worktree
`.agent-worktrees/cassette-canvas-session-20261102`).
`workers/facade/surfaces/lib/canvasSession.js` is the session record: target,
assembly selection, assembly camera, and one sketch camera per target.
`DrawingCanvas` exposes `getViewBox`/`setViewBox`; `CadCraftHost` exposes
`snapshotView`/`restoreView`; `sketchEditor.mjs` restores the stored camera on
reopen and hands its camera back on close. The sketch mode fills the canvas
area, and the designer restores the assembly camera and selection on
Back/Save. Validation: 124 facade surface specs green; `check-arch`,
`check-plugin-deps`, and facade listing validation green; SSR smoke 7/7 green.
`check-docs` keeps the pre-existing `workers/nesting/README.md` broken link.
The surface checker cannot resolve the cross-plugin `cadcraft` import in this
checkout. E2E `cassette-profile-editor` passes (51.2s), including the
full-bleed box and the assembly/sketch camera roundtrip.

## In-place assembly context in the sketch canvas (owner direction 2026-11-03)

The sketch canvas places the authored sketch into the cassette assembly at the
target's placement, so the host face and surrounding cassette stay in their own
coordinates. The assembly rides its own layers, locked and unpickable, and
extraction reads the authored sketch alone. The sketch model remains the
authored truth. The frame comes from the face's assembly transform, a closed
profile's axis and point placement, or an open profile's edge embedding.

- [ ] WAITING — owner verification: editing a placed profile or face shows the
  sketch at its real place on the host face; the assembly layers keep their
  colors and are not selectable; the shape list carries only the profile's own
  shapes; Save returns to the assembly unchanged.

### Agent Notes (2026-11-03, in-place assembly context)

Session `agent/cassette-inplace-frame-20261103` (worktree
`.agent-worktrees/cassette-inplace-frame-20261103`).
`cassetteV2SketchFrame` resolves the target's local-to-assembly frame (face
workpiece transform, closed-profile axis and point placement, open-profile
edge embedding). `sketchEditor.mjs` places the seeded sketch, annotations and
native dimensions through that frame, converts pointer coordinates both ways,
and inverse-maps extraction so the model stays local. `cassetteV2AssemblyEntities`
returns the assembly on its source layers with their colors and weights, all
locked; `entityRecords` skips locked layers so the shape list and dimensions
read the authored sketch alone. The assembly keeps its own coordinates; the
sketch sits at its placement. `CadCraftHost.seed({ fit: false })` restores the
camera the document load would otherwise refit. Validation: 125 facade surface
specs green; `check-arch`, `check-plugin-deps`, and facade listing validation
green; `check-docs` keeps the pre-existing `workers/nesting/README.md` broken
link. E2E `cassette-profile-editor` passes (37.5s) and writes
`.playwright/cassette-inplace-context.png`: the place is at its host face, the
assembly layers are locked, and the shape panel carries only the authored
circle.

## CadCraft theme, font and layer pen sync (owner direction 2026-11-03)

The sketch canvas mirrors the app's light/dark tokens and UI font into the
CadCraft frame; the frame's paper/model mode follows the app theme. Assembly
layers carry the OCCS layer standards' colors, weights and dash patterns.

- [ ] WAITING — owner verification: the sketch canvas follows the app
  light/dark theme, uses the app font, and shows the dashed fold route from the
  layer standard.

### Agent Notes (2026-11-03, theme, font and layer pens)

Session `agent/cassette-cadcraft-theme-20261103` (worktree
`.agent-worktrees/cassette-cadcraft-theme-20261103`). `CadCraftHost.applyTheme`
resolves the app's surface, ink, muted, border, primary and UI-font tokens
through a probe, writes them into the frame's `documentElement`, sets
`data-space` from the app's `dark-mode` class and re-applies on the `html`
class mutation. The vendor text draw uses `view.colors.font`
(`view.js`/`bundle`/`cadcraft.js`). `cassetteV2AssemblyEntitiesFromDrawing`
maps each layer's dasharray to `DASHED`/`DOT` and passes the patterns through
`seed`'s `linetypes`. Validation: 125 facade surface specs green;
`check-arch`, `check-plugin-deps`, and facade listing validation green; E2E
`cassette-profile-editor` passes (43.8s) with the theme assertion (font,
surface token, paper/model mode).

## Cassette canvas geometry on CadCraft (owner direction 2026-11-03)

The cassette designer's canvas paints its geometry through a CadCraft host
behind the SVG interaction layer. The SVG keeps the camera, chips, hit areas
and popups; the host follows that camera and keeps every assembly layer locked.
The main canvas and the sketch canvas read the same assembly layers, theme and
font.

- [ ] WAITING — owner verification: the cassette canvas geometry is drawn by
  CadCraft, the chips and hit areas still work over it, and pan/zoom keeps the
  host aligned.

### Agent Notes (2026-11-03, canvas geometry on CadCraft)

Session `agent/cassette-cadcraft-theme-20261103` (worktree
`.agent-worktrees/cassette-cadcraft-theme-20261103`). The designer canvas mounts
a CadCraft host behind `DrawingCanvas` (`showGeometry: false`); the SVG keeps
the camera, chips and hit areas, and `view-change` + `getViewportSize` map the
viewBox to the host camera. `cassetteV2AssemblyEntitiesFromDrawing` seeds the
host from the same drawing; every layer is locked. `handleDrawingReady` refits
when the drawing scope changes, and `DrawingCanvas` refits when geometry first
arrives. Validation: E2E `cassette-profile-editor` passes; 3 of 5
`cassette-designer-parameters` tests pass. The two failures (array position
drafts, dimension override) are the pre-existing assertions named in the
2026-11-02 notes.

## Shared cassette edit canvas (owner direction 2026-11-03)

Profile and face editing drive the designer's CadCraft host in place: the
sketch seeds over the assembly context at the assembly camera. The edit
controls fill the right inspector panel — back and save, the profile identity,
the parameter table and the shape list. The canvas keeps the drawing toolbar,
the dimension editor and the corner popup. Leaving restores the assembly
document and selection.

- [ ] WAITING — owner verification: entering a profile or face edit keeps the
  camera and the target in place; the inspector carries the edit controls; the
  canvas keeps the drawing toolbar; leaving restores the assembly drawing and
  selection.

### Agent Notes (2026-11-03, in-place edit panel)

Session `agent/inplace-edit-panel-20261103` (worktree
`.agent-worktrees/inplace-edit-panel-20261103`). The sketch editor teleports
its parameter table and shape list into the designer inspector through the
surface runtime's `Teleport`; the profile identity and save/back actions render
in the same panel. The assembly camera seeds the sketch camera, so entering,
leaving and reopening keep the target at its position. A face sketch's frame
composes the node's shard attachment frame with its workpiece assembly
transform, so a child face on an offset or reversed host edge opens at its
host placement.

## Inspector assembly tree and native canvas layers (owner direction 2026-11-03)

The right inspector lists the assembly as workpiece → face. The selected
face's details list its placed profiles in one compact row each, with edit and
delete icons and the Add profile action; fill edge and edge start live in the
face shape editor. The canvas carries no per-face menu chip. The assembly
canvas draws its dimensions as native CadCraft dims on the dimension layer in
every view, including the assembly context. The palette lists the drawing's
native layers, and its rows toggle those layers in the assembly and the edit;
hidden layers stay hidden through an edit. The native host is the one canvas
view: the SVG overlay keeps hit areas, chips and selection strokes alone. The
edit drawing toolbar fills the left palette; the canvas keeps the dimension
editor and corner popup.

- [ ] WAITING — owner verification: the inspector lists the workpiece and its
  faces; the selected face details list its profiles with edit/delete icons and
  Add profile; fill edge and edge start open in the face shape editor; the
  assembly canvas shows native dimension labels; the palette lists only the
  drawing's native layers; the edit toolbar sits in the left palette over the
  hidden layer list; geometry is painted once by the native host.

### Agent Notes (2026-11-03, inspector tree and native canvas)

Session `agent/inplace-edit-panel-20261103` (worktree
`.agent-worktrees/inplace-edit-panel-20261103`). The inspector renders
`workpiece → face → placed workpiece` rows; faces open the face editor in the
inspector and profiles open the placement editor there. The canvas face menu
chip is removed. `cassetteV2Renderer` keeps the dimension layer when the
assembly context replaces the drawing layers, so the assembly host seeds its
native dims. `sketchEditor` applies the palette's visible layer set to the
native host on seed and on change. E2E `cassette-profile-editor` asserts the
tree, the inspector editor, the native assembly dimensions, the dimension
layer row, the stationary camera and the in-place profile.

### Agent Notes (2026-11-03, compact face details and single native view)

Session `agent/cassette-native-inspector-20261103` (worktree
`.agent-worktrees/cassette-native-inspector-20261103`). The inspector tree
stops at faces; the selected face details render one compact row per placed
profile with edit/delete icons, Add profile, and face edit/delete icons. Fill
edge, face width and edge start moved to the face shape editor. The palette
lists the drawing's native layers only, and the edit mode swaps the layer list
for the sketch drawing toolbar; the sketch editor accepts the palette element
as its tool target and owns keyboard shortcuts while a palette tool is focused.
The SVG canvas suppresses face and profile fills once the native host owns the
drawing, keeping hit areas and selection strokes. E2E `cassette-profile-editor`
and `cassette-profile-lifecycle` pass; the parameter spec still reaches its
known array-draft failure.

### Agent Notes (2026-11-03, native-only assembly canvas)

Session `agent/cassette-native-only-20261103` (worktree
`.agent-worktrees/cassette-native-only-20261103`). The designer canvas passes
`showGeometry: false` and `nativeDimensions: true`; the native host is the only
layer and dimension painter, and the SVG keeps the face/profile hit paths and
chips. Face and profile fills use `fill-opacity` as a hover/selection
highlight, so hover feedback survives the native render. A loaded-record probe
finds no SVG text and one face hit path; the host carries the dimension layer
and responds to the palette layer toggle.

## Native cassette view (owner direction 2026-11-03)

The read-only cassette record view mounts the native CadCraft canvas with
every drawing layer, dimensions included. Its layer control toggles those
native layers. The view is inert; card and record clicks stay with the host
layout.

- [ ] WAITING — owner verification: opening a cassette record shows the
  native dimensions and every drawing layer; the layer button toggles the
  native layers; clicking the preview still opens the record from a card.

### Agent Notes (2026-11-03, native cassette preview)

Session `agent/cassette-preview-native-20261103` (worktree
`.agent-worktrees/cassette-preview-native-20261103`). `cassette-preview.mjs`
mounts `CadCraftHost`, seeds `cassetteV2AssemblyEntitiesFromDrawing`, lists the
host layers in its layer panel, and keeps the iframe pointer-inert so the
host card/record click survives. E2E `cassette-preview-native` asserts native
dimension entities, the dimension layer, and a layer toggle driving the host.

## Native cassette dimensions and layers (owner direction 2026-11-03)

The cassette canvas draws its dimension annotations as native CadCraft dim
entities on the dimension layer; a label opens its authored field in place.
Every assembly layer, dimensions included, is a native CadCraft layer toggled by
the designer's layer rows.

- [ ] WAITING — owner verification: the cassette dimension labels are drawn by
  CadCraft, clicking one edits the authored field, and the layer rows hide and
  show the native layers.

### Agent Notes (2026-11-03, native cassette dimensions and layers)

Session `agent/cassette-shared-canvas-20261103` (worktree
`.agent-worktrees/cassette-shared-canvas-20261103`). Pending implementation.

### Agent Notes (2026-11-03, owner verification fixes)

Session `agent/cassette-verify-fixes-20261103` (worktree
`.agent-worktrees/cassette-verify-fixes-20261103`). The designer palette now
hides every native layer when the last row is unchecked: `setVisibleLayers([])`
is an empty visible set, and the sketch editor keeps layer 0 and its annotation
layers when the drawing's rows are all off. The assembly's fill-only face layer
seeds as a solid native hatch at its authored opacity, so the face reads as a
fill. The profile editor hatches the placed parent face in sketch coordinates;
the parent face is the only hatch base. The SVG dimension controls are
transparent targets whenever `showGeometry` is false, so a host-painted canvas
has one dimension painter. E2E `cassette-designer-native` covers the native labels and the
hide-all toggle; `cassette-profile-editor` asserts the hatch span.

`CadCraftHost.setVisibleLayers` regens the cached base render, so a layer row
repaints the canvas. The face hatch carries entity transparency and one loop
per subpath with opposite hole winding. `drawing.dimensionAnnotations` feeds
the native dims, and the preview surface renders the OCCS payload
before baked geometry rows. E2E `cassette-preview-native` asserts the hatch
transparency, the dimension labels and a repainting layer toggle.

The profile editor's zero axis is a finite segment over the placed parent
face. Placed profiles open with the workpiece's instance values in the
parameter table; saving back to the cassette drops the instance overrides the
authored table now owns, and a library save writes evaluated parameter values.
A selected placed profile draws measured placement dimensions along the parent
edge; array placements chain every copy between the edge ends. Native
dimensions draw continuous lines in the canvas ink with readable labels.

### Agent Notes (2026-11-03, native-only dimension geometry)

Session `agent/cassette-native-dims-2-20261103` (worktree
`.agent-worktrees/cassette-native-dims-2-20261103`). The cassette drawing emits
dimension rows as structured annotations and leaves the dimension layer's path
list empty; the native host entities are the only dimension geometry. The
designer's SVG dimension edit targets resolve from those annotations in
model-space coordinates flipped into the canvas frame. Native dim entities
carry the drawing ink; the dimension layer keeps its violet DOTTED pen for
layer identity.

## Unified cassette dock and expanding assembly tree (owner direction 2026-11-05)

The designer dock owns the canvas commands in every mode: assembly undo/redo
and zoom in the assembly view; sketch undo/redo, zoom, fit, DXF import and
clear in a sketch. The tools palette holds the drawing tools, erase and the
drafting toggles alone while a sketch is open. The inspector's assembly tree is
a PrimeVue `Tree`: workpieces top-level, faces under their workpiece, a placed
profile once under its target face, every other relation under its source
workpiece; the selected face's details expand under the face row (role, shape
actions, pulse-glyph Add profile, parameter fields) and a selected profile or
relation expands its placement fields under its row. Fill edge, face width and
edge start controls are gone; a child face's span stays its authored node
parameters. The profile sketch identity packs name, kind and process into one
compact block.

- [ ] WAITING — owner verification: the dock carries undo/redo and zoom in
  both modes; the tree expands with faces and placed profiles; face and
  profile details open inside their nodes; Add profile shows the pulse glyph;
  the sketch palette shows only the drawing tools.

### Agent Notes (2026-11-05, unified dock and tree)

Session `agent/cassette-ui-unify-20261105` (worktree
`.agent-worktrees/cassette-ui-unify-20261105`). The dock's canvas group switches
by mode: the sketch editor exposes `undo`, `redo`, `canUndo`, `canRedo`,
`zoomIn`, `zoomOut`, `zoomFit`, `importDxf` and `clear`, and its palette keeps
select/line/polyline/circle/arc/rect, erase and the ortho/tangent/command-line
toggles. `Tree` joins the remote surface pack. The floating face/attachment
panel editor is gone — `renderInlineEditorBody` renders inline under the
selected tree node, keeping the `[data-designer-panel-editor]` hook. E2E
selectors updated for the dock's Clear/Undo and the tree's face row.

### Agent Notes (2026-11-05, tree styling homed in the token module)

Session `agent/cassette-tree-style-20261105` (worktree
`.agent-worktrees/cassette-tree-style-20261105`). The first pass wrapped every
tree node in a hand-rolled bordered chip and left Aura's loose root padding on
top — invented composition over the design system. `primeComponentTokens.tree`
now delivers the explorer density the token README already promised (root
padding 0, transparent background); the designer's nodes drop the chip chrome
and read selection and hover from the theme's own node states
(`selectionMode: single` with selection keys derived from the designer
selection), keeping only the `pt` lines tokens cannot express (slot-owned
icons, label fill). A relation's settings render in one full-width panel under
the tree — placement grids and parameter tables are wide, and the tree's
indentation squeezed them inside the node.

### Agent Notes (2026-11-05, tree density and adaptive settings grids)

Session `agent/cassette-settings-fit-20261105` (worktree
`.agent-worktrees/cassette-settings-fit-20261105`). The tree token block now
carries the full explorer density: `0.75rem` indent, `0.125rem 0.25rem` node
padding, `1.5rem` toggle. The attachment body (both kinds), the hardware
detail grids and the parameter grids ride auto-fitting tracks
(`repeat(auto-fit,minmax(...))` with `col-span-full` for full-row controls), so
a narrow rail renders one readable column and a wider host fills more; the
fixed two-column layout overflowed and cramped the placement fields. The
hardware dialog keeps its fixed columns — its host is a wide dialog.

### Agent Notes (2026-11-05, tree selection wired, settings in one panel)

Session `agent/cassette-tree-select-20261105` (worktree
`.agent-worktrees/cassette-tree-select-20261105`). PrimeVue's Tree consumes
`node-click` internally and never re-emits it — the tree routed nothing; the
rows now route through `node-select` (payload: the node). Face settings and a
selected hardware workpiece's fields left the tree nodes: every selection
opens its settings in the one full-width panel under the tree (face details,
relation placement, hardware fields), and tree rows carry identity alone.

### Agent Notes (2026-11-05, a new profile mounts on creation)

Session `agent/cassette-profile-mount-20261105` (worktree
`.agent-worktrees/cassette-profile-mount-20261105`). A blank draft opened on
the stand-in window and the context loaded once at edit-open, so the first
commit created the workpiece and its relation without the cassette ever
appearing — worse, the created relation kept the 'E0' default, a fold on a
grown face, leaving the placement refused until an edge was picked by hand.
The edge-array edge snap (owner law 2026-10-16) now has one home shared by
patches and creation: `snapEdgeArrayEdge`; `commitProfileDraft` and
`addProfileFromLibrary` place the new relation on the face's first
arrangeable edge. The designer watches the edited profile's placement key and
reloads the sketch context live; the sketch editor refits onto the mounted
sketch when the frame arrives mid-session.

### Agent Notes (2026-11-05, edge + dial and honest bindings)

Session `agent/cassette-edge-dial-20261105` (worktree
`.agent-worktrees/cassette-edge-dial-20261105`). The free-shard + now opens a
two-choice dial on the edge: add a face on the shard, or start a profile
mounted there — the profile workpiece is created blank with its edge-array
relation bound to that face and edge, so the sketch opens with the cassette
context live (`DrawingCanvas` already emitted the clamped screen point with
the edge payload). The binding read path dropped its silent fallbacks: a
stale target occurrence or face keeps the relation unplaced under its source
workpiece instead of rebinding to `workpieces[0]` or the tree root face
(`normalizedCassetteV2WorkpieceRelation`, `updateCassetteV2WorkpieceRelation`,
`faceIdForWorkpiece`). The binding chain is stated once in the occs README.

## Cassette selection and canvas widgets (owner direction 2026-11-02)

A face click with a profile selected selects that face and leaves the
profile placement untouched. Canvas chips, handles, and hit areas keep
their screen size across zoom. Trapezoid faces expose width and height
dimensions; authored corner geometry lives in the face shape editor.

- [ ] WAITING — owner verification: clicking a face while a profile is
  selected switches the selection to that face; profile placement stays;
  zooming leaves the canvas widgets at a constant screen size; corner
  geometry opens in the face shape editor.

### Agent Notes (2026-11-02, selection and widgets)

Session `agent/cassette-selection-widgets-20261102` (worktree
`.agent-worktrees/cassette-selection-widgets-20261102`). The profile face
branch in `handleDesignerFaceSelect` selects the clicked face and clears
the attachment selection. `DrawingCanvas` sizes designer chips, handles,
marker circles, and hit strokes from the viewBox-to-viewport ratio. The
face render data carries `dimensionControls`; corner geometry is authored
in the face shape editor. Validation: 69 facade surface specs green;
`check-arch`, `framework:validate`, and listing validation green. E2E
`cassette-profile-lifecycle` and `cassette-profile-editor` pass;
`cassette-designer-parameters` keeps its two pre-existing attachment and
override assertions failing, with two tests passing. The docs guard and
design-system suite keep their pre-existing findings.

## Stateful lifecycle contracts (2026-11-02 audit)

Root SPEC §25 is the desired-state contract for every lifecycle in this
program. READMEs keep describing the implemented machine; each README row
lands with the code that makes it true. This section is the cross-cutting
work list; each task names the owner seam and the desired machine.

### Server runtimes

- [x] `server/core/tasks`: guard `completeTaskRun` and `failTaskRun` on
  `status: 'RUNNING'` beside the claim token, so a replayed terminal
  delivery applies as a no-op. Derive the terminal set from the task
  definition's closed six status kinds; the hardcoded `TERMINAL_STATUSES`
  array stays as the default spelling. Add transition tests for duplicate
  complete/fail, cancel, retry, lease reclaim, and a definition that
  renames status values. Evidence: `server/core/tasks/service.js:8,72-180`,
  `repository.js:34-65`; desired machine SPEC §25.
- [ ] Task completion concurrency: two completion requests carrying the
  same still-valid claim can both pass the initial read and execute
  `processEvents`/`processEffects` before either wins the final
  `updateClaimedById` compare-and-set. The final state is protected, but
  side effects are not. Define a durable idempotent effect/outbox protocol
  with crash recovery before claiming concurrent completion is exactly-once;
  a short-lived in-memory lock or a completion flag alone is insufficient.
- [x] `server/core/commands`: add orphan recovery for `RUNNING`. A
  startup sweep, or the command lease chosen below, marks stale runs
  `FAILED` with `abandoned` context and a finish stamp. Add transition
  tests for success, failure, and abandoned recovery. Evidence:
  `server/core/commands/service.js:24-120`.
- [x] `packages/processes` + `server/features/process-definitions`: publish
  the run and step transition tables in the owning docs and pin them with
  tests. Create each step as `pending`, move it to `running`, and settle
  it through `succeeded`/`failed`/`cancelled`; `skipped` leaves the
  vocabulary. Keep `waiting` as the parked state with `pendingEffect` or
  `wakeAt` as facts. Test node failure, empty-token success, stop-success,
  stop-failure, task cancellation, Wait Until resume, and restart loss of
  an async command continuation. Evidence:
  `packages/processes/src/orchestration.js:5-6,67-170,228-341`;
  `server/features/process-definitions/service.js:639-720,840-885`.
- [x] `server/features/process-definitions`: give the definition its own
  transition table — create → `DRAFT`, activate → `ACTIVE`, deactivate
  `ACTIVE` → `DRAFT`, archive → `ARCHIVED` — and write status stamps
  through the same audit seam as other persisted lifecycles. Add the
  migration axis `none`/`required`/`applied`/`incomplete` to the same
  contract; `ACTIVE` plus an incomplete migration is one named state.
  Test activation from draft, active, and archived; deactivation refusal
  from draft; archive from each state; re-activation history; and the
  partial-migration resume. Evidence:
  `server/features/process-definitions/service.js:274,402-470,540-597,1453-1455`.

### Feature lifecycles

- [x] `server/features/billing`: close the payment machine with a terminal
  failure path — `created`, `processing`, `completed`, `failed` — and give
  the invoice `open`, `paid`, `void`, `failed`. The background claim keeps
  the attempt cap and the startup `processing` reset; a payment at the cap
  moves to `failed` with its last provider error. Test paid, retry, cap,
  startup reset, and duplicate completion. Evidence:
  `repository.js:135-155`; `service.js:102-162`;
  `server/plugins/stripesync.js:21-35`.
- [x] `server/features/invitations` + `server/features/users`: make
  `status` the invitation state — `pending`, `accepted`, `declined`,
  `expired`, `revoked` — and derive `isActive` from it. Link and targeted
  invitations share the table. Expiry moves through a declared sweep or a
  lazy transition with the same result; `revoke` writes `revoked`. The
  membership machine is `pending` → `active`, with rejection removing the
  membership; the `rejected` reads leave the code. Test link join, targeted
  accept, decline, revoke, expiry, pending approval, rejection, and a
  duplicate response. Evidence: `invitations/repository.js`,
  `invitations/service.js:86-192`, `users/repository.js:114`,
  `users/service.js:200-216`, `states/types.js:9-13`.
- [x] `server/features/partnerships`: pin the documented table with
  transition tests — request → `pending`, partner accept → `active`,
  partner decline → `declined`, requester cancel pending → `declined`,
  either side terminate `active` → `terminated` — and verify the collection
  status and `status_events` record move together. Evidence:
  `service.js:37-77`.
- [x] `server/features/livekit`: make recording terminal events idempotent.
  `egress_ended` imports and completes once; a repeated delivery applies as
  a no-op. `egress_failed` and import failure settle `failed`. Add a stale
  `recording` recovery that checks the egress plane and settles the record.
  Test duplicate ended, duplicate failed, import failure, and stale
  recovery. Evidence: `repository.js:8-38`; `service.js:291-299,379-402`.
- [x] `server/features/files`: give upload sessions a `status` field —
  `open`, `completed`, `expired` — beside the chunk collection. `complete`
  assembles, stores, and marks `completed`; the TTL sweep marks `expired`
  before deletion. Test resume, out-of-order chunks, incomplete completion,
  duplicate completion, and expiry. Evidence: `repository.js`;
  `service.js:141-211`; `composables/useChatFileUpload.js`.
- [x] `server/features/process-definitions`: close event delivery and
  schedules. `process_events` carries `pending`, `dispatched`, `failed`
  with attempts and last error; a failed delivery retries to the declared
  cap and then settles `failed`. A schedule entry is `unfired` or `fired`,
  with the ledger row as the state. Test inline delivery, scanner retry,
  retry cap, event subscriber fanout, one-shot fire, interval re-arm, and
  failed fire. Evidence: `run-store.js:45-71`; `run-scanner.js:47-98`.
- [x] `server/features/workflow-overrides`: keep `ACTIVE` and `ARCHIVED`
  as the override states and delete `DRAFT` from the vocabulary. Activation
  archives the current active row and inserts the next one in one seam; a
  unique active index enforces the invariant. Test first activation,
  replacement, archive, and a concurrent activation. Evidence:
  `workflow-overrides/service.js:19-35`; `repository.js:39-52`.
- [x] `server/features/agent-bots`: name the room run machine — `running`,
  `awaiting-answer`, `stopping` — with outcomes `completed` and `failed`.
  The coalesced trigger set is queue state on the room. A stop moves the
  room to `stopping`, aborts the loop, persists the partial answer, and
  settles. A question moves to `awaiting-answer` and settles through the
  answer, stop, or timeout. Test coalescing, stop mid-tool, stop mid-answer,
  question answered, question timeout, question stopped, and run failure.
  Evidence: `runtime.js:27-126,430-500,570-650,700-775`.

### Client and transport machines

- [x] `stores/outbox.js` + `utils/outbox.js`: name the operation machine —
  `pending`, `failed` — with success deleting the operation. Connectivity
  is `online`/`offline` with the failure latch as its transition fact.
  Persist the state on enqueue; a 4xx settles `failed`, a 5xx or network
  failure leaves `pending` and stops the flush. Test offline queue, online
  replay, 4xx failure, retry, discard, duplicate replay, and the latch
  heal. Evidence: `stores/outbox.js`; `utils/outbox.js`.
- [x] `composables/useConnections.js`: publish the stream table —
  `idle` → `connecting` → `open`; `open` → `error` → `reconnecting` →
  `connecting` — and a separate subscription sync table `idle`, `syncing`,
  `synced`, `failed`. A 403 moves the sync to a fresh stream. Test first
  connect, ready, close, reconnect, 403 resync, sync retry cap, and topic
  drop. Evidence: `composables/useConnections.js`.
- [x] `stores/instanceEvents.js`: publish the poll table — `idle`,
  `polling`, `connected`, `error`, `stopped` — with visibility and retry
  clauses. `connected` means the last poll succeeded; `error` keeps the
  retry timer. Test first cursor, success, failure, visibility pause,
  reconnect, and self-published skip. Evidence: `stores/instanceEvents.js`.
- [x] `stores/calls.js`: keep the documented line table and make the
  session state explicit — `connecting`, `connected`, `reconnecting`,
  `failed` — with `reconnecting` as a state in place of the boolean
  overlay. Placement is `tab`, `dialog`, `floating`, `dock`, with
  `pendingTabRoom`/`mountedRooms`/`callTabs` as facts. Give `joining` a
  timeout that returns to `ringing` or `idle`. Test invite, accept, join,
  leave, session failure, reconnect, surface move, and join timeout.
  Evidence: `stores/calls.js:27-169,247-271,706-714`;
  `components/calls/README.md:134-165`.
- [x] `composables/useProcessDesignerApply.js`: replace the parallel refs
  with one `applyState` — `idle`, `saving`, `applying`,
  `migration-required`, `type-migration-required`, `error`. Confirm and
  cancel consume the state and move to the next state; the two gates share
  the same transition table. Test save-only, validation failure, migration
  confirm/cancel, type migration confirm/cancel, and overlapping gate
  arrival. Evidence: `useProcessDesignerApply.js`.
- [x] `stores/instances.js`: name the per-record write state — `idle`,
  `pending`, `confirmed`, `rolled-back`, `queued` — and serialize writes
  per record id. A preview enters `pending`; the response settles
  `confirmed`; a failure or queued offline write settles `rolled-back` or
  `queued`. Test update, delete, concurrent update, rollback, queued
  offline, and event reconciliation. Evidence: `stores/instances.js:381-451`.
- [x] `components/chat/useChatThread.js`: derive the client run state from
  the server stream — `idle`, `running`, `awaiting-answer`, `stopping`,
  `completed`, `failed` — with `stopping` reconciled by stream end, the
  persisted message, or a timeout. Test activity, stream, question,
  answer, stop, stream end, persisted message, and gap resync. Evidence:
  `useChatThread.js:142-183,1880-1940`.

### Documentation reconciliation

- [x] `server/features/states/README.md`: state the actual status write
  paths — `stateService` for machine-governed transitions, `applyStatus`
  for initial organization/user/process-definition snapshots, and
  `addStatus`/`initializeStatus` for invitations and partnerships. The
  current "only through `stateService.transition()`" sentence contradicts
  those writers.
- [x] `server/features/states/types.js` + `server/features/invitations/README.md`:
  align the invitation vocabulary with the desired table (`declined` and
  `revoked` included; `pending` as the single initial state).
- [x] `server/features/workflow-overrides/README.md`: drop `DRAFT` from the
  data contract after the code cut.
- [x] `server/features/process-definitions/README.md`: add the Archive row
  to the lifecycle table and state the migration axis beside the status.
- [x] Add the transition table to each implemented machine's README after
  its code lands: task run, command run, process execution, billing,
  call recording, upload session, process event delivery, agent run, and
  outbox. Each README keeps the implemented table; root SPEC §25 keeps the
  desired one.

### Dead vocabulary and paths

- [x] Remove process step `skipped`; create steps as `pending`.
- [x] Remove membership `rejected` checks with the membership machine.
- [x] Write invitation `revoked` or remove it from the vocabulary; the
  desired table writes it.
- [x] Remove `invitations/repository.js:markAsUsed()` with its callers.
- [x] Remove the organization/user `inactive` and `suspended` status
  vocabulary, or implement the account lifecycle that uses it.
- [x] Remove `users.data.isActive` login checks, or implement account
  deactivation as an explicit account machine.
- [x] Remove the workflow-override `DRAFT` state with the code cut.
- [x] Replace `TERMINAL_STATUSES` with the task definition's terminal set.

### Owner decisions wanted

- [x] Command-run recovery — startup sweep; runs older than 15 minutes
  settle `FAILED` with `abandoned`.
- [x] Billing terminal names — payment `failed`; invoice `failed`/`void`.
- [x] Invitation expiry — lazy transition on access.
- [x] Upload-session state — persisted `status` field.
- [x] Agent-run state — persisted `agent_bot_runs` document.
- [x] Call placement — explicit `tab`/`dialog`/`floating`/`dock` state.
- [x] Account lifecycle — delete `isActive`/`inactive`/`suspended`;
  membership is the only tenant state.

### Agent Notes (2026-11-02)

Session `agent/state-machines-20261102-0900` (worktree
`.agent-worktrees/state-machines-20261102`). All machines landed with
their transition tables, focused tests, and README contracts:

- Core runtimes: task terminal edges derive from the definition's
  `status` map and guard on running + claim token before side effects;
  command runs recover stale `RUNNING` rows through the startup sweep;
  workflow overrides have `ACTIVE`/`ARCHIVED` plus the unique active
  index.
- Process runtime: run/step tables live in `packages/processes`; a step
  starts `pending` and settles through `succeeded`/`failed`/`cancelled`.
  Publication is `DRAFT`/`ACTIVE`/`ARCHIVED` with archive from each state, and
  `data.migrations.state` carries `none`/`required`/`applied`/`incomplete`.
  Process events are `pending`/`dispatched`/`failed` with attempts and
  last error; schedule entries are `unfired`/`fired` by ledger row.
- Feature lifecycles: billing payment/invoice, invitation, membership,
  partnership, call recording, and upload-session machines landed.
  Stored data migrates through
  `server/scripts/migrate-lifecycle-status-vocabulary.js` and
  `migrate-process-event-status.js`.
- Agent runs persist as `agent_bot_runs`; boot recovery settles runs
  untouched for 30 minutes.
- Client machines: outbox, connections stream + subscription sync,
  instance-events poll, call line/session/placement, designer Apply,
  optimistic writes, and the chat run mirror each carry one authoritative
  state value and their transition tables.

Validation: touched suites are green. The full unit suite's remaining
failures sit in process-definitions fixture drift, design-system, fact
display, localization, app-registry, construction-services,
instance-select, canvas-model, and the support snapshot. `check-arch`, `framework:validate`, docs guard (the pre-existing
`jagua-rs` submodule link aside), and the SSR smoke (23 tests) pass.

- [ ] WAITING — owner verification: exercise the live surfaces — task
  retry/cancel, command recovery after restart, Apply gates, invitations
  and membership approval, billing payment, call joining/reconnect and
  placement, offline outbox replay, agent stop/answer, and a process run
  through Wait Until and event delivery.

## Process proposition before compose (owner direction 2026-11-02)

Composing a process definition answers with the definition's simplified
Mermaid proposition first — entity types, lifecycle states, effects,
entries. The room validates the shape through `ask_user` in chat runs;
MCP surfaces validate it in the diagram reply that starts the compose.

- [x] WAITING — owner verification: the authoring guide, system prompt,
  MCP instructions, and compose tool description carry the gate; a chat
  proposition round keeps its diagram beside the suspended question.

### Agent Notes (2026-11-02, process-proposition-mermaid)

Session `agent/process-proposition-mermaid-20261102` (worktree
`.agent-worktrees/process-proposition-mermaid-20261102`). The guide adds
`## The proposition gate` ahead of the compose loop; the runtime system
prompt and MCP instructions carry it; the loop keeps a proposition
round's answer text live beside `ask_user`; the tooling spec pins the
guide text and the chat spec pins the preserved diagram.

## Lightweight in-place previews (owner direction 2026-11-06)

Instance previews render in-place as lightweight SVG. The cassette
preview surface draws through the plugin's tree renderer on the shared
SVG canvas — the same render the designer's template-picker thumbnails
use — and the DXF preview parser covers the full entity set real files
carry (blocks, splines, ellipses, text, bulges), with off layers hidden.
The CAD engine mounts in editors; preview slots stay engine-free. Baked
preview storage stays out.

- [ ] WAITING — owner verification: cassette cards and record bands
  preview instantly as SVG with outline and folds; DXF files whose
  geometry lives in blocks or curves preview whole; the preview bands
  mount no engine iframe.

### Agent Notes (2026-11-06, in-place SVG previews)

Session `agent/svg-previews-20261106` (worktree
`.agent-worktrees/svg-previews-20261106`). This supersedes the 2026-11-03
native cassette view for the preview surface: `cassette-preview.mjs`
renders the payload graph tree through `renderCassetteV2TreeToDrawing`
onto the contract-1 `DrawingCanvas` (payload first, baked geometry rows
behind it, `CASSETTE_PREVIEW_LAYERS` gating the visible layers);
`cassette-preview-native.spec.js` is replaced by `cassette-preview.spec.js`
asserting the SVG band. `utils/dxfParser.js` `generateSvgData` flattens
INSERT block references recursively (placement transform, layer-0
inheritance, depth cap), samples SPLINE via de Boor (fit points pass
through), ELLIPSE by parametrization, polyline bulges as arcs, and emits
TEXT/MTEXT text primitives with rotation; the LAYER table's negative
color index hides off layers; the dead `extractDxfLayers`,
`generateSvgDataFromText`, `generateSvgPreview`, `extractPolygons`, and `validateDxfFile` exports are deleted. Validation:
`utils/dxfParser.spec.js` 5/5; facade surface specs 224/224; `check-arch`,
`check-plugin-deps`, and facade listing validation green; docs guard keeps
the pre-existing `workers/nesting` link finding.

## Interaction unification programs (owner direction 2026-11-06)

Law: SPEC §4 (the editor is the record surface; the create palette and
the action inbox), SPEC §1 (declaration authoring in place), SPEC §22.15
amendment (the quiet header cluster). Written from owner words
2026-11-06: generated UI converges on Notion/Obsidian-grade interaction
ease and uniformness — record surfaces quiet and uniform, documents open
into their editors, creation and next-action are first-class surfaces,
and process declarations author in place. Ordered programs A–D; each
lands with its own WAITING boxes and Agent Notes.

### A. Quiet collection chrome (SPEC §22.15 amendment)

- [x] One view control: search, the FilterBuilder, the projection
  switch, and SortControl collapse behind a single header popover
  carrying the active condition count as its badge; the header renders
  label, count chip, create (+ link where a relation section owns it),
  and the view control alone. The popover hosts the existing contracts
  (`listControls`, `builderFieldsForType`, the ui-view-state
  persistence) — no new per-type vocabulary.
  Landed 2026-11-06 (c09f38c47).
- [x] Pointer-aware disclosure: hover-capable pointers reveal the
  cluster on header hover; coarse pointers keep every control pinned.
  Landed 2026-11-06 (c09f38c47).
- [x] Validation: ui-mapping focused specs, design-system guard,
  localization keys en+ru, SSR smoke; docs — components/ui-mapping and
  shared/ui-mapping READMEs.
  Landed 2026-11-06 (c09f38c47).
- [ ] WAITING — owner verification: visual pass over a generated
  collection header (view popover contents and order, condition-count
  badge, quiet-until-hover on a mouse host, pinned full presence on a
  touch host, live-apply of search/projection/sort inside the popover).

Session reads: SPEC §22.15/§22.9; shared/ui-mapping/README.md;
components/ui-mapping/README.md (region header controls section).

### Agent Notes (2026-11-06)

- Landed in c09f38c47: RegionBlock's header cluster renders label,
  count chip, view control, create (+ link on relation sections). The
  view popover hosts, in order, the search field, the FilterBuilder
  panel, the projection toggle, and the card-grid sort keys — all live
  models applying on change. The view button badges the filter condition
  count through `countPredicates`, a new export canonically homed in
  shared/instance-filters. FilterBuilder is now a host-owned panel (its
  one consumer is the view popover); SortControl gained an `inline` mode
  for the view popover while board lanes keep the popover mode.
- Pointer disclosure is pure CSS on the header row: the quiet state
  rides Tailwind's `[@media(hover:hover)]:opacity-60` arbitrary variant
  with `group-hover/region-header` and `group-focus-within/region-header`
  reveal, `motion-reduce:transition-none` for reduced motion, and the
  cluster stays lit while its popover is open (Popover show/hide state).
  The TODO's container-trait hint was dropped: the hover-capability
  media query is itself the pointer distinction, so a JS/seam read adds
  state the CSS already decides. Scoped styles stayed out of the design:
  the design-system guard pins scoped styles to a layout-only property
  vocabulary (opacity and transition sit outside it), and the arbitrary
  variant compiles to the plain media query (verified against the
  installed Tailwind 3.4).
- Locale key `uiMapping.view` added to en+ru ("View" / "Вид").
- Validation: `npx vitest run shared/ui-mapping
  components/ui-mapping/module-imports.spec.js shared/localization.spec.js`
  134/134 green; `shared/instance-filters` green; SSR smoke
  (`vitest.ssr.config.js`) 23/23 green; `node scripts/check-arch.js`
  green; `npm run docs:validate` reports only the two known findings
  (workers/nesting jagua-rs broken link, the 13-entry contract-homing
  backlog).
- Finding: `shared/design-system.spec.js` carries 4 failures that exist
  on the base commit (reproduced with this branch's changes stashed) —
  `components/generated/GeneratedScreenHost.vue` typography, raw
  Card/Dialog ownership, and a dead color utility, plus one token
  projection diff. They predate this program and belong to the
  GeneratedScreenHost owner.
- shared/ui-mapping/README.md needed no edit: it states the projection
  switch's persisted-seam contract and links to the components README
  for placement.

#### Agent Notes (2026-11-06, review cleanup)

Session `agent/review-slop-20261106` (worktree
`.agent-worktrees/review-slop-20261106`). Review-pass hygiene over the
landed programs: `countPredicates` gained direct spec coverage
(nested-combinator, malformed-tree, bare-predicate counts); its contract
sentence in shared/instance-filters names the view control (the badged
trigger); SortControl's redundant inline guard, RegionBlock's two
narrating comments, and PayloadRevisionPicker's two dead store imports
are deleted.

### B. The editor is the record surface (SPEC §4)

- [x] Editor-bound types open editor-first: the record detail mounts the
  registered editor surface (local registry or the remote loader) as the
  record body under the standard header; the standalone editor action
  dies from headers, action strips, and menus.
  Landed 2026-11-06 (20694b7d1).
- [x] Grant-keyed mode: a write grant edits in place; a read grant
  renders the same surface read-only (per-surface degradation — the
  sheet editor's existing law generalized; the text editor's read-only
  presentation is the rendered document).
  Landed 2026-11-06 (20694b7d1).
- [x] Hosts: the record popup of an editor-bound type renders the
  bounded editor (compact rhythm); the peek keeps its preview; routed
  pages and panes render the editor at full surface.
  Landed 2026-11-06 (20694b7d1).
- [x] Version trigger and blank creates: the version surface trigger
  rides the editor surface's corner in every host shape;
  `created-instance-open` lands editor-protocol creates on the record
  surface; blank editor creates keep the first-save-creates law.
  Landed 2026-11-06 (20694b7d1).
- [x] Validation: focused component specs + SSR smoke; e2e re-pins
  (md-editor-repair and the editor surfaces); docs —
  components/generated (file surfaces contract), components/ui-mapping
  (record anatomy), stores/README where open seams change.
  Landed 2026-11-06 (20694b7d1) — unit-side green; the e2e re-pins
  (md-editor-repair, plugin-surface, sheet-editor-panel,
  tech-drawing-fill-dialog) await the next stack run.
- [ ] WAITING — owner verification: a generated document detail (md/csv)
  opens its editor as the record body with the version trigger on the
  corner; the record popup hosts the bounded editor; the peek keeps its
  preview; a read-grant opener sees the rendered markdown document while
  the sheet, csv, sketch, DXF, and cassette surfaces degrade to their
  read-only presentations; no edit affordance remains on
  any surface of an editor-bound type; the fill dialog's reference-row
  affordance opens the record popup.

Session reads: SPEC §4 (editor law, create protocols), §24 (version
surface); components/generated/README.md (file surfaces),
components/ui-mapping/README.md (SurfaceHeader/GeneratedMappingScreen),
pages/README.md (screens route).

### Agent Notes (2026-11-06, editor-as-record-surface)

Session `agent/editor-surface-20261106` (worktree
`.agent-worktrees/editor-surface-20261106`). Landed in 20694b7d1:

- The record body mounts the editor: `RecordEditorBody` (components/
  generated) resolves the type's file surface through the registry
  (served view, pack fallback), feeds the mount the wire record from the
  instances pool, and renders the workspace-page presentation inside the
  framed `LAYOUT.editorBand` (`editorBandBounded` in popup hosts — new
  band-atom recipes, real CSS in main.css). `SurfaceDetailBody` mounts it
  for the full variant in the record presentation; the peek and nested
  card bodies keep the preview band; the fact strip keeps its
  filled-scalars derivation, so payload-only document types render the
  editor alone and canvas types keep parameter facts; relations and the
  record ladder stack after the editor unchanged. The
  `PayloadRevisionPicker` overlay re-homes to the editor band's corner in
  that shape.
- Grant-keyed mode: `editorWriteGranted`/`editorMountMode` single-homed
  in file-surfaces.js over `resolveTypeFeature` + the shared evaluator;
  consumed by the record-body mount, the remote workspace-page props
  adapter, the remote access channel (deduped), `ReplacePayloadAction`,
  and `PayloadRevisionPicker` (deduped — four inline copies collapsed).
  `RemoteEditorSurface` passes `mode` to the mounted module; the
  documents text editor renders the markdown document (host
  `renderMarkdown`, `ck-markdown-body`) under 'read'.
- The editor action died whole: `GeneratedEditorPageAction.vue`,
  `instance-editor-action.js`, the `editorActions` channel
  (GeneratedScreenHost → GeneratedMappingScreen → RegionBlock →
  SurfaceHeader, RefRowActions, SpotPartsRow), and the `editor` flag on
  `created-instance-open`/`openInstanceInWorkspace`/the home workspace's
  open chain are deleted; editor creates land on the record surface
  (compiled detail tab, else the editor page bound to the record). The
  workspace-page registry entries for editors stay; blank creates keep
  `openBlankFileEditor`. The fill dialog's reference-row pencil became
  the record-popup opener (common.open, en+ru already present).
- Design-system guard failures on `GeneratedScreenHost.vue` closed
  (StandardDialog for the two raw Dialogs, semantic typography roles);
  the stale `primeComponentTokens.tree` pin (explorer-density tokens
  landed without the spec) and the DesignerWorkspace custom-property
  scoped-style false positive closed at their homes.
- FINDING (pre-existing, fixed): `components/generated/file-surfaces.spec.js`
  was red at base — its import graph reaches `#app`
  (RemoteEditorSurface → remote-surface-mount → InstanceInlineRef →
  InstancePeek → GeneratedScreenHost → useGeneratedScreen) and the unit
  vitest config carried no `#app` resolution; the config now aliases the
  SSR harness stubs (grew `useRequestHeaders`).
  `instance-select.spec.js`'s enum-select allowance also missed
  `LayerMappingRow.vue` at base (pre-existing red).
- FINDING (closed 2026-11-06): the csv editor, sketch editor, DXF
  editor, and cassette designer carried no read-only degradation — a
  read-grant opener saw the editing surface (writes stayed
  server-fail-closed; the sheet editor degrades internally, the text
  editor renders the document). Plugin-side read-only presentations
  landed (Agent Notes below): every editor surface now degrades under
  mount `mode: 'read'`.
- FINDING (open): plugin-surface e2e's preview leg was dropped — the
  fixture type binds an editor, so its detail body is the editor and the
  plugin preview has no remaining UI slot in that org (table projection,
  no chips); the served-binding assertions stay, the cassette preview
  specs pin the preview mount against real payloads.
- Validation: components/generated 47, shared/ui-mapping + ui-mapping
  131, design-system 34, localization, module-imports, instance-select,
  surface-pack-cycle green; SSR smoke 23/23; `check-arch`,
  `check-plugin-deps` green; `docs:validate` reports only the two known
  findings (jagua-rs link, 13-entry homing backlog). Full unit sweep: 12
  failures reproduced identical at base (process-definitions fixture
  drift, fact-display, agent-bots, app-registry, support snapshot —
  untouched server-side suites). E2E re-pins edited blind (no stack in
  session); the next stack pass owns them.

#### Agent Notes (2026-11-06, read-only degradation)

Session `agent/ro-degrade-20261106` (worktree
`.agent-worktrees/ro-degrade-20261106`). The mount already passes the
grant-keyed `mode` prop to every served module (`RemoteEditorSurface`,
the record-body mount, the pane-tab props adapter), so the degradation
consumed the existing contract; versions bumped per the surface-change
precedent (documents v7, tech-drawing v10, facade v41). Per surface:

- csv editor renders the table and the document name (the cell-edit
  table, rename field, and save die with the read render branch).
- sketch editor renders the scene svg inert (the read render attaches
  no pointer handlers and drops the toolbar, background controls, and
  save).
- DXF editor keeps the canvas (fit control, layer-normalized open) and
  renders the anchor rows as plain text; the marker form, rename
  inputs, delete, save, and canvas point-picking die.
- cassette designer keeps the canvas with selection (face/profile/fold
  select, tree, layer toggles, folded preview) and gates every
  authoring entry: document dock, undo/redo dock items and shortcuts,
  parameter palette, add-hardware/tree-row actions, inline editors and
  the selection panels, sketch sessions, edge-dial/point/section/fold
  authoring events, onboarding rail. DrawingCanvas gained the
  `designerEditable` prop (default true) hiding the authoring overlays
  — free-shard `+` chips, fold-angle chip, section drag handles,
  dimension edit targets — so a read mount carries zero dead controls.
- Specs: each surface gained a mount spec (SSR render-tree pattern of
  `sheet-design-editor.spec.js`) pinning the degradation case and the
  edit-mode contrast; `cadcraft` is factory-mocked in the DXF and
  cassette specs (the bare specifier resolves only through the
  executor's vendor rewrite).
- Validation: the three plugins' surface suites 146/146; all three
  listings `perigram-plugin validate` OK; components/generated +
  shared plugin-surfaces suites, `check-arch`, `docs:validate` green
  beside the known findings.


### C. Create palette and the action inbox (SPEC §4)

- [x] Create palette: one create control in the home shell opening a
  searchable palette of the compiled create actions the current user may
  run (auth-hydrated manifest + bundle), grouped by type label, named by
  the create-label law, dispatching by creation protocol (upload inline,
  editor blank surface, construct dialog) and landing through
  `created-instance-open`.
  Landed 2026-11-06 (057ac1e21).
- [x] Inbox query: one framework endpoint serving, for the current user
  and organization, instances whose current state admits an action the
  user's roles grant — derived over the compiled active contract
  (per-action `state.from` × action grants × live instances), bounded
  per action, carrying `{typeId, instanceId, actionIds}` rows through
  the ordinary instances read paths.
  Landed 2026-11-06 (057ac1e21).
- [x] Inbox surface: a home pane tab (registered workspace page) listing
  the tiles with their admissible actions, running them through the
  instances store's action-run channel.
  Landed 2026-11-06 (057ac1e21).
- [x] Validation: the query service's focused spec; SSR/component specs
  for the surfaces; localization en+ru; docs — the endpoint's README
  home, components/generated home-workspace section.
  Landed 2026-11-06 (057ac1e21).
- [ ] WAITING — owner verification: the create control beside the wrap
  control in both sidebar shapes and in the mobile home header opens a
  searchable palette grouped by type with procedural labels; an upload
  create runs inline, an editor create opens the blank editor, other
  creates open the construct dialog and land through created-open; the
  Inbox entry beside Chats/Calls (and the mobile inbox tab) lists tiles
  with admissible actions grouped by type, running an action reconciles
  the row away, and a grantless user sees no palette entries.

Session reads: SPEC §4 (create palette/inbox law, action contract);
components/generated/README.md; stores/README.md (instances store);
server/api + server/features layout for the endpoint home.

### Agent Notes (2026-11-06, create palette and action inbox)

Session `agent/create-inbox-20261106` (worktree
`.agent-worktrees/create-inbox-20261106`). Landed in 057ac1e21:

- Landed: the create control (`CreatePalette.vue`) sits in the brand
  header beside the wrap control in the expanded sidebar, at the top of
  the wrapped icon rail, and in a new mobile home surface header row;
  it renders only while the manifest carries a runnable create. The
  palette is a Popover with one `common.search` field and a grouped
  PrimeVue Listbox (`createPaletteGroups` pure helper, spec-pinned);
  entries keep the manifest projection's procedural create labels (the
  projection applies the create-label law — authored label wins, else
  `New <Type> from <Mode>`), grouped by type label through the served
  type view with the bundle as fallback. Dispatch reuses the RefRowActions
  law: `editor` mode opens `openBlankFileEditor`, `upload` mode runs the
  files channel then the action run, everything else opens the shared
  action form dialog or runs directly (`planActionLaunch`); runs go
  through `instances.runAction` and land through
  `resolveCreatedInstanceOpen` + `openInstanceInWorkspace`.
- Create-dialog factoring: the form dialog left
  GeneratedMappingScreen as `ActionFormDialog.vue` (create + runCommand
  rows, the empty-rows immediate-run law, scoped-parent binding) with
  `NestedCreateDialog.vue` for part-creates (row apply inside the form,
  link apply in the screen's link dialog). The row-unfilled predicate
  and the draft payload scalarization moved to shared/ui-mapping
  (`createDialogRowUnfilled`, `createDialogPayload`); compiled creates
  group through `createActionsByType` in utils/action-visibility.
  GeneratedMappingScreen keeps only the run dispatch and the link
  dialog.
- Inbox query: `GET /api/process-definitions/active/inbox`
  (`action-inbox.js`, neighbor of the active contract's runtime routes).
  Grants consume `auth.roleAssignments.actions` — the hydration seam's
  grant-filtered projected manifest, no second evaluator. Selection:
  manual instance-addressed actions with a non-empty `state` window
  (creates excluded). `from` admits instances in that state; a `to`
  without `from` admits every non-empty state except the no-op target —
  the stored twin of `actionAppliesToEntity`. One bounded query per
  action (`INBOX_ROW_CAP_PER_ACTION` = 25, createdAt-desc) over the
  type's per-class collection, org-filtered like the list transport;
  rows are `{typeId, instanceId, actionIds}` alone. Spec written first
  (failure modes), 10/10 green.
- Inbox surface: `ActionInboxPage.vue` is the registered `inbox`
  workspace page (`/inbox` as the mobile/deep-link route, a bottom-bar
  tab beside Chats); the sidebar carries the Inbox entry between Chats
  and Calls in both shapes. Rows (`deriveInboxRows`, spec-pinned)
  cross the query with live pool state: each type hydrates through the
  ordinary list transport, a row renders while its instance stays
  pooled and `actionAppliesToEntity` still admits one of its actions —
  runs reconcile rows away through the shared entity-event
  invalidation; the row is the `InstanceInlineRef` tile with
  `ActionButton`s, grouped under the type label; empty state is a bare
  StateBlock.
- Locale key `nav.inbox` added to en+ru ("Inbox" / "Входящие").
- Validation: focused suites green — action-inbox 10/10,
  create-palette 3/3, action-inbox-rows 3/3, components/generated 48,
  ui-mapping module-imports + shared/ui-mapping 133, localization; SSR
  smoke (`vitest.ssr.config.js`) 23/23; `node scripts/check-arch.js`
  green; `npm run docs:validate` clean beside the known findings
  (13-entry contract-homing backlog, unchanged; the jagua-rs link
  reported OK this run). No Playwright per session law.
- Open: while the inbox tab stays mounted, rows reconcile away through
  entity events but new admissions appear on the next open/reload — a
  live-query subscription would be new machinery beyond this program.
- Open: the sidebar-explorer spec stubs `CreatePalette.vue` (its
  PanelMenu model fixture provides no Toast service; the palette needs
  the app-level Toast host the real layout mounts).

Retired 2026-11-07 (SPEC §26): the action inbox surface and its
endpoint died in the user-space program's Phase F (e282445a0) — the
pane tab, sidebar entries, mobile tab, `/inbox` route, and the
`/active/inbox` query. The create palette stays.

#### Agent Notes (2026-11-06, review fixes)

Session `agent/c-review-fix-20261106` (worktree
`.agent-worktrees/c-review-fix-20261106`). Review findings, fixed:

- F1: the collapsed sidebar rendered two create controls at once (the
  brand header's and the wrapped rail's top). The collapsed brand
  header now carries the wrap toggle alone; the rail top carries the
  one create control when collapsed and the expanded header keeps it
  beside the wrap toggle, so each desktop shape mounts exactly one
  (mobile keeps its own header mount).
- F2: the wrapped rail carried chats, calls, and type icons only. It
  now carries the inbox icon between Chats and Calls (plain state like
  Calls, `nav.inbox` label, `openWorkspacePage({ pageId: 'inbox' })`),
  matching the expanded menu's order — the inbox is reachable in both
  sidebar shapes. The rail enumeration in components/generated/README
  follows.
- M1: the action-inbox README called the server state admission "the
  stored twin" of `actionAppliesToEntity`. It now states the actual
  contract: a conservative over-fetch whose excess rows the client
  drops by re-evaluating `actionAppliesToEntity` per row (two safe
  divergences motivated the fix: a stateless instance with a to-only
  action is server-excluded while the client predicate admits it, and
  multi-shape docs match any state path server-side while the client
  read is precedence-first).
- M2: framework feature types (party classes, `framework`-flagged
  machinery) resolved through `declarationForType` and a granted
  action over them queried the `files` collection fallback, matching
  nothing. `declarationCollectionOf` now returns them no collection
  (the domain projection's authorable-instance predicate), so the
  README's "framework feature types do not contribute" holds.
- M5: CreatePalette and RefRowActions duplicated the upload-create
  sequence (accept derivation, `/api/files/upload?bucket=files`,
  payload-reference draft). It lives once in
  `components/ui-mapping/upload-create.js`
  (`uploadCreateAccept`, `uploadCreatePayloadReference`), consumed by
  both; zero behavior change.
- Validation: components/generated + shared/localization 58/58;
  create-palette 3/3, action-inbox 10/10, action-inbox-rows 4/4;
  SSR smoke 24/24; `node scripts/check-arch.js` green;
  `npm run docs:validate` clean beside the known findings (the
  contract-homing backlog, none of it in the touched files).

### D. Declaration authoring in place (SPEC §1)

- [x] Author affordance: a control on a stationed type's list surface
  header (and the type's record surface), gated by the process-design
  capability, opening the type declaration editor as a workspace page
  pane tab.
  Landed 2026-11-06 (declaration editor session, see Agent Notes).
- [x] Declaration editor: fields as a property list — one row per field
  with kind, qualifier, identifier/required flags, glyph — and the
  lifecycle as the states-and-transitions editor (state value, label,
  severity/icon; transitions from/to/intent), composing the existing
  `DescriptorEditor` and declaration authoring components; writes target
  the definition draft that stations the type through the same
  declaration records the canvas authors (compile/validate through
  `compileTreeDeclarations` diagnostics); save persists the draft.
  Landed 2026-11-06 (declaration editor session, see Agent Notes).
- [x] Lifecycle machine view: one dedicated popup diagramming the type's
  states and legal edges from the draft data (the shared mermaid
  pipeline or an equivalent diagram surface).
  Landed 2026-11-06 (declaration editor session, see Agent Notes).
- [x] Canvas reconciliation: the designer reloads draft state on open;
  an open canvas reconciles out-of-band draft saves (minimum: reload on
  focus/reopen; live signature re-run where the seam makes it cheap).
  Landed 2026-11-06 (declaration editor session, see Agent Notes).
- [ ] Validation: declaration-plane focused specs; e2e for the
  authoring round-trip (edit field in place, open canvas, see the same
  declaration); docs — components/type-designer + process-designer
  READMEs, components/generated README.
  Unit side landed 2026-11-06 (see Agent Notes); the e2e round-trip
  awaits the next stack run (no Playwright this session).
- [ ] WAITING — owner verification: a stationed type's typeList pane
  header, the routed typeList page, and the type's record surfaces (the
  pane detail header row, the routed detail branch) carry the declaration
  affordance (pack types render nothing); the editor's fields rows rename, edit
  descriptors through the shared DescriptorEditor, move the identifier
  holder, and refuse orphaning removals with the compile diagnostic; the
  lifecycle edits states and transitions and the machine view renders
  the mermaid diagram; save persists the draft and Apply stays on the
  canvas; an open designer picks an in-place save up on focus/poll.
  Superseded by the on-surface rework (see Agent Notes 2026-11-07): the
  pane/route header affordances and the editor page are gone; the
  verification surface is now the record page's property block and the
  state popover.

Session reads: SPEC §1 (in-place law), §7 (CTS state law);
components/process-designer/README.md; components/type-designer;
server/features/process-definitions/README.md (definition draft
lifecycle); packages/processes/README.md (declaration compiler).

### Agent Notes (2026-11-06, declaration authoring in place)

Session `agent/declare-inplace-20261106` (worktree
`.agent-worktrees/declare-inplace-20261106`).

- Landed: the author affordance (`components/generated/TypeDeclareEntry.vue`)
  renders on the typeList workspace pane header (`GeneratedScreenPane`,
  host chrome) and the routed screens page's action space, gated by
  `organizations:admin` (the process-designer system screen's `required`
  seam) and by `useDeclarationStation` — the active definition whose
  draft graph declares the type (`/active` first, then the additive
  active set; drafts station nothing). Icon-only, `uiMapping.declareType`
  (en+ru).
- Landed: the `typeDeclaration` workspace page
  (`components/type-designer/TypeDeclarationEditor.vue`,
  `/types/declaration?type=&definition=` as the route twin) receives the
  type through the params channel, loads the stationing definition via
  the designer's read API, projects with `definitionToCanvas`, and saves
  the `canvasToDefinition` snapshot through `PATCH /api/process-definitions/:id`
  — draft only. Fields rows (rename, shared `DescriptorEditor`,
  identifier holder via `applyFieldDisplayRole`, required/nullable marks,
  gated removal), lifecycle states (value/severity/icon) and transitions
  (intent label, entry-wire target), the shared live interpretation
  (`interpretDeclarationEdges`) after each structural edit, and the
  compile-diagnostics surface on every change. The machine view derives
  `machineModelOf` → mermaid through the shared markdown pipeline.
  Pure layer: `utils/processDesignerDeclarationEditor.js` (spec-pinned
  round-trip: an in-place field add serializes to the exact document the
  canvas gesture saves).
- Reconciliation: the designer re-fetches its document on window focus
  and a 30s poll, comparing the draft data signature against the settled
  load baseline (the read API carries no version stamp); a dirty canvas
  reconciles nothing — last-writer-wins, like the canvas itself.
- Design decisions forced by the canvas draft shape (owner review):
  a state's vocabulary membership is operation-carried (SPEC §7), so
  add-state wires the new state into the first construct without an
  initial state, else mints the targeting transition — a "move to X"
  action appears at the next Apply; transition `from` is wiring-derived
  (dataflow stays canvas), so the transitions list renders an authored
  `from` where present and edits intent + target only; the pane tab
  close carries no veto seam, so unsaved-change guards cover the routed
  leave (standard confirm host) and the browser unload, and closing a
  dirty editor pane tab drops its edits.
- Findings: the removal gate is the compile diagnostics chain
  (`compileTreeDeclarations` + `normalizeType`) — the identifier-holder
  law surfaces at Apply through the registry compile (canvas parity; the
  class inspector shows the same chain), and no client diagnostic today
  covers a construct referencing a removed field (Apply validation owns
  it, as on the canvas); `composables/useProcessDesignerCanvasModel.spec.js`
  "keeps every node and record through declaration authoring…" fails at
  base (reproduced with this branch's changes stashed — a state→class
  declare connect expectation, presumably broken by the state-scope
  retirement on an earlier base).
- Validation: `utils/processDesignerDeclarationEditor.spec.js` 16/16;
  components 79/79 (generated 85 incl. the new spec run);
  shared/localization 4/4; shared/process-designer-ui +
  process-designer-localization green; SSR smoke 24/24 (a new
  `declaration-page.ssr-smoke.js` mounts the routed twin and caught a
  real first-paint bug — the pre-load render fell into the
  not-stationed branch); `node scripts/check-arch.js` green;
  `npm run docs:validate` clean beside the known 13-entry homing
  backlog (unchanged). No Playwright per session law; the e2e
  authoring round-trip awaits the next stack run.

### Agent Notes (2026-11-06, review fixes)

Session `agent/d-review-fix-20261106` (worktree
`.agent-worktrees/d-review-fix-20261106`). Review pass fixes:

- Transition sources are wiring-derived: `transitionSourcesOf`
  (utils/processDesignerDeclarationEditor.js) derives a transition's
  source states from the entity wires into it — the upstream operation's
  authored target — appending an authored `state.from` as legacy data,
  the draft-side twin of the compiled `declaredTransitionSources`
  (packages/processes README → Workflow synthesis; the compiled function
  reads compiler-internal graph windows, so consuming it over canvas
  arrays would mean synthesizing its inputs). The transition rows'
  from column and the machine view (one edge per source state) consume
  it; `setTransitionTarget` now keeps the authored `state.from` on
  retarget. Spec 20/20.
- The affordance mounts on the type's record surfaces too (TODO item D1's
  parenthetical): the pane's instanceDetail header row beside the
  typeList mount, and the routed screens page's detail branch header row
  — gated identically (capability + station over the detail screen's
  typeId).
- Docs: the pane-tab close trap (unsaved edits drop; routed leave and
  browser unload guard) and the v1 boundary (glyph and payload-traits
  authoring stay on the canvas inspector) stated in
  components/type-designer/README.md.
- The state-severity options are single-homed in
  components/type-designer/state-severities.js (editor + canvas
  inspector consumed duplicate derivations). The round-trip fixture
  carries the palette's drop-time ctsTypes record (`kind: 'field'` lives
  on that record — process.vue enrichNodeData mints it; node data
  carries no kind).

#### Agent Notes (2026-11-07, on-surface rework)

Session `agent/declare-onsurface-20261107` (worktree
`.agent-worktrees/declare-onsurface-20261107`), owner direction
2026-11-07: "all things related to 'edit declaration' should be
customized in-place… States should be edited in state block… fields in
page where fields belong, and all has to be definition-aware."

Investigation: the record page (RegionBlock depth-0, `record`
presentation) composes SurfaceHeader (the state surface: StateTag →
popover with legal transitions + StateHistory; a stateless record
renders nothing there) and SurfaceBody → SurfaceDetailBody (the §22.17
property block: filled scalar facts as label+value rows through
InlineField). The declaration machinery — the pure gesture layer
(`utils/processDesignerDeclarationEditor.js`), `useDeclarationStation`,
`definitionToCanvas`/`canvasToDefinition`,
`useProcessDesignerPersistence` draft PATCH, `useProcessDesignerTypes`
live registry view — was already the whole engine; the 2026-11-06
editor page was a second chrome around it.

Died: `TypeDeclarationEditor.vue`, the `typeDeclaration`
workspace-pages registry row, `pages/types/declaration.vue`,
`TypeDeclareEntry.vue` (the pane-header/route-action ribbon affordance
and its mounts in GeneratedScreenPane + pages/screens), the
`declaration-page` SSR smoke, the `uiMapping.declareType` and
`typeDeclaration.title` locale keys.

Landed:

- The one authoring session: `useDeclarationAuthoring.js`
  (components/type-designer) loads the stationing draft, mutates only
  through the pure layer, recomputes `compileTreeDeclarations` +
  `normalizeType` diagnostics on every change, saves the
  `canvasToDefinition` snapshot as a draft PATCH, and guards dirty
  route-leave (confirm host) + browser unload. `DeclarationAuthoring.vue`
  provides it; RegionBlock mounts the provider around the depth-0
  record (keyed by type id), gated on `organizations:admin` + station.
- Fields author in the property block: for holders the block projects
  the draft (every declared scalar field in authored order, empty ones
  included, identifier holder excluded — the title owns it); each row's
  popover (`DeclarationFieldMenu` → `DeclarationFieldPanel`) composes
  the shared DescriptorEditor (ref accepts pick from the live registry
  view), name edit, identifier move, move up/down
  (`moveDeclarationField`, the new pure reorder gesture — array order
  is declaration order), and diagnostics-gated removal; add-field at
  the block end (`DeclarationAddField` mints through
  `newFieldDeclaration` with the authored name+descriptor); the save
  control rides the block-end cluster; rendered structural sections
  carry the same popover at their label. Non-holders byte-identical.
- States author in the state surface: the state popover gains the
  authoring lane (`DeclarationStatePanel`) behind a quiet edit toggle —
  states (value/label/severity/icon through the shared
  state-severities vocabulary), add-state under the SPEC §7 carrier law
  with the consequence stated beside the input, transitions with
  from-chips and to-select over the live vocabulary plus intent, gated
  removal, the machine-view dialog (mermaid through the shared
  pipeline), and save. A stateless record of a stationed type carries
  the quiet add-states affordance at the tag position instead.
- `newTransitionDeclaration`-minted transitions now pick their target
  from the vocabulary (select) instead of defaulting to states[0].
- Pure rows survive as the panel's presentation
  (`DeclarationStateRow` gained the label input);
  `DeclarationFieldRow.vue` died with the page (its anatomy lives on in
  `DeclarationFieldPanel`).

Open: empty structural draft fields (long-text/json/record added in the
draft, unseen until Apply) render only after Apply — the canvas keeps
the full projection; the peek presentation keeps the compiled fact
grammar (the record page is the authoring surface); the pane-tab close
still carries no veto seam (route-leave + unload guard only, canvas
parity); e2e round-trip awaits the next stack run.

Validation: `utils/processDesignerDeclarationEditor.spec.js` 22/22 (+
reorder, + named-field gesture), `components/type-designer` 10/10
(panels/rows/save pins), `components/ui-mapping` green incl. the new
`declaration-authoring.spec.js` (draft-driven property block, add-states
affordance, non-holder parity), `components/generated`, `shared/
design-system` 34/34, `shared/localization` clean; SSR smoke 24/24
(declaration-page smoke replaced by the surface spec);
`node scripts/check-arch.js` green; `npm run docs:validate` clean.

#### Agent Notes (2026-11-06, deslop round)

Session `agent/typedeslag-20261106` (worktree
`.agent-worktrees/typedeslag-20261106`), owner verdict "absolutely awful
now". Audit findings, all fixed in this round unless marked deferred:

- Field rows rendered as always-on InputText boxes with a required or
  nullable Tag on every row (one of the two always present), a duplicate
  identifier pair (Tag plus toggle), no fact-row anatomy, and no quiet
  affordances.
- The transition from-column rendered wiring-derived source states as a
  12px muted text run — a data value below the ladder's small tier — with
  unlabeled columns and no chip vocabulary.
- The severity select rendered the raw PrimeVue enum names
  (info/success/warn/danger/secondary) in both the editor and the shared
  inspector options; the ref field summary rendered raw opaque type ids
  (`Ref(t-…)`), both against SPEC §4 (ids never render).
- The machine-view dialog had unbounded content; wide flowcharts stretched
  it past the viewport with no scroll containment.
- Section titles sat at the 15px label tier, the page column stretched to
  max-w-app (1600px), state icon authoring showed a floating icon preview
  beside a bare input, and the DescriptorEditor carried bare unstyled
  labels, a nullable checkbox with no label association, and four
  contract-shaped comments restating README law.
- The whole surface lived in one file (state + gestures + presentation),
  leaving the loaded presentation unpinnable by the SSR-mount spec style.

Rebuilt: fields as fact rows (small muted name label click-editing in
place through PrimeVue Inplace with confirm/discard, ink kind summary
with ref accepts resolved through the type-label chain, Identifier mark
on the holder, quiet-until-hover affordance cluster pinned on touch per
the RegionBlock header-cluster convention, descriptor editor in a
bordered inset under its row); lifecycle rows render the
severity-and-icon chip records wear with in-place rename, localized
severity labels (`stateSeverityOptions`, one home shared with the canvas
inspector), and the icon input previewing its glyph in the leading slot;
transitions as a machine table (per-source severity chips, the any chip
for unscoped transitions, labeled From/To/Intent columns, inline intent);
machine view in a StandardDialog lg with a 60dvh bounded scroll region;
page rhythm at the 60rem measure with 24px section separation and 16px
content stacks, ActionToolbar section headers in natural case; title from
the draft class node's authored name. Rows extracted into
pure-presentation `DeclarationFieldRow`/`DeclarationStateRow`/
`DeclarationTransitionRow` (the inspector law — every mutation an event
up), mounted by the new
`components/type-designer/type-declaration-editor.spec.js` pinning the
anatomy; `fieldDescriptorSummary` gained an optional type-label resolver
(presentation-facing only).

Deferred: the canvas FieldNode card still renders ref accepts raw — the
fix threads type labels into the canvas enrichment pass
(pages/organization/process.vue, the canvas projection); the pane tab
label stays the static "Declaration" (workspace-page labels are owned by
components/generated, the concurrent md-record session's surface);
first-diagnostic focus stayed out (cheap versions were noise). The pure
layer's draft-mutation semantics are untouched — round-trip spec 21/21.

Validation: `components/type-designer` 8/8,
`utils/processDesignerDeclarationEditor.spec.js` 21/21,
`components/shared` 16/16, `shared/localization`, `shared/design-system`
34/34, `shared/process-designer-localization` + `process-designer-ui`
15/15, SSR smoke 24/24; `check-arch` green; `docs:validate` clean beside
the known 13-entry homing backlog (unchanged, none of it in touched
files).

### Agent Notes (2026-11-06, preview pending loader)

Session `agent/svg-preview-loader-20261106` (worktree
`.agent-worktrees/svg-preview-loader-20261106`). The cassette preview
surface spins while the host's payload fetch is outstanding: a record
whose payload reference carries the OCCS mime shows the loader until the
parsed document lands, closing the quiet-box window between mount and
the payload render; DXF-payload records keep the instant baked-field
path. Validation: surface graph check, facade surface specs, and E2E
`cassette-preview` green.

### Agent Notes (2026-11-06, app-standard preview spinner)

Session `agent/svg-preview-spinner-20261106` (worktree
`.agent-worktrees/svg-preview-spinner-20261106`). `ProgressSpinner` joins
the surface component pack, and the cassette preview's pending state
renders the app's standard ring beside the quiet box — the same loader
`StateBlock` and `DrawingCanvas` show.

Finding (2026-11-06, first-save title race): the designer's first save
intermittently lands the record under the platform default title
("Unnamed") — observed in a preview-spec run; `saveTemplate`'s
create/rename path is the suspect. The preview spec opens its record by
route as a result.

## README tree map (owner direction 2026-11-06)

SPEC §22.5. Context assembly for agent sessions rides one derived
command over the README tree.

- [x] `scripts/docs-map.js` + `npm run docs:map`: whole-tree outline
  (H1, H2s, outbound links) and `--near <path>` (outline, outbound,
  inbound). check-docs.js exports its walker and link parsing, so the
  map and the docs guard scan one tree definition. Landed 2026-11-06
  (`agent/docs-map-20261106`).
- [x] check-docs.js submodule scope: `.gitmodules` paths leave the scan
  under the vendored-upstream principle, and links into submodules
  resolve by pin — the docs guard passes in fresh worktrees with the
  submodule unpopulated. Landed 2026-11-06 (`agent/docs-map-20261106`).

## Create-context and cross-cut placement (owner direction 2026-11-06)

SPEC §4 (captioned create controls; contextless launches prompt lineage)
and §22.8 (the lineage trail beside the identity on every unscoped class
list). Owner words: instances rendered outside their parent were
unrecognizable in composed views; creating inside a parent prompted the
lineage the context already supplied while creating outside collected
none and the records became unreachable; the "+" create button carried
no type name.

- [ ] WAITING — owner verification: every collection projection (table,
  card-grid tile/side/plain, board, timeline, gantt, stats) renders the
  lineage breadcrumb trail on cross-cut lists (calendar day cells stay
  summaries); `ParentRef` retired, the trail is the one ancestry surface;
  creates render captioned type names on every surface; a contextless
  create (palette, unscoped class list) prompts its lineage rows, a
  scoped create and every nested part-create auto-fill and hide them.

  ### Agent Notes (2026-11-08, empty relation link)

  An empty relation section drops to the stub strip; the stub line now
  renders the relation's injected link action beside its create
  affordances, the same toolbar placement the filled section carries.

  ### Agent Notes (2026-11-06)

  Session `agent/create-context-20261106` (worktree
  `.agent-worktrees/create-context-20261106`). Shared contract:
  `planActionLaunch(action, { scopedInstance })` counts lineage axes as
  dialog rows exactly on contextless launches (graph-wired lineage's
  wire source is the launch context — the runtime's `resolveLineageContext`
  already resolves the run-context entity into unwired lineage sockets,
  and explicit dialog data overrides wires, so prompting never fights the
  graph); `resolveCreateDialogInputs` keeps lineage rows through the
  `prompt: false` suppression, resolves accepted parents over the
  bundle's children edges with the input's declared type as fallback, and
  carries the compiled `required` flag. Components: `NestedCreateDialog`
  gains the `scopedInstance` channel (nested part-creates inside a
  parent's surface stop prompting the parent), `GeneratedMappingScreen`
  threads it and passes the screen scope into the launch decision; the
  create button loses icon-only (resolver table) and the region-header
  "New" collapse retires with the `uiMapping.new` key; `BreadcrumbTrail`
  replaces `ParentRef` in every projection via the `parented` cross-cut
  flag, and the parent-type pool overlay dies with it (the trail resolves
  ancestors through the readable-reference seam; the children-type
  overlay stays for the children columns). SSR smoke re-pinned to the
  caption law. Validation: ui-mapping spec 113, design-system +
  framework-packages guards, localization spec, SSR suite 24/24,
  check-arch, framework:validate — green; e2e not run (no live stack in
  this session).

### E. The record page is a document (SPEC §22.17)

Owner decisions 2026-11-06: free prose lives in declared long-text
fields; comments render as the trailing section; record pages only
(list screens keep the ladder).

- [x] Document flow: depth-0 record pages render one inline stack at the
  60rem measure — record header, property block, payload/editor, prose
  sections, collections inline; the side rail, peer columns, and tabs
  retire on record pages (§22.1–22.2 superseded there); list screens
  unchanged; peek/popup keep compact presentations.
  Landed 2026-11-06 (b1b44c496).
- [x] Property block: declared scalar facts as compact property rows
  under the title (inline pencils stay; fact groups/fact columns die on
  record bodies).
  Landed 2026-11-06 (b1b44c496).
- [x] Comments section: the instance thread (today's entity chat)
  renders as the record page's trailing section through the
  `utils/instance-chat.js` seam; the header's chat entry retires;
  comments naming lands in the locales.
  Landed 2026-11-06 (b1b44c496).
- [ ] Filed follow-up (separate program, not this one): record links in
  prose — authoring grammar in the markdown editor plus InstanceInlineRef
  chip rendering through the readable-reference seam.

Session reads: SPEC §22.17, §22.1–22.3, §4 (editor-as-record-surface,
comments direction); shared/ui-mapping/README.md (arrangement),
components/ui-mapping/README.md (GeneratedMappingScreen/RegionBlock/
SurfaceDetailBody), components/generated/README.md (instance-chat seam),
components/chat README as needed.

#### Agent Notes (2026-11-06)

Law written from owner words this session; owner confirmed declared
prose fields, trailing comments, and record-pages-only scope. The e2e
stack verification for the review-era re-pins is deferred to this
program's stack pass.

Session `agent/md-record-20261106` (worktree
`.agent-worktrees/md-record-20261106`). All three steps landed in
`b1b44c496`:

Session `agent/md-record-20261106` (worktree
`.agent-worktrees/md-record-20261106`). All three steps landed in
`b1b44c496`:

- Document flow lives in the pure contract: `composeScreen` takes
  `options.presentation` (`record` default) and resolves every step of a
  depth-0 detail region's child arrangement to the stack — the ladder
  code stays untouched for list screens, nested surfaces, and the whole
  tree under `peek`. The measure is the wide step by construction:
  `designTokens.layout.recordMeasure` (60rem) is pinned against
  `CONTAINER_WIDTH_STEPS.wideRem` in the design-system spec and consumed
  through `LAYOUT.measure` (`max-w-[var(--ck-record-measure)]`, chrome
  recipe) on RegionBlock's depth-0 record root — routed page, pane tab,
  and popup all center the document inside their own column. Tables
  inside the document compress through the existing container-seam
  channel (the compact column scale engages in narrow/medium hosts; a
  60rem box resolves the wide step, so the measure itself is the
  compression on wide pages) — judgment call, owner to verify visually
  on the stack pass. The record popup keeps its compact presentation
  (measured popup box, compact density) and now stacks its sections as
  the document law; the peek keeps the ladder compose and the fill-grid
  body byte-identically.
- Property block: `SurfaceDetailBody`'s `full`+`record` body leads with
  the scalar facts as compact property rows (the specList grammar —
  muted label cell, value, per-group show-more, no group titles on
  single-group bodies, identifier excluded as before), then the
  editor/preview band, then structural fields and relations stacked
  full width — the `factsGrid`/`bodyGrid` fill grammar survives only on
  the peek and nested cards.
- Comments mount shape: the honest fallback, stated — the full
  ChatSupport column is host-shaped (h-full chains, inbox rail, thread
  header chrome), so the trailing section is a bounded thread surface
  reusing the thread components directly. To avoid duplicating the
  stage, `ChatThreadStage.vue` (drop zone, message list, scroll-to-end,
  composer, attachment picker, create-and-attach + forward dialogs) was
  extracted from ChatSupport — both hosts now mount the same stage; the
  record band adds only the "Comments" title and the pinned key.
  `RecordComments` gates the thread on viewport visibility (the chat
  chunk and the conversation fetch stay off records opened above the
  fold); `instanceThreadKey` in `utils/instance-chat.js` homes the
  thread-kind law for pinned mounts (a `user` record rides the direct
  1:1 thread, same as the popup entry). One thread-core repair en
  route: a pinned thread (`conversationKey` prop) no longer consumes
  the ambient chat target at mount — a lingering popup target would
  have overridden the pin.
- List-screen parity evidence: the random-world spec now pins every
  `instanceDetail` record to `{ mode: 'stack' }` with `sideRail: null`
  at all three steps across all seeds while asserting the home screen's
  section ladder still reaches columns/tabs; the screen spec re-pinned
  the record tabs cases to stack and proves the same heavy child set
  tabs under `presentation: 'peek'`; the screen-section ladder pins
  (`regionsArrangement` tabs/mixed) are untouched. SSR smoke re-pins:
  the showcase carries `ck-record-measure` and no `ck-body-grid`/
  `ck-facts-grid`; the routed detail renders the measure and the
  Comments section with the header chat entry retired.
- Validation: shared/ui-mapping (130), design-system (34),
  localization (4), components/ui-mapping + components/generated +
  components/chat (78), random-world (8) — green; SSR smoke 25/25;
  check-arch green; docs:validate OK with the known 13-entry homing
  baseline unchanged. e2e not run (deferred to this program's stack
  pass per the task; no e2e asserts the retired surfaces — checked).
  ### Agent Notes (2026-11-06, repair session)

  Session `agent/create-context2-20261106` (worktree
  `.agent-worktrees/create-context2-20261106`). Owner review found two
  defects in the first cut. (1) The lineage predicate read the policy
  field `id`, but the block-composed compiled shape carries
  `field:`-prefixed ids with the wire path on `path` — the resurrection
  never fired there (and `field:`-prefixed field rows never mapped onto
  declared fields); row ids now normalize onto the wire path for both
  shapes. (2) `planActionLaunch` grew a context parameter; the context
  decision moved where it belongs — every lineage axis without an
  authored default counts as a dialog row on every launch, and the
  dialog's launch-context channel seeds/hides/auto-runs inside the
  parent (explicit dialog data overrides wires server-side, so the
  scoped path no longer leans on runtime entity binding through a wired
  socket). Authored socket defaults (pinned parents) stay supplied.
  Create captions translate: `generatedCreateLabel` (utils) composes
  `uiMapping.createCaption{,FromMode}` over the localized type label and
  mode name; ActionButton, CreateControl, the palette, and the menu
  label chain render it (authored labels win). Validation: ui-mapping
  spec 119, design-system + framework-packages + components/ui-mapping
  44, localization, SSR suite 24/24, check-arch, check-docs green;
  e2e still pending a live stack.

  ### Agent Notes (2026-11-06, queue-picker repair)

  Owner report: creating a queue entry inside its queue still prompted a
  queue picker. Root cause: the served input-policy field carries no
  per-input `typeId` (only the `entity` base), and when the bundle's
  children edges do not name the pair (graph-wired containment, lineage
  key drift), the lineage input degraded to a context-free entity picker
  row — `row.lineage` undefined, so the launch context could neither
  seed nor hide it. `declaredParentTypeId` (shared/ui-mapping) now
  resolves the fallback parent type from the served exposure inputs
  (per-axis by id/path; the `parent` input / `parentTypeId` only as a
  single-axis fallback) — the row stays a context-seedable lineage
  picker everywhere. Validation: ui-mapping spec 117 green; e2e still
  pending a live stack.

  ### Agent Notes (2026-11-06, live-stack reproduction)

  Reproduced on the dev stack (Org1 data, diagnostic session, browser
  automation): the create dialog's template iterated `rows`, so the
  context-hidden lineage row rendered anyway — every resolver-layer fix
  was correct and invisible. `ActionFormDialog` now renders
  `visibleRows` (6f02e2413). Verified live: creating a queue entry
  inside Cutting queue prompts Design + Count only and the created
  record carries `lineage.queueId` plus the derived `projectId`; the
  unscoped queue-entry list renders the interactive trail (Demo project
  › Cutting queue) under each row identity; the same list's create
  prompts a Queue picker over real queues. Button captions render
  ("New Queue entry"). The two earlier repair sessions fixed real
  defects in the same path (field: id shapes, accepts fallback) that
  this render-line fix finally exercises.

  ### Agent Notes (2026-11-07, chain repair)

  Session `agent/bcfix-20261107` (worktree `.agent-worktrees/
  bcfix-20261107`). Owner report: chains in some places showed the
  direct parent alone, and crumb icons/chevrons rendered oversized.
  Diagnosis: (1) `TraceChain` kept a compact/expandable teaser —
  `InstanceCard` mounts it for any type whose surface contract leaves
  trace visible — that rendered the nearest ancestor plus an expander;
  SPEC §22.8's full-trail law owns the contract, so the teaser branch,
  the `variant`/`expandable` props, and the matching shared-README
  sentence are deleted; chains longer than three crumbs keep the
  middle-ellipsis reveal. (2) PrimeVue's base layer pins `.pi` at
  `1rem`, so the 12px-supporting chain carried 16px glyphs (18px on the
  mobile root); crumb icons and chevrons now size at `text-[0.75rem]`
  (the StateTag/StateHistory pattern). Create-context verification on
  the live stack (fresh org, three-level chain authored through the
  declaration + process APIs): the scoped create inside the folder
  detail prompts the name row alone and stores the full chain
  (`folderId` + derived `shelfId`); the contextless creates (unscoped
  list button and the global palette) prompt the labeled lineage
  picker; record header, workspace tab, and cross-cut list identities
  render the whole chain — the create-context seams hold at HEAD with a
  consistent declaration set. Pre-existing staleness left as-is:
  `e2e/process-generated-screen.spec.js` asserts the retired
  `.p-breadcrumb` selector and bare "New" buttons.

  ### Agent Notes (2026-11-07, lineage picker tree)

  Session `agent/lintree-20261107` (worktree `.agent-worktrees/
  lintree-20261107`). Owner report: the lineage row's dropdown rendered
  a children-down tree — every child type's records were selectable,
  and selecting one wrote a ref typed as the accepted parent type. The
  hierarchical branch now walks the accepted instances' containment
  ancestry (the same walk the record chain renders): ancestor levels
  load on demand, render as muted navigation rows with their type
  label, and refuse selection (`selectable: false` on the node);
  accepted-type nodes are the only selectable ones, each key carrying
  its own type. Verified live on the stack: the note create's parent
  picker shows Shelf › Folder only (no notes, no sibling child types),
  the shelf click selects nothing, the folder select writes
  `folderId` plus the derived `shelfId`; artifact
  `.playwright/bcfix-lintree-ancestry-picker.png`.

  ### Agent Notes (2026-11-06, trail single-homing)

  Owner review: the trail was hand-wired per projection and the action
  inbox — a mixed-type pile of instance tiles — carried none. The trail
  moved into the one identifier surface (`InstanceIdentity`) behind a
  collection-context provide (`instanceCollectionCrossCut`,
  `RegionCollections`); the six per-projection copies died, the media
  tile keeps its grounded chip at its host, the calendar re-provides
  false (summary chips), and the inbox rows carry the trail beneath the
  tile with crumbs opening ancestors through the workspace seam.

  ### Agent Notes (2026-11-07, one ancestry chain)

  Owner review: the trail rendered beneath the component (expected at
  its top, inside), the sheet editor carried a second implementation,
  and the identifier-surface trail never reached plugin surfaces. One
  ancestry chain now serves every host: the shared `TraceChain`
  (record headers, entity cards, chat, the plugin component pack —
  including the sheet editor's family section) with `BreadcrumbTrail`
  deleted; the identifier surface renders it above the identity on
  cross-cut collections, and the inbox rows render it at the row top
  (self-routing crumbs). The sheet editor's editor-top strip was
  attempted and reverted: its spec pins exactly one chain (the family
  section head) and none for lineage-less records — moving the chain to
  the editor top is an owner decision on that surface's spec, recorded
  here.

  ### Agent Notes (2026-11-07, lawful TraceChain)

  Owner review: the unification crowned the legacy component. TraceChain
  now implements the current laws — titles through the one title
  resolver (`titleFor`) with the entity type label as the unresolved
  fallback (record ids and hardcoded English fallbacks die with
  `FALLBACK_LABELS`), crumbs open the shared record popup
  (`useEntityPopup`, the one interactive-reference law) replacing
  self-routing to detail routes, and the legacy `lineage` prop,
  `entityContext` injection, `useLineage`, and `TraceLink` are deleted.
  Consumers unchanged (same props surface); ui-lab drops the TraceLink
  primitive.

  ### Agent Notes (2026-11-07, sheet editor proper breadcrumbs)

  The sheet editor's working set hand-rolled its lineage presentation:
  a parent-map serialization grouped sheets and TraceChain heads stood in
  for breadcrumbs, while the opened record itself carried no chain. The
  proper chain now renders at the canvas column's top for the opened
  record, every working-set sheet tile carries its own chain above it
  (the opened record's tile excepted — the top states it), and the
  grouping machinery (`lineageKeyOf`/`sheetGroups`/`renderGroupChain`)
  is deleted. The family list channel stays (filters over the record's
  lineage keys). Spec re-pinned: the chain stub renders only for
  records carrying ancestry.

  ### Agent Notes (2026-11-07, chain homes per mount)

  The editor-surface top chain duplicated the record header's chain on
  the detail mount. One chain per mount: the record header owns it on
  detail mounts, `GeneratedWorkspacePage` renders it at a record-bound
  page's top on the page mount (blank editor pages carry none), and the
  editor surface stays pure content — its working-set tiles keep their
  own per-record chains.

  #### Agent Notes (2026-11-07, comments re-key repair)

  Owner report: the record page's comments section kept one record's
  thread across record opens. Root cause: every record host (routed
  page on a param-only navigation, pane tab on in-place content
  replacement, record popup on an in-place request swap) reuses the
  mounted chain and feeds `RecordComments` new props reactively, but
  `useChatThread`'s pin opens one conversation per mount by design (the
  call-workspace pin law) — a changed `conversationKey` prop never
  re-opens, so the band kept the first record's thread. Fix at the
  owning seam: `RecordComments` keys the `RecordCommentsThread` mount
  by the record identity (`typeId:instanceId`), remounting the thread
  with every record swap; no watcher surgery in the shared thread core.
  Pinned by `components/chat/record-comments.spec.js`: the thread binds
  the conversation of the record it mounts for (instance and
  user-direct branches) and the band keys the mount by both record
  coordinates.

  ### Agent Notes (2026-11-07, chain inside the component)

  Owner review: hosts wrapped the chain AROUND tiles (inbox rows, the
  sheet working set) — outside the component. The tile itself carries
  the chain at its own top now (`InstanceInlineRef` `trace` prop; the
  select's closed control stays clean), every chain placement renders
  the full visible path (the collapsed compact teaser is gone), and the
  hosts' wrapper markup is deleted.

## User space programs (owner direction 2026-11-07)

Law: SPEC §26 (user space), §22.15 amendment (the view control pinned
and labeled). Owner words this session: more Notion — custom collection
views added anywhere, non-process-definition custom pages in separate
top-level collections, instance pages customizable (text blocks, custom
views; declared fields move, never delete), Notion AI block, all md
rendering with one slash vocabulary (format toolbar dies). The inbox
retires. Custom views reuse the existing view machinery — saved lenses
over existing collections, nothing new to project.

### F. Phase 0 — discoverability repair, inbox retirement, review residue

- [x] View control pinned and labeled on every host (SPEC §22.15
  amendment); hover-quieting of the header cluster dies.
  Landed 2026-11-07 (e282445a0).
- [x] Inbox retirement: the pane tab, /inbox route + mobile tab, sidebar
  entries (both shapes), the /active/inbox endpoint + its spec and README
  rows, nav.inbox keys — zero reachability; the create palette stays.
  Landed 2026-11-07 (e282445a0).
- [x] Review residue: SurfaceDetailBody's duplicated property-row
  markup collapses to one loop; ChatThreadStage's sub-ladder badge font
  joins the ladder; EntityPopup README gains the document+comments
  pointer; the deslop spec's negative-space phrasing dies; canvas
  FieldNode renders ref accepts through the type-label resolver (the
  enrichment pass threads it — the live SPEC §4 violation).
  Landed 2026-11-07 (e282445a0).
- [ ] WAITING — owner verification: a generated collection header shows
  the labeled View control at full presence (no hover-quieting) with the
  condition-count badge and the popover contents unchanged; the sidebar
  (both shapes) and the mobile bar carry no inbox entry; record bodies
  render unchanged; the designer canvas's ref field cards show accepted
  type labels.

#### Agent Notes (2026-11-07, phase F)

Session `agent/userspace-f-20261107` (worktree
`.agent-worktrees/userspace-f-20261107`). All three steps landed in
`e282445a0`:

- View control: RegionBlock's header cluster renders at full presence —
  the `[@media(hover:hover)]:opacity-60` quieting, its group-hover and
  focus-within reveals, and the popover-open pinning class are deleted.
  The control renders as an outlined secondary button carrying the
  localized `uiMapping.view` label ("View"/"Вид" — the en+ru keys
  already existed) beside the sliders icon; the condition-count badge
  and the popover contents (search, FilterBuilder, projection switch,
  sort) are unchanged. New `region-header.spec.js` pins the label and
  the absence of the quiet classes; no spec had pinned the quiet
  behavior, so nothing needed re-pinning.
- Inbox retirement: `ActionInboxPage.vue`, `action-inbox-rows.js`(+spec),
  the `inbox` workspace-pages row, both sidebar entries, the mobile
  bottom-bar tab, `pages/inbox.vue`, the `/active/inbox` route,
  `action-inbox.js`(+spec), the `nav.inbox` locale keys (en+ru), and the
  README rows (process-definitions Action inbox section + route row,
  server/api, pages /inbox row, layouts, generated) all die in one cut.
  SPEC §4's action-inbox paragraph and §22.12's action-inbox-rows
  mention are removed — the owner's §26 retirement paragraph supersedes
  them (judgment call: SPEC is owner prose, but §26 contradicted §4
  after the cut). Grep sweep: zero action-inbox references remain; the
  word "inbox" survives only in chat contexts (ChatInboxRail,
  support.inbox events) and generic empty-state icons.
- Review residue: SurfaceDetailBody's two property-row/show-more blocks
  (~25 duplicated lines) collapse into the shared `PropertyRows.vue`
  (rows + per-group show-more; the authoring projection and the row
  group class ride nullable props). Byte-equivalence verified
  empirically: old-vs-new SSR renders of the document holder, document
  non-holder, fill card, and fill full/peek branches are identical after
  stripping Vue's hydration anchor comments (`<!--[-->`/`<!--]-->`/
  `<!---->` — zero DOM footprint); the harness was temporary and is
  deleted. ChatThreadStage's waiting-messages badge joins the ladder at
  `text-label` (SPEC §4's 15px small tier covers tags and badges) and
  the pill grows h-4→h-5 for the role's line-height (judgment call). The
  generated README's EntityPopup paragraph states the record-document
  mount (measure + trailing comments). The deslop spec's "never the raw
  enum" phrasing loses the negative-space form. FieldNode's tag resolves
  accepted type ids through `fieldDescriptorSummary(descriptor,
  typeLabelFor)`: the designer enrichment pass (process.vue
  `enrichNodeData`) seeds `data.fieldTypeLabelFor` per ctsField node
  from `classNameMap` (tree class names first, registry view labels
  second — now exposed from `useProcessDesignerTypes`), listed in
  `DERIVED_NODE_DATA_KEYS` so it strips at save; pinned in
  type-declaration-editor.spec.
- Validation: components/generated + ui-mapping + type-designer + chat +
  localization + design-system green in the touched suites; the new
  region-header + FieldNode pins green; SSR smoke (`npx nuxi prepare` +
  `vitest.ssr.config.js`) 24/24; `check-arch` green; `docs:validate` OK
  (13-entry homing backlog unchanged). Pre-existing on the base commit
  and unrelated (reproduced with this branch's changes stashed): 5
  failures in `server/features/process-definitions/{process-definitions,
  runtime-producer-output,runtime}.spec.js` — auth-hydration and
  producer-migration assertions over fixtures, service tests untouched
  by this diff.
- Open: none beyond owner verification.

### G. Slash and md unification (SPEC §26)

- [x] Format toolbar dies; the slash panel carries the full vocabulary:
  headings 1-6, toggle, callout, divider, fenced code, page link, view
  embed, AI block — one grammar in the text editor and every block
  authoring surface.
  Landed 2026-11-07 (4ce465c02).
- [ ] WAITING — owner verification: the text editor's toolbar carries
  only the name field, save, and the dirty-remote refresh; typing `/`
  offers the full vocabulary (17 entries with glyphs, keyboard
  navigation, toggle semantics — the heading entry on a heading returns
  body text); the to-do entry authors `- [ ]` checkboxes; the callout
  seeds a blockquote with a bold title; the link entry opens the
  address popover at the surface; page-link/view-embed/AI-block entries
  are absent until phases H/J/K.

#### Agent Notes (2026-11-07, phase G)

Session `agent/userspace-g-20261107` (worktree
`.agent-worktrees/userspace-g-20261107`). Landed in `4ce465c02`:

- G1: the toolbar's format cluster (B/I/inline-code, H1–H6, code
  block, paragraph, bullet, ordered, quote, link button) dies; the
  toolbar keeps the name field + apply, save, and the dirty-remote
  refresh affordance (document-level reconciliation, SPEC §4's
  editor-save divergence law). The link address popover survives,
  opened by the slash link entry and anchored to the editing surface;
  the editor selection survives the pick, so the link applies at the
  caret.
- G2: the vocabulary (`surfaces/lib/block-vocabulary.mjs`) carries 17
  entries: paragraph, H1–H6, bullet, ordered, to-do, quote, callout,
  code block, diagram (mermaid fence), divider, table, link. To-do
  sets the gfm `checked` attr on the focused list item (engine schema
  supports task lists; crepe renders the checkbox; the pipeline
  renders `- [ ]` GFM). Callout seeds a blockquote with a bold
  localized title — the blockquote-with-title the pipeline already
  renders, no new AST. Entries toggle exactly as the toolbar did
  (identity-pinned in `text-editor.spec.js`: slash h2 dispatches
  `wrapInHeadingCommand` payload 2; active h2 dispatches
  `turnIntoTextCommand`; quote-lift rides the raw prose `lift`).
  Interpretation flagged: the TODO's "toggle" is read as the to-do
  checklist block — the engine and pipeline carry no collapsible
  toggle block today; a Notion-style toggle needs a pipeline block
  kind first. Inline marks (bold/italic/inline-code) are input-rule
  authored — the brief's vocabulary list carries no mark entries
  beyond link.
- G3: `block-vocabulary.mjs` is the share module for phases H/J —
  pure `BLOCK_VOCABULARY` table (id, labelKey, glyph, match) +
  `blockIsActive`/`resolveBlockAction` (pure decision over the
  source-markers selectionState) + `applyBlock` (the adapter the
  editor binds: engine handle, view, locale, link hand-off). The
  custom-page/instance-block surfaces mount the same table, panel, and
  actions over their own engine instance.
- G4: SPEC §4's toolbar-toggle paragraph, authoring-surface sentence,
  and input-rules/slash/toolbar sentence amend (retirement + panel
  vocabulary + toggle semantics on entries); workers/documents README
  carries the canonical vocabulary table, the toolbar contents, and
  the phase-boundary note (page link, view embed, AI block join with
  H/J/K).
- Validation: documents suites green (csv 2, fill 19, text-editor 8 —
  new); localization, icon-fonts, markdown, plugin-surfaces,
  plugin-sdk sdk green; `perigram-plugin surfaces` clean on both
  surfaces; `plugin-deps:check`, `check-arch` green; SSR smoke 24/24
  (`nuxi prepare` + vitest.ssr).
- Open: none beyond owner verification.

### H. Custom pages (SPEC §26)

- [x] Framework pages collection + API; md block documents; user-created
  sidebar sections with nested pages; create/rename/move/delete through
  the palette and explorer gestures.
  Landed 2026-11-07 (7248aff81).
- [ ] WAITING — owner verification: the sidebar (expanded) shows user
  sections after the type panels with nested page rows, loose pages as
  root rows, and the quiet New section affordance at the foot; the
  wrapped rail carries one icon per section that expands the sidebar and
  that section; right-click (long-press) on a section or page carries
  new-page-inside / rename / move / delete (delete confirms through the
  host dialog; move picks a parent over the org's sections and pages
  with the sidebar-root choice); deleting a parent leaves its children
  at the root; the create palette's New page entry (en+ru) creates a
  page and opens its tab; the page tab wears the file glyph + live name
  (renames reach the tab), the name edits in place, typing `/` offers
  the 17-entry vocabulary, save is dirty-gated and pane-close confirms
  unsaved edits; an explicit section collapse survives reload.

#### Agent Notes (2026-11-07, phase H)

Session `agent/userspace-h-20261107` (worktree
`.agent-worktrees/userspace-h-20261107`). Landed in `7248aff81`
(docs in the follow-up `neo:` commit):

- H1 (server): the pages feature is a capability module
  (`server/features/pages/` — repository/service/index, README carrying
  the canonical contract: wire shapes, routes, access law, detach
  semantics). One `pages` collection stores both kinds; the list is the
  tree projection (`_id, name, parentId, kind`, content excluded,
  createdAt ascending); one PATCH covers rename/move/content; moves walk
  the ancestor chain and refuse cycles (400); delete detaches children
  to roots; access is active-org membership alone (`auth.organizationId`,
  the chats precedent — no grant machinery in v1, law stated in the
  README); foreign-org rows answer 404. Lookup indexes on
  `organizationId` and `organizationId+parentId`.
- H2 (sidebar): sections render as PanelMenu panels after the type
  panels; loose pages (no section) render as root rows like the
  communication entries — no virtual container was invented for them.
  Context gestures ride one capture-phase seam (right-click; long-press
  after 500ms with touch-move cancel) resolved through the existing
  positional `menuKeyForElement`, so no per-row handlers. Move is a
  StandardDialog + TreeSelect over the org's sections/pages plus the
  sidebar root, with the moved page's subtree excluded client-side (the
  server remains the cycle authority). Deleting a page closes its open
  tabs. Explicit section collapses persist with the workspace layout
  (`collapsedSectionKeys`, a v3-compatible addition beside
  `sidebarCollapsed`); sections auto-expand on first sight otherwise.
- H3 (surface): `customPage` is a registered workspace page
  (ephemeral, per-document tab keyed `page:customPage:<docId>` over the
  item's `docId` — the pinned-chat rule; one tab per page, session
  scoped, labels live from the pages store). The surface renders read
  through `shared/markdown.js` and mounts crepe after mount following
  `text-editor.mjs` verbatim (all engine chrome off, Placeholder
  included — a new page starts blank, no invented prose); the block
  vocabulary, slash panel, source-markers plugin, cm theme, crepe theme
  css, and editor voice css are consumed from the documents plugin's
  `surfaces/lib` + `assets` by relative import over the app's own
  dependency graph (`@milkdown/crepe` is a declared root dependency),
  never copied; engine pieces load through dynamic imports so SSR and
  the browser bundle stay clean. Save patches content through the pages
  API, dirty-gated on the workspace page-dirty registry; name edits
  commit through the rename channel. Page-link/view-embed/AI-block
  entries stay dark until phases I/K. The palette carries the pinned
  New page group above the type groups under the same needle, and the
  control now renders whenever the active org exists (pages available)
  even with no compiled creates; the entry emits `create-page` and the
  workspace owns the create + tab.
- Judgment calls, stated: a section is a page-kind row (`kind:
  'section'`, root-only, content-free) chosen over a separate sections
  collection — one collection, one tree law, one gesture set; the
  wrapped rail carries one icon per section (the rail law "one icon per
  top-level panel"), each expanding the sidebar and its section; page
  tabs are ephemeral (pinned-chat precedent) rather than persisted
  page refs — persisting them would need a state-version bump for no
  owner-asked value.
- Validation: `server/features/pages/pages.spec.js` (failure modes
  first: org gating, cross-org 404, cycle refusal, section-root law,
  unknown/foreign parent, detach-on-delete, tree shape, unnamed create)
  9/9; components/generated suites 55→68 green (new sidebar-pages pins
  + palette pinning + collapsedSectionKeys round-trip); localization
  green; SSR smoke `npx nuxi prepare` + `vitest.ssr.config.js` 25/25
  (new custom-page smoke: registry adapter binds the document, the read
  presentation mounts the pipeline recipe, no raw id renders as a
  label); `check-arch` green; `docs:validate` OK (13-entry homing
  backlog unchanged). Engine-share resolution proven by importing the
  lib modules + milkdown packages from the app's node_modules context.
  No build/dev-server/Playwright runs (brief). Pre-existing on the base
  commit and unrelated: the 5 process-definitions spec failures phase G
  reported (auth-hydration/producer-migration fixtures).
- Open: mobile carries no pane tabs, so a page created from the mobile
  palette opens into the hidden desktop pane tree (toast confirms the
  create) — a mobile page surface is future owner scope; realtime
  cross-session page sync (the instance-events channel) is unused by
  pages in v1.

### I. Custom view blocks (SPEC §26)

- [x] Save-the-view affordance on collection headers; the saved view
  (type + view state, named) renders as a block on pages and record
  pages through the ordinary list contract; read paths and grants
  unchanged. Landed 2026-11-06 (2940b06c3).
- [x] View-embed repair (owner report "Views don't work", 2026-11-08):
  the embed's region was seeded before the lens GET landed, freezing
  every view model at its empty default. The embed now mounts the
  region only once the lens arrives (the pending lens renders the
  region's loading surface), and a 404 on the lens drops the stale
  cache row so the fence renders its carried name and the unavailable
  state. Pinned by components/generated/view-embed.spec.js and
  stores/views.spec.js. Also: the dead `viewsByType` getter removed.

#### Agent Notes (2026-11-07, phase I)

Session `agent/userspace-i-20261107` (worktree
`.agent-worktrees/userspace-i-20261107`).

- I1 (server): the views feature is a capability module
  (`server/features/views/` — repository/service/index/README, the
  pages conventions): one org-scoped `views` collection
  `{ organizationId, name, typeId, viewState }`; the list projection
  excludes viewState (pickers read `{ _id, name, typeId }`, optional
  `typeId` query); one PATCH covers rename/state-replace; access is
  active-org membership alone; foreign rows answer 404; name/typeId
  required (400). viewState is stored and served verbatim — the
  persisted per-type state over every popover model
  (`{ search, filters, sort, projection }`, filters as the canonical
  tree, sort a sortKeys entry + order, projection inside the
  switchable pair); readers re-validate (normalizeFilter, bounds), the
  same revival law `utils/ui-view-state.js` applies. Lookup indexes in
  `server/db/indexes.js`.
- I2 (save affordance): RegionBlock's view popover gains the save
  entry (icon button in the popover body) gated on
  `viewsStore.canSave` (active org) and on the region rendering its
  own state (a provided viewState prop — a lens — offers no save).
  `ViewSaveDialog.vue` (StandardDialog) prompts for the name under the
  type label; RegionBlock captures the region's CURRENT models and
  creates through the views store. A `viewState` prop seeds every view
  model (search/filter/projection/sort) and turns persistence off; a
  `label` prop overrides the section title.
- I3 (the view block): the embed rides a ```view fence carrying
  `{"id","name"}` (the mermaid fence precedent — the name rides the
  fence so a deleted view still renders its name). Judgment calls,
  stated: (a) the fence grammar is JSON in the fence body — parseable,
  space-safe, read by `parseViewRef`/`splitViewEmbeds` in
  `shared/markdown.js` (marked's lexer; a non-parseable fence stays a
  plain code block); the pipeline renders view fences as a quiet
  `ck-view-embed` chip for every reader outside the page surface, and
  the crepe preview shows the same chip inside the editor — the LIVE
  region belongs to surfaces that compose Vue (the page read
  presentation), a manual Vue mount inside CodeMirror was rejected.
  (b) The composition seam: `ViewEmbed.vue` composes the minimal
  single-list-region screen through `composeScreen` (the
  detail-screen-actions floor precedent — unscoped list source, no
  actions: creation/quick actions belong to the collection's own
  screens, the embed is the lens) and renders the one RegionBlock
  directly with the saved viewState + name — RegionBlock mounts fine
  given a composed node, so no GeneratedScreenHost threading was
  needed; the pool loads through the instances store list transport
  (grants and org scoping ride it — the lens law), the source state
  derives from the pool (loading only while a fetch is in flight), row
  opens route through `openInstanceInWorkspace`. (c) The controls
  boundary: the embed's view controls render and stay live (typing
  filters at once) but persist nothing — neither localStorage nor the
  view doc; re-saving a lens from its own embed is refused outright.
  The vocabulary's view entry hands off to the host picker
  (`openViewPicker` → the picked view inserts its fence at the caret
  through `insertViewFence`); the plugin's text editor filters the
  entry out until its surfaces mount live embeds (phase J).
- Validation: `server/features/views/views.spec.js` 7/7 (failure modes
  first: org gating, cross-org 404, required name/typeId, viewState
  round-trip fidelity, rename/replace, delete, typeId filter);
  `shared/markdown.spec.js` 7/7 (fence grammar pins);
  `components/ui-mapping` 13/13 incl. region-header 4 (lens seeding
  pins: badge from saved filters, label override, saved search applied
  to rows; save-dialog pin through a StandardDialog stub — PrimeVue
  Dialog renders nothing SSR); `workers/documents` 29/29 (vocabulary
  identity + view action pins); `components/generated` +
  `shared/ui-mapping` 189/189; localization green; SSR smoke 26/26
  (new case: a page carrying a view fence renders the region with the
  saved search applied over the seeded pool, no raw ids);
  `check-arch` green; `docs:validate` OK (13-entry homing backlog
  unchanged). No build/dev-server/Playwright runs (brief).
- Open: the popover's save entry and the picker's authoring flow are
  E2E-scope (SSR cannot render the closed popover or dialog); phase J
  mounts the same ViewEmbed on record pages.

### J. Instance-page overlays (SPEC §26)

- [x] Rights-gated custom blocks around declared content on record
  pages; declared blocks reorder-only; overlay storage keyed by
  instance.
  Landed 2026-11-07.
- [ ] WAITING — owner verification: a write-granted member's record page
  (routed or pane) hover-reveals each section's controls (insert above,
  move up/down; edit/delete on custom blocks alone) plus the foot insert
  affordance; the picker offers Text / View with the saved-views picker
  behind View; a text block authors inline with the full slash
  vocabulary; the header cluster's save is dirty-gated and pane-close
  confirms unsaved overlay edits; every reader sees the authored order
  with custom blocks composed; the popup and the peek render no overlay;
  a record nobody customized renders today's document.

#### Agent Notes (2026-11-07, phase J)

Session `agent/userspace-j-20261107` (worktree
`.agent-worktrees/userspace-j-20261107`).

- J1 (server): the overlays feature is a capability module
  (`server/features/instance-overlays/` — repository/service/index/README,
  the pages/views conventions): one org-scoped `instance_overlays`
  collection, unique on `(organizationId, typeId, instanceId)`, storing
  `{ blocks, order, updatedBy, updatedAt }`. One PATCH creates or
  replaces the whole document; read answers the overlay or `null`;
  delete 404s when none exists. Reads take active-org membership (the
  pages/views precedent); writes take **the record's own write grant**
  — `writeGrantTarget` (declaration `access.inherits`, else the class
  collection) resolved against the loaded instance through
  `hasInstanceAccess` at write level, fail-closed, the same seam the
  instance patch transport and the client's `editorWriteGranted` take.
  A foreign or missing record 404s before grant evaluation. Block
  payloads validate (v1 kinds `text` → markdown source, `view` →
  `{ id, name }` — the page fence's shape); malformed blocks/orders
  refuse 400. Spec 8/8, failure modes first (org gating, foreign 404,
  grant refusal, one-per-instance replacement, fidelity, validation,
  delete).
- J2/J3 (client): the depth-0 record document became a composed section
  flow. `SurfaceDetailBody` renders its own sections (the property
  block, the dominant band with the declared structural open sections
  riding beneath it, each relation section) in the order
  `composeDocumentSections` resolves, and delegates foreign sections
  (child collections, custom blocks) to the host slot RegionBlock
  fills — children through single-region `RegionChildren` stacks, text
  blocks through `OverlayTextBlock` (read `MarkdownBlocks`/authored
  `CrepeEditor`), view blocks through `ViewEmbed` verbatim. With no
  overlay the flow is the derivation order — the fixed document
  (byte-parity pinned: the record-document smoke and the ui-mapping
  document specs render unchanged). Authoring: the session
  (`composables/useRecordOverlay.js`) exists for write-grant holders
  (the file-surfaces seam decides); shells (`DocumentSectionShell`)
  hover-reveal move/insert (+edit/delete on blocks); the insert picker
  (`OverlayInsertControl`) carries the Text/View pair — the slash
  vocabulary's entry set keyed to document sections, since an overlay
  is a structured block document, a markdown surface only inside its
  text blocks; the save affordance rides the header cluster
  (`SurfaceHeader`'s new `cluster` slot), dirty-gated on the workspace
  page-dirty registry (the screen pane now provides its tab key), and
  saves the whole overlay (a trivial draft — no blocks, natural order —
  deletes it). The overlay store (`stores/instance-overlays.js`) caches
  per instance; readers get the saved composition applied.
- Judgment calls, stated: (a) the section-key grammar — `properties`,
  `editor` (the payload/editor band plus the declared structural open
  sections that ride beneath it — they move as one flow position in
  v1), `relation:<key>` (an inline chip section or its relation-scoped
  child collection, whichever renders it — one key per relation), and
  `children:<lineageKey | typeId>` for lineage-scoped child sections;
  the header, the inert stubs, and the trailing comments section sit
  outside the order. (b) The insert affordance renders as a hover
  control on each section's leading corner plus the document's foot —
  a between-sections hover line was the alternative, rejected as
  untestable at this layer. (c) The popup, the peek, and nested cards
  render no overlay (the popup is excluded by its `popup`
  container-traits hostKind; the peek and nested cards never reach the
  document branch). (d) An emptied child section drops to the stub
  strip and its order entry goes dormant until the collection refills —
  declared content keeps rendering under every drift, per the law.
  (e) Authoring affordances render for holders with no save-state
  toggle (Notion rhythm: hover-revealed, focus-within reachable).
- Unslop: the custom page's engine mount, read composition, and view
  picker were extracted (`CrepeEditor.vue`, `MarkdownBlocks.vue`,
  `ViewPickerDialog.vue`) and consumed by both surfaces — the overlay
  mounts the one engine, the one md composition, the one ViewEmbed, the
  one picker; the relation chip section markup became
  `RelationChipSection.vue`, the one section both body grammars render.
- Validation: `server/features/instance-overlays` 8/8;
  `shared/ui-mapping` 138/138 incl. the new order-law pins (child key
  grammar, no-overlay identity, interleave, unknown-drop/missing-append,
  omitted-block append); `components/ui-mapping` 17/17 incl. new
  `record-overlay.spec.js` 4 (parity, interleave order, append law,
  view block through the host slot); `components/generated` 55/55;
  `workers/documents` 29/29; `server/features/{pages,views}` green;
  localization green; SSR smoke 27/27 (`npx nuxi prepare` +
  `vitest.ssr.config.js`; new case: a seeded overlay with a text block
  composes the block's section ahead of the property rows; the md body
  itself hydrates client-side — DOMPurify is browser-bound, the
  pipeline's own law); `check-arch` green; `docs:validate` OK. No
  build/dev-server/Playwright runs (brief).
- Open: the popover- and editor-level affordances (the insert picker's
  menu, the inline crepe mount, the save flow) are interaction-scope —
  SSR cannot render closed popovers or client-only engine mounts; the
  phase K AI block joins the vocabulary table and the insert picker
  when it lands.

### K. AI block (SPEC §26)

- [ ] Ask/answer block through the org assistant under the delegated
  principal; answer rendered as md, persisted with the page; re-ask
  re-runs.

Session reads per phase: phase F — SPEC §22.15, §26 inbox paragraph,
components/ui-mapping README (view control), components/generated
README (inbox), the 2026-11-07 review findings in Program E notes.

## Unified page header (owner direction 2026-11-07)

Law: SPEC §4 (the full-page editor amendment, the text-editor toolbar
amendment), §22.3 (the unified header anatomy), §22.8 (the type label
opens the type's card), §22.17 (comments behind the header entry).
Owner words this session: a file opens as its full-page editor, not a
page; its comments go somewhere; one header for editors, instance
pages, and custom pages; the type name under the title is clickable and
opens a type popup.

### Steps

- [x] The unified header: `SurfaceHeader` is the one header —
  breadcrumbs, in-place editable title where the surface owns the name
  (the record document's identifier patch, the editor chrome channel,
  the custom page rename), the clickable type label, the state surface,
  and the action cluster (chrome save + divergence refresh, host slot
  saves, comments entry, actions/overflow). Custom pages pass
  `title`/`onRename` with no type or instance.
- [x] Full-page editors: an editor-bound depth-0 record on an open page
  surface renders the editor flush under the header (no property rows,
  trailing sections, stubs, or overlays); the workspace editor page tab
  mounts through `EditorPageSurface` (flush, own record header); the
  record popup keeps the compact document with the bounded editor band;
  the peek keeps its preview.
- [x] The chrome channel: the documents editors (text, csv) shed their
  toolbars and bind `{ name, dirty, saving, diverged, save, rename,
  reload }` through the `pageChrome` prop; the header renders the
  name/save/refresh and the host registers dirty on the page-dirty
  registry.
- [x] Comments to the header: the entry opens the thread as a bounded
  right-side panel (`RecordCommentsPanel`) mounted by the page hosts —
  the routed page (viewport-anchored, it scrolls with the window), the
  screen pane, and the workspace page host (absolute inside their
  bounded columns); the trailing `RecordComments` band retires; the
  popup and the peek keep the shared chat-surface entry — one comments
  entry point on every record surface.
- [x] The class dialog (`ClassDialog`): name, class, glyph, field rows,
  and CTS children for capability holders; the record header's type label
  and organization-class sidebar panels open it.
- [ ] WAITING — owner verification: an editor-bound file opens into its
  full-page editor with the header owning name/save (dirty-marked,
  pane-close still confirms); a regular record page keeps its document
  with the header's comments entry opening the side panel; the record
  popup keeps its compact document; the type label under any title
  opens the class dialog for capability holders; a custom page shows the
  same header with no type label.

#### Agent Notes (2026-11-08)

Session `agent/header-unify-20261107` (worktree
`.agent-worktrees/header-unify-20261107`).

- What died: `RecordComments.vue` (the trailing band), the documents
  editors' toolbar rows (text/csv — name input, apply check, save,
  remote-refresh), the csv read-mode name row, CustomPageSurface's
  name/save row, SurfaceDetailBody's page-host editor band branch (the
  popup keeps `editorBandBounded`), GeneratedWorkspacePage's lineage
  strip over editor pages.
- Header audit beyond the stated anatomy: the navigation channel
  (routed back, §22.3), the reload lane (§22.9), the overlay save
  cluster slot (§26), and the declaration authoring affordances (§1)
  all stay — each is a standing law's own channel. Nothing else
  rendered.
- Judgment calls: (1) the facade and tech-drawing editors keep their
  designer docks — their toolbars carry designer tooling far beyond
  name/save; only the documents editors' toolbars were exactly the
  document chrome, so only those died (validation scope pins
  workers/documents). Their headers render a read-only title until they
  bind the chrome channel. (2) The side panel anchors per host: the
  routed record page window-scrolls, so its panel is viewport-fixed
  below the navbar; pane and workspace-page hosts get an absolute panel
  inside their bounded columns — one panel component, two anchor modes.
  (3) The type popup's fields entry navigates to the declaration
  designer page (`organizationProcess`) — the property rows' author
  popovers carry no programmatic open seam; the states entry opens the
  header's own state popover lane programmatically (the HoverPeek
  `popover.show({}, anchor)` precedent).
- Validation: components/ui-mapping, components/chat,
  components/generated, workers/documents, shared/ui-mapping spec
  suites green (text-editor/csv-editor specs re-pinned: the surface
  renders alone and binds the chrome channel); localization green
  (one new key, `typeDeclaration.editFields`, en+ru); check-arch,
  docs:validate, and the SSR smoke run in the session's validation
  pass (results in the handoff).

### L. blocks-round-2 — Notion-grade block authoring (owner direction 2026-11-07/08)

Owner verdicts, verbatim: "Page blocks management and whole page layout is
a weak parody on Notion"; "Text block is rendered separately in your
version, with it's artificial bounds; hover buttons are awful and placed
wrong... in collections, there is lots of slop in headers, starting from
'view' button which actually triggers a filter, bloated create buttons
text (in some cases take more than 1/2 of screen lol), no actual view
setup, no search." Rulings: quiet document sections (label+count pinned,
Create/Link disclosed); autosave user space (pages + overlays; process
documents keep explicit save). Prior review (2026-11-08) evidence stands:
no drag anywhere; three gestures to type in a record-page block;
pencil-first block editing; insert as a two-entry menu; no focus/scroll
on insert; no gutter lane (controls overlap content); collection headers
inside documents carry full chrome; custom pages open as a blank void.

- [x] R1 Seamless text blocks: click mounts the editor inline at the
  caret, Escape / Cmd+Enter close, the apply button died, crepe's page
  chrome stripped (ck-inline-editor). Landed 2026-11-08.
- [x] R2 Gutter lane: the section shells reserve one lane step; drag
  handle + plus + overflow live in it, hover/focus reveal; the corner
  cluster died. Landed 2026-11-08.
- [x] R3 Drag reordering: handle drag with a top-edge drop target and
  `moveToIndex` over the order array; keyboard arrows on the handle.
  Landed 2026-11-08.
- [x] R4 Insert rhythm: plus inserts a focused text block directly;
  columns opens the view picker; the foot strip inserts on click;
  focus + scrollIntoView on mount. Landed 2026-11-08.
- [x] R5 Custom pages as documents: crepe placeholder on for user-space
  mounts (localized slash hint). Title focus on create still open.
  Landed 2026-11-08 (partial).
- [x] R7 Autosave user space: overlays debounce-save at 1.5s idle
  (pages' autosave still open — CustomPageSurface keeps explicit save).
  Landed 2026-11-08 (partial).
- [x] R8 The orphaned `.ck-editor-band` rule removed (bounded stays).
  Landed 2026-11-08.
- [x] R6 Document collection header: label + count pinned; the search
  field renders in the header; the document host's create/link controls
  sit behind one compact (+) popover (standalone list screens keep the
  inline cluster); the View popover carries field selection — the
  explicit column set persists per type (`perigram:fields:` in
  utils/ui-view-state.js, absent = the derived budget) and filters the
  table columns. Landed 2026-11-08.
- [ ] R5 residual (title focus on create) and R7 residual (pages
  autosave).
- [ ] WAITING — owner verification, live stack, after R6 lands.

Session reads: SPEC §26/§22.17/§22.15/§4; TODO Phase J's Agent Notes
(the current shapes); the 2026-11-08 blocks review findings; the
degradation/editor laws in Program B notes.


### Agent Notes (2026-11-17, Page typed references)

- Page documents accept typed reference blocks with stable type/instance identity and an optional exact retained revision. The picker inserts live references or selects a retained content revision.
- Resolution checks the source's ordinary read grant, loads the selected revision, and verifies its source identity. Missing and inaccessible targets share one unavailable response.
- Page surfaces render live/pinned reference embeds. Backlinks are derived from the owning organization's page documents and remain rebuildable.
- Saved-query collection embeds carry a pinned viewState definition revision, explicit empty parameters, and live authorized collection results. Graph-output collection embeds pin an execution/output pair and revalidate the saved graph revision when read; referenced instances resolve through their current read grants. Parameter binding and frozen result data snapshots remain.


### Agent Notes (2026-11-17, provider endpoint and palette audit)

- Plugin settings no longer render one URL input per service. They expose one provider-level executor origin; each legacy endpoint-mode operation is addressed at `<executorOrigin>/<serviceId>`, and the provider credential remains one setting. New installs persist `executorOrigin`; saving settings collapses compatible legacy per-operation URL maps and removes the old map. Divergent legacy maps are surfaced for explicit correction.
- This removes the 64-field build123d settings regression without pretending its runtime migration is complete. Current catalog inventory at this audit: build123d 51 endpoint-mode services / 7 semantic groups; Documents 7 endpoint-mode + 5 managed services / 2 groups; Facade 2 endpoint-mode + 5 managed / 3 groups; Technical drawing 1 endpoint-mode service (provider fallback group). There are 61 endpoint-mode declarations across the four first-party plugin listings; runtime conversion remains open (build123d E5, remaining Documents/Technical drawing work, and Facade residual adapters).
- Palette review covered both process-designer palettes and the procedural graph palette. The graph palette already declared a separate `source: 'graphs'` group, but both the dock and context palette folded it into the platform tier. A shared tier projection now renders reusable graphs separately from platform and installed-plugin contributions. Ungrouped plugin services now receive a stable provider-owned group rather than being mislabeled as framework services.
- Palette coverage now has explicit tests for all 51 graph-composable build123d operations across seven groups, Technical drawing's provider fallback group, existing Documents and Facade group coverage, the process designer's executable palette trace, and graph/plugin/framework tier separation. The legacy process designer groups remain: types, operations, control, instances, values, and list/tree; plugin sections derive from declared provider groups.
- This is a settings and palette correction, not completion of the runtime migration or of the entire SPEC §28 graph roadmap. Verify the latest CI run before treating these changes as green.
