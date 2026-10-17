# COMPONENT: Process Definitions

Organization-owned process definitions store the current species process graph
and compiled contracts for role grants, entity-origin field/lineage policy,
declared workflow overlays, service availability, screens, and navigation.
Entity type is the lifecycle/schema authority; `producerOutputId` is optional
origin provenance, not a required workflow key for existing-instance
operations. Runtime role permissions are derived from action and screen
contracts. Service run/view access uses service identities rather than user
roles. A role with grants but no authored screen receives the generated
entity-list surface for the granted type.

Activation is the only path that affects runtime behavior, and
activation is **additive**: an organization may hold several `ACTIVE`
definitions at once, compiled as if all their authored graphs were one
canvas. `mergeActiveDefinitions` (in `compiler-adapter.js`) merges the
active set's authored data — graph nodes and edges concatenated (id
dedupe), `processNodes`/`producerOutputs`/`screens`/`services`/
`sockets`/`stateDefinitions`/`valueInputs` key-unioned, per-role
`roleGrants` unioned — in activation order, later activations winning
key conflicts, and the merged data compiles through the one compiler
seam. Activating requires canonical semantic process records,
validates the draft, verifies the process transpiler round-trip,
compiles the runtime contract, and marks the selected process `ACTIVE`,
adding it to the active set.
**Deactivation** removes one definition from the active set (state
returns to `DRAFT`, editable and re-activatable) and re-derives the
runtime contract. The migration gate and the semantic Apply diff
compare the activating draft against the merged contract of the
OTHER active definitions. The active set is queried from the
definitions collection (`findActiveSetByOrganization`); `/active`
returns the most recently activated definition for boot convenience.

**Type lifetime** (cts SPEC §4, owner decision 2026-10-13): an org type
lives while any stored definition's current graph declares it — active,
draft, or turned off. Two gates pause on the same disclaimer
(`data.typeDeath`, one row per dying type with its authored name and
live instance count; the designer renders `TypeDeathDialog`):

- **Activation**: the apply that orphans types fails with HTTP 409
  unless the request carries `confirmTypeDeath: true`; the confirmed
  retry kills each orphan WITH its data (declaration, instances, status
  history, stored files — the executor is
  [cts-types lifetime](../cts-types/README.md)) before compiling.
- **Definition deletion** (`DELETE /api/process-definitions/:id`): types
  declared only by the deleted definition die the same way — the
  unconfirmed delete returns the 409 disclaimer, the confirmed retry
  (`confirmTypeDeath: true`) cascades and then removes the definition.

Turned-off definitions and version-history snapshots retain their data
and declaration copies; the runtime (hydration, screens, navigation)
is dictated by the ACTIVE definitions only.

Validation and activation also produce the semantic Apply diff against the
organization's current active definition. Both sides are recompiled from their
canonical authored records (never the inspection-only stored `compiled`
snapshot) and compared through `diffProcessContracts`
(`packages/processes/src/contract-diff.js`): added/removed/changed actions,
screens, and role grants; per-type-id CRUD capability changes; per-producer
workflow state/transition/entry changes; field-policy section changes; and the
entity statuses the next contract removes. The validate response carries the
diff for the designer's Apply summary. Activation is a migration gate for the
last category: when live entities still hold a removed workflow state
(checked through the registered entity services with the activating actor's
auth context), activation fails with HTTP 409 and `migrationRequired` data
naming each entity type, its removed states, and the affected count. Entity
types whose status check cannot run do not block activation, and a previous
contract that can no longer be compiled (domain drift) makes the diff
unavailable rather than blocking activation.

## Apply migration plan (canonical)

Apply turns the removed-status gate from a dead end into a confirmed
migration. `migration-plan.js` owns the contract:

- **Plan** (`migrationPlan` on the validate response and on the 409 data):
  one row per entity type with live instances in removed primary states —
  `{ statuses: [{ typeId, removed: [{ state, count }], targets }] }`,
  where `targets` are the entity type's retained primary states in the next
  compiled contract (recomputed from both sides, never trusted from the
  client). The plan is the whole database impact statement for instance
  mutations: compatible declaration evolution needs no instance rewrite
  (absent-from-row renders absent), field-policy changes are redaction
  only, and the append-only logs are never mutated. An abandoned/deleted
  bucket is structurally absent today because breaking declaration changes
  are refused at the registry and Apply never removes types; declared
  migrations (CTS SPEC §11 deferred tier) will land in this same plan when
  that tier is built.
- **Decision** — migration decisions are authored data on the definition,
  not an activate-time payload: `data.migrations.statuses` carries
  `[{ typeId, from, to }]` alongside the graph records, and activation
  reads the declaration (the activate request body carries no migration
  data). The `declareStatusMappings` service entry (the agent tool
  `declare_status_mappings`) merges the declaration server-side through
  the same update boundary — no whole-document echo; an empty list
  clears the declaration back to the 409 gate. Every removed state with
  a live count must be covered by one
  declared mapping whose `to` is a retained target for that entity type;
  partial or off-target declarations are HTTP 400 with the plan attached.
  A declared row the current plan no longer requires is a no-op, so stale
  declarations from earlier applies never block activation. With no
  declaration at all the boundary keeps the historical 409.
- **Ordering** — activate, then migrate, inside one request. The status
  machine resolves the *active* contract (`resolveActiveWorkflow`), so
  re-targeting before activation would validate targets against machines
  that do not contain them yet. After the new contract is active, each
  affected instance is re-targeted through
  `stateService.setInitialStateForOrganization` (initial-state semantics:
  the `status_events` record carries `fromState: null`; the old→new mapping
  is preserved in the migration summary on the definition). The producer
  output whose machine contains the target state is resolved per write and
  passed as `producerOutputId` metadata, so machines are never guessed.
  Reads go through the registered entity service's `processList` with the
  activating actor's auth — process definitions never run generic Mongo
  writes for business entities.
- **Idempotent resume** — re-targeting skips instances no longer holding
  the removed state, so re-posting activate re-runs the declared mappings
  and completes an interrupted migration. The applied summary is persisted
  as `data.migrations.applied` on the activated definition (`appliedAt`,
  actor, applied counts, failures) beside the declarations it executed;
  the former top-level `data.migration` summary key is this contract's
  predecessor and is not read by any code path. A migration step that fails
  after activation returns HTTP 500 with `migrationIncomplete` and the
  partial summary; every re-target publishes the shared typed
  invalidation event, so open screens reconcile exactly as if the
  mutation happened through an action.

Creation, update, validation, activation, preview, and run accept current
semantic species records. The one-way legacy migration runs before resolution;
no retired operation kind is accepted after that boundary. Save and activation
persist the current records. Draft acceptance overlays the draft's declaration
graph on the projected CTS domain and validates the same recursive state/edge
records that APPLY posts.

The deadline scanner (`deadline-scanner.js`, wired by the
`deadline-scanner` nitro plugin) lives here because its input is the
activation-written compiled snapshot: on an interval it resolves every
organization's ACTIVE definitions, walks their compiled machines' states
for declared deadlines (CTS SPEC §7), and moves overdue instances —
`stateChangedAt` (or the legacy `status.timestamp`) older than the
declared duration — through the status engine as SYSTEM. Scan input is
the stored `data.compiled` snapshot only; auth decisions always
recompile and never read this path. Rescans are self-stabilizing: moved
instances no longer match the state query, and guard/access refusals
are counted and retried on the next tick. The same snapshot-read law
serves `listActiveWorkflowStates(auth)` — the active set's emitted types
with their primary-region state paths, picker data for the
[agent bot wake rules](../agent-bots/README.md).

Durable effect dispatch classifies once (`operationKindOf`) and keeps the
record's species kind: `cts.construct`/`cts.mutate`/`cts.remove` run through
the same construction/update/delete adapters as their retired v4 spellings,
`cts.command`/`cts.service` run commands, and `cts.transition` executes
through the status runtime using its declared `state` reference — target
path, axis (`state.axis` becomes the transition region), and note — never a
retired status socket or an arbitrary field patch.

`compiler-adapter.js` owns current-protocol validation and activation
projections. `resolveCtsDefinition` resolves ids and paths without changing
species kinds, discriminators, socket ids, or graph edges. The durable run
repository owns run/invocation/wait/receipt storage, and `runtime.js` owns
active-process compilation and auth hydration. No feature imports another
feature's repository.

Process compilation runs through `projectDomainFromView` over the organization
type store plus mounted declarations. Workflow projection preserves recursive
state trees. Consumer actions may omit producer identity; when present, the
producer output must emit the same type. The compiled contract is derived from
fresh semantic records for every validate/apply/run; stored compiled snapshots
are inspection-only.

## Process execution

`POST /api/process-definitions/:id/runs` starts a manual current-species
process run backed by durable MongoDB execution records. Runs, steps,
invocations, waits, outputs, and receipts retain revision, provenance,
control-scope, and invocation identity. Native species records and their
authored ports are resolved once and used unchanged by validation, compilation,
orchestration, and effect adapters.

Receipt ingestion claims the invocation revision and advances the run in one
MongoDB transaction. Duplicate or concurrent delivery is therefore an
idempotent no-op after the first commit. Dispatched invocations without receipts
remain discoverable after restart for continuation or retry.

Task completion closes the loop end to end. `executeManualRun` records the
enqueued task-run id on the invocation dispatch (`dispatch.taskRunId`, resolved
from the command result's task/job references), the task runtime's terminal
boundary (`completeTaskRun`/`failTaskRun`/`cancelTaskRun` in
`server/core/tasks`) notifies the process layer, and `ingestTaskCompletion`
correlates by that task-run id, projects the terminal `TaskResult` entities
onto the invocation's expected completion sockets, and — inside the same
receipt transaction — resumes the waiting graph step
(`resumeProcessRun`): the step succeeds with the projected output, its
snapshotted control token is re-queued on the recorded `completed` routes, and
the run continues. After the transaction commits, `continueStoredRun` drives
the run to settled or the next async boundary with the originating actor
context. Terminal task failure or cancellation enters the same receipt
transaction through `failInvocation`; with no authored failure route in the
graph language the run is marked failed/cancelled. The
`process-reconciliation` plugin re-checks unreceipted invocations against
terminal task runs every 30 seconds, so a crash between task finalization and
ingestion redelivers exactly once. The completion snapshot intentionally lists
socket ids (not a duplicated typed contract): per-output persistence owner and
timing are declared once on the command/task boundary and enforced where the
result is produced and where it is projected.

Effect nodes are
either manual or automatic-from-socket. Date or event-triggered automation is
not part of the
supported process contract. The originating actor/access snapshot is carried on
the run object so the action re-enters the normal feature access boundary; it
includes the compiled `effectivePermissions` consumed by entity adapters, so
the execution has the same access context as the action that started it.

Preview and manual-run responses leave the process runtime through
`serializeProcessResult` from
[`packages/processes`](../../../packages/processes/README.md): evaluator
missing-field markers are converted to the machine-readable tag
`{ missing: true, path }` at any depth, while present `null` values stay
`null`. Consumers can therefore distinguish an absent field from a nullable
one directly from the JSON response.

Activation validates every effect node's entity service binding against the
registered capability record. `effect.createEntity` and `effect.runProducer`
require `create`, `effect.updateEntity` requires `processUpdate`, and
`effect.changeStatus` requires a status workflow: the domain machine when
one is served, else the draft's own seeded state vocabulary (SPEC §7 —
machines are graph-derived, so the draft's state nodes satisfy the gate
exactly like the machine `compileWorkflows` builds from them). A node whose selected
entity lacks the required capability is rejected as a deterministic
`validation.errors` entry (HTTP 400 at activation) instead of failing later at
runtime. The enforcement pass consumes the per-entity `processCapabilities`
record documented in [server/runtime/README.md](../../runtime/README.md) and is
a no-op when the registry exposes no capability map. The capability derivation
itself is the canonical projection in
[`packages/processes`](../../../packages/processes/README.md).

The pure scheduler lives in `@perigram/processes`. This service supplies only
authorized read adapters and effect adapters. Reads use registered entity
services. Effects delegate to command, entity, status, projection, producer, or
attachment services and never write another feature's repository. Generic
Create consumes connected canonical blocks. Update flattens only writable
fields present in connected replacement blocks. Composed Lineage entity
references are copied from the compiled binding into the creation payload; no
parent key or entity type is guessed from a domain containment table. Lifecycle status remains a
dedicated status-runtime input.
Pure block operations resolve exact paths from the domain's entity-independent
block schema registry. The effect adapter deliberately switches back to the
target entity schema when projecting constructible or writable values. Stored
process nodes retain selected block paths but not copied schema snapshots, so
runtime behavior follows the activated domain contract rather than stale graph
metadata.
Consumer effects accept the operated entity in every shape the run context
produces — a typed `{ type, id }` ref, a full DTO, or the bare instance id
the manual action transport posts as `instanceId`; the effect boundary
normalizes all three against the effect's `typeId` before the service call.
Create, update, and status effects receive one scalar input tuple per invocation
from the package-owned effect mapper. Every invocation independently re-enters
the registered service/status boundary with the complete auth context. A fully
successful mapped step keeps the historical bare effect result; a step with
failed aligned items completes with a `{ result, failures, completedMutations }`
output whose shape-preserving result tree carries each MutationFailure record in
its own slot. No collection transaction or rollback is implied: completed writes
stay applied when a later item fails, and `completedMutations` identifies them.
Process definition management also accepts the active organization membership's
stored `organizations` grants as a narrow recovery path. Membership role labels
and sole-member status do not imply process management access; the recovery path
is local to process definition operations and does not grant general entity
access.

The compiled runtime contract is not a design source. Stored definitions that
only contain `data.compiled` without semantic records are rejected during
validation and activation so operators do not edit a guessed reconstruction.
Edits save in place; an identity-only PATCH never touches data. A save
carries a structural floor — every graph node needs a unique id, a type,
and a numeric position, and every edge must address existing nodes
(`graphIntegrityProblems` from the
[processes package](../../../packages/processes/README.md)) — while
semantic validity stays the validator's job, so drafts may fail
validation mid-edit but never persist as corruption. Each
activation writes the activated snapshot to `data.activated` — the
runtime compiles `data.activated ?? data` for every active-set member,
never live draft data. Re-activation records the superseded snapshot in
`data.history` (capped at 50). The Definitions pane restores a history
entry as the definition's data; restoring goes live through activation.

Entity lifecycle profiles and action nodes compile directly into normalized
`@perigram/workflows` v2 machines. Runtime status resolution uses the active
process workflow before organization workflow overrides and domain defaults, so
action-only process graphs still define the statuses and transitions exposed by
the status runtime.
Authenticated runtime hydration includes those compiled workflows under
`process.workflows`. Shared entity surfaces consume that same effective
contract to suppress non-informative status chrome for one-state lifecycles;
they do not infer visibility from status names or entity types.

`createActiveEmptyProcess()` is the organization-bootstrap path used by signup
and organization creation. The organization service stores the organization's
own `role_admin` identity and the creator assignment, then this feature
authors the organization's first definition through the same headless
authoring seam the designer uses (`createDefinitionAuthoring`): it starts
empty and stations the organization's starter constructs — the mounted
packs' plus the installed plugins' (`starterConstructsForOrganization` in
[plugins](../plugins/README.md); the documents pack's markdown-first set
carries the visible-by-default law, SPEC §UI), each as a
manual construct granted to `role_admin`, then compiles and activates it.
There are no starter templates: a new organization starts with zero authored
access beyond the starter constructs, and the creator's owner
membership still carries `organizations:admin`/`users:admin` for tenant
management. Organizations created before the starter set exist are repaired
by `server/scripts/station-documents-types.js` (the additive stationing
operator).

Agent authoring rides the same seam through two service entries:
`composeDefinition` (gestures onto a fresh draft) and `editDefinition`
(gestures onto an existing definition's stored authored document — server
owned activation records preserved, the same step grammar and legality
gates; the tool catalog in
[agent-bots](../agent-bots/README.md) serves them as
`compose_process_definition` / `edit_process_definition`). The seam
resolves ports against the **draft-overlay domain**: every declaration
step (`declareClass`/`declareTypeRef`/`declareField`/`wireDeclaration`)
re-seats the session onto `declarationOverlayDomain` over the projected
domain, and `editDefinition` seats the stored draft's own unapplied
declarations before the first step — the tree's declarations are ports
immediately, so a field declares and wires in one session with no
intermediate apply (the same overlay law the acceptance adapter follows;
live defect 2026-10-17: unapplied fields' connects were refused with
`Unknown port` until an activation posted them). The overlay never skips
silently: a declaration the registry refuses, or field records whose
`typeId` matches no class, ride the very `Unknown port` step error as a
named cause (`draft overlay: <type> skipped: <reason>` / `… field
record(s) matched no class typeId`) — the failure names its cause and
the next action instead of a wall.

Process definitions never store role identities or user assignments. Their
`data.roleGrants` record maps stable organization role ids to process-owned base
feature grants; entity profiles, actions, screens, and transitions add their
own operational mappings. Validation and compilation receive the current
organization role catalog explicitly and reject missing role references. The
compiled contract contains role capabilities but no per-user `userAccess`.
Auth hydration resolves the active organization assignment against that
contract on every request, so editing a team assignment does not mutate or
recompile the active process and a draft can never overwrite assignments.

`findTypeReferences(organizationId, typeId)` is the blast-radius probe type
authoring consumes before destructive changes (see
[cts-types](../cts-types/README.md)): it lists the org's non-archived
definitions whose nodes, screens, or draft declaration children edges
bind a CTS type.

## Manual action execution

Manual generated-screen actions execute through the active process definition,
not through client-selected entity routes. For v4 definitions,
`executeActiveProcessAction()` verifies the compiled role assignment, resolves
the authored effect's manual start, starts the durable run, and returns
the effect result (or a run/wake reference for a persisted wait). It does not
execute a second action algebra. The delegated entity/status/command service
remains the access and business-logic boundary. Create-entity actions are
authorized as create operations by
the process action itself before the created entity exists; the delegated
entity service receives a temporary action-scoped create grant for that feature
instead of requiring an already-existing status-scoped entity grant. After the
record is created, create actions apply `action.state.to` through the status
runtime, treating it as the process initial state for that new record rather
than a transition from the feature service default. When the compiled action
status includes process-authored `label`, `color`/`severity`, or `icon`
metadata, create and status-mutating update execution stores that display contract under
`status.metadata.display`. Status-badge rendering for generated screens and shared entity cards is defined in [server/core/machines/README.md](../../core/machines/README.md).
If an already-active compiled action was produced before that metadata was
embedded, execution resolves the action `stateRef` or target status against
the semantic `data.stateDefinitions` record and writes the same display
contract at runtime. This keeps existing active process definitions rendering
the authored severity and icon without requiring an immediate compiled-runtime
rebuild.
The successful Create boundary publishes one typed `created` invalidation with
the created entity type/id after the optional initial status has persisted.
Constructor, block, or status failures publish nothing. Mapped Create execution
therefore emits one event per completed tuple while retaining its ordinary
item/list/tree result topology and partial-failure reporting contract.
Generic Create receives block-composed data. `identity.name` is
projected to the owning service's `name` input; a persisted draft from
before the Name-input retirement is healed by the one-way rewrite at the
definition-resolution seam (`rewriteRetiredNameInputs`, also applied by
the save-boundary persisted rewrites): its `name` construction-input
entries, `name` socket defaults, and edges wired into the retired
`data:name` handle drop before validation, compilation, execution, or
storage ever see them — there is no runtime bridge.
`data` and `specs` values are projected only where the service has no explicit
top-level value. Non-block generic construction inputs remain available beside
those blocks, so an entity can declare an explicit source reference without
turning it into a bespoke effect. A composed Lineage block owns parent ids and
its stored ids are also projected to the owning service's top-level creation
payload. The compiler may use
one declared lineage entity reference for contextual screen placement, and the
effect boundary converts its entity reference to the canonical stored id.
Provenance is stamped by the effect boundary and never composed; origin,
status history, and summary are not accepted as generic constructible
blocks.
Generic Update receives replacement blocks through the same typed process
dataflow. Relation collection changes are composed with ordinary list/tree
operations before Modify Block receives the replacement value, then persisted
through the target feature's `processUpdate()` contract. Manual Update
effects compile into the normal generated action manifest; Relations data
connections without an effect remain non-executable dataflow.
Change Status forwards authored region/path scope and lifecycle evidence to the
status runtime and returns the updated entity DTO. Archive uses the compiled
domain archive intent or `ARCHIVED` state, while hard deletion delegates to the
registered `processDelete(id, auth)` adapter only after domain and runtime
capability checks. Delete actions must be manual, admin-scoped, and present in
the caller's compiled action manifest; collection topology and failure behavior
remain owned by the shared process mutation mapper documented in
[`@perigram/processes`](../../../packages/processes/README.md).
Immediately before a compiled Create constructor or Modify persistence call,
the effect adapter normalizes each connected Relations replacement against the
current graph-declared owner/key/target/cardinality contract. It resolves every
target through its registered `processGetById` adapter with the run auth
context, applies ordinary read access (including active-organization
isolation), and removes duplicate targets from many-valued replacements by the
same entity type/id identity used by Link and Unlink. A revision pin does not
make a second association to the same entity.
Failure leaves the owner persistence method uncalled. This check is local to
compiled effects because entity services do not have the graph metadata;
non-relation patches keep their existing service semantics.
Compiled process-relation actions execute directly at the active-definition
boundary, including for dataflow-v4 definitions: Link merges the selected typed
reference according to relation cardinality, while contextual Unlink removes
the exact reference supplied by the linked entity row. Persistence still
delegates to the owner entity's `processUpdate` service. Auth hydration and
execution resolve actions from the same freshly compiled canonical graph; the
stored activation snapshot is not a second executable action source.
Every Create Entity payload receives the active organization as canonical
`lineage.organizationId`. Parent-scoped actions additionally pass declared
containment lineage and pinned parent revision provenance. The owning feature
service must persist that context during create.
Create Entity owns both generic and typed domain construction. Generic mode
receives canonical blocks; other declared modes receive their fixed
`construction.inputs` together with canonical constructible blocks and delegate
initial creation to the corresponding domain constructor. Producer identifiers remain internal runtime metadata rather than
separate authoring nodes:
For a typed construction input, an explicit connected/authored value wins,
then the declared construction default is used, and an absent optional value is
omitted. Required inputs without either value fail graph validation. Generic
block construction forwards only connected or explicitly defaulted fields;
service-owned identity uid is never accepted and is generated by the target
feature service. The effect maps prompted drafts through the live domain
contract's construction inputs (the catalog's single derivation over the
resolved mode, authored entries merging over their contract twins): the
persisted record's `construction.inputs` is an authoring-time copy that can go
stale, and a value that arrived through a contract-derived port is never
dropped at the draft mapping.
Generic cassette creation calls the cassette entity service, whose create
contract always persists a named OCCS template with the default graph-tree
document.
In v4 execution, typed constructor inputs and connected canonical blocks are
collected separately. The constructor creates the complete entity first, then
the entity feature's explicit `processUpdate()` applies authored blocks as
merges over the created DTO. This keeps service-owned geometry and provenance
intact while allowing the same identity, relations, attachments, specs, and
data composition available to ordinary create nodes, except for service-owned
blocks.
A producer may request `linkCreatedTo` with an owner type and relationship key;
after creation the runtime validates that relationship against the domain
registry and updates it through the owner's `processUpdate()` contract.
Relations may declare an association-data path; linking initializes its
defaults, unlinking removes it, and copy-on-write replacement transfers it to
the new target.
Compiled Link actions grant their exposed roles read access to the declared
target entity feature so generated entity pickers can load authorized choices.
They do not inherit the owner entity's create-construction fields.
Link option resolution keeps embedded creators scoped to their construction
source. It reads the source entity type from the normalized creator contract,
uses domain containment to resolve both the owner's parent and the source's
parent, then crosses the single matching process-declared Link relation between
those parents. Source and derived-target reads use the embedded creator's
temporary execution grants, while owner and ancestor reads retain the caller's
ordinary access checks. An unresolved or ambiguous scoped path returns no
candidates; it never falls back to the organization-wide readable target
collection. The same endpoint returns existing derived targets for normal
selection and source entities for the embedded Create-new flow. For queue
cassette designs this yields project-linked libraries, their cassette children,
and only designs derived from those cassettes.
Typed construction actions receive action-scoped grants for the target entity
they create and for the source entities declared by the construction contract.
For cassette-design baking this includes a temporary `cassettes:write` grant so
the constructor can read the selected template and refresh its geometry
revision pointer before creating the design. These execution grants do not
become role permissions after the request; ordinary list/detail APIs still use
the compiled role grants.
Run-command actions use the same action-scoped execution model. The action must
be present in the user's compiled action manifest, then the command executes
with a temporary grant on the action's input entity feature so the command
runtime can enforce its normal domain access contract. Domain command
definitions may also declare `access.executionGrants` for records the handler
must read while executing the command but that should not become
ordinary user list/detail access. For example, a manual `solveNesting` action
on a queue can run from a generated queue detail only when that action id is
present in the user's compiled action manifest for the opened queue entity. The
action gets transient cassette and cassette-design read access required by the
command handler to evaluate material-bound parametric queue entries, while
queue job edits still require the separate `queues:write` entity grant. A queue
write grant alone does not expose the command action, and a command action
grant does not expose queue mutation controls.
For dataflow v4, Run Service sockets are resolved from the current registered
command definition at authoring and validation boundaries.
The executor partitions those flat typed socket values into the
command runtime's `entities` and `parameters` envelope; it does not accept a
generic nested parameters socket. Command results are projected back onto
typed entity and attachment output sockets while the full result remains the
fallback output for commands without declared entity/attachment outputs.

## Feature access boundaries

Entity query nodes also stay inside feature access boundaries. Registered services
expose `processList`/`processGetById` adapters as defined in
[server/runtime/README.md](../../runtime/README.md). Process evaluation calls only
these adapters; it never guesses positional feature-service auth arguments. This covers current/exact entity reads, parent resolution,
relation-target validation, update-target loading, and socket projection.

The process-definition service owns source-query planning. It pushes only a
source equality predicate with a normal persisted-field path into the concrete
`processList` filter and still evaluates the predicate in memory. Sort, slice,
compound predicates, and unsafe paths remain residual because the runtime
adapter deliberately has no portable filter capability contract.
Parent, Children, and Related reads resolve from the domain `containment` and
`relations` contracts via the pure helpers in `entity-sources.js`: Parent loads
the declared lineage parent through `processGetById`, Children query declared
children through `processList` with the lineage-key filter, and Related resolves
each stored relation reference through `processGetById` by its declared target
type. They receive the full auth context and never fall back to an unfiltered
repository read. A missing or denied parent/relation target fails clearly;
root entities and empty relation values return null or an empty list.
Relation writes evaluate the entry's declared target domain (`where`, CTS
SPEC §6) over the target's stored row at the write boundary — the same
expression `relation-option-resolver.js` filters Link-picker candidates
with (one evaluator home:
[`shared/relation-domain.js`](../../../shared/relation-domain.js)) — so a
value outside the domain is refused whatever offered it.
Returned models are serialized before type-idd field predicates are evaluated in memory. Predicate
conditions and gates remain process algebra values; they are not translated
into database filters. The runtime does not infer service signatures, read
feature collections directly, or turn a designer predicate into an unchecked
Mongo query.
When a synchronous run-command action returns entity refs and the visual graph
wires a typed output handle into a downstream status-mutating `updateEntity`
node, execution applies that target process status to each returned entity
through the status runtime. Async command results that include task/job refs
are not projected at command-return time; the task completion boundary owns
final output status and
child-output linking. This prevents commands such as `solveNesting` from
moving a `nesting_run` out of its solver state before the `nesting.solve` task
can apply the domain completion intent and attach generated `sheet_design`
records. The migration script
`server/scripts/migrate-process-command-output-statuses.js` applies the same
graph-derived status projection to existing active-process command outputs; it
must not hardcode status names.
Activation resolves required entity profiles from command metadata. Nesting
therefore cannot activate without profiles for the run, sheet design, and
physical sheet records that the command persists; the validator does not
hardcode that list independently of the domain command contract.
Status-mutating `updateEntity` actions go through the status runtime with the
connected entity patch attached to the status mutation. Both `updateEntity`
paths emit the updated typed entity DTO as the node result, matching the
declared non-nullable entity output type: the status path returns the entity
snapshot written by the transactional status-plus-patch boundary, not the
transition wrapper (status/actions/effects), so downstream nodes and generated
screens always receive a current typed entity. Non-status
`updateEntity` actions are not executed through a generic service signature:
after loading the target through its owning feature service and checking write
access, the runtime delegates the flattened canonical block patch to the
feature's explicit `processUpdate()` handler. That handler persists the
allowed `identity`, `data`, `specs`, `summary`, `attachments`, and `relations`
paths through the owning feature repository/model boundary; process
definitions do not run generic Mongo collection writes for business entities.
Process create, update, status-mutating update, and command-output status
mutations publish typed invalidation events through
`server/features/instance-events` after their canonical mutation succeeds.
Generated screens consume those events through the shared browser-local entity
sync contract and then reload their normal sources; process actions do not
broadcast DTO replicas or bypass entity read access.
The active action options route resolves relation choices through registered
entity services. For an embedded relation creator it follows the creator's
typed source, its declared containment parent, the opened owner's ancestor, and
the active process relation joining those parent types. Derived targets are
then queried by canonical provenance. Submitting `relationCreator` to the Link
action runs that exact embedded constructor and persists the returned reference
through the owner's `processUpdate()` boundary.
An embedded creator request may also declare `relationReplaces` for one target
already linked through that same relation. After creation, the relation runtime
verifies the old reference belongs to the owner and replaces it with the new
target in one owner update. This is the generic copy-on-write path for editing
immutable derived entities from an owning context.
Create-and-link behavior is relationship-driven rather than entity-specific.
`linkCreatedTo` is accepted only when the domain declares the requested
many-valued owner relationship and its target matches the created entity type.
The runtime resolves the owner from action context and uses its explicit
`processGetById()` and `processUpdate()` methods with a narrow request-local
write grant. There is no queue-specific append endpoint or copied item model.
Activation and the process-construction migration normalize stored create
actions whose construction mode no longer belongs to the selected entity type
before recompiling the active runtime contract.
Active-runtime compilation also applies the deterministic producer-identity
migration in memory, so an older active definition remains executable before
the persisted migration is applied. It still fails on ambiguous ownership and
never selects a producer by entity type.
Compiled process access is windowed by graph state. Status-mutating update
nodes do not append permanent grants; they inherit the incoming entity access
until edited, then replace the target-status role set with the node's selected
grants. Parent lineage scopes are preserved by the compiler, so child actions
created from a scoped parent branch emit lineage-scoped grants such as
`scope.projectId` instead of global child-entity permissions.

## Socket projection and auth hydration

Socket projection is exposed as a runtime operation for outbound sockets. The
socket API loads the source entity through the app registry, enforces read
access, copies only the socket projection fields, applies excluded fields, and
returns receiver lifecycle metadata for the target organization to interpret.
Inbound sockets are receiver contracts in the active process graph and cannot
be used by the outbound projection API.

Auth hydration compiles the current semantic process graph before resolving
screens, actions, workflows, and grants. Manual action execution uses that same
compiler path. The stored compiled value is an activation snapshot only; it is
never preferred over the canonical graph at either runtime boundary.
