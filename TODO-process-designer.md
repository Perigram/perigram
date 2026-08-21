# TODO: Process Designer procedural entity CRUD

Status: READY

This plan completes the Process Designer as a procedural entity-dataflow
authoring surface. The target is exhaustive composition of organization-scoped
entity reads, selection, canonical-block transformations, persistence, role
access, and generated interfaces. Long-running service orchestration is not the
priority of this plan, except for the exact async service-completion boundary
defined under Producer-scoped entity workflows.

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
  general-purpose wait nodes, retry-control nodes, compensation nodes, or
  service-management UI as prerequisites for this plan. Durable suspension is
  limited to a Run Service invocation whose declared completion outputs are
  consumed by the graph.

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

- [x] Define one lower-level effect-mapping contract used by Create, Modify,
  and Change Status (Delete remains deferred by the recorded verdict). Item
  inputs map over aligned packets, the output preserves branch paths and item
  order, and no mutation node contains its own loop implementation.
- [x] Define multi-input matching for persistence nodes. Item values may
  broadcast over an entity list; aligned lists follow the chosen matching
  rule; incompatible branch lengths or unsafe Cross mutation must fail before
  the first write.
- [x] Define mutation failure reporting below the graph language. Return the
  operation, branch path, item index, entity ref when known, and underlying
  service error. Do not add success/failure fan-out nodes merely to represent
  collection execution mechanics.
- [x] Do not claim collection-wide atomicity when mutations are separate
  service calls. Make the execution result identify completed mutations if a
  later item fails, and make generated UI refresh those entities.
- [x] Test the same mutation contract with item, list, branched tree, broadcast
  scalar, and aligned value-tree inputs; verify Create, Modify, and Status use
  it. Delete coverage remains deferred with `effect.deleteEntity`.

#### Agent Notes — 2026-08-21

Implemented the recorded effect-mapping verdict without adding mutation-specific
loops or a Delete node. `executeProcessEffectNode` in
`packages/processes/src/evaluator.js` preflights scalar-or-aligned branch/item
lengths and branch paths, rejects Cross before invoking the adapter, obtains the
per-item invocation plan from `solveDataTrees`, and runs one authorized effect
call per aligned tuple. Create Entity, Modify Entity, and Change Status delegate
through that mapper in `orchestration.js`; other effects keep their existing
singular contracts. A preflight failure fails the step and run before the first
write, so incompatible branch lengths or unsafe Cross matching never partially
persist.

Run-status semantics for mapped mutations: a step whose aligned calls all
succeed keeps the historical output contract byte-for-byte — one aligned item
yields the bare structuredCloned effect result (and the step idempotency key is
reused unchanged), a list/tree input yields the bare shape-preserving data
tree. A step with any failed aligned item still completes (the run continues)
and its output becomes `{ result, failures, completedMutations }`: `result` is
the shape-preserving tree with each failed slot carrying its own
`{ operation, branchPath, itemIndex, entityRef?, error }` MutationFailure
record, `failures` is the flat record list, and `completedMutations`
identifies every write that finished. Calls continue after an item failure and
completed writes stay applied — nothing claims or implies collection-wide
atomicity or rollback. Downstream data outputs consume the unwrapped result
tree. `GeneratedScreen` applies each completed item (slots without an `error`
payload) to matching loaded sources and only opens a create detail route when
the mapped result has exactly one completed entity.

Coverage: `evaluator.spec.js` runs one mutation contract against item, list,
scalar-broadcast, aligned value-tree, and branched-tree inputs, asserts the
zero-failure bare outputs, the strict preflight rejections (no write
attempted), and partial-failure reporting including the single-failed-item
envelope; `orchestration.spec.js` proves Create, Modify, and Change Status
route through the mapper, that a later item failure completes the step with
the failure-carrying output while the run proceeds, and that misaligned inputs
fail the run before the first `executeEffect` call. Hard deletion remains
deferred until the capability, node, confirmation, and execution contract
exists.

#### Agent Notes — 2026-08-21 (effect socket access declaration)

Closed the remaining wiring half of this section: Create Entity, Modify
Entity, and Change Status input sockets now declare List access in
`effectInputs` (`packages/processes/src/node-catalog.js`), so list and tree
sources are advertised and wire validly into mutation sockets while edge
compatibility stays type-based (`processSocketsCompatible`/
`portSpecsCompatible` unchanged). A single item source remains valid as one
broadcast item: run-context values and authored `inputDefaults` scalars on
these sockets wrap as one-item packets instead of throwing list arity errors
(`runContextPacket` in `orchestration.js`, scalar-tolerant default
normalization in `compiler-core.js`), and a scalar fallback on a
List/Tree-declared socket satisfies required-input availability by the scalar
rules — only actual arrays/trees use the collection non-empty rule. The
designer keeps inline scalar fallback editors on mapped mutation sockets
(`ProcessNode.vue`). `node-catalog.spec.js` asserts the List declarations and
that item, list, and tree sources are all compatible with Modify Entity
sockets; the existing orchestration specs prove scalar run-context entities
and scalar defaults still drive Modify/Change Status unchanged. Delete
remains deferred; `effect.runProducer`, `sendEntity`, `generateAttachment`,
and `runCommand` keep item access because they do not route through the
mapper.

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

- [x] Expose Make List only where authors need to combine several independent
  item values into one data-tree list. Its number of inputs must be explicit
  and stable; do not permit several wires into an ordinary single-value socket.
- [x] Keep Concat for joining existing lists, and verify it retains item type,
  branch topology, and order.
- [x] Keep Collect Array/Expand Array as the explicit persisted-array boundary.
  Add array/map value-type authoring where a canonical block field or command
  input actually declares those types; do not treat arbitrary JSON text as a
  typed array.
- [x] Test construction of relation arrays, attachment arrays, command
  entity-list inputs, empty lists, and mixed incompatible element types.

#### Agent Notes — 2026-08-21

Implemented the recorded verdict (run 2026-08-19): Make List is a fixed
input-count constructor with exactly four optional item sockets
(`item1`–`item4`, exported as `MAKE_LIST_INPUTS` from
`packages/processes/src/node-catalog.js`), each a non-multiple single-value
socket so connection validation rejects a second wire like any other
single-value input. The node now appears first in the designer palette's
Lists/trees group (`designer.js`), the catalog emits the four item sockets
plus one list output (`node-catalog.js`), the evaluator consumes connected
and authored-fallback sockets in socket order via `solveDataTrees` and a
fully unconnected Make List evaluates to the empty list (`evaluator.js`,
`orchestration.js` inputless-evaluation allowance), and connection inference
treats the four sockets as generic-type drivers like the former `value`
socket (`useProcessDesignerConnectionInference.js`). The inspector needed no
change: `ProcessNode.vue` renders catalog-resolved ports and the generic
inline fallback editor already covers optional primitive sockets. Concat,
Collect Array, and Expand Array were not changed; their behavior is pinned by
tests instead — Concat order/branch-topology/empty-side joins and Collect/
Expand round-trip including the empty array and non-array rejection
(`evaluator.spec.js`), plus Concat's two-list catalog contract
(`node-catalog.spec.js`). Construction coverage added: relation arrays and
attachment arrays (Make List → Collect Array → Compose Block relations/
attachments), command entity-list input arrays, empty lists, and mixed
incompatible element types rejected at edge validation
(`v4-validation.spec.js`), plus the one-wire-per-socket accept/reject pair.

## P0 — complete canonical-block CRUD

### Decompose and read

- [ ] Make Deconstruct Entity accept item/list/tree entities and emit each
  declared canonical block with identical topology.
- [ ] Make Get Block equivalent for one selected block and reject blocks not
  declared by the incoming entity contract.
- [ ] Make Get Field consume fixed and open canonical blocks without storing
  schema snapshots. Restore typed entity refs for Lineage/Relations and typed
  attachment/array/map values where declared.
- [x] Distinguish a missing field from a present nullable field in preview and
  evaluator results so Logic, fallback values, Unset, and validation behave
  predictably.

#### Agent Notes

- 2026-08-21 (agent/missing-field-serializer-20260821): implemented the
  missing-vs-nullable distinction per the accepted correction direction.
  `readPath` in `packages/processes/src/evaluator.js` now returns a frozen
  `$missingField` marker (plain object, so it survives the packet pipeline's
  `structuredClone` calls) when a path segment is absent, including below a
  present `null`; `packages/processes/src/missing-field.js` owns the marker,
  `isMissingField`, and `serializeProcessResult`, the single conversion point
  that rewrites markers to the serializable tag `{ missing: true, path }` at
  emission boundaries. Logic `isNull`/`isNotNull` are strict (`null` only for
  present null), Coalesce and required validation treat missing as absent,
  Required/validation errors name the missing path, patch append/remove and
  Compose/Modify Block treat missing as absent content (markers are never
  written into entities). The process-definitions preview and manual-run
  service responses emit through `serializeProcessResult`. Tests:
  `packages/processes/src/missing-field.spec.js` (13 tests) and a
  preview-path round-trip test in
  `server/features/process-definitions/process-definitions.spec.js` asserting
  both the missing tag and a present null survive JSON unchanged. The other
  four bullets of this section remain open; the pre-existing
  activation-protocol test failure noted on 2026-08-15 is unchanged and
  unrelated.

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

- [x] Make a fresh graph able to create every process-creatable domain entity
  through either generic canonical blocks or an explicit typed construction
  mode. Do not depend on legacy Entity/Action/Service canvas records being
  preseeded by a template.
- [x] Project exact constructor sockets, requiredness, creator constraints,
  accepted attachment/entity kinds, and domain defaults from the selected
  construction contract.
- [x] Accept constructible blocks, Lineage, Relations, initial status, and typed
  constructor inputs without duplicating leaf fields on the persistence node.
- [x] Validate parent/ancestor requirements and compile Lineage bindings from
  actual connected lineage data, not entity-name special cases.
- [x] Return the created typed entity with the same item/list/tree topology as
  its construction inputs and publish normal entity invalidation events.
- [x] Test root creation, child creation, relation-bearing creation, typed
  derived construction, collection creation through mapped inputs, denied
  creation, and generated manual forms.

#### Agent Notes — 2026-08-21

Closed all six Create Entity bullets under the fixed no-`parentEnforcement`
verdict. The registry matrix in `server/runtime/app-registry.spec.js` now walks
all 14 creatable CNC contracts and every mode, proving normalized requiredness,
defaults, creator/attachment restrictions, typed entity and accepted-kind
references, constructible block sockets (including open Lineage/Relations),
List access, initial status, runtime handler parity, and the deliberate absence
of `parentEnforcement`. Existing focused graph specs remain the executable
evidence for root creation, Project -> Compose Lineage -> child creation,
relation-bearing creation, graph-derived Lineage bindings, and mapped
item/list/tree output; no duplicate runtime path was added.

The open generated-form investigation is closed by extracting the existing pure
field/payload logic to `components/generated/action-inputs.js` and testing both
generic block-composed and typed-reference/upload-backed Create forms. Manual
execution denial is now explicit acceptance coverage for the existing compiled
role-assignment gate and request-local constructor grants. The one actual
runtime divergence was repaired in
`server/features/process-definitions/service.js`: a successful Create now
publishes the normal typed `created` invalidation after constructor, block, and
optional initial-status persistence succeeds. The returned DTO/data-tree shape
is unchanged. Validation: `packages/processes/src` 310/310 tests; Create
registry/manual-form tests 13/13; denied manual Create test 1/1;
`node scripts/check-arch.js`, `npm run framework:validate`, and
`node scripts/check-docs.js` all pass.

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

- [x] Treat Lineage construction as ancestry and Relations as associations.
  Do not add generic parent dropdowns or infer containment from arbitrary
  relation names.
- [x] Provide explicit Link and Unlink authoring through typed relation block
  modification or the smallest derived action contract. Both paths must use
  declared owner/target types and service authorization.
- [x] Support one-to-one and one-to-many relation values, including building a
  persisted relation array from a data-tree list through Collect Array.
- [x] Prevent cross-organization links unless the domain operation explicitly
  permits transfer through a socket/service boundary.
- [x] Test link, unlink, replace, duplicate prevention, missing targets,
  reverse/display projection, and lineage-scope effects.

### Status, archive, and delete

- [ ] Keep initial status on Create and workflow transition on existing
  entities as separate typed operations. Status changes must use the status
  engine, transition authorization, lifecycle evidence, and history.
- [x] Fix workflow compilation so every authored v2 region, state, transition,
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

#### Agent Notes

2026-08-19 — completed the workflow-compilation checkbox above; verified the
first and third checkboxes are already satisfied by existing architecture.

- Region preservation: `packages/processes/src/compiler-core.js`
  `workflowBuilderFromWorkflow` now seeds a builder per region in
  `workflow.regions` instead of reading only the primary region, and
  `compileWorkflows` re-emits every region with the source `primaryRegion` and
  carries workflow-level contracts (top-level keys beyond the v2 structural
  fields) plus region-level metadata into the emitted machine. Synthesized
  action states/transitions land in the primary region; sibling regions pass
  through unchanged. Coverage: `packages/processes/src/index.spec.js` asserts
  the full region map, `primaryRegion`, and workflow-level contracts for custom
  lifecycles, and that action-synthesized transitions do not drop sibling
  regions. See [packages/processes/README.md](./packages/processes/README.md).
- Create-vs-transition separation (first checkbox) is already satisfied: the
  node catalog has a dedicated `effect.changeStatus` node distinct from create
  (`packages/processes/src/node-catalog.js`); runtime creation calls
  `statusService.setInitialStateForOrganization` and transitions call
  `statusService.transitionWithResult` with source `process-run`
  (`server/features/process-definitions/service.js`), i.e. through the status
  engine with hooks, lifecycle validation, and `status_events` history per
  [server/core/machines/README.md](./server/core/machines/README.md).
- Archive-as-state (third checkbox) is already satisfied structurally:
  `packages/processes/src/capabilities.js` derives archive only when the runtime
  binding allows it and a workflow region has an `ARCHIVED` state, the designer
  exposes `archivableEntityOptions`, and archive executes as a normal status
  transition to `ARCHIVED` through the status engine — never as hard deletion.
  A dedicated archive intent node and an end-to-end archive spec remain open
  under the test checkbox below.

## P1 — make organization scope authorable and reviewable

### Agent Notes

- 2026-08-19: Bullet 3 (derived role summary with contributor labels) is
  partially implemented: `shared/role-access-summary.js` now provides one
  annotated derived-summary implementation covering entity profiles, screens,
  actions, and workflow transitions, with every line naming its contributing
  record (authored grant, screen-derived grant from `screen.required`,
  status-window rule, or level fallback). The Team page role dialog
  (`pages/organization/users.vue`) renders from it and no longer carries a
  local `derivedRoleAccessSummary`; transition lines come from the compiled
  workflow contract of the active process. Remaining for the bullet: swap the
  process designer's local `roleAccessSummary` in
  `pages/organization/process.vue` onto the same shared implementation so both
  surfaces consume one source. Other bullets in this section were reviewed and
  remain open (typed grant-dimension controls, silent screen-derived grants,
  complete `$assignment` binding discovery, assignment preview explanations,
  access test matrix); the roles-as-identities bullet is already enforced by
  compiler/spec invariants and reads as a keep constraint.

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
- [x] DONE 2026-08-20 — Validate unique source/region IDs, required
  single-source identifiers, filter types/placeholders, surface registry
  values, region action IDs, template slot/cardinality rules, and unresolved
  assignment bindings before activation. `validateScreenContract` now rejects
  duplicate source/region ids, single-mode sources without a resolvable
  identifier, non-scalar identifiers/filter values, non-object filter maps,
  malformed/empty `$screen.*`/`$assignment.*` placeholders, `$screen.bindings.*`
  references to undeclared bindings, region surfaces outside the new canonical
  `SCREEN_REGION_SURFACES` registry, region-level action ids missing from the
  process action manifest, `workspaceLanes` slot/cardinality violations, and
  statically unresolvable screen bindings (screen-contract.js:51-172;
  screen-contract.spec.js; Agent Notes below).
- [x] DONE 2026-08-20 — Generate manual CRUD forms from unconnected promptable
  inputs with shared typed controls. Entity refs/lists use entity pickers;
  scalar, enum, date, number, Boolean, and schema fields use ordinary PrimeVue
  controls. Boolean prompt fields now render a ToggleSwitch, date/dateTime
  fields a DatePicker (time only for dateTime), and object/json fields the new
  generic `GeneratedObjectInput` structured editor (schema-driven typed rows,
  key/value rows otherwise, raw JSON textarea only as fallback)
  (components/generated/GeneratedScreen.vue:160-176, 568-580, 756-785;
  components/generated/GeneratedObjectInput.vue; Agent Notes below).
- [x] DONE 2026-08-20 — Refresh or patch every affected generated source after
  mapped create, modify, status, relation, or delete results. Do not require a
  full page reload to observe a successful procedural action. Browser proof: a
  mapped relation action's owner snapshot patches the project card in place —
  no source list refetch, no page reload
  (e2e/process-generated-screen.spec.js "patches the affected list source in
  place after a mapped relation action result"; Agent Notes below).
- [x] DONE 2026-08-20 — Add concrete-role/user previews and browser tests for
  list, detail, workspace, table, and form-action templates with filters,
  bindings, regional actions, CRUD forms, and denied actions. Browser matrix
  delivered over every screen variant the active compiled process instantiates:
  all seven `entityList` endpoints (contracted source endpoint, access-rule
  status filter, toolbar create action, denied delete), `entityDetail` with
  single-source `$screen.scope.entityId` identifier resolution, filtered child
  sources, and region-scoped actions, `entityDetail` without contracted
  actions, the `home` screen's per-source sections, and the create-form
  prompt-post + created-entity detail navigation
  (e2e/process-generated-screen.spec.js; Agent Notes below). Residuals
  dispositioned in the closeout Agent Notes: `workspaceLanes`/`table`/
  `formAction` templates have no authored screens in the seeded process to
  drive, and concrete-role/user previews do not exist as a designer feature;
  both are process-authoring/designer work, not test gaps.

### Agent Notes — 2026-08-20

Reconciled all seven checkboxes against current code before implementing
(session scope: the pre-activation validation rule set):

1. **Source contract exposure — still open (UI gap).** The contract schema and
   compiler already carry the full source shape (id/label/entityType/mode/
   required/identifier/filters/lineageBindings;
   packages/processes/src/screen-contract.js:94-136, compiler-core.js:1953-1985),
   but the designer screens tab only edits entityType+mode per source
   (pages/organization/process.vue:850-887).
2. **Region contract exposure — still open (UI gap + defect).** Same schema
   support exists for regions, but `syncSelectedScreenUi` copies the screen's
   global actions into every region on each sync
   (pages/organization/process.vue:2542-2545, 2566-2581) — the exact behavior
   this checkbox forbids.
3. **Arbitrary typed bindings — still open (UI gap).** Bindings editing is a
   single InputText bound to `bindings.entityId`
   (pages/organization/process.vue:850-887). The compiler/runtime already
   resolve arbitrary binding keys.
4. **Pre-activation validation — DONE (this session).** See checkbox above.
   `SCREEN_REGION_SURFACES` (`card`, `compact`, `detail`, `table`, `workspace`)
   is the canonical shared surface registry exported from
   `packages/processes/src/screen-contract.js`; the designer page now consumes
   it instead of a hardcoded list (pages/organization/process.vue:954, 1141).
   Enforcement flows through the existing activation path unchanged:
   `validateProcessDefinition` → `validateScreenContract`
   (packages/processes/src/compiler-core.js:599-609), reached by
   `compileProcessDefinition` (throws on errors) and the server activation
   adapter `validateActivatableProcess`
   (server/features/process-definitions/compiler-adapter.js:21-42). Slot/
   cardinality is scoped to `workspaceLanes` (`main`/`left`/`center`/`right`,
   one region per slot) because that renderer keys regions by slot and would
   silently drop duplicates; other templates render all regions.
   "Unresolved bindings" is enforced statically: binding values must be
   literal scalars or `$assignment.<key>` references, and `$screen.bindings.*`
   placeholders in identifiers/filters must reference declared bindings.
   Per-assignment key absence cannot be activation-rejected (assignments are
   runtime data) and remains a compile-time skip with `incompleteBindings`
   diagnostics (packages/processes/src/index.spec.js:1612-1643).
5. **Generated typed CRUD forms — still open.** Manual prompt form exists with
   entity/entityList pickers, enum Select, number/text InputText, object
   Textarea (components/generated/GeneratedScreen.vue:117-238); boolean and
   date/date-time controls for ordinary prompt fields are missing, and
   schema/object fields remain raw JSON.
6. **Post-action refresh/patch — appears already implemented, needs browser
   proof.** applyActionResult patches owner/created/entity snapshots,
   useGeneratedScreen patches/removes matching source items with filter-match
   insertion, and an onEntityChanged listener refreshes affected sources
   (components/generated/GeneratedScreen.vue:480-493;
   composables/useGeneratedScreen.js:68-130). Left unchecked pending browser
   evidence owned by checkbox 7.
7. **Template-matrix browser tests — still open.**
   e2e/process-generated-screen.spec.js holds only one endpoint smoke test.

Validation: `npx vitest run packages/processes` (265 passed, incl. 24
screen-contract specs covering every new rule plus activation-path rejection
through `validateProcessDefinition`/`compileProcessDefinition`);
`npx vitest run server/features/process-definitions` (25 passed, 1
pre-existing unrelated failure: "rejects activation when the authored graph
is not the current protocol" fails with "Permission denied" on the base
checkout too). Architecture contract documented in
packages/processes/README.md (screen records section).

### Agent Notes — 2026-08-20 (typed prompt controls)

Session scope: checkbox 5 (generated typed CRUD forms) only; the remaining
open checkboxes (1-3, 6-7) are designer-UI and browser-test concerns outside
this session's assignment.

5. **Generated typed CRUD forms — DONE (this session).** The per-type control
   mapping in `components/generated/GeneratedScreen.vue` was extended in
   place, following the established convention and the `ProcessNode.vue`
   literal-input precedent (ToggleSwitch for boolean, DatePicker with
   `show-time` for dateTime, `hour-format="24"`). No new domain-specific
   hardcoded cases were added; every control is keyed purely off field
   type/schema. Decisions on the two deferred refinements:
   - **Boolean tri-state:** untouched boolean fields initialize to `null`
     and are omitted from the submission payload; the ToggleSwitch resolves
     to a real boolean only once touched. This avoids silently posting
     `false` over server-side state on update actions.
   - **Object-editor nesting/coercion:** `GeneratedObjectInput.vue` renders
     schema-driven typed rows when the field carries a JSON schema whose
     declared properties cover the current value, otherwise add/removable
     key/value rows. Nesting is handled by single-line JSON text at the leaf
     level (parsed back on emit), not recursive rows; scalar coercion is
     `JSON.parse` with plain-string fallback. The raw JSON textarea remains
     only for values that do not fit the structured model (non-object or
     unparseable). Empty object values are now omitted from submission
     instead of posting `{}`.
   Relation-creator inline fields (the embedded create-related-entity form)
   keep their existing InputText fallback; they are a separate special-case
   surface and were out of scope.

Validation: `npx vitest run components/generated` (41 passed); SFC compile
check for both touched components; `npx vitest run shared/localization.spec.js`
(3 passed, 1 pre-existing failure covering only untouched files:
FacadeDesigner.vue, QueueEditor.vue, SheetDesignEditor.vue, ui-lab.vue);
`node scripts/check-docs.js` (passed). Control contract documented in
components/generated/README.md (Manual Prompt Forms section).

### Agent Notes — 2026-08-20 (P1 closeout reconciliation)

Session scope: documentation closeout for the whole section. Every checkbox was
re-verified against the current checkout before disposition; no runtime or
designer code changed in this session, so the docs commit is the only commit.

1. **Source contract exposure — deferred with reason.** Re-verified: the gap
   is UI-only (schema/compiler already carry the full source shape;
   packages/processes/src/screen-contract.js:94-136), and the designer screens
   tab still edits only entityType+mode (pages/organization/process.vue:850-887).
   Reasonable and worth implementing, but it is a dedicated designer-UI session
   (source id/label, required access, identifier, filters, assignment bindings
   editors), not a documentation change. Left open.
2. **Region contract exposure — deferred with reason; live defect confirmed.**
   `syncSelectedScreenUi` still copies the screen's global actions into every
   region on each sync (pages/organization/process.vue:2542-2545) and
   `ensureSelectedScreenRegion` seeds new regions the same way
   (pages/organization/process.vue:2566-2581) — the exact behavior this
   checkbox forbids. Fix belongs to the same designer-UI session as checkbox 1
   (independent per-region action lists). Left open.
3. **Arbitrary typed bindings — deferred with reason.** Re-verified: bindings
   editing is still a single InputText bound to `bindings.entityId`
   (pages/organization/process.vue:850-887) while the compiler/runtime already
   resolve arbitrary binding keys. Same designer-UI session as checkboxes 1-2.
   Left open.
4. **Pre-activation validation — implemented 2026-08-20.** See checkbox entry
   and Agent Notes above; unchanged this session.
5. **Generated typed CRUD forms — implemented 2026-08-20.** See checkbox entry
   and typed-prompt-controls Agent Notes above; unchanged this session.
6. **Post-action refresh/patch — already implemented, code evidence recorded.**
   `applyActionResult` patches owner/created/entity snapshots (and every
   `entities` output of runCommand actions) synchronously after a successful
   post (components/generated/GeneratedScreen.vue:492-504);
   `useGeneratedScreen` replaces matching items in place, inserts only on
   filter match, removes deleted ids from list sources, patches single-mode
   sources only on identifier match, and falls back to a debounced reload for
   snapshot-less events via the `onEntityChanged` listener
   (composables/useGeneratedScreen.js:68-130). No page reload is required.
   This session documented the contract in the canonical READMEs
   (components/generated/README.md "Action Results";
   composables/README.md "useGeneratedScreen"). The checkbox stays unchecked
   only because browser evidence is owned by checkbox 7.
7. **Template-matrix browser tests — deferred with reason.** Re-verified:
   e2e/process-generated-screen.spec.js still holds only one endpoint smoke
   test. Real browser evidence needs a Playwright session against a running
   app (dev-server startup is outside this session's scope). Left open; when
   scheduled it must also supply the browser proof for checkbox 6.

Files changed (docs only): composables/README.md,
components/generated/README.md, TODO-process-designer.md.

Validation: `node scripts/check-docs.js` (passed). No code paths changed, so
no test suites were re-run; cited line numbers were re-read from the current
checkout on branch `agent/p1-docs-closeout-20260820`.

### Agent Notes — 2026-08-20 (region action independence)

Session scope: checkbox 2's action-independence defect only (the forbidden
copy from screen global actions into region action lists). Region id/label
exposure and checkboxes 1, 3, 6, 7 remain open as recorded above.

2. **Region action independence — fixed (this session).** New regions are now
   seeded with an empty action list in `createScreen` (unchanged),
   `ensureSelectedScreenRegion`, and `addSelectedScreenRegion`;
   `syncSelectedScreenUi` no longer overwrites `region.actions` from
   `screen.actions` on any sync — it only guarantees the array shape via
   `||= []` (pages/organization/process.vue). Region-scoped actions are
   edited explicitly through a new per-region MultiSelect in the region rows
   of the screens tab (add/edit/remove), reusing the existing
   `screenActionOptions`. The contract layer already preserved region-local
   actions (`normalizeRegions` defaults to `[]`;
   packages/processes/src/screen-contract.js:235-243), so no schema change
   was needed. Checkbox 2 stays open only for region id/label editing.

Files changed (code): pages/organization/process.vue.
Files changed (docs): pages/organization/README.md, TODO-process-designer.md.

Validation: `npx vitest run packages/processes` (265 passed); SFC compile
check for pages/organization/process.vue (passed); grep invariant that no
`region.actions` seeding from screen actions remains (passed);
`node scripts/check-docs.js` (passed). Acceptance path: create a region →
its action list is empty; change screen-level action ids → sync leaves every
region's action list untouched; add/remove action ids in a region row → only
that region changes.

### Agent Notes — 2026-08-20 (generated screen browser evidence)

Session scope: checkboxes 6 and 7 — browser proof of post-action refresh and
the template-matrix browser tests, delivered by extending the existing
e2e/process-generated-screen.spec.js in place (13 tests total). Entity and
action execute/options endpoints are route-mocked so every variant is hermetic;
screen contract resolution stays live through the real authenticated session
(`app.switchToAssignedOrganization`).

6. **Post-action refresh/patch — DONE (this session).** The refresh test
   drives a card-level relation action end-to-end: it mocks the execute
   endpoint to return an owner snapshot with a changed name, then asserts the
   project card updates in place, the source list endpoint is not refetched
   (request counter), the page does not reload (window marker survives), and
   the URL stays on the generated list screen. This is the browser evidence
   the previous sessions deferred.
7. **Template-matrix browser tests — browser matrix delivered, two residuals
   recorded.** The matrix is derived from the canonical contract dimensions
   (source entityType/mode, binding shapes, region action scoping) over every
   screen variant the active compiled process instantiates: all seven
   `entityList` endpoints (project/queue/library/cassette/artifact/facade/
   cassette_design) assert the contracted source endpoint, access-rule status
   filter presence/absence, toolbar create action, and permission-denied
   delete; `entityDetail` asserts single-source `$screen.scope.entityId`
   identifier resolution, filtered child sources, and region-scoped actions
   (no leakage from unrelated screens); a second `entityDetail` posture asserts
   a screen without contracted actions renders no generated action buttons;
   the `home` screen asserts every contracted source section renders from its
   own endpoint; the create-form test covers the form-action flow (prompt post
   + created-entity detail navigation). Residuals: (a) the seeded process
   instantiates only `home`/`entityList`/`entityDetail` templates, so
   `workspaceLanes`/`table`/`formAction` template instances have no endpoint
   variants to drive until such screens are authored into the process;
   (b) concrete-role/user previews do not exist as a designer feature yet.
   Both are process-authoring/designer work, not test work; the checkbox stays
   unchecked until the owner dispositions those residuals.

Files changed (code): e2e/process-generated-screen.spec.js.
Files changed (docs): e2e/README.md, TODO-process-designer.md.

Validation: `E2E_BASE_URL=http://localhost:3000 npx playwright test
e2e/process-generated-screen.spec.js` (13 passed against the running dev
stack, branch `agent/p1-screen-e2e-evidence-20260820-2145`);
`node scripts/check-docs.js` (passed). Acceptance path: the refresh test is
the checkbox-6 proof cited above; the seven parametrized list-variant tests
plus detail/home/create-form tests are the checkbox-7 matrix.

### Agent Notes — 2026-08-20 (P1 evidence trail closeout)

Session scope: documentation-only closeout of the checkbox 6/7 evidence trail.
No runtime, designer, or test code changed in this session.

6. **Post-action refresh/patch — DONE, evidence confirmed.** Checked above with
   the browser proof delivered in the generated-screen-browser-evidence
   session: e2e/process-generated-screen.spec.js "patches the affected list
   source in place after a mapped relation action result" asserts the owner
   snapshot patches the project card in place, the source list endpoint is not
   refetched (request counter), the page does not reload (window marker
   survives), and the URL stays on the generated list screen.
7. **Template-matrix browser tests — DONE, residuals dispositioned.** The
   checkbox is now checked on the strength of the delivered browser matrix
   (e2e/process-generated-screen.spec.js, 13 tests): the seven parametrized
   `entityList` variants, both `entityDetail` postures, the `home` screen
   per-source sections, and the create-form flow. The two residuals recorded in
   the previous session are dispositioned as follows: (a) `workspaceLanes`,
   `table`, and `formAction` templates have no authored screens in the seeded
   process, so there are no endpoint variants for a browser test to drive —
   covering them requires authoring such screens into a process, which is
   process-authoring work outside this section's test scope; (b)
   concrete-role/user previews do not exist as a designer feature, so there is
   no surface to test — adding the feature is designer work, not test work.
   Neither residual is a test gap in the delivered matrix; both become
   actionable only when the corresponding authoring/designer work is scheduled.
   The coverage boundary is documented in e2e/README.md so the suite's scope
   stays truthful.

Files changed (docs only): e2e/README.md, TODO-process-designer.md.

Validation: `node scripts/check-docs.js` (passed). No code paths changed, so no
test suites were re-run; the cited browser evidence was re-read from
e2e/process-generated-screen.spec.js on the current checkout (branch
`agent/p1-evidence-trail-closeout-20260820-2345`).

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

## Corrections queue — re-launch scopes

Sections below received design verdicts from solution-lod runs but no
implementation or bookkeeping, or were only partially closed. Each subsection
is a self-contained re-launch scope: the recorded verdict is the design input,
not something to re-derive. Close the listed bullets in the original section,
add Agent Notes there, and validate per the Implementation protocol.

### Correction: Item/list/tree persistence semantics

Verdict on record (run 2026-08-19): one generic, type-agnostic effect-mapping
contract shared by all mutation effect nodes; mutation inputs routed through
`solveDataTrees` with a per-aligned-item invocation boundary;
`MutationFailure` records `{operation, branchPath, itemIndex, entityRef?,
error}`; results carry `failures` and `completedMutations` lists; result tree
is shape-preserving; `effect.deleteEntity` stays deferred to Status, archive,
and delete.

- [x] Implement the shared effect-mapping contract below the node language in
  `packages/processes/src/evaluator.js`, wired into Create, Modify, and Status;
  Delete stays deferred per the verdict.
- [x] Implement multi-input matching for persistence nodes per the verdict.
- [x] Implement mutation failure reporting (`failures` + `completedMutations`)
  without claiming collection-wide atomicity.
- [x] Test the same mutation node against item, list, and branched-tree inputs.

### Correction: Collection construction

Verdict on record (run 2026-08-19): Make List gets a fixed input-count
contract — 4 optional item sockets, at most one wire each; Concat, Collect
Array, and Expand Array stay as they are.

- [x] Implement the Make List fixed-socket contract (catalog, designer palette,
  inspector) if not already matching; verify Concat/Collect/Expand behavior
  with tests rather than changes.
- [x] Test relation arrays, attachment arrays, command entity-list inputs,
  empty lists, and mixed incompatible element types.

### Correction: Decompose and read

Verdict on record (run 2026-08-19): attachments become a framework-owned open
block declared in core (`CANONICAL_BLOCK_SCHEMAS` /
`CANONICAL_BLOCK_COMPOSITION` in `packages/core/src/index.js`).

- [ ] Verify Deconstruct Entity, Get Block, and Get Field against item/list/
  tree inputs and the full CNC block family, including the attachments block
  per the verdict; implement only where behavior diverges.
- [x] Distinguish missing field from present nullable field in preview and
  runtime errors.
- [ ] Close the five original bullets with tests and bookkeeping.

### Correction: Compose Block

Verdict on record (two runs, 2026-08-19): all five bullets are functionally
implemented and documented (catalog ports, evaluator, compiler validation, UI,
domain schemas, tests); the single genuine gap is the missing explicit
multi-entity/list-input compose output test. Do not add required/default
declarations to fixed block fields — an open compose socket is a composition
affordance, not an error.

- [ ] Add the focused multi-entity/list-input `composeBlock` output test in
  `packages/processes/src` (one composed block per aligned input tuple).
- [ ] Tick the five original bullets and add Agent Notes. Bookkeeping plus one
  test; no runtime changes expected.

### Correction: Create Entity

Verdict on record (run 2026-08-19): no creatable entity type declares a
mandatory parent or containment relation; all 14 construction contracts in
`entity-construction.js` lack parentEnforcement; manual-form/task-form
consumer of promptable inputs was the open investigation.

- [x] Verify Create Entity against every process-creatable domain entity:
  constructor sockets, requiredness, creator constraints, constructible
  blocks, Lineage, Relations, initial status, typed references.
- [x] Verify parent/ancestor validation and Lineage binding compilation;
  implement only where behavior diverges from the contract.
- [x] Test root creation, child creation, relation-bearing creation, typed
  references, and denied creation; close the six original bullets.

#### Agent Notes — 2026-08-21

Correction complete. The full evidence and the sole runtime repair are recorded
under the original Create Entity task above. No construction contract gained
`parentEnforcement`; ancestor semantics remain graph-derived Lineage bindings.

### Correction: Relations and lineage

Verdict on record (two runs, 2026-08-19): only the forward/source-side
relation read is covered (`entity-sources.spec.js` exercises
`processRelatedEntities` as an owner-side forward read).

- [x] Verify Lineage-as-ancestry vs Relations-as-associations semantics and
  explicit Link/Unlink authoring through typed relation blocks; implement
  gaps only.
- [x] Verify one-to-one and one-to-many relation values, including building a
  persisted relation array from a data-tree list through Collect Array.
- [x] Verify cross-organization link prevention; test link, unlink, replace,
  duplicate prevention, missing targets, and denied relations.

#### Agent Notes — 2026-08-21

Correction complete. Lineage remains graph-derived ancestry and Relations
remain typed non-owning associations. Compiled Create and Modify effects now
validate graph-declared relation owner/key/target/cardinality contracts before
the owning persistence call, resolving targets through authorized registered
services and deduplicating many-valued replacements. Runtime coverage now pins
one/many replacement, Collect Array cardinality, Link, Unlink, copy-on-write
replacement, duplicate handling, missing targets, denied reads, and
cross-organization rejection. Existing forward related reads, generated detail
actions, reverse/display projections, and lineage-scoped compiler coverage were
verified without runtime changes.
Replacement deduplication also uses the Link/Unlink target identity
(`type` plus `id`), so pinned and unpinned references cannot create two
associations to the same entity.

### Correction: Status, archive, and delete

One bullet closed 2026-08-19 (workflow compilation preserves all authored v2
regions/contracts). Verdict on record: a single topology-aware mutation effect
boundary — status and delete effects declare their own item/list/tree mapping.

- [x] Verify initial status on Create and workflow transitions on existing
  entities across the authored regions now preserved by the compiler fix.
- [x] Decide and implement archive modeling through a domain workflow
  state/intent where that is the honest contract.
- [x] Gate Delete Entity on process capabilities and domain delete contracts;
  implement `effect.deleteEntity` per the Item/list/tree verdict only for
  capable entity types.
- [x] Test multi-region status changes, evidence-required transitions, and
  item/list/tree status/delete inputs.

#### Agent Notes — 2026-08-21

Correction complete. Create initial-status writes preserve every authored
region initial while replacing the primary region, and Change Status now
compiles and forwards region/path scope plus metadata and lifecycle evidence,
returning the updated entity DTO. Archive is an explicit mapped effect: it uses
the domain's named archive intent when declared (notably process definitions)
and otherwise transitions to the domain `ARCHIVED` state. Hard deletion is an
admin-only manual mapped effect exposed only when the canonical capability
projection combines `operations.delete` with a registered runtime delete
binding; one `processDelete(id, auth)` registry adapter translates the existing
feature service signatures.

Generated process surfaces no longer infer delete controls from domain support
and grants. They render only an authorized compiled delete action, confirm it,
and execute it through the active process. Shared mapper coverage pins status,
archive, and delete item/list/branched-tree topology; compiler, runtime, status
engine, capability-denial, archive-intent, lifecycle-evidence, and generated
action tests cover the remaining cases.

### Correction: P1 — generated interface follow-through

Four bullets closed 2026-08-20 (contract validation, typed CRUD forms,
post-action refresh/patch, browser evidence). Verdicts on record in the
section Agent Notes: bullets 1–3 are designer-UI gaps — the schema and
compiler already carry the full shapes; only the screens tab UI is thin.

- [x] Expose the complete semantic screen source contract in the designer
  (stable id/label, entityType, mode, required/identifier, filters,
  lineageBindings) — schema support exists in
  `packages/processes/src/screen-contract.js:94-136`; extend
  `pages/organization/process.vue:850-887`.
- [x] Expose the complete region contract (stable id/label, template slot,
  region actions) in the designer.
- [x] Support arbitrary typed screen bindings instead of only the currently
  authorable subset.

#### Agent Notes — 2026-08-21

Completed the three designer-UI gaps without changing the existing screen
schema. The Screens tab now authors each source's stable identity, entity type,
mode-specific identifier or typed flat filters, independent required access,
and complete lineage binding rows; each region authors stable identity, slot,
source, surface, and its own action list. Screen bindings use arbitrary keyed
string, number, boolean, or assignment-reference values. Screen mutation and
mode cleanup moved into `useProcessDesignerScreens`, which normalizes through
the canonical `packages/processes/src/screen-contract.js` contract.

Focused behavior coverage exercises list/single mode switching, source-id
reference updates, every supported binding value type, canonical validation,
and compiler round-trip of authored sources, lineage bindings, regions, and
bindings. The following organization-scope and producer-scoped corrections are
unchanged.

### Correction: P1 — organization scope follow-through

Verdicts and partial implementation on record (run 2026-08-19/20): shared
annotated role access summary implemented (`shared/role-access-summary.js`,
rendered on the Team page); remaining bullets were dispositioned as design
decisions in the section Agent Notes.

- [x] Expose the access engine's real grant dimensions in typed controls where
  the designer edits access.
- [x] Make entity-profile, action, status-transition, and screen access
  reviewable from one place per the recorded verdict.
- [x] Stop screen layout from silently granting backend capability per the
  recorded verdict.
- [x] Discover required assignment binding keys from every supported location.
- [x] Add "preview as assignment" with concrete role IDs and bindings.
- [x] Test one role, several additive roles, overloaded assignments, and
  denied cases.

#### Agent Notes — 2026-08-21

Completed against the existing access evaluator and assignment compiler.
Process Designer now reuses the typed nested permission builder for process base
grants and action/effect/screen conditions; action normalization preserves
action maps, entity/lineage scope, transition restrictions, and nested rules.
Designer and Team both render `shared/role-access-summary.js`. Raw grant JSON,
assignment nodes, and a second authorization model were not introduced.

Screen requirements are capability consumers: screen records no longer add
role grants, assignment compilation resolves all selected roles first, and a
screen is included only when separately authored grants cover its requirement.
Authored screen scope survives compilation and resolves with screen bindings.
The package binding projection discovers typed keys from routes, scopes,
bindings, source identifiers/filters/requirements, role and action access
scopes, transitions, action maps, and nested rules.

Team's Preview as Assignment evaluates edited role ids and typed bindings
through the package compiler, canonical grant evaluator, and compiled field
policies. Concrete entity/status/lineage context resolves conditional entity,
field, action, and transition decisions; absent context stays unresolved.
Candidate compilation supplies screens and missing bindings. Active owner
membership is displayed and tested as a separately attributed
`organizations:admin`/`users:admin` recovery overlay, not a process role grant.
Focused coverage includes one role, additive roles, overloaded and missing
bindings, denial, status and lineage scopes, fields, actions, transitions,
screens, complete action-grant dimensions, and owner recovery.

Follow-up verification now evaluates each compiled screen and source requirement
through the shared grant evaluator with the matching preview context. A
status-scoped grant therefore reports its screen denied for a concrete
non-matching status and unresolved when that context is absent, rather than
treating assignment compilation's candidate screen as an unconditional allow.

### Correction: Producer-scoped entity workflows

Status: READY. The architecture finding is complete; the implementation below
must replace the current entity-type/profile contract as one protocol change,
not add a compatibility lookup beside it.

#### Chosen contract

`entityType` identifies a domain schema only. It must never select a process
workflow, field policy, access window, lineage path, initial status, or
transition. Every executable node output that emits an entity has a stable
`producerOutputId`, derived from the stable process-node id and output-socket id.
The compiled workflow identity is that producer/output identity, including when
two outputs emit the same entity type or one node has several entity outputs.
Node-only identity is insufficient because it would merge those sockets.

Compilation must emit authoritative producer-keyed records and a non-authoritative
type index:

- `producerOutputs[producerOutputId]` owns `entityType`, source node/socket,
  workflow, field policy, role/access contributions, and graph-derived lineage
  and relationship bindings.
- `entityTypeIndex[entityType]` is an ordered set of all matching
  `producerOutputId` values for schema discovery, diagnostics, and designer
  choices only. A runtime path must not select its first or sole entry as an
  implicit workflow.
- Every compiled action, screen source, access window, execution token, and
  status operation that consumes an entity carries the applicable
  `producerOutputId`. Runtime workflow and policy APIs require that context and
  fail on missing, unknown, entity-type-mismatched, or ambiguous identities.
- An entity is not permanently assigned to a process workflow. The graph path
  by which it enters the current operation supplies the workflow context. This
  allows the same persisted entity to enter distinct typed graph paths without
  storing process definition, action, node, or workflow identifiers on it.

Producer configuration replaces detached entity profiles. Create Entity owns
its construction mode, explicit initial domain status, field policy, grants,
and connected canonical blocks. Other entity-producing outputs own their entry
status and downstream transition contract. Typed graph edges supply
construction values, relations, parentage, lineage, access inheritance, and
the consuming producer context. A lifecycle, policy, or relation declaration
that is not attached to an executable producer output or connected executable
configuration has no runtime meaning.

Lineage and relationship bindings must preserve both ends of the graph path:
`sourceProducerOutputId`, source node/socket, consuming producer/output id, and
consuming node/socket, in addition to entity types and field/relation keys.
Deduplication uses that full identity. It must not merge bindings merely because
their child type, ancestor/target type, and storage key match.

#### Designer editing and activation diagnostics

The entity-producing node is the only workflow editing anchor. Selecting a
Create Entity output, Run Service entity output, task-completion entity output,
or other entity-producing socket opens an integrated **Workflow** inspector for
that exact `producerOutputId`. The inspector shows the stable producer/output
identity beside the schema-only `entityType` and edits its entry state,
transitions, field policy, role grants, and access behavior. A multi-output node
uses an explicit output selector; editing one output must not mutate another.
The canvas must give same-type outputs distinct path labels/accents and preserve
their identities when nodes are moved, renamed, saved, or round-tripped.

The designer must not offer an Entity Profile palette item, create a hidden
profile while adding a command, or show an "add missing profile" repair. Remove
`entityProfiles`, `requiredEntityProfiles`, and profile-presence validation from
the authored and compiled protocols. Policy, role/access, lineage, relationship,
and construction context is visible either in the selected producer inspector
or as a typed connected executable node/socket; there is no second detached
place that can silently override the producer.

Same-type producer paths remain separate in workflow preview, generated action
placement, access summary, and runtime tracing. Connecting both paths to an
ordinary same-type consumer does not merge their workflow meaning. Convergence
is legal only through an explicit Join operation whose input sockets retain
their source `producerOutputId` values and whose configuration chooses a
compatible resulting producer workflow. Activation rejects an implicit
convergence or a join whose entry states, transition contract, field policy, or
access contract cannot be reconciled explicitly.

Activation validates each producer output as an independent unit after typed
port resolution and before compilation. It must verify:

- every required constructor/block input has one valid connected or explicitly
  allowed local source, with compatible value type, Item/List/Tree access, and
  cardinality;
- lineage parentage and relationship associations come from declared typed
  connections, use valid source/target entity types and keys, and retain both
  producer identities without type-only deduplication;
- policy, role, and access contributions are attached to that producer or reach
  it through a typed executable connection, with no detached or type-global
  contribution;
- exactly one valid entry/initial domain status is configured for the producer,
  and every transition has known endpoints, a connected source entity flow, and
  valid authorization/evidence contracts; and
- every outgoing entity flow retains producer context until an explicit valid
  join selects a new producer workflow identity.

Diagnostics are graph-addressable records, not entity-type summaries. Each
error includes `producerOutputId` and `nodeId`; socket errors also include
`socketId` and connection errors include `edgeId` plus source/target handles.
Transition errors include the producer-local transition and endpoint ids. Apply
focuses the responsible node, output, socket, edge, or transition in the canvas
and never reports only "project workflow invalid" when several project
producers exist.

Each producer workflow declares its entry/initial domain status and every
allowed transition explicitly. Create applies its declared initial status
through the status engine after atomic entity creation. Command-owned producers
must persist and return an entity in their declared entry status; completion
projection validates that contract. Compilation rejects missing entry states,
unknown states, undeclared transition endpoints, and several candidate states.
The designer must not copy a status from the first same-type record or invent a
default status. Graph step states such as queued, running, waiting, completed,
and failed remain process-run/step state and never become entity domain status.

#### Persistence ownership

Every command and task entity output must declare one persistence owner; mixed
implicit behavior is invalid:

- `commandOwned` outputs are persisted inside the registered command/task
  business boundary (directly or through its declared effects) and return typed
  persisted entity references/DTOs. The graph may route them but must not create
  or persist them again.
- `graphOwned` outputs return typed raw construction data, never an entity
  reference and never a hidden `createEntity`/`updateEntity` effect. That data
  reaches an explicit Create/Modify Entity node through typed sockets; that
  graph node owns authorization, atomic persistence, producer identity, initial
  status, lineage, relations, and invalidation.

The ownership declaration belongs on each declared output because one command
may expose several outputs with different timing or ownership. CommandResult and
TaskResult validation must reject an entity on a `graphOwned` output, raw
construction data on a `commandOwned` output, undeclared persistence effects,
and an output whose result timing differs from its declaration. Existing
handlers that already persist cassettes, conversions, and nesting runs become
explicit `commandOwned` outputs; no adapter may infer ownership from handler
behavior.

#### Asynchronous completion

Entity outputs declare whether they are available `immediate` or `completion`.
The immediate command return may populate only declared `immediate` sockets for
which that return actually contains a value. A task reference, placeholder, or
entity expected only from task completion must not populate a `completion`
socket. Immediate packets are persisted on the current invocation and may be
read by already-runnable graph work, but the invocation does not emit its
`completed` control token while any consumed completion output is pending.

Every operational execution is a durable invocation, not merely a node id. The
run store must persist `process_runs` and `process_step_invocations`; each
invocation records its run id, step id, invocation id, process definition and
compiled-contract revision, producer node id, control-token/scope identity,
attempt, idempotency key, status, immediate output packets, and terminal output
packets. A Run Service invocation that returns a pending task creates exactly
one `process_invocation_wait` with a unique wait token and these immutable
fields:

- run id, step id, invocation id, producer node id, invocation attempt, and
  invocation idempotency key;
- task run id plus task id, task attempt/correlation identity, and the command
  run id when one exists;
- a versioned/hashable expected-output contract containing each completion
  socket id, producer output id, timing, structured value/entity type, access
  shape, nullability, and persistence owner; and
- the compiled outgoing route snapshot for those outputs and the completion,
  failure, and cancellation control sockets, expressed as edge id plus exact
  target node/socket ids.

The wait is the authoritative correlation boundary. Completion ingestion must
look it up by wait token and task correlation; it must never reconstruct a
process invocation by searching entity ids, process events, entity type, or the
latest task for a node. The immutable contract and route snapshot ensure that
activation or draft edits made after suspension cannot redirect an in-flight
invocation.

After the task runtime has durably finalized and normalized its terminal
TaskResult, it submits a completion envelope containing a stable completion id,
wait token, task run/id/attempt correlation, terminal outcome, and normalized
output. Delivery is retriable: a terminal-task reconciliation pass must
resubmit any correlated task whose wait has no receipt, so a crash between task
finalization and process ingestion cannot strand the run. The task completion
API must not directly evaluate graph edges.

Ingestion performs one database transaction and compare-and-set:

1. Load the waiting invocation and verify the wait token, task correlation,
   invocation attempt, and expected-contract version/hash.
2. Validate and project only declared `completion` values from the normalized
   TaskResult. Enforce each output's persistence owner and reject missing,
   extra, mistimed, or mistyped values before changing the run.
3. Insert a `process_completion_receipt` unique on both completion identity and
   wait token, persist the projected output packets, atomically change the wait
   from `waiting` to `consumed`, and change that exact invocation from `waiting`
   to `resumable`.
4. Append continuation tokens only for the recorded connected output/control
   routes whose socket contracts were satisfied. Unconnected sockets and edges
   from another invocation, node, attempt, or newer compiled graph are never
   evaluated.

A repeated envelope that matches an existing receipt returns that receipt as a
successful no-op. A stale attempt or conflicting completion identity cannot
consume the wait. Claiming a `resumable` invocation is likewise a conditional
state transition, so concurrent ingestion or workers cannot advance the run
twice. Downstream effects continue to use invocation-derived idempotency keys;
the guarantee is exact-once durable graph advancement, not an assumption that
external side effects are transactional.

Task failure or cancellation enters through the same receipt transaction and
resumes only that invocation's recorded failure/cancellation route, or marks
the run failed when no such route is authored. It never publishes success data
or the `completed` token.

This requires durable process run, step, output, and wait persistence for async
paths. Correlation and process provenance belong to those execution records and
task/command run linkage, never to entity status metadata. Ordinary synchronous
CRUD remains synchronous; durable waiting is required only when a graph consumes
a declared asynchronous output.

#### Required implementation

- [ ] Replace `workflows[entityType]` and `fieldPolicies[entityType]` with
  producer-output-keyed records plus `entityTypeIndex`; update compiler output,
  serialization, auth hydration, generated actions/screens, status resolution,
  and policy resolution together.
- [ ] Add stable producer/output identities to every entity-emitting catalog
  socket and preserve them through canvas round-trip, normalization, compiled
  actions, access windows, and runtime output packets.
- [ ] Move lifecycle, entry status, field policy, grants, relations, and role
  contributions from detached entity profiles onto producer-local or connected
  executable graph contracts. Delete profile requirements, profile canvas
  creation, `requiredEntityProfiles`, and activation checks based on entity-type
  presence; remove the Entity Profile palette/repair path entirely.
- [ ] Make the designer edit each producer output independently. Two Create
  Project nodes must retain separate statuses, transitions, policies, grants,
  and downstream paths; changing one must not synchronize or rewrite the other.
  Use the integrated producer/output Workflow inspector and visibly label the
  stable output identity beside the schema-only entity type.
- [ ] Require `producerOutputId` in workflow/status/policy/action runtime calls.
  Keep type-only APIs for domain schema lookup only and fail closed if execution
  context does not identify one producer output.
- [ ] Compile construction, lineage, relations, and access only from typed graph
  connections. Include source and consumer producer/socket identity in binding
  keys and remove type-only binding deduplication.
- [ ] Add per-output command/task metadata for persistence owner and result
  timing; validate handler results/effects against it and migrate every existing
  command/task declaration without behavior inference.
- [ ] Add durable run/invocation/wait/receipt storage and task-completion
  ingestion. Snapshot the versioned output contract and exact connected routes
  at suspension; project final async outputs into the waiting invocation before
  emitting `completed`; recover delivery after crashes; and use transactional
  compare-and-set plus unique completion/wait constraints for attempt-safe,
  exact-once graph advancement.
- [ ] Remove process/action ids from entity status writes and from the
  command-output-status migration. Add a data migration that removes existing
  process provenance from entity status metadata while retaining legitimate
  display, lifecycle evidence, and transition-local audit metadata.
- [ ] Remove every first-type-match and hardcoded status path in designer sync,
  workflow compilation, command-output projection, migrations, and runtime
  fallbacks. Activation must report the producer output and missing/ambiguous
  state instead of selecting one.
- [ ] Add producer-scoped activation diagnostics for constructor sockets, typed
  edges, lineage/relationship bindings, policy/role/access contributions, joins,
  entry states, and transitions. Every error must identify the responsible
  producer plus its socket, edge, or transition where applicable, and Apply must
  focus that graph element.
- [ ] Replace the persisted process protocol in one migration. Rewrite profile
  data onto producer outputs only where graph ownership is unambiguous; fail the
  migration with actionable node/output diagnostics rather than preserving a
  detached-profile or type-global fallback.

#### Acceptance tests

- [ ] Compile two Create Entity nodes for the same `entityType` and assert two
  workflows and field policies survive under distinct producer/output ids while
  the type index contains both.
- [ ] Start from New Draft, add same-type Create and Run Service producers, and
  prove no standalone profile node or `requiredEntityProfiles` repair is created
  or required. Edit each output in the integrated Workflow inspector and prove
  saving/round-trip preserves independent settings and visible identities.
- [ ] Prove runtime workflow, policy, action, and transition resolution fails
  without producer context and resolves the correct same-type producer when it
  is supplied.
- [ ] Prove same-type lineage/relation edges from different source sockets and
  into different consuming producers remain separate compiled bindings.
- [ ] Prove each producer's explicit initial status and transitions compile and
  execute independently; missing/ambiguous/unknown statuses fail activation and
  no designer or migration chooses a first/default status.
- [ ] Connect same-type producer paths to an ordinary consumer and prove
  activation rejects implicit workflow convergence. Connect them through an
  explicit compatible Join and prove the selected result identity is retained.
  Assert each failure identifies the exact producer, socket/edge, or transition
  and that Apply focuses that graph element.
- [ ] Prove `commandOwned` outputs route already-persisted entities exactly once
  and `graphOwned` outputs route raw typed data to an explicit persistence node;
  reject cross-mode results and effects.
- [ ] Prove an async nesting-style command emits only values present in its
  immediate result and no completion-only entity early. Assert the persisted
  wait identifies the run, step, producer node, invocation, task correlation,
  attempt, versioned socket contract, and route snapshot.
- [ ] Deliver final run/design/sheet outputs and prove only the exact suspended
  invocation's connected completion sockets advance. Redeliver concurrently,
  retry after a simulated task-finalization/ingestion crash, and send a stale
  attempt plus a conflicting completion id; assert one receipt, one resume, and
  one set of continuation tokens.
- [ ] Prove graph run/step status changes cannot mutate entity domain status and
  entity status metadata contains no process definition, action, node, producer,
  or workflow identifier.

#### Agent Notes — 2026-08-20

Architecture investigation completed. Current workflow and field-policy maps
overwrite same-type producers; detached profiles remain independent lifecycle
authorities; lineage deduplication omits producer identity; designer status sync
uses the first matching entity type; command/task outputs do not declare
persistence owner or result timing; and task completion cannot resume the
synchronous in-memory process runner. Existing action-keyed access windows are
the model to extend because they already retain graph-path identity. The chosen
replacement is producer-output identity, not node-only identity and not an
entity-type-primary variants map. Implementation remains READY under the tasks
and acceptance tests above.

The async finding was refined to make the suspension boundary implementable.
The existing in-memory runner has step ids and attempts but no durable
invocation repository; task completion persists normalized output independently
and has no process-ingestion callback. The required replacement stores one wait
per pending invocation, snapshots its expected completion sockets and connected
routes, and ingests terminal task output through a durable receipt. A unique
receipt plus transactional wait/invocation compare-and-set provides exact-once
graph advancement, while retry/reconciliation after task finalization provides
delivery. Process definition, producer node, invocation, and task provenance
stay on run/step/wait/receipt records and are never copied to produced entities.

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
