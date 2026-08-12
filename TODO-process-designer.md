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

- [ ] Add one canonical process-capability projection for every registered
  entity type: list/query, get-by-id, create modes, writable blocks/fields,
  relation mutations, status mutation, archive, and hard delete. Derive it from
  domain declarations plus explicit runtime bindings; do not infer create or
  delete support from the existence of an entity collection.
- [ ] Make the designer filter entity choices per operation. Create Entity must
  show only process-creatable entities and valid construction modes; Modify,
  Change Status, and Delete must apply their own capabilities independently.
- [ ] Make activation reject a node whose selected entity/service binding
  cannot perform its declared operation. A graph that validates must not later
  fail only because the registered service lacks `create`, `processUpdate`,
  status support, or delete support.
- [ ] Remove the generic-create fallback for entity types that have no explicit
  process construction contract. Every excluded entity must have a documented
  domain reason, and every included entity must be constructible from a fresh
  graph.
- [ ] Add a contract test that iterates the complete domain entity registry and
  proves palette availability, compiler validation, and registered service
  capability agree for every CRUD operation.

### Required inputs and value availability

- [ ] Restore the catalog's real `required` flag. Do not make every socket
  optional in `socket()` or confuse an unconnected manual prompt with an
  optional runtime value.
- [ ] Represent input availability explicitly: connected upstream value,
  authored fallback, domain-owned default, generated manual prompt, or runtime
  context. Activation must reject required inputs that have none of these
  sources.
- [ ] Keep generated prompts limited to manual actions. An automatically
  evaluated data path must be complete without a UI prompt.
- [ ] Validate availability after type/access inference so a required entity,
  block, array, attachment, enum, or construction input cannot be satisfied by
  an incompatible scalar fallback.
- [ ] Add focused tests for required primitive, entity, entity-list, block,
  status, attachment, and command inputs, with connected/defaulted/prompted and
  missing cases.

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

- [ ] Expose Current Entity as an authoring node. Its entity type must be
  inferred from the manual action/screen context where possible and selectable
  only when the context cannot determine it.
- [ ] Expose Entity by ID/Reference. Accept a typed entity reference directly;
  accept an ID only with an explicit entity type. Return a typed readable entity
  and fail clearly when access denies it or it does not exist.
- [ ] Complete Select Entities as the organization-scoped list source for every
  process-listable entity. Preserve the service's access filtering; never use
  an unfiltered repository read.
- [ ] Expose Parent, Children, and Related Entities from declared Lineage and
  relation contracts. The node must offer only relations valid for the incoming
  entity type and return exact typed entity references/DTOs.
- [ ] Add source tests for root entities, lineage children, relation targets,
  missing references, cross-organization references, and per-entity read denial.

### Filter and find paths

- [ ] Make this ordinary path work for every readable scalar field:
  `Select Entities -> Deconstruct/Get Block -> Get Field -> Logic -> Filter`.
  Field extraction and Logic must map over the source topology so the Boolean
  mask stays aligned with the original entities.
- [ ] Cover equality, inequality, numeric/date comparisons, contains,
  starts/ends with, null/not-null, Boolean AND/OR/NOT, enum values, status, and
  typed entity-reference equality. Do not require raw predicate JSON.
- [ ] Preserve the original entities through Filter and Dispatch; masks are
  selectors, not replacement values. Reject mask/item branch mismatches before
  returning misleading results.
- [ ] Support several conditions by composing Logic nodes. Do not add a second
  query-language or a monolithic advanced-filter node.
- [ ] Add an internal query-planning optimization only after semantics are
  correct: safe source-adjacent predicates, sort, and slice may be pushed into
  `processList` filters, but the graph result must be identical to in-memory
  evaluation and service access checks remain authoritative.
- [ ] Add end-to-end tests for find-by-field, combined conditions, status
  selection, relation-reference selection, empty results, and denied records.

### Ordering, grouping, and windows

- [ ] Change Sort Items to accept the original item list plus an aligned key
  list produced by Get Field. Return the original items in key order; do not
  require hidden/raw property paths inside Sort.
- [ ] Use one canonical `direction` property (`asc` or `desc`) from inspector
  through evaluator. Remove the current `operation`/`direction` mismatch and
  test both directions.
- [ ] Define stable ordering for equal keys and deterministic placement of null
  values. Cover string, number, date/date-time, enum, status, and identity
  values.
- [ ] Make Distinct optionally consume aligned keys so complete entities can be
  deduplicated by a field without losing the original entity values.
- [ ] Keep Group By as items plus aligned keys and preserve source branch paths.
- [ ] Complete Slice and Item At with authorable start/end/index fallbacks,
  negative-index behavior where supported, empty-list behavior, and exact
  output topology.
- [ ] Test practical paths such as “most recent ten”, “first matching entity”,
  “unique entities by reference”, and “entities grouped by status”.

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

- [ ] Preserve unselected fields from the incoming block and replace only
  connected or explicitly defaulted selected fields.
- [ ] Support Set/Replace and Unset for eligible fixed/open entries. Support
  Append/Remove only for collection-valued fields and validate the element
  type.
- [ ] Make modification intent explicit in the node record and preview. An
  absent input must mean “preserve”, not “set null”; explicit null and Unset
  must remain distinct.
- [ ] Apply field write policy at the consuming persistence node as well as the
  block editor, because the same canonical block can be valid for one entity
  type and non-writable for another.
- [ ] Test the full read-modify-write path:
  `Current/Selected Entity -> Get Block -> Modify Block -> Modify Entity`,
  including list/tree inputs and preservation of untouched fields.

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

- [ ] Require a typed current entity/reference and accept only blocks writable
  for that entity type. Preserve all unconnected blocks.
- [ ] Support one entity with one block, a list/tree of entities with aligned
  block changes, and scalar/block broadcasting through the common solver.
- [ ] Keep ordinary metadata mutation separate from status transition so each
  re-enters its correct service boundary. When one authored action requests
  both, use the existing transactional status-plus-patch boundary and fail
  rather than partially applying it where transactions are unavailable.
- [ ] Return updated typed entities, not opaque success flags, so downstream
  reads and generated screens receive current DTOs.
- [ ] Test identity/data/spec/relation changes, explicit Unset, collection
  Append/Remove, denied fields, stale refs, and item/list/tree output shape.

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
