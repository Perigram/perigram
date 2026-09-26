# TODO

## Dead-surface purge (2026-09-26)

Domain truth per owner: the facade pack is cassette + sheet-design file types,
their editors, and services like nesting. `queue` is not declared. The
cassette_design entity machinery, the project/queue production flow, and the
catalogue features behind it are legacy awaiting deletion. Four parallel
liveness audits (server features, frontend surfaces, workers/scripts/docs,
core packages) produced the phased plan below; evidence lives in the session
notes.

- [x] P1 — server-side dead cuts with no frontend impact: delete features
  `machines`, `results`, `profile-templates`, `tool-profiles`,
  `layer-standards`, `pen-templates` (UI reads these types through the
  generic instance transport, not the features) + `api/results` route +
  `server/core/project/` + `server/plugins/status-control.js` + their seed
  scripts + orphaned/dead server-scripts and their specs + all four
  framework task definitions (no enqueue site exists for any of them) +
  workers `cassette-processing`, `fileprocessing`, `geometry-capture`
  (compose/stack/build-images updates; nesting worker stays) + dead
  attachment kinds `CASSETTE_DXF`/`SVG_PREVIEW` + dead-collection indexes in
  `server/db/indexes.js` + `check-arch.js` list updates + fix the two specs
  importing the removed `cncFileTypes` export.
- [x] P2 — frontend orphan sweep: queue utils trio + specs,
  `stores/artifacts` + `ArtifactsTable`, `AssetsLibrary`, `PartLibrary`,
  `TemplatesManager`, `ProjectStatistics`, `useTraceability`,
  `SheetDesignDetail`, `stores/toolProfiles` (+ SheetDesignEditor kerf
  fallback), unreachable entity cards (CassetteTemplate, ProfileTemplate,
  ToolProfile) + contract rows + ui-lab/factories trim, project workspace
  cluster + `project` overload, dead riders in PermissionEditor/
  InstanceInlineRef/InstancePreview/TraceChain/users.vue/access-control/
  field-access-policies/public-entities, dead icon glyphs (keep
  `sheet-design.svg`, rebuild font).
- [x] P3 — cassette_design cut: delete `server/features/cassette-designs` +
  `api/cassette-designs/*` + `FEATURE_ROUTES.cassette_design` + support
  loader; cassettes service drops the design twin (`importFromArtifact`
  keeps creating the cassette, template DXF export stays template-level);
  `convertArtifact` retargets cassette; facade pack contract references
  (`cassette.bakeTemplate` task list, cassette_design output) removed;
  frontend: SheetDesignEditor placements + CassetteThumbnail fallbacks +
  CassetteEditorDialog import path rewire to cassette surfaces;
  CassetteDesignCard deleted; decide `parametric-cassettes` (keep only what
  template export needs); trim e2e specs that pin the dead flow.
- [x] P3b — facade-design/facade-pattern cut (owner-scoped domain): remove
  the two pack type declarations + editor bindings + FacadeDesigner/
  FacadePatternDesigner + generated workspace pages + surface entries +
  related contract rows/policies (their persistence routes are already
  gone).
- [x] P4 — workflow core legacy: remove `getDomain('cnc')` zombie reads in
  `server/core/machines` (validateHookParams, isSynchronousHook, aggregator,
  dead stateMachines proxy), rewrite the ~13 dead spec expectations in
  `machines/service.spec.js`, drop consumer-less `initialStatus`/
  `getDefaultWorkflow` fallback paths and the `workflow-overrides` HTTP
  routes (service stays — machines resolves through it), trim `states`
  STATUS_TYPES to live types, remove bake/import grant special-cases in
  `process-definitions/service.js`, remove dead alias rows in
  `support/service.js`.
- [x] P5 — docs + guards: rewrite `server/features/README.md` inventory,
  `server/api/README.md`, `workers/README.md`, `docs/SYSTEM_ARCHITECTURE.md`,
  root README container table, both scripts READMEs, nesting README link,
  DESIGN_SYSTEM rows; regenerate `framework.manifest.json`; stale TODO lines
  (`domain-cnc` spec note); run `check-arch`, `docs:validate`,
  `framework:validate`, focused vitest + SSR smoke; report.

### Agent Notes (2026-09-26) — purge complete

Executed on `agent/dead-code-purge-20260926` (merged to `local`): P1–P5 all
landed. Final validation: `check-arch`, `docs:validate`, `framework:validate`
all green; vitest server 59 files / 351 tests green (baseline: 24 failing
tests, 6 broken files), packages 47 files green, SSR smoke green; frontend
suites carry exactly the 4 pre-existing baseline failures
(delete-visibility, home-workspace state, socket-tone ×2 — untouched, present
on the primary checkout). Two real bugs found and fixed en route: the process
run environments evaluated against the static domain instead of the projected
org domain (org-type block records failed or silently dropped patches), and a
missed rename call-site in sheet-designs updateLayout. The CREATED minted-machine fallback was deleted after this
audit (owner directive: authored vocabulary only) — vocabulary-less types are
stateless and creation stamps the compiled machine's entry when one exists.
Follow-ups not in
scope: the 4 frontend baseline failures; the entity→instance vocabulary
remainder (protocol kinds `effect.createEntity`, `entityRef`, framework type
`entity_revision`, `BaseEntity`) — tracked separately as a rename+migration
decision; artifact upload endpoint 400s for every kind because no registry
attachment-kind declarations exist (pre-existing, unrelated to the purge).

### Agent Notes (2026-09-26)

Audit verdicts (full evidence in session): LIVE and untouched — cassettes,
sheet-designs, artifacts, artifact-templates, artifact-conversions, nesting,
files, support (chat + instance options), workflow-overrides (service),
instances, cts-types, process-definitions, _template (process-update-handler
is imported by live services). DEAD — machines, results, profile-templates,
tool-profiles, layer-standards, pen-templates (features; types are served by
the generic instance transport), all four framework tasks, three of four
workers, status-control plugin, server/core/project. Legacy-live until P3 —
cassette-designs, parametric-cassettes. Known broken on HEAD: four orphaned
server-script specs, two process-definitions specs spreading removed
`cncFileTypes`, ~13 machines/service.spec expectations pinned to the deleted
cnc domain, artifact upload endpoint 400s for every kind (no registry kind
declarations — separate defect, not in this purge). Open decisions taken:
profile_template designer dialog left intact (works against org-declared
types; only unreachable surfaces cut); `saveCassetteTemplate` command kept
until P3 verifies its invokers; check-arch dead-name denylist kept (it guards
reintroduction).

## Process Designer nodes

- [ ] Nodes in node editor follow several completely different UI conventions. Need to unify (aligned with latted cts
  type, keep socket visual contract)
- [ ] Inline editing looks awful as today. 

  ### Agent Notes (2026-09-24)

  First slice landed on `agent/node-grammar-2-20260924`: entityRef
  authoring no longer types raw ids. An EntityRef literal's value and an
  unconnected entityRef socket's inline fallback are instance pickers
  (shared `InstanceSelect` contract): options load silently from the
  generic instance transport for the socket's exact type, and the
  authored reference resolves through the readable-reference seam so the
  value renders as an instance card. `TypedValueControl` owns the
  wrapping (`{ type, id }` in and out); `instanceIdFallback` ("X ID or
  connect a wire") is gone. Remaining awfulness not yet addressed:
  literalList/literalTree authoring is still a raw JSON textarea; the
  always-visible stacked selects on literal cards were not touched.
- [ ] Need some sugar or UX-level adoption, and some fixes, actually:
  - [ ] Probably "instant" should be recorded when it's instance's field is initiated? 
  - [ ] And, need a literal that bears current time, to display things like "5 days left"? 
  - [ ] And, need to REMOVE FUCKING BOWELS FROM UI! I don't want to ever see stuff like "Child: Field name Instant must be lowerCamelCase". Field name is public, for user plane, and field ID can be named as you want, any fucking case, but better short UUID. 
- [ ] Migrations don't work currently. See many errors (Child: breaking change to Child (t-uth93vgdab) without a covering declared migration (retype-field anythin requires a retype-field step)), non-actionable popups, etc.

  ### Agent Notes (2026-09-24) — CTS/Process Designer hard cut

  Accepted architectural direction: declaration and process graphs are
  separate semantic planes; state nodes declare recursive parent/child state
  machines and transition nodes declare explicit from/to transitions; native
  CTS species records remain executable through resolution, validation,
  compilation, orchestration, and server adapters; instance sources are
  context/reference/all plus declared field access; raw ids, producer joins,
  fixed list arity, packet controls, and hidden predicate paths leave the
  primary palette. Producer identity is origin provenance only, never a
  lifecycle requirement for existing-instance consumers. Add a repeatable
  palette and nested-state E2E artifact before closing this task.

  ### Agent Notes (2026-09-24)

  Engine loop verified live against a throwaway org type: the breaking
  retype is refused with the plan payload (`error.data.data.plan`,
  `changes[].severity/kind`) the steps dialog consumes; declaring the
  `migrate: [{ kind: 'retype-field', field, via: <CEL AST> }]` step on
  the next declaration is accepted and the stored instance reads back
  migrated. The designer dialog → declare → retry walk is still
  unconfirmed in a browser session.

  ### Agent Notes (2026-09-24) — hard cut implemented on
  `agent/process-designer-cts-refactor-20260924-190000`

  Landed and validated (880 focused tests, architecture guard, docs
  guard): recursive state declarations compile through the declaration
  graph (nested state wires, per-axis machines, entry roots); persisted
  declarations and v4 graphs migrate one-way — reads collapse to
  `cts.read` + select with edge-handle rewrites (legacy query and its
  predicate wires die), composer-fed construct/mutate blocks expand to
  field wires with the dead substrate removed, and a v4 update that
  smuggled a status splits into `cts.mutate -> cts.transition`; durable
  dispatch classifies native species so `cts.transition` executes its
  declared reference (target, axis, note) through the status runtime;
  secondary lifecycle axes persist without rewriting `main`; cassette
  declares its lifecycle on the pack type. Designer: recursive state
  authoring UI (axis/initial/terminal/nesting), transition
  reference pickers, retained palette pinned by tests. Not done:
  browser E2E was authored (`e2e/process-designer-cts.spec.js`) but not
  run (no app stack started), and the UI-convention/inline-editing items
  above are untouched. `server/core/machines/service.spec.js` has 13
  pre-existing failures around the retired legacy queue service — same
  failures on the primary checkout, not introduced here.

## CTS Type system

- [ ] Types hierarchy isn't preserved correctly, either on compile or in contract generator. I don't
  see actual correct types/instances nesting, I rather see a mess in an app. (instances don't seem to
  accumulate child instances, or current UI doesn't respect it, idk)

  ### Agent Notes (2026-09-24)

  Verified in the browser: a parent detail's child region lists only the
  parent's children (client-side scope filter over the loaded pool), and
  children created from the parent detail now preselect the parent in the
  create dialog's lineage picker, so created children stamp their lineage
  and accumulate in the region. Unparented children were the actual bug.
  Child rows still read "Unnamed" when the child type declares no
  identifier field — a declaration gap, not a nesting defect.

## Open questions from the crystallization conversations (2026-09-23)

> NOTHING below is decided. Candidate designs were discussed and rejected or left
> unaccepted — do not treat any prior proposal (field roles, type-level identifier
> pointer, render.title/render.* facets, semantic-fact lists, tier/precedence
> models, "mechanism" framings) as agreed. These are open questions, stated bare.

- [ ] Where does a record's display title in generated UI come from once the
  hardcoded name-fallback lists (`name→slug→uid` and its component-level twins)
  are deleted? Requirements raised: derived from paper; no hardcoded field-name
  lists in code; one home per fact. UNRESOLVED.
- [ ] Is there a layer that allows tweaking render contracts in paper — without
  slop (vocabulary that grows per UI aspect) and without hardcoding? Only point
  actually agreed: no paper key may be named after a screen element. Everything
  else — homes, mechanism, authoring surface — UNRESOLVED.
- [ ] What exactly belongs in a type declaration vs a screen/station record vs
  code, for display concerns (title, field groups, icons, preview)? Note:
  `render.groups` currently lives ON type declarations (phase 6) — correct home
  or misfiled? UNRESOLVED.
- [ ] Type glyph / record thumbnail / payload preview: two hardcoded icon
  registries exist today (utils/README warns to "keep them in sync"). Where
  should this live and how is it declared? UNRESOLVED.
- [ ] If several types ever need a SHARED lifecycle vocabulary (same state names,
  same meaning — states are type-scoped homonyms by design), where does it live?
  Nothing built; open until a real need appears.
- [ ] A process with zero inferred stations has no screen-creation entry at all
  (delta-only authoring), and one authored screen suppresses BOTH the inferred
  list and detail station for its role+feature. Both acceptable? UNRESOLVED.
- [ ] Phase 7 (tracked in TODO-crystallization.md): artifact entity vs file-type
  instances; `status` block vs `states.main` — the dual worlds. Open.
- [ ] Phase 8 (tracked in TODO-crystallization.md): export/import org
  declarations as diffable pack; whether pack substrate should become authored
  data instead of code. Open.
- [ ] Phase 4 remainder (tracked in TODO-crystallization.md): empty inspector
  sections; palette discoverability for unbindable entries. Open.
- [ ] Pre-existing failing spec (parallel sessions, unfixed):
  `packages/domain-cnc/src/relationships.spec.js` — 2 failures.



