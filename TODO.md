# TODO

## Repair the July 15–August 9 architecture violations

Goal: remove the parallel registries, concrete-domain leaks, runtime compatibility
bridges, unrequested automation, and source-assertion testing practices introduced
or expanded between 2026-07-15 and 2026-08-09. The finished system must have one
authoritative contract for each concern. Do not preserve the superseded contracts
through adapters, fallbacks, dual reads, or aliases; migrate persisted data in the
same phase that replaces a contract.

### 0. Freeze the evidence and strengthen enforcement

- [x] Add executable architecture guards for the violations found by the audit:
  concrete CNC imports in generic process/generated UI modules, duplicate object
  keys, cross-feature repository imports, concrete entity-name branches in
  `@cutkit/processes`, runtime legacy-process bridges, and multiple structural
  registries for hierarchy or creation.
- [x] Make every architecture finding blocking. Delete the “non-blocking migration
  inventory” success path; `check-arch` must not print Golden Path success while
  reporting violations.
- [x] Add a repository test that fails when component/page behavior is asserted only
  by searching source text. Source-contract tests remain allowed only for genuine
  static boundaries such as forbidden imports or manifest structure.
- [ ] Record persisted acceptance fixtures for the current organization, process
  graph, project hierarchy, and representative entity DTOs without copying private
  production data into the repository.
- [x] Acceptance: the new guards fail against the audited pre-repair tree and pass
  only after the relevant later phases are complete.

### 1. Make process Lineage the only authored hierarchy contract

- [x] Define hierarchy as typed Lineage dataflow: a connected entity value determines
  the ancestor type and canonical lineage key; the downstream entity receives that
  composed Lineage block. Graph structure, not an entity selector or global table,
  owns authored parentage.
- [x] Extend the normalized/compiled process contract with explicit lineage bindings
  derived from those graph edges. The compiled binding must contain child entity
  type, ancestor entity type, lineage key, source node/socket, and consuming
  node/socket.
- [ ] Use compiled lineage bindings for action placement, child regions, detail
  context, explorer hierarchy, list scoping, Home eligibility, trace omission, and
  runtime creation payloads.
- [ ] Remove process and generated-screen dependence on `cncContainment`, including
  `parentSupportedByDomain`, `parentRelationForChild`, `withRootEntityScope`, and
  browser-side containment imports. Do not replace it by guessing every `*Id` key.
- [ ] Decide whether any static containment metadata is still needed outside process
  authoring. If a domain invariant truly exists, keep it as validation of a compiled
  graph binding only; it must not create, override, or place process hierarchy.
- [ ] Migrate active process definitions so their compiled lineage bindings are
  regenerated from their saved graph, then remove old `rootLineageKeys` and static
  parent metadata from persisted screen contracts.
- [ ] Acceptance: `Project -> Compose Lineage(projectId) -> Artifact` makes Artifact
  project-scoped, removes Artifact from Home, exposes it in Project context, and
  persists/reloads without any manual type or key selection. The same behavior must
  work for arbitrary entity types without adding a registry row.

### 2. Remove the parallel hierarchy and summary implementations

- [x] Delete or reduce `utils/entity-hierarchy.js`, `utils/generated-screen-source.js`,
  and related browser inference to consumers of compiled lineage bindings.
- [x] Remove hierarchy facts duplicated by `cncSummaries`. Define aggregates as
  explicit derived fields/queries whose scope references compiled lineage, not a
  second parent type/key table.
- [ ] Remove UI fallbacks that infer hierarchy from camelCase/snake_case aliases,
  arbitrary `*Id` fields, loaded neighboring sources, or route shape.
- [ ] Remove component-local child placement and parent filtering. Generated screens,
  project explorer, project panes, and standalone entity pages must consume the same
  compiled hierarchy projection.
- [ ] Acceptance: Home contains only entities without a readable non-organization
  ancestor; an entity becomes nested or top-level solely by changing the process
  Lineage graph and reapplying the process.

### 3. Establish one canonical entity identity and frontend projection

- [ ] Make the domain entity registry the sole owner of canonical entity type,
  collection, feature, routes, UI surface key, and aliases required at external
  boundaries.
- [ ] Generate frontend endpoint/surface projections from that registry. Remove
  `cncFrontendEntities`, `TYPE_ALIASES`, `ENTITY_TYPE_ALIASES`, `SOURCE_TYPE_MAP`,
  `OBJECT_LIST_KEY_TYPES`, and page-local type maps.
- [ ] Use canonical snake_case entity types in persisted/process/runtime contracts.
  Keep camelCase only as generated Vue-facing surface identifiers where required;
  never persist both.
- [ ] Migrate stored references and process definitions to canonical entity types,
  then delete runtime alias normalization.
- [ ] Acceptance: adding a domain entity requires one registry entry plus its owning
  feature implementation, not edits to multiple maps across packages and UI code.

### 4. Replace the three creation contracts with one typed constructor boundary

- [ ] Define one domain constructor contract per entity/mode. It owns typed inputs,
  prompt policy, produced entity type, accepted blocks, service/command binding, and
  whether the result is derived.
- [ ] Delete `cncEntityCreateInputs` and the duplicate `artifact` property. Delete
  node-catalog snapshots and UI-specific constructor rewrites that duplicate the
  domain contract.
- [ ] Keep canonical block composition separate from constructors: generic Create
  consumes composed blocks; a typed constructor consumes only its declared service
  inputs plus explicitly declared block inputs.
- [ ] Remove implicit `name`, `parent`, `fields`, `attachments.primary`, and other
  guessed Create inputs. Required fallback editing lives on the typed input socket;
  optional configuration lives in the inspector.
- [ ] Migrate every saved create node to the selected current constructor mode and
  delete stale construction/input-policy fields instead of interpreting both shapes.
- [ ] Acceptance: Artifact upload, generic entities, cassette templates, cassette
  designs, and facade creation all derive their sockets and generated forms from the
  same constructor contract with no entity-specific designer branch.

### 5. Restore the generic process package boundary

- [ ] Remove explicit Artifact, Cassette, Cassette Design, Queue, Project, Library,
  attachment-kind, and CNC construction-mode branches from `@cutkit/processes`.
- [ ] Move domain decisions into pure domain contracts and registered runtime
  handlers. The compiler may validate and compose supplied contracts but must not
  recognize concrete CNC names.
- [ ] Split `packages/processes/src/index.js` by responsibility: normalization,
  validation, action compilation, screen compilation, access compilation, hierarchy
  projection, and public exports. Preserve one-way dependencies between these
  modules.
- [ ] Split `server/features/process-definitions/service.js` into the feature service,
  compiler adapter, execution runtime, relation option resolver, and run repository
  boundaries. Cross-feature operations must call registered services, never concrete
  repositories or entity-specific helpers.
- [ ] Acceptance: process package tests run against a synthetic domain containing no
  CNC entity names, while CNC integration tests prove the supplied domain contracts.

### 6. Remove queue producer and relation-action parallel systems

- [x] Represent selection, creation, conversion, and linking as ordinary typed graph
  operations. A producer is not a second action language and a relation is not a
  hidden constructor.
- [x] Delete `utils/queue-producers.js`, `utils/queue-design-producers.js`, and
  queue/project-specific action synthesis once their behavior is expressed by graph
  nodes and compiled actions.
- [x] Compile Link/Unlink only from a composed Relations block connected to a Modify
  Entity effect. Cardinality comes from data shape at the persistence boundary, not
  a global relation registry or page-specific mutation mode.
- [x] Keep artifact upload/conversion as declared constructors or commands. Do not
  special-case Artifact relation rows inside the generic compiler.
- [x] Acceptance: adding another design-producing process requires only graph
  authoring; Queue and Project UI expose it without new helper code.

### 7. Remove unrequested and unreliable Automation runtime

- [x] Remove hidden `control.domainEventTrigger`, `control.entityChangedTrigger`,
  wait/scheduler nodes, automatic handler registration, and the three-second Nitro
  orchestration poller unless a separately reviewed process-events specification is
  accepted.
- [x] Remove `orchestration_runs`/step persistence and APIs that exist only for the
  removed hidden operations. Migrate or explicitly delete existing run records after
  confirming they carry no required business history.
- [x] Keep the requested node-bottom manual/socket trigger switch. Event output policy
  can be designed later as explicit graph data/control nodes.
- [x] If durable automation is later approved, design it around one durable queue,
  leases/idempotency, multi-instance delivery, recovery, authorization, and observable
  failure states—not process-local Sets and per-instance polling.
- [x] Acceptance: the palette, persisted node catalog, validator, compiler, runtime,
  APIs, and documentation expose the same supported operation set; no hidden nodes
  remain executable.

### 8. Eliminate runtime compatibility bridges

- [x] Inventory every use of `legacyActionId`, `legacyProcessType`,
  `legacyTypeToTemplateId`, stale-parent normalization, old handle reconstruction,
  old action/status normalization, and entity aliases.
- [x] Write one idempotent migration for each persisted contract still present in the
  database. Migrations must fail closed and report unresolved records.
- [x] Run migrations for drafts and active definitions, recompile active manifests,
  and verify round-trip equality under the current protocol.
- [x] Delete the runtime dual-read/normalization paths and the superseded migration
  code after data verification. Current code must accept exactly one process protocol.
- [x] Acceptance: fixtures using an old protocol fail with a clear migration-required
  error; current persisted records need no stale/legacy fallback to load or execute.

### 9. Repair persistence and editing boundaries

- [x] Keep Save as unconditional draft persistence for any structurally serializable
  graph. Save must never compile, activate, or require semantic validation.
- [x] Remove synchronous full compilation from the deep `[draft, nodes, edges]`
  watcher. Replace it with explicit Apply validation and bounded, cancellable preview
  compilation only when a preview surface is open.
- [x] Separate authored graph state, runtime Vue Flow state, compiled preview, and
  server-persisted draft snapshots. Mutating one plane must not silently rewrite
  another.
- [ ] Split the process page into focused composables/components for persistence,
  graph editing, connection inference, palette, inspector, process selection, roles,
  screens, and dock/navigation.
- [ ] Add crash/reload tests proving incomplete graphs, selected nodes, viewport, and
  every authored edge survive Save and reload after validation errors.
- [ ] Acceptance: repeated edits do not increase heap without bound; Save completes
  while the graph is invalid; Apply alone reports semantic errors.

### 10. Repair generated UI and project workspace ownership

- [ ] Generated UI renders compiled contracts only. Remove direct domain hierarchy
  imports and component-specific reconstruction of actions, parents, sources, status,
  or routes.
- [ ] Define one action ownership rule: collection actions live in collection bodies,
  entity actions live in entity/detail bodies, tab headers carry identity/status only,
  and pane controls live in the pane menu.
- [x] Treat project explorer folders, tabs, pane bodies, and standalone generated
  screens as projections of the same entity/screen contracts. Remove hardcoded Queue,
  Artifact, Cassette, or designer placement branches.
- [ ] Decide and document workspace persistence ownership. If layouts must follow a
  user across devices, replace localStorage-only persistence with an organization/user
  preference service; otherwise state explicitly that it is device-local.
- [ ] Remove planning archives from component source directories and keep component
  architecture in README files.
- [ ] Acceptance: the same entity screen behaves consistently on Home, standalone,
  and inside a project pane without duplicate headers/actions or special-case code.

### 11. Replace source-string assertions with behavioral coverage

- [ ] Convert process designer, generated workspace, tabs, pane, Home, Artifact, and
  UI-rework source-reading specs to mounted component, compiler, API, or Playwright
  behavior tests.
- [ ] Add persisted-data acceptance cases for every regression repeatedly reported:
  draft Save, Lineage inference, node connections, role ownership, generated actions,
  Home top-level filtering, project tabs/panes, selectors, status display, and Artifact
  creation/viewing.
- [ ] Tests must assert user-visible state and persisted/compiled output, not source
  substrings, CSS class presence alone, or synthetic contracts unrelated to active
  data.
- [ ] Acceptance: removing or disconnecting the real behavior makes the corresponding
  test fail even if the expected text remains in source.

### 12. Enforce honest task and integration workflow

- [x] Reopen tasks whose own acceptance notes say “not fixed,” “not fixed at all,” or
  describe broken rendered behavior. A task is complete only after its stated
  persisted/browser acceptance cases pass.
- [x] Remove completion narratives that contradict current behavior; update relevant
  READMEs to describe only implemented contracts.
- [ ] Enforce worktree/session-branch commits and clean merges. Add a CI/history guard
  where practical so coding-agent implementation commits cannot land directly on the
  integration branch.
- [ ] Preserve separate implementation and `neo:` documentation commits. Do not use a
  documentation commit to claim unverified implementation completion.
- [ ] Acceptance: handoff reports contain commit hashes, exact validations, known
  failures, and remaining dirty files; task status matches those results.

### Required execution order and completion gate

- [ ] Execute phases 0–3 before changing Home or child placement again.
- [ ] Execute phases 4–6 before adding or repairing entity constructors, relation
  actions, or producer UI.
- [ ] Execute phases 7–9 before extending process runtime behavior.
- [ ] Execute phases 10–12 only on the canonical contracts established earlier; do
  not add temporary compatibility paths to keep old UI alive.
- [ ] For every phase: update the relevant README source of truth, add focused tests,
  run `node scripts/check-arch.js` and `npm run framework:validate`, migrate affected
  persisted data, validate against the real saved process/project fixture, commit in
  an isolated worktree, and merge cleanly into `local`.
- [ ] Final gate: no parallel hierarchy/creation/entity registries, no concrete CNC
  behavior in generic process code, no runtime legacy bridges, no hidden automation,
  no source-string behavior tests, no contradictory DONE tasks, and no known
  architecture findings reported as non-blocking success.

## Open tasks (migrated from TODO.org)

Tasks moved from `TODO.org` on 2026-08-10 when the operational task
registration moved to this markdown file. Status and acceptance criteria are
preserved verbatim from the org source. Update task status the same way here:
check the box when its own acceptance criteria pass, or set the task
`WAITING` when it is implemented and awaiting user validation.

### Facade designer v0.1

- [x] Implement facade designer as part of cnc-domain, with a designer (same as
  cassette designer or process designer; their architecture needs to be
  abstractionized, centralized and formalized according to project guidelines if
  still not; especially layout responsibility) with three.js for display, so
  mesh and cladding elements type and library define which patterns can be
  applied, including a facade entity holding a 3d artifact, a pattern entity
  holding a generation algorithm, and optional libraries in the relations block.
  Patterns should be applied to 3d meshes by loose parts and customized in the
  designer.

#### Agent Notes

- [2026-08-08 Sat 10:11 MSK] Completed facade designer v0.1. Added the shared
  DesignerWorkspace/ThreeViewport abstraction used by cassette and process
  designers; added project-scoped facade and organization-scoped facade_pattern
  entities, APIs, revisions, permissions, artifact validation for immutable
  GLB/self-contained GLTF sources, generated-detail integrations, mesh-part
  pattern assignment, and a Vue Flow pattern editor. Removed the process
  designer Automation palette section on request; runtime event/wait operations
  were later removed entirely from the supported process contract.
- [2026-08-08 Sat 10:39 MSK] Superseded by the 11:27 repair below: construction
  metadata must not declare a facade-specific parent.
- [2026-08-08 Sat 11:27 MSK] Repaired facade creation to use the existing
  generic containment contract. Facade construction has no parent declaration
  and Create Entity has no facade-specific parent socket; process authors
  compose the facade Lineage block with the declared projectId reference. The
  compiler then resolves project context and generated placement from that
  shared lineage connection. Updated Process Designer and facade documentation,
  with construction/compiler/catalog validation passing.
- [2026-08-08 Sat 11:58 MSK] Fixed v3 generic Create execution: block-connected
  creates now retain non-block construction inputs such as facade
  sourceModelId, merge them into the effect payload, and project composed
  Lineage ids to the owning service's top-level creation inputs. This lets the
  facade service receive projectId while preserving the shared Lineage
  containment contract.

### File viewers set for artifacts v0.1

- [x] Implement artifact editors and viewers for all the artifact types and
  improve artifact flow. Scope: same as all the designer modules (process
  designer, cassette designer, facade designer, etc) on the architectural level.
  Details: for all artifact types reasonably possible (DXF, PDF, SVG,
  txt/docx, xslx/csv, jpeg/png) develop centralized viewers and, where makes
  sense, editors, including multi-format ones (table editor for xslx/csv, img
  viewer for jpeg/png/svg, etc), using good lightweight opensource solutions.
  Centralize designer and viewer components (adjust cassette and process
  designers if still not). Add proper upload and revision tracking per artifact
  type; artifact page and element must use the matching viewer and editor when
  available for the file type and user access rights. In the process designer,
  choose the artifact type and its creation way (prefer OS-native ways like
  taking a photo or uploading where possible).

#### Agent Notes

- [2026-08-08 Sat 10:09 MSK] Completed artifact viewer/editor flow, upload and
  revision handling, and process-defined artifact creation modes. Shared
  designer surfaces now provide the common fullscreen host structure for
  operational designers. Follow-up stability fixes capped the development Node
  heap, prevented unchanged data-model writes from triggering HMR, and reduced
  entity-event polling from 750 ms to 15 seconds while visible (paused for
  hidden tabs).

#### User testing

- [ ] Open an artifact detail page and verify that its viewer matches the file
  type: DXF/SVG, PDF, image, text/document, or table data.
- [ ] Replace an artifact file, confirm the preview updates, then inspect the
  revision history and restore/open an earlier revision if available.
- [ ] In the process designer, create or edit an artifact action and verify the
  selected artifact kind exposes only its valid creation mode and editor
  behavior.
- [ ] Open cassette, process, facade, and facade-pattern designers from their
  standalone routes/actions; each should occupy the full available workspace
  and preserve its own data.
- [ ] On `http://0.0.0.0:3000/screens/auto_project_detail?entityId=unnamed-project-3V1ZXt&projectId=unnamed-project-3V1ZXt`,
  leave DevTools Network open for at least 20 seconds. `/api/entity-events`
  should appear once on initial load and then roughly every 15 seconds, never
  repeatedly at sub-second intervals. Switch to another tab for 20 seconds and
  confirm no additional entity-event requests occur; returning to the tab
  triggers one prompt refresh.

### Artifact conversion

- [x] Add a layer that converts artifacts from one type to another or into other
  entities (probably as a server service/command, or multiple ones), including
  entity creation mode compatibility and creation modes from artifact types.
  Visible in the process designer with action buttons.

#### Agent Notes

- [2026-08-09 Sun 13:16] Implemented the domain-declared `convertArtifact`
  command and the server artifact-conversions capability. The first supported
  conversions are `LAYOUT_DXF -> DXF_SOURCE`, preserving the copied file with
  artifact provenance and its own revision, and `DXF_SOURCE -> cassette_design`
  through the existing typed cassette import constructor.
- Process command inputs now support context-bound entities without a redundant
  picker, conversion choices are filtered by the selected artifact kind, and
  command output DTOs are applied immediately to matching generated-screen
  sources.
- Updated domain, server feature/runtime, artifact, and generated-component
  READMEs. Validation passed: `node scripts/check-arch.js`,
  `npm run framework:validate`, diff checks, and 6 focused Vitest assertions.

#### User testing

- [ ] In the process designer, connect an artifact entity to a Run Command
  node, choose `convertArtifact`, expose it as a manual action, and activate
  the process.
- [ ] Open a `LAYOUT_DXF` artifact detail generated by that process. Run
  Convert artifact and verify the only target is Create DXF source; after
  completion, confirm the new `DXF_SOURCE` appears without reloading and
  downloads/previews the same DXF.
- [ ] Open a `DXF_SOURCE` artifact detail. Run Convert artifact and verify the
  only target is Import cassette design. Supply a name and layer mapping that
  maps at least one closed contour to cut.outer; confirm the resulting cassette
  design opens in the cassette-design surface.
- [ ] Try invoking either conversion with an incompatible source kind through
  the command API and verify the server rejects it with HTTP 400 instead of
  creating a record.

### UI rework and some bugfix (7/14)

- Note taken on [2026-08-09 Sun 11:42]: before executing each task, explore
  project architectural patterns that it should be based on.
- [ ] Home page fix: generated home page should contain only top-level entities
  (those without user-accessible entities in lineage; if the user has no access
  to any ancestor excluding org, it counts as top-level). Note: not fixed at all.
- [ ] Default entity detail/page should fit its parent: layout must depend on
  parent size and proportions, with reasonable breakpoints and sizes so graphic
  elements look good and data/actions are correctly placed. Note: not fixed at all.
- [ ] Entity page or component should not show lineage already displayed in the
  current context (e.g. lineage `orgId/clusterId` on the clusterId page needs no
  lineage display); a simple check. Note: not fixed at all.
- [x] Fix layout of `/invitation/id` (broken, not centered, error message
  doesn't fit, and the button is text not a button). Note: modal header is awful.
- [x] `/invitation/id` must not fetch an organization the user cannot access,
  which causes an inline 404 in the invitation form.
- [x] In the app menubar there is no need for a chat icon; the floating chat
  icon on the bottom right should be bigger. Note: moved to menu, which was not
  asked for; accepted but noted with frustration.
- [x] Chat window should have an expand button with a separate route to chats
  (with generated actions etc, viewed as general organization entity cards).
  Note: chats layout is awful and the floating chat icon should not be in chats.
- [x] Chats need refactor: "support" appears instead of self-chat, and existing
  chats with every user are wrong; each must be launched explicitly.
- [x] In the app menubar menu, the organization list is broken (no names shown)
  and all org-level functions (team management, billing) should be removed from
  that section since they are on the org page; only choosing an organization
  belongs there. Note: organizations no longer visible in the menubar menu.
- [ ] Clicking an organization in the menubar does not switch organization.
- [ ] Menubar breadcrumbs in organization scope are artificial/wrong.
  Note: removed instead of fixing to represent the correct hierarchy.
- [x] User entity needs an avatar-set capability. Note: the avatar image needs
  to be cropped, not scaled non-uniformly.
- [ ] In the user's space, organizations have poor data representation and
  actions; develop it in project-architecture terms (generated actions, general
  organization entity cards). Note: made much worse; ellipsis dropdown for
  navigation and a flat organization/billing list are rejected.
- [ ] Billing page has non-UI leaks (packages set in external runtime
  configuration, tokens belonging to the active organization). Status is
  artificial (should only be derived from deployment configuration with current
  tariff). Add an explanation message in the tokens panel describing that tokens
  are used for compute work like the nesting service or AI interactions.
  Note: sentence construction strongly rejected.

#### Agent Notes

- [2026-08-10 Mon 11:40 MSK] Reopened the seven UI-rework items whose acceptance
  notes say "not fixed at all" or describe broken rendered behavior (home
  top-level filtering, entity detail parent-responsive layout, redundant lineage
  display, organization switching, breadcrumbs, user-space organization cards,
  and billing UI leaks). The task header now reads [7/14]; the reopened items
  must be verified against persisted data/browser behavior before being marked
  DONE again.
- [2026-08-09 Sun 21:24 MSK] Reopened the task against the persisted
  user-6a0590fd account, active process-6a78b739 manifest, project
  unnamed-project-3V1ZXt, non-square 1080x1920 avatar, and real direct-message
  history. This invalidated the earlier synthetic-account/browser claims: the
  full-page chat selected a thread without connecting its SSE body, and the
  rendered PrimeVue avatar computed to object-fit: fill despite source
  assertions for cover.
  Fixed the reproduced contracts. Home now evaluates canonical lineage keys
  that are absent from containment metadata and removes empty child sections;
  entity contexts propagate through project panes, generated card collections
  use bounded parent-responsive tracks, persisted embedded chats load their
  message stream, and all PrimeVue avatar media uses runtime cover cropping.
  Organization child routes now sit directly in the canonical organization
  entity header, while Profile uses controlled PrimeVue tabs and canonical
  membership cards instead of an artificial navigation list.
  The first persisted-data acceptance run still exposed Cassette Design on Home.
  Its records use lineage.templateId, while the domain omitted the matching
  containment edge. Added cassette -> cassette_design to the CNC domain contract
  and made Home omit structurally nested source bands when loaded records carry
  that parent. This repair is validated against the active manifest instead of
  requiring process reactivation.
  The next rendered pass proved the Profile tab chrome still did not change
  content. Replaced component-local tab state with route-backed
  ?tab=preferences/organizations navigation; membership cards are now
  addressable and survive reload instead of depending on inert visual tabs. The
  acceptance retry showed PrimeVue tab events were still inert on this page, so
  the final control is a semantic route-link tab strip.
- [2026-08-09 Sun 21:00 MSK] Audited the reviewed UI task against rendered pages
  instead of the previous source-string assertions. The audit found and repaired
  an authenticated /projects 500, stale Nuxt runtime modules, a collapsed /chats
  layout, inaccessible Profile membership content, a non-opening account menu,
  raw invitation request errors and blank header chrome, and the rejected flat
  organization navigation-card hub. The current rendered contracts are:
  full-height two-pane Chats with no app launcher on that route; a centered
  headerless invitation panel with localized invalid/expired messaging; canonical
  organization detail data with direct Billing/Team actions; visible Profile
  organization cards with direct switch/open actions; and an account popover
  whose organization section lists canonical names and contains organization
  selection only. Billing retains deployment-derived tariff visibility and now
  uses concise compute-token copy. Browser validation exercised Invitation,
  Projects, Chats, Profile, Organization, and Billing against a clean restarted
  Nuxt process. Focused Vitest coverage was updated for the repaired contracts.
- [2026-08-09 Sun 20:13 MSK] Reopened every reviewed item after user testing.
  The earlier home fix was ineffective for already-active process manifests;
  home now derives all readable non-organization ancestors from the domain
  containment graph at runtime. Entity pages, facts, specs, and generated child
  grids now respond to their actual parent width, and descendant traces
  automatically omit the entity already displayed by the enclosing EntityPage.
  Reworked the reported visual/navigation failures: invitation uses a normal
  panel header; /chats is a bounded two-pane desktop workspace with the launcher
  hidden on that route; the organization switcher is visible for one or many
  organizations; organization breadcrumbs are organization name -> section;
  profile organization cards have visible direct actions and only open/switch at
  that level; avatar images use cover cropping; billing uses a dedicated
  explanation message with rewritten English and Russian copy. Added focused
  regression coverage for these reviewed contracts.
- [2026-08-09 Sun 19:31 MSK] Completed all 14 UI-rework items. Generated home
  filtering now hides a child only when its declared containment parent is
  actually readable in the user's loaded generated sources. Entity detail layout
  uses parent-width container breakpoints, and child collection traces omit the
  displayed parent. Invitation presentation is sanitized and server-resolves
  organization/role labels without a protected browser fetch. Chat navigation,
  explicit direct conversation creation, and direct self-chat are complete.
  Organization switching uses canonical DTO ids/names; profile memberships
  render OrganizationCard with generated system-screen actions. User avatar
  upload, authenticated streaming, removal, DTO projection, profile editing, and
  app shell/card display use the users/files service boundaries. Billing UI now
  receives deployment mode/current tariff explicitly, hides artificial account
  status outside tariff mode, and explains compute-token usage without runtime
  configuration leaks. Updated component, composable, page, API, users,
  invitations, support, and billing documentation.

#### User testing

- [ ] Verify generated Home hides a child when its readable parent is present,
  but shows the child when that parent is inaccessible.
- [ ] Open child collections inside a detail screen and confirm layout responds
  to pane width and the displayed parent is absent from each child trace.
- [ ] Open a valid and invalid invitation link while logged out; confirm the
  centered form never requests `/api/organizations/:id` and long errors fit.
- [ ] Open Chats from the floating launcher, expand to `/chats`, start a new
  user chat and a self-chat, and confirm untouched users have no empty rows.
- [ ] Switch organizations from the user menu and profile cards; verify names,
  active state, generated organization actions, and breadcrumbs.
- [ ] Upload, replace, and remove JPEG/PNG/WebP avatars; verify profile, user
  cards, and the app-shell avatar update.
- [ ] Check billing in prepaid-token and tariff deployments; only tariff mode
  shows the configured tariff, and the token explanation mentions nesting and AI
  compute work.

### INBOX Process designer node set update

- [ ] Goal: update the process designer node set.
- [ ] Scope: undefined.
- [ ] Details: undefined.
