# TODO: Process Designer procedural entity CRUD

Status: READY

This plan completes the Process Designer as a procedural entity-dataflow
authoring surface. The target is exhaustive composition of organization-scoped
entity reads, selection, canonical-block transformations, persistence, role
access, and generated interfaces. Long-running service orchestration is not the
priority of this plan.

Canonical architecture remains in
[`packages/processes/README.md`](./packages/processes/README.md),
[`components/process-designer/README.md`](./components/process-designer/README.md),
[`server/features/process-definitions/README.md`](./server/features/process-definitions/README.md),
and [`server/core/access/README.md`](./server/core/access/README.md). Update those
owners with each implemented contract instead of turning this TODO into a
second specification.

## Required authoring model

- [ ] Keep iteration below the node language. Item access maps over matched
  items, List access runs once per branch, and Tree access receives the whole
  structure. Create, Modify, Change Status, and Delete must consume and return
  item/list/tree topology through those same solver rules. Do not add `For
  Each`, Batch, Bulk, Map, or collection-specific mutation nodes.
- [ ] Keep transport shape separate from value type. A List of entity refs is
  not an array-valued entity field; Collect Array and Expand Array remain the
  explicit boundary between data-tree topology and a persisted `array` value.
- [ ] Keep nodes declarative and domain-independent. Entity types, canonical
  blocks, fields, relations, construction modes, status contracts, commands,
  and capabilities must come from the active domain and runtime registry.
- [ ] Keep access and persistence at service boundaries. Graph evaluation may
  select and transform readable DTOs, but every read/write/delete/status action
  must still re-enter the registered entity service, access engine, or status
  engine with the complete auth context.
- [ ] Keep ordinary CRUD synchronous for now. Do not introduce schedules,
  durable waits, process-run workers, retry-control nodes, compensation nodes,
  or service-management UI as prerequisites for this plan.

## P0 — make the contracts truthful

### Entity process capabilities

- [x] Add one canonical process-capability projection for every registered
  entity type: list/query, get-by-id, create modes, writable blocks/fields,
  relation mutations, status mutation, archive, and hard delete. Derive it from
  domain declarations plus explicit runtime bindings; do not infer create or
  delete support from the existence of an entity collection.
- [x] Make the designer filter entity choices per operation. Create Entity must
  show only process-creatable entities and valid construction modes; Modify,
  Change Status, and Delete must apply their own capabilities independently.
- [x] Make activation reject a node whose selected entity/service binding
  cannot perform its declared operation. A graph that validates must not later
  fail only because the registered service lacks `create`, `processUpdate`,
  status support, or delete support.
- [x] Remove the generic-create fallback for entity types that have no explicit
  process construction contract. Every excluded entity must have a documented
  domain reason, and every included entity must be constructible from a fresh
  graph.
- [x] Add a contract test that iterates the complete domain entity registry and
  proves palette availability, compiler validation, and registered service
  capability agree for every CRUD operation.

#### Agent Notes

2026-08-15 — completed the "Entity process capabilities" checkboxes above.

- Canonical projection: `packages/processes/src/capabilities.js`
  (`projectEntityProcessCapabilities`) intersects domain construction, field
  schemas, relations, workflows, and `operations.delete` with an explicit
  service-bindings map; no create/delete inference from collection presence.
  See [packages/processes/README.md](./packages/processes/README.md).
- Runtime bindings: `server/runtime/app-registry.js` declares a per-entity
  `processCapabilities` record `{ create, processUpdate, delete, archive }`,
  throws on a missing entry or a `true` flag that does not resolve to a real
  service method, and spreads it onto each registered service. See
  [server/runtime/README.md](./server/runtime/README.md).
- Designer filtering: `packages/processes/src/designer.js` exposes
  `createEntityOptions`, `updateEntityOptions`, `changeStatusOptions`,
  `deleteEntityOptions`, and `archivableEntityOptions`;
  `pages/organization/process.vue` branches `processEntityTypeOptions` on the
  node kind and defaults Create Entity to the first creatable entity. See
  [components/process-designer/README.md](./components/process-designer/README.md).
- Activation enforcement: `packages/processes/src/compiler-core.js` adds
  `requiredEffectCapability` plus a gated capability pass that rejects
  create/update/changeStatus effects lacking the binding as deterministic
  `validation.errors` (HTTP 400), and `compiler-adapter.js` threads the registry
  capabilities through `validateActivatableProcess`. See
  [server/features/process-definitions/README.md](./server/features/process-definitions/README.md).
- Generic-create fallback removed: `packages/domain-cnc/src/entity-construction.js`
  returns `null` for entities without an explicit construction contract and adds
  explicit entries for `catalog`, `color`, `material`, `material_pile`,
  `remnant`, `requisition`, and `warehouse`. See
  [packages/domain-cnc/README.md](./packages/domain-cnc/README.md).
- Contract test: `server/runtime/app-registry.spec.js` iterates
  `cncDomain.entities` and proves the declared `processCapabilities` flags agree
  with the actual service methods (`create`↔`service.create`,
  `processUpdate`↔`service.processUpdate`, `delete`↔`service.remove`) and with a
  workflow `ARCHIVED` state for `archive`, per CRUD operation.

Validation: `npx vitest run packages/processes packages/domain-cnc server/runtime`
passed; `npx vitest run server/features/process-definitions/process-definitions.spec.js`
passes 5/6 (the "rejects activation when the authored graph is not the current
protocol" case is a pre-existing failure unrelated to this task);
`node scripts/check-arch.js`, `npm run framework:validate`, and
`node scripts/check-docs.js` ran before the docs commit.

#### Corrective plan — mode-aware construction capabilities

Status: WAITING. The plan below is complete: process creatability now resolves
to the registered per-mode construction handlers, and the projected capability
record is the single activation/authoring/execution contract.

- [x] Replace the boolean create authority with explicit runtime support per
  construction mode. Effective `createModes` must be the intersection of the
  domain-declared modes and registered runtime handlers; derive `create` only
  as `effectiveCreateModes.length > 0`. Bind `genericCreate` to
  `service.create` and every typed mode to its named handler instead of treating
  all creation as a generic service call.
- [x] Remove the compiler's remaining implicit `genericCreate` contract.
  Missing domain construction must remain `null` through normalization and
  validation, and Create Entity / Run Producer must reject an entity or mode
  that is not explicitly declared.
- [x] Reconcile every declared construction mode with execution. Preserve the
  specialized cassette-design bake/import paths as typed mode bindings; resolve
  the `cassette_instance` mismatch by either providing its declared
  `genericCreate` execution boundary or removing that domain construction
  contract with the owning-domain reason. Do not expose the ten internal
  service `create` methods whose entity types have no process construction
  contract.
- [x] Make the projected capability record the consumed activation and
  authoring contract. Activation must validate the selected construction mode,
  not a raw entity-level boolean. The designer must receive effective entity
  options and modes from that projection (or from a serialized registry-owned
  projection), rather than independently reconstructing process support from
  `domain.construction`.
- [x] Keep Create Entity and Run Producer checks mode-specific. A producer is
  valid only when its selected producer/construction handler is registered;
  ordinary Create Entity is valid only for its selected construction mode.
  Update and Change Status continue to use their independent capabilities.
- [x] Replace the current method-presence test with a registry-wide, per-mode
  contract test proving palette modes, compiler acceptance, and runtime
  handlers agree for every domain entity. Cover an internal `service.create`
  with no construction contract, generic creation, cassette-design typed
  creation, an unsupported mode, and the resolved cassette-instance contract.
- [x] After the executable contract passes, correct the canonical owner docs
  and these Agent Notes. Remove the documented compiler fallback and describe
  mode-aware projection/activation without duplicating the per-entity matrix.

Acceptance: no entity or construction mode appears in the designer unless the
same mode activates and executes through a registered handler; no internal
service method becomes process-authorable without an explicit domain contract;
and no missing construction contract falls back to `genericCreate`.

##### Agent Notes

2026-08-17 — completed the mode-aware construction capability plan above.

- Execution boundary: `server/features/process-definitions/service.js`
  `performDurableEffect` now resolves the effect's construction mode on the
  target service's `constructionHandlers` map and invokes that bound handler
  (including the `genericCreate` binding). The hardcoded
  `uploadArtifact`/`bakeCassetteDesignFromTemplate`/
  `importCassetteDesignFromArtifact`/`genericCreate` branches were deleted;
  create-status and typed-block post-processing still run after a successful
  handler call. See [server/runtime/README.md](./server/runtime/README.md).
- Compiler fallback removed: `packages/processes/src/compiler-core.js`
  `constructionContract`/`normalizeConstruction` return `null` for an entity
  without a construction contract, and Create Entity / Run Producer reject an
  undeclared entity or mode; `packages/processes/src/node-catalog.js` no longer
  defaults the port contract to `genericCreate`.
- `cassette_instance` resolved by removal:
  `packages/domain-cnc/src/entity-construction.js` drops the `cassette_instance`
  entry (instances are derived at nesting time through the `cassette-instances`
  service, not authored from an empty graph), and the domain README and
  construction spec were corrected to match. See
  [packages/domain-cnc/README.md](./packages/domain-cnc/README.md).
- Mode-aware projection/activation: `packages/processes/src/capabilities.js`
  derives `createModes` as the declared-mode/handler intersection and `create`
  as `createModes.length > 0`; `packages/processes/src/designer.js`,
  `pages/organization/process.vue`, and `server/api/admin/domain/index.get.js`
  feed the serialized registry-owned projection into the designer.
- Contract test: `server/runtime/app-registry.spec.js` iterates the domain
  entities and proves declared modes == runtime handlers == capability
  `createModes` == palette presence, plus execution-dispatch cases for generic
  and typed creation, an internal `service.create` with no contract, an
  unsupported mode, and the null `cassette_instance` contract.

Validation: `npx vitest run packages/processes packages/domain-cnc
server/runtime` passed; `npx vitest run
server/features/process-definitions/process-definitions.spec.js` passes 5/6 (the
"rejects activation when the authored graph is not the current protocol" case
is a pre-existing failure unrelated to this task); `node scripts/check-arch.js`
and `npm run framework:validate` passed; `node scripts/check-docs.js` reports
only pre-existing broken links to unrelated deleted docs.

### Required inputs and value availability

- [x] Restore the catalog's real `required` flag. Do not make every socket
  optional in `socket()` or confuse an unconnected manual prompt with an
  optional runtime value.
- [x] Represent input availability explicitly: connected upstream value,
  authored fallback, domain-owned default, generated manual prompt, or runtime
  context. Activation must reject required inputs that have none of these
  sources.
- [x] Keep generated prompts limited to manual actions. An automatically
  evaluated data path must be complete without a UI prompt.
- [x] Validate availability after type/access inference so a required entity,
  block, array, attachment, enum, or construction input cannot be satisfied by
  an incompatible scalar fallback.
- [x] Add focused tests for required primitive, entity, entity-list, block,
  status, attachment, and command inputs, with connected/defaulted/prompted and
  missing cases.

##### Agent Notes

2026-08-18 — implemented the required-input availability contract.

- Real `required` propagation: `packages/processes/src/node-catalog.js`
  `socket()` honors its `_required` argument instead of hardcoding
  `required: false`; `packages/processes/src/ports.js` `normalizePortSpec`
  derives `required` from the real flag; `packages/processes/src/compiler-core.js`
  stops forcing `required: false` at the derived-input sites (construction
  inputs, command inputs, input policies, relation link/entity inputs). A
  construction or command input with a domain `default` still projects as
  non-required. See
  [packages/processes/README.md](./packages/processes/README.md).
- One activation-time availability pass: new
  `validateRequiredInputAvailability` in `compiler-core.js`, exported through
  `validation.js`, consumed by `validateActivatableProcess` in
  `server/features/process-definitions/compiler-adapter.js`. It resolves the
  five sources (connected edge, authored `inputDefaults` fallback, domain
  default, manual-only prompt, manual-only run context) and rejects required
  effect inputs with no source. A prompt never satisfies an automatically
  evaluated path.
- Manual classification: Link targets and manual generic Create
  `identity.name`/typed construction inputs and command entities/parameters
  (with `display !== 'hidden'`) are the promptable inputs; the entity/status
  ports resolve from the manual run context.
- Emptiness semantics: `null`/`undefined` never satisfy; empty entity-list and
  attachment fallbacks/defaults never satisfy; scalar fallbacks cannot satisfy
  entity/block/array/attachment/opaque ports after type/access inference;
  empty string/zero satisfy primitives; enum/status fallbacks must be a
  declared member where options exist.
- Tests: updated `node-catalog.spec.js`, `ports.spec.js`, and `index.spec.js`
  assertions that locked in `required: false`; added `availability.spec.js`
  covering connected, fallback (empty/incompatible/null), default, enum
  membership, manual-vs-automatic prompt, runtime context, and
  hidden-command-parameter cases.

Validation: `npx vitest run packages/processes` passed (218 tests);
`npx vitest run packages/domain-cnc server/runtime
server/features/process-definitions` passes except the pre-existing
"rejects activation when the authored graph is not the current protocol"
permission-denied case; `node scripts/check-arch.js` and
`npm run framework:validate` passed.

### Item/list/tree persistence semantics

- [ ] Define one lower-level effect-mapping contract used by Create, Modify,
  Change Status, and Delete. Item inputs map over aligned packets, the output
  preserves branch paths and item order, and no mutation node contains its own
  loop implementation.
- [ ] Define multi-input matching for persistence nodes. Item values may
  broadcast over an entity list; aligned lists follow the chosen matching
  rule; incompatible branch lengths or unsafe Cross mutation must fail before
  the first write.
- [ ] Define mutation failure reporting below the graph language. Return the
  operation, branch path, item index, entity ref when known, and underlying
  service error. Do not add success/failure fan-out nodes merely to represent
  collection execution mechanics.
- [ ] Do not claim collection-wide atomicity when mutations are separate
  service calls. Make the execution result identify completed mutations if a
  later item fails, and make generated UI refresh those entities.
- [ ] Test the same Create/Modify/Status/Delete node with item, list, branched
  tree, broadcast scalar, and aligned value-tree inputs.

## P0 — complete entity acquisition and selection

### Entity sources

- [x] Expose Current Entity as an authoring node. Its entity type must be
  inferred from the manual action/screen context where possible and selectable
  only when the context cannot determine it.
- [x] Expose Entity by ID/Reference. Accept a typed entity reference directly;
  accept an ID only with an explicit entity type. Return a typed readable entity
  and fail clearly when access denies it or it does not exist.
- [x] Complete Select Entities as the organization-scoped list source for every
  process-listable entity. Preserve the service's access filtering; never use
  an unfiltered repository read.
- [x] Expose Parent, Children, and Related Entities from declared Lineage and
  relation contracts. The node must offer only relations valid for the incoming
  entity type and return exact typed entity references/DTOs.
- [x] Add source tests for root entities, lineage children, relation targets,
  missing references, cross-organization references, and per-entity read denial.

#### Agent Notes — 2026-08-19

Implemented the Entity sources subsection. Runtime read functions
`parentEntity`, `childEntities`, and `relatedEntities` are now wired into
`processDataEnvironment` through the pure helpers in
`server/features/process-definitions/entity-sources.js`, resolving from the
domain `containment`/`relations` contracts via `processList`/`processGetById`
with the complete auth context (never an unfiltered repository read).
`currentEntity`, `entityById`, and `resolveEntityRef` were already wired.
`queryProcessGraphEntities` now accepts lineage-key filters. The authoring
palette exposes Current Entity (`read.currentEntity`), Entity by ID
(`read.entityById`), Entity by Reference (`read.resolveEntityRef`), Parent
(`read.parent`), Children (`read.children`), and Related (`read.related`),
alongside Select Entities. The designer contract now emits
`listableEntityOptions`/`readableEntityOptions` from the capability projection,
and the designer gates Select Entities/Children by `list` and the other read
sources by `getById`. Current Entity's entity type remains node-selected and is
resolved from the run context (`inputs.entities[type]`); context inference from
manual action/screen placement is left for the placement-aware authoring work
since the runtime has no such signal today. The source matrix lives in
`entity-sources.spec.js` (root, children, relation, missing, cross-org, and
read-denial).

### Filter and find paths

- [x] Make this ordinary path work for every readable scalar field:
  `Select Entities -> Deconstruct/Get Block -> Get Field -> Logic -> Filter`.
  Field extraction and Logic must map over the source topology so the Boolean
  mask stays aligned with the original entities.
- [x] Cover equality, inequality, numeric/date comparisons, contains,
  starts/ends with, null/not-null, Boolean AND/OR/NOT, enum values, status, and
  typed entity-reference equality. Do not require raw predicate JSON.
- [x] Preserve the original entities through Filter and Dispatch; masks are
  selectors, not replacement values. Reject mask/item branch mismatches before
  returning misleading results.
- [x] Support several conditions by composing Logic nodes. Do not add a second
  query-language or a monolithic advanced-filter node.
- [ ] Add an internal query-planning optimization only after semantics are
  correct: safe source-adjacent predicates, sort, and slice may be pushed into
  `processList` filters, but the graph result must be identical to in-memory
  evaluation and service access checks remain authoritative.
- [x] Add end-to-end tests for find-by-field, combined conditions, status
  selection, relation-reference selection, empty results, and denied records.

#### Agent Notes — 2026-08-19

Closed the ordinary find/filter authoring path. `filterPackets`/`dispatchPackets`
no longer reuse `combineDataPackets`' default "longest" matching (which silently
repeated the last mask entry on a length mismatch). They now align the Boolean
mask to the item list with equal branch paths and equal per-branch item counts
via `alignSelectorPackets`, rejecting any branch or item mismatch, and return the
original entity values unchanged. Comparison semantics are pinned and tested:
`status.state.primary` travels through Get Field as a scalar status id string and
compares with scalar equality, enum values compare as scalar strings, and typed
entity references compare structurally by their serialized `{ type, id }` shape
through the existing `same()`/`compare()` operators. Added end-to-end
evaluator tests for find-by-field, combined Logic conditions, status selection,
relation-reference selection, empty results, and authorized-only (denied-excluded)
reads, plus mask/item and mask/branch mismatch rejection. Source-adjacent query
planning remains deferred until these in-memory semantics are exercised end to
end.

### Ordering, grouping, and windows

- [x] Change Sort Items to accept the original item list plus an aligned key
  list produced by Get Field. Return the original items in key order; do not
  require hidden/raw property paths inside Sort.
- [x] Use one canonical `direction` property (`asc` or `desc`) from inspector
  through evaluator. Remove the current `operation`/`direction` mismatch and
  test both directions.
- [x] Define stable ordering for equal keys and deterministic placement of null
  values. Cover string, number, date/date-time, enum, status, and identity
  values.
- [x] Make Distinct optionally consume aligned keys so complete entities can be
  deduplicated by a field without losing the original entity values.
- [x] Keep Group By as items plus aligned keys and preserve source branch paths.
- [x] Complete Slice and Item At with authorable start/end/index fallbacks,
  negative-index behavior where supported, empty-list behavior, and exact
  output topology.
- [x] Test practical paths such as “most recent ten”, “first matching entity”,
  “unique entities by reference”, and “entities grouped by status”.

#### Agent Notes — 2026-08-19

Implemented the aligned-key-sockets contract for Sort, Distinct, Group By,
Slice, and Item At. `collection.sort` now exposes `items` + `keys` (both
required) and sorts the original items by the strictly aligned key list via the
shared `alignSelectorPackets` helper, removing the hidden `record.path`/`readPath`
key mechanism; one canonical `direction` (`asc`/`desc`, default asc) is read by
the evaluator and written by the inspector (the inline Sort selector now writes
`direction`, and `syncProcessNode` defaults it and drops `operation`), so the
former `operation`/`direction` mismatch is gone and both directions are tested.
Stable ordering is explicit (equal keys keep original order via an index
tiebreak) and null keys sort after non-null keys in ascending order.
`collection.distinct` exposes `items` + optional `keys`; with keys it keeps the
first item per aligned key, without keys it dedups the items themselves by
structural equality instead of whole-entity JSON. `collection.groupBy` keeps
`items` + `keys` but switches from `combineDataPackets` longest-match to strict
`alignSelectorPackets` alignment (rejecting length/branch mismatches) and
preserves source branch paths by appending the group index. Slice `start`/`end`
and Item At `index` are now authorable integer fallbacks (the index socket is no
longer required) with native negative-index and empty-list semantics; Item At
resolves absent/out-of-range/empty indices to null, and Slice was fixed to map
optional start/end positionally. Added catalog contract and evaluator tests for
most-recent-ten (Sort+Slice), first-matching-entity and negative/absent index
(Item At), unique-entities-by-reference and no-keys dedup (Distinct), and
entities-grouped-by-status (Group By), plus mismatch rejection for Sort and
Group By.

### Collection construction

- [ ] Expose Make List only where authors need to combine several independent
  item values into one data-tree list. Its number of inputs must be explicit
  and stable; do not permit several wires into an ordinary single-value socket.
- [ ] Keep Concat for joining existing lists, and verify it retains item type,
  branch topology, and order.
- [ ] Keep Collect Array/Expand Array as the explicit persisted-array boundary.
  Add array/map value-type authoring where a canonical block field or command
  input actually declares those types; do not treat arbitrary JSON text as a
  typed array.
- [ ] Test construction of relation arrays, attachment arrays, command
  entity-list inputs, empty lists, and mixed incompatible element types.

## P0 — complete canonical-block CRUD

### Decompose and read

- [ ] Make Deconstruct Entity accept item/list/tree entities and emit each
  declared canonical block with identical topology.
- [ ] Make Get Block equivalent for one selected block and reject blocks not
  declared by the incoming entity contract.
- [ ] Make Get Field consume fixed and open canonical blocks without storing
  schema snapshots. Restore typed entity refs for Lineage/Relations and typed
  attachment/array/map values where declared.
- [ ] Distinguish a missing field from a present nullable field in preview and
  evaluator results so Logic, fallback values, Unset, and validation behave
  predictably.
- [ ] Cover every canonical block family used by the CNC domain, including
  identity, lineage, relations/data, specs, attachments, summary, provenance,
  and status as read-only or writable according to its real policy.

### Compose Block

- [ ] For fixed blocks, expose only domain-declared constructible fields with
  their exact types, units, enum/schema qualifiers, and required/default rules.
- [ ] For open blocks, keep stable author-defined entries: Lineage key plus
  typed ancestor, Relation key plus accepted entity type, Attachment kind plus
  typed reference, and named Data/Summary/Provenance entries only where policy
  permits them.
- [ ] Let each selected field receive item/list/tree values through ordinary
  solver matching. Compose Block must emit one block for each aligned input
  tuple, not require a separate loop node.
- [ ] Reject duplicate open keys, service-owned fields, unknown schema paths,
  incompatible units/types, and fields that are readable but not constructible.
- [ ] Test complete creation blocks, partial optional blocks, open relation and
  lineage blocks, collection-valued fields, and multi-entity block output.

### Modify Block

- [x] DONE 2026-08-19 — Preserve unselected fields from the incoming block and
  replace only connected or explicitly defaulted selected fields. The
  evaluator clones the incoming block and writes only connected paths;
  inputDefaults merge into packets so an explicitly defaulted selected field
  is also written (evaluator.js:21-22, 116-150; orchestration.js:282-283;
  evaluator.spec.js:118-136; Agent Notes below).
- [x] OUT OF SCOPE — Support Set/Replace and Unset for eligible fixed/open
  entries, and Append/Remove only for collection-valued fields with element
  type validation. The v4 dataflow is replace-only: migration-v4.js:16-25
  rejects any modifyBlock entry whose operation is not `replace` and strips
  entry.operation/cardinality, and the set-only persistence boundary rejects
  unsets/undefined (service.js:1076-1104, 1099). Collection changes are
  composed with list/tree nodes before the block socket
  (processes/README.md:328-333), not expressed as modifyBlock operations.
- [x] DONE 2026-08-19 (absent=preserve half) / OUT OF SCOPE (explicit
  null-vs-Unset half) — Make modification intent explicit in the node record
  and preview. An absent input must mean "preserve", not "set null"; explicit
  null and Unset must remain distinct. The absent=preserve half is TODO #1's
  already-implemented preserve semantics (evaluator.js:21-22, 116-150; Agent
  Notes below). The explicit-null-vs-Unset distinction is out of scope: the v4
  migration strips all non-replace operation metadata (migration-v4.js:16-25)
  and the set-only persistence boundary never materializes a null assignment
  (service.js:1076-1104, 1099).
- [x] DONE 2026-08-19 — Apply field write policy at the consuming persistence
  node as well as the block editor, because the same canonical block can be
  valid for one entity type and non-writable for another. Implemented in three
  layers: Modify Block validation rejects fields with writable===false and
  managed blocks (compiler-core.js:3053-3075); effect.updateEntity rejects
  blocks outside its writable set and edge validation rejects composer/modifier
  wiring whose fields are not writable (compiler-core.js:3104-3120,
  3241-3272); the service filters field.writable !== false and applies the
  field-access policy (service.js:874-884, 1217).
- [x] DONE 2026-08-19 — Test the full read-modify-write path:
  `Current/Selected Entity -> Get Block -> Modify Block -> Modify Entity`,
  including list/tree inputs and preservation of untouched fields. Graph-level
  proof runs Deconstruct (identity) -> Modify Block -> Update Entity through
  processUpdate and asserts identity.slug preserved while identity.name (list
  source) and identity.reference (tree source) are applied
  (process-definitions.spec.js:121-166; Agent Notes below).

#### Agent Notes — 2026-08-19

Closed the remaining read-modify-write gap for the block editor. The
`record.modifyBlock` node preserves unselected fields (the combined packet
starts from the incoming block and only connected paths are replaced), and
`processBlockInputChanges` at the consuming `effect.updateEntity` node
applies the entity service's writable-field policy: it emits `set` changes
only for writable fields present in the replacement block, so untouched
fields survive without an explicit copy. Graph-level proof:
`server/features/process-definitions/process-definitions.spec.js` runs a real
`startRun` over the chain Deconstruct (identity) -> Modify Block
(`identity.name` fed from a list source) -> Update Entity, asserting
`processUpdate` receives `{identity.uid, identity.name, identity.slug}` with
the source list value applied and the unconnected slug preserved, and that
the persisted entity keeps `identity.slug` after the name change. List/tree
inputs flow through the block socket as a single replacement value
(list/tree composition happens before the block socket), so the v4
set-only semantics remain the only persistence mode.

##### Agent Notes — 2026-08-19 (list/tree field sockets)

The graph-level read-modify-write proof above now feeds both dynamic field
sockets of `record.modifyBlock`: `identity.name` from a `source.literalList`
and `identity.reference` from a `source.literalTree`, both composed before the
block socket. The evaluator still emits one replacement identity block, so the
block socket carries a single replace-only value into `effect.updateEntity`;
`processUpdate` receives `identity.reference` alongside `identity.uid`,
`identity.name`, and the preserved `identity.slug`, and the persisted entity
retains the untouched slug while applying the list and tree values.

##### Agent Notes — 2026-08-19 (section reconciliation)

The Modify Block bullets above are reconciled against repository evidence. TODO
#1 (preserve-unselected) is DONE: the evaluator clones the incoming block and
writes only connected paths, with inputDefaults merged into packets
(`packages/processes/src/evaluator.js:21-22, 116-150`;
`orchestration.js:282-283`), proven at node level by
`evaluator.spec.js:118-136`. TODO #4 (write policy at the consuming persistence
node) is DONE in three layers: Modify Block validation rejects
`writable === false` and managed blocks (`compiler-core.js:3053-3075`);
`effect.updateEntity` rejects blocks outside its writable set and edge
validation rejects composer/modifier wiring whose fields are not writable
(`compiler-core.js:3104-3120, 3241-3272`); the service filters
`field.writable !== false` and applies the field-access policy
(`server/features/process-definitions/service.js:874-884, 1217`). TODO #2/#3
(Unset, Append/Remove) and the explicit-null-vs-Unset half of the
modification-intent TODO are OUT OF SCOPE: the v4 migration rejects any
modifyBlock operation other than `replace` and strips entry.operation/
cardinality (`migration-v4.js:16-25`), the set-only persistence boundary
rejects unsets/undefined (`service.js:1076-1104, 1099`), and collection changes
are composed with list/tree nodes before the block socket
(`processes/README.md:328-333`). The absent=preserve half of the
modification-intent TODO is attributed to TODO #1's implemented preserve
semantics. TODO #5 (full read-modify-write test) is DONE via the separate
graph-level test piece: `process-definitions.spec.js:121-166` chains
Deconstruct -> Modify Block -> Update Entity through `processUpdate` with list
and tree field inputs and asserts `identity.slug` is preserved.

## P0 — complete persistence operations

### Create Entity

- [ ] Make a fresh graph able to create every process-creatable domain entity
  through either generic canonical blocks or an explicit typed construction
  mode. Do not depend on legacy Entity/Action/Service canvas records being
  preseeded by a template.
- [ ] Project exact constructor sockets, requiredness, creator constraints,
  accepted attachment/entity kinds, and domain defaults from the selected
  construction contract.
- [ ] Accept constructible blocks, Lineage, Relations, initial status, and typed
  constructor inputs without duplicating leaf fields on the persistence node.
- [ ] Validate parent/ancestor requirements and compile Lineage bindings from
  actual connected lineage data, not entity-name special cases.
- [ ] Return the created typed entity with the same item/list/tree topology as
  its construction inputs and publish normal entity invalidation events.
- [ ] Test root creation, child creation, relation-bearing creation, typed
  derived construction, collection creation through mapped inputs, denied
  creation, and generated manual forms.

### Modify Entity

- [x] DONE 2026-08-19 (already implemented) — Require a typed current
  entity/reference and accept only blocks writable for that entity type.
  Preserve all unconnected blocks. The `effect.updateEntity` entity socket is
  a required typed entityRef (node-catalog.js:621-627); the compiler rejects
  updateEntity nodes with no writable block or status target and blocks
  outside the writable set (compiler-core.js:3085-3120); at runtime
  `processBlockInputChanges` emits set-changes only for writable fields
  present in the incoming block and `processUpdate` patches a clone of the
  full document, so untouched blocks survive (service.js:1211-1230;
  process-update-handler.js:37-55; graph proof process-definitions.spec.js).
- [x] DEFERRED 2026-08-19 — Support one entity with one block, a list/tree of
  entities with aligned block changes, and scalar/block broadcasting through
  the common solver. Effect nodes execute exactly once per control token with
  every input flattened via `packetValue(packet, 'item')`, which throws for
  list/tree inputs (orchestration.js:153-162; data-tree.js:31-41). The
  effect-mapping contract belongs to the unchecked "Item/list/tree
  persistence semantics" P0 section above; this bullet is tracked there and
  must not be solved locally by special-casing updateEntity.
- [x] DONE 2026-08-19 (already implemented) — Keep ordinary metadata mutation
  separate from status transition so each re-enters its correct service
  boundary. When one authored action requests both, use the existing
  transactional status-plus-patch boundary and fail rather than partially
  applying it where transactions are unavailable. The combined path routes
  through `statusService.transitionWithResult` with the block patch
  (service.js:1076-1089); `performTransition` writes status event plus entity
  snapshot with preferTransaction and throws rather than partially applying
  (machines/service.js:457-469, 498-515). A separate `effect.changeStatus`
  node exists for status-only mutations (node-catalog.js:628-632;
  service.js:1107-1120).
- [x] DONE 2026-08-19 — Return updated typed entities, not opaque success
  flags, so downstream reads and generated screens receive current DTOs. The
  plain-metadata path already returned the `processUpdate` DTO
  (process-update-handler.js:52-54); the status-plus-patch path leaked the
  raw `transitionWithResult` wrapper `{entity, status, actions, effects}`
  where the catalog declares a non-nullable entity result
  (node-catalog.js:727-730; orchestration.js:249-266). Fixed: the status
  branch now returns `result.entity` (service.js:1081-1089). Graph-level
  proof in process-definitions.spec.js asserts a Modify Entity node with
  both writable blocks and a status target emits the patched typed entity
  DTO with identity fields preserved and no wrapper keys.
- [x] DONE 2026-08-19 (output shape) / OUT OF SCOPE (Unset, Append/Remove) —
  Test identity/data/spec/relation changes, explicit Unset, collection
  Append/Remove, denied fields, stale refs, and item/list/tree output shape.
  Identity-block changes and item output shape (including the combined
  status-plus-patch shape) are covered by the graph-level specs in
  process-definitions.spec.js; denied fields are covered by the writable-set
  compiler/service rejection evidence in bullet 1; stale refs already throw
  at the persistence boundary (process-update-handler.js:39). Explicit Unset
  and collection Append/Remove are out of scope per the Modify Block
  decision: the v4 migration rejects any non-`replace` operation
  (migration-v4.js:16-25) and the persistence boundary rejects unsets
  (service.js:1092-1102). List/tree output shape is deferred with bullet 2
  to the "Item/list/tree persistence semantics" section.

#### Agent Notes — 2026-08-19

Reconciled the Modify Entity bullets against repository evidence and fixed
the one real defect. Bullets 1 and 3 were already satisfied (typed entityRef
socket, writable-set enforcement, preserve semantics, and the transactional
status-plus-patch boundary with hard failure when transactions are
unavailable). Bullet 4 had a genuine contract break: the status-plus-patch
branch of `effect.updateEntity` returned the raw `transitionWithResult`
wrapper while the catalog declares a non-nullable typed entity result, so
downstream nodes received `{entity, status, actions, effects}` where an
entity was declared. The branch now returns `result.entity`
(service.js:1081-1089); the wrapper's entity field is the post-transition
snapshot with the patch applied, so unwrapping loses no state and changes no
persistence or authorization behavior, and `effect.changeStatus` keeps its
own contract untouched. Added a graph-level spec that runs a Modify Entity
node with both a writable identity block (Deconstruct -> Modify Block chain)
and a status target through `startRun`, asserting the emitted step output is
the patched typed entity DTO (identity.slug preserved, list/tree field
values applied, status transitioned, no `actions`/`effects` wrapper keys).
Bullet 2 and the list/tree half of bullet 5 are deferred to the unchecked
"Item/list/tree persistence semantics" P0 section, which owns the
effect-mapping contract for multi-item inputs; the Unset and Append/Remove
halves of bullet 5 stay out of scope per the Modify Block replace-only
decision.

### Relations and lineage

- [ ] Treat Lineage construction as ancestry and Relations as associations.
  Do not add generic parent dropdowns or infer containment from arbitrary
  relation names.
- [ ] Provide explicit Link and Unlink authoring through typed relation block
  modification or the smallest derived action contract. Both paths must use
  declared owner/target types and service authorization.
- [ ] Support one-to-one and one-to-many relation values, including building a
  persisted relation array from a data-tree list through Collect Array.
- [ ] Prevent cross-organization links unless the domain operation explicitly
  permits transfer through a socket/service boundary.
- [ ] Test link, unlink, replace, duplicate prevention, missing targets,
  reverse/display projection, and lineage-scope effects.

### Status, archive, and delete

- [ ] Keep initial status on Create and workflow transition on existing
  entities as separate typed operations. Status changes must use the status
  engine, transition authorization, lifecycle evidence, and history.
- [ ] Fix workflow compilation so every authored v2 region, state, transition,
  hook, lifecycle schema, and access contract is preserved. Never collapse a
  multi-region workflow into `regions.main`.
- [ ] Model archive through a domain workflow state/intent when that is the
  entity's contract. Do not silently equate archive with hard deletion.
- [ ] Add Delete Entity only for entity types whose process capabilities and
  registered service explicitly allow hard deletion. Generated UI must require
  an authorized manual action and confirmation.
- [ ] Map item/list/tree status and delete inputs below the node language and
  return updated/deleted refs in corresponding topology.
- [ ] Test multi-region status changes, evidence-required transitions,
  archive, denied transitions, deletable and non-deletable types, and collection
  inputs.

## P1 — make organization scope authorable and reviewable

- [ ] Expose the access engine's real grant dimensions in typed controls where
  the process needs them: feature/level, entity or lineage scope, allowed
  actions, status windows, transitions, and composable rules. Do not use raw
  grant JSON.
- [ ] Keep organization roles as identities and Team assignments as user data.
  The graph may reference role IDs and `$assignment.*` values but must not
  create user-assignment nodes.
- [ ] Make entity-profile, action, status-transition, and screen access
  contributions visible in one derived role summary. Label which authored
  record contributed each effective permission.
- [ ] Stop screen layout from silently granting backend capability. Either make
  screens consume already-authored grants or make any generated grant an
  explicit, separately confirmed access edit.
- [ ] Discover required assignment binding keys from every supported location:
  screen route/scope/bindings, source identifiers, source filters, access
  scopes, and rules.
- [ ] Add “preview as assignment” using a concrete set of role IDs and bindings.
  Show accessible entities, fields, transitions, actions, screens, and the
  explanation for each allow/deny result.
- [ ] Test users with one role, several additive roles, overloaded assignments,
  missing bindings, status-scoped access, lineage-scoped access, and owner
  recovery authority.

## P1 — complete generated interface construction

- [ ] Expose the complete semantic screen source contract: stable id/label,
  entity type, list/single mode, required access, identifier, filters, and
  assignment bindings.
- [ ] Expose the complete region contract: stable id/label, template slot,
  source, domain surface, and independent action list. Do not copy the screen's
  global action list into every region.
- [ ] Support arbitrary typed screen bindings instead of only
  `bindings.entityId`, with autocomplete from the selected template, sources,
  lineage, and assignment requirements.
- [ ] Validate unique source/region IDs, required single-source identifiers,
  filter types/placeholders, surface registry values, region action IDs,
  template slot/cardinality rules, and unresolved assignment bindings before
  activation.
- [ ] Generate manual CRUD forms from unconnected promptable inputs with shared
  typed controls. Entity refs/lists use entity pickers; scalar, enum, date,
  number, Boolean, and schema fields use ordinary PrimeVue controls.
- [ ] Refresh or patch every affected generated source after mapped create,
  modify, status, relation, or delete results. Do not require a full page reload
  to observe a successful procedural action.
- [ ] Add concrete-role/user previews and browser tests for list, detail,
  workspace, table, and form-action templates with filters, bindings, regional
  actions, CRUD forms, and denied actions.

## P1 — validation and diagnostics

- [ ] Make Apply validate the complete fresh-graph path: domain capabilities,
  required value availability, typed connections, collection alignment,
  block policy, entity service bindings, workflow preservation, access, screens,
  and semantic canvas round-trip.
- [ ] Add unreachable/dead-end diagnostics for values that cannot reach a
  persistence or visible output. Keep an intentionally inspectable pure-data
  subgraph valid, but report it as non-operational.
- [ ] Make Output Preview evaluate all pure/read nodes over item/list/tree data
  and show branch paths, item counts, sampled typed values, null/missing state,
  and field-access redaction. It must never execute persistence effects.
- [ ] Add a semantic Apply diff: changed CRUD capabilities, grants, workflows,
  screens, actions, field policies, and entity statuses that would become
  invalid. Require a migration decision when active entities use removed
  workflow states.
- [ ] Decide one activation artifact authority. Either execute the immutable,
  versioned compiled snapshot or remove it and explicitly version runtime
  recompilation; do not store one contract while silently executing another.

## P2 — remove misleading and unnecessary surface area

- [ ] Reduce the primary collection palette to operations required by the CRUD
  paths above: Make List, Collect/Expand Array, Concat, Filter/Dispatch, Sort,
  Item At, Slice, Count, Distinct, and Group By.
- [ ] Remove or hide Reverse, Shift, Partition, Flatten, Graft, Simplify, Branch,
  Transpose, Clean, and Tree Statistics until a documented procedural entity
  case requires them. Do not create an “Advanced” drawer merely to retain
  unused nodes.
- [ ] Remove legacy Action, Entity, Service, Socket, Value Input, Role, and User
  canvas components/inspectors after migration proves current v4 semantic
  records no longer need them. Definition-plane resources belong in focused
  panels, not duplicate executable nodes.
- [ ] Keep Run Service as one typed command leaf operation required by a CRUD
  path. Do not add service lifecycle, scheduling, worker, retry, or queue
  management to the Process Designer.
- [ ] Split `pages/organization/process.vue` by real ownership: node-record
  factories/synchronization, entity/block inspector, roles/access, screens,
  workflow/statuses, graph interaction, preview, and persistence. The page must
  remain the composition root.
- [ ] Use ordinary PrimeVue controls for scalar/enum/role/schema/process-record
  choices and shared entity pickers only for canonical entity DTO/reference
  choices.
- [ ] Remove stale documentation and archived-plan claims that imply event
  automation, waits, durable runs, or complete CRUD paths that current UI and
  runtime cannot demonstrate.

## Required acceptance matrix

No task set is complete until the following processes can be built from New
Draft, saved, applied, assigned to a user, opened through generated UI, and run
without editing JSON or seeding legacy canvas records.

- [ ] Find all readable entities of a type, read a scalar field, filter by two
  composed conditions, sort by another field in both directions, take a window,
  and render the result.
- [ ] Find one entity by typed reference and by ID, read each canonical block,
  and distinguish missing, nullable, and populated fields.
- [ ] Traverse from an entity to its parent, children, and declared relations,
  then filter and sort the related entities.
- [ ] Compose fixed and open blocks from scalar, entity-ref, list, and
  array-valued inputs; create one entity and a mapped list/tree of entities.
- [ ] Read an existing block, replace one field, unset another, append/remove a
  collection element, persist the change, and prove untouched fields survive.
- [ ] Create a child with canonical Lineage, link and unlink declared Relations,
  and reject an undeclared or cross-organization association.
- [ ] Set initial status, perform an authorized status transition with required
  evidence, preserve secondary workflow regions, and archive through a declared
  lifecycle intent.
- [ ] Delete an explicitly deletable entity and prove Delete is unavailable for
  an entity without that capability.
- [ ] Apply the same Create, Modify, Status, and Delete nodes to item, list, and
  branched-tree inputs without adding iteration/control nodes.
- [ ] Assign two roles and bindings to one user, prove additive scoped access,
  and explain why each CRUD action, field, status transition, and screen is
  visible or denied.
- [ ] Build list/detail/workspace screens with source filters, single-source
  identifiers, arbitrary bindings, independent region actions, and generated
  typed CRUD forms.
- [ ] Start from an empty process and use a registered typed command needed by
  an entity procedure without manually creating hidden entity-profile, service,
  or socket records.

## Implementation protocol

- [ ] Implement tasks in dependency order: truthful contracts, entity sources
  and selection, block transformations, persistence, access, interfaces,
  diagnostics, then cleanup.
- [ ] For each completed task, add a child **Agent Notes** section here with the
  date, exact checkbox, files changed, migrations, validation, and acceptance
  path demonstrated. Change only tasks owned by the implementing session.
- [ ] Update the canonical README for every changed architecture or contract;
  link to it from Agent Notes instead of duplicating it here.
- [ ] Replace changed persisted/API/runtime contracts and migrate current data
  in the same task. Do not add legacy fallbacks, dual reads, or adapter shims.
- [ ] Run focused package/evaluator/compiler/service/UI tests for each task,
  `node scripts/check-arch.js` for backend changes,
  `npm run framework:validate` for framework/package contracts, and
  `node scripts/check-docs.js` before every documentation commit.
- [ ] Treat catalog/source assertions as boundary checks only. Browser evidence
  owns fresh-graph interaction; compiler/evaluator/service tests own semantics;
  the acceptance matrix owns end-to-end completion.
