# TODO

## Repair the July 15–August 9 architecture violations

Goal: remove the parallel registries, concrete-domain leaks, runtime compatibility
bridges, unrequested automation, and source-assertion testing practices introduced
or expanded between 2026-07-15 and 2026-08-09. The finished system must have one
authoritative contract for each concern. Do not preserve the superseded contracts
through adapters, fallbacks, dual reads, or aliases; migrate persisted data in the
same phase that replaces a contract.

### 0. Freeze the evidence and strengthen enforcement

- [ ] Add executable architecture guards for the violations found by the audit:
  concrete CNC imports in generic process/generated UI modules, duplicate object
  keys, cross-feature repository imports, concrete entity-name branches in
  `@cutkit/processes`, runtime legacy-process bridges, and multiple structural
  registries for hierarchy or creation.
- [ ] Make every architecture finding blocking. Delete the “non-blocking migration
  inventory” success path; `check-arch` must not print Golden Path success while
  reporting violations.
- [ ] Add a repository test that fails when component/page behavior is asserted only
  by searching source text. Source-contract tests remain allowed only for genuine
  static boundaries such as forbidden imports or manifest structure.
- [ ] Record persisted acceptance fixtures for the current organization, process
  graph, project hierarchy, and representative entity DTOs without copying private
  production data into the repository.
- [ ] Acceptance: the new guards fail against the audited pre-repair tree and pass
  only after the relevant later phases are complete.

### 1. Make process Lineage the only authored hierarchy contract

- [ ] Define hierarchy as typed Lineage dataflow: a connected entity value determines
  the ancestor type and canonical lineage key; the downstream entity receives that
  composed Lineage block. Graph structure, not an entity selector or global table,
  owns authored parentage.
- [ ] Extend the normalized/compiled process contract with explicit lineage bindings
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

- [ ] Delete or reduce `utils/entity-hierarchy.js`, `utils/generated-screen-source.js`,
  and related browser inference to consumers of compiled lineage bindings.
- [ ] Remove hierarchy facts duplicated by `cncSummaries`. Define aggregates as
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

- [ ] Represent selection, creation, conversion, and linking as ordinary typed graph
  operations. A producer is not a second action language and a relation is not a
  hidden constructor.
- [ ] Delete `utils/queue-producers.js`, `utils/queue-design-producers.js`, and
  queue/project-specific action synthesis once their behavior is expressed by graph
  nodes and compiled actions.
- [ ] Compile Link/Unlink only from a composed Relations block connected to a Modify
  Entity effect. Cardinality comes from data shape at the persistence boundary, not
  a global relation registry or page-specific mutation mode.
- [ ] Keep artifact upload/conversion as declared constructors or commands. Do not
  special-case Artifact relation rows inside the generic compiler.
- [ ] Acceptance: adding another design-producing process requires only graph
  authoring; Queue and Project UI expose it without new helper code.

### 7. Remove unrequested and unreliable Automation runtime

- [ ] Remove hidden `control.domainEventTrigger`, `control.entityChangedTrigger`,
  wait/scheduler nodes, automatic handler registration, and the three-second Nitro
  orchestration poller unless a separately reviewed process-events specification is
  accepted.
- [ ] Remove `orchestration_runs`/step persistence and APIs that exist only for the
  removed hidden operations. Migrate or explicitly delete existing run records after
  confirming they carry no required business history.
- [ ] Keep the requested node-bottom manual/socket trigger switch. Event output policy
  can be designed later as explicit graph data/control nodes.
- [ ] If durable automation is later approved, design it around one durable queue,
  leases/idempotency, multi-instance delivery, recovery, authorization, and observable
  failure states—not process-local Sets and per-instance polling.
- [ ] Acceptance: the palette, persisted node catalog, validator, compiler, runtime,
  APIs, and documentation expose the same supported operation set; no hidden nodes
  remain executable.

### 8. Eliminate runtime compatibility bridges

- [ ] Inventory every use of `legacyActionId`, `legacyProcessType`,
  `legacyTypeToTemplateId`, stale-parent normalization, old handle reconstruction,
  old action/status normalization, and entity aliases.
- [ ] Write one idempotent migration for each persisted contract still present in the
  database. Migrations must fail closed and report unresolved records.
- [ ] Run migrations for drafts and active definitions, recompile active manifests,
  and verify round-trip equality under the current protocol.
- [ ] Delete the runtime dual-read/normalization paths and the superseded migration
  code after data verification. Current code must accept exactly one process protocol.
- [ ] Acceptance: fixtures using an old protocol fail with a clear migration-required
  error; current persisted records need no stale/legacy fallback to load or execute.

### 9. Repair persistence and editing boundaries

- [ ] Keep Save as unconditional draft persistence for any structurally serializable
  graph. Save must never compile, activate, or require semantic validation.
- [ ] Remove synchronous full compilation from the deep `[draft, nodes, edges]`
  watcher. Replace it with explicit Apply validation and bounded, cancellable preview
  compilation only when a preview surface is open.
- [ ] Separate authored graph state, runtime Vue Flow state, compiled preview, and
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
- [ ] Treat project explorer folders, tabs, pane bodies, and standalone generated
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

- [ ] Reopen tasks whose own acceptance notes say “not fixed,” “not fixed at all,” or
  describe broken rendered behavior. A task is complete only after its stated
  persisted/browser acceptance cases pass.
- [ ] Remove completion narratives that contradict current behavior; update relevant
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
