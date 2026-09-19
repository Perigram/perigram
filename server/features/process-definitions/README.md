# COMPONENT: Process Definitions

Organization-owned process definitions store the visual process graph and the
compiled runtime contract for organization-role grants, producer-output
workflows and field policies, service availability, sockets, screen manifests,
and navigation. Runtime workflow resolution requires the exact
`producerOutputId`; entity type is only schema metadata and an index key.
Runtime role permissions are derived from the graph during compilation: role,
entity-profile, and action access create grants; screen requirements only
consume those grants and screen manifests create navigation. Service run/view access uses service identities
instead of user roles. If a role has grants but no authored screen for the
granted entity feature, compilation creates a generated entity-list screen for
that role/feature instead of relying on static app navigation.

Activation is the only path that affects runtime behavior. The service
requires canonical semantic process records, validates the draft, verifies the
process transpiler round-trip, compiles the runtime contract, archives the
previous active process for the organization, marks the selected process
`ACTIVE`, and stores its id on the organization.

Validation and activation also produce the semantic Apply diff against the
organization's current active definition. Both sides are recompiled from their
canonical authored records (never the inspection-only stored `compiled`
snapshot) and compared through `diffProcessContracts`
(`packages/processes/src/contract-diff.js`): added/removed/changed actions,
screens, and role grants; per-entity-type CRUD capability changes; per-producer
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
  `{ statuses: [{ entityType, removed: [{ state, count }], targets }] }`,
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
- **Decision** — `POST …/activate` accepts `{ migration: { statuses:
  [{ entityType, from, to }] } }`. Every removed state with a live count
  must carry exactly one mapping whose `to` is a retained target for that
  entity type; invalid or partial mappings are HTTP 400 with the plan
  attached. Without a payload the boundary keeps the historical 409.
- **Ordering** — activate, then migrate, inside one request. The status
  machine resolves the *active* contract (`resolveActiveWorkflow`), so
  re-targeting before activation would validate targets against machines
  that do not contain them yet. After the new contract is active, each
  affected instance is re-targeted through
  `statusService.setInitialStateForOrganization` (initial-state semantics:
  the `status_events` record carries `fromState: null`; the old→new mapping
  is preserved in the migration summary on the definition). The producer
  output whose machine contains the target state is resolved per write and
  passed as `producerOutputId` metadata, so machines are never guessed.
  Reads go through the registered entity service's `processList` with the
  activating actor's auth — process definitions never run generic Mongo
  writes for business entities.
- **Idempotent resume** — re-targeting skips instances no longer holding
  the removed state, so re-POSTing activate with the same mappings
  completes an interrupted migration. The applied summary is persisted as
  `data.migration` on the activated definition (`appliedAt`, actor,
  mappings, per-mapping counts, failures). A migration step that fails
  after activation returns HTTP 500 with `migrationIncomplete` and the
  partial summary; every re-target publishes the shared typed
  invalidation event, so open screens reconcile exactly as if the
  mutation happened through an action.

Creation, update, validation, and activation accept only the current semantic
source at `dataflowVersion: 4`. Definitions with a missing or different
dataflow version are rejected, and new definitions are authored directly in
the current format. During the producer-output protocol cutover, these
boundaries run the package-owned, one-way producer identity rewrite. Save and
activation persist the rewritten semantic records and clear stale compiled
output. Validation checks the same rewrite in memory. A definition with zero or
multiple candidate entity outputs fails with node/socket diagnostics instead
of selecting by entity type. Other normalization used by validation and
compilation remains an in-memory projection and does not replace authored graph
records.

The feature boundary is split into explicit collaborators. `compiler-adapter.js`
owns current-protocol validation and activation projections — including
graph-protocol v5 dual acceptance: definitions authored in the CTS
vocabulary (`cts.*` species kinds, type ids, row paths; see
[packages/cts/SPEC.md](../../../packages/cts/SPEC.md) §20) lower to the
executable working shapes through `resolveCtsDefinition`/`checkCtsGraphBindings`
at this one seam, so validate, activate, preview, and run paths accept both
vocabularies while stored v4 graphs pass through untouched. Acceptance
validates against the projected domain **overlaid with the draft's own
`ctsTypes` declarations** (`declarationsFromCtsRecords`): SAVE persists
in-tree-authored types as draft data — they only land in the registry at
APPLY — so bindings to them must resolve at save time. Declarations that
do not compile stub into the entity list (bindings save; APPLY reports
the declaration error where it belongs); `draft-overlay.spec.js` pins
the contract.
`relation-option-resolver.js` owns scoped relation choices, `run-repository.js`
owns the durable run/invocation/wait/receipt execution store, and `runtime.js`
owns active-process compilation/auth hydration. Organization configuration is
read and changed through the registered organization service. Neither runtime
nor the feature service imports another feature's repository.

Process compilation runs through the CTS-projected domain: the active
runtime, activation, contract diffs, and draft normalization build their
compiler domain from the organization type store (`server/features/cts-types`)
overlaid on the strangler-converted system declarations
(`@perigram/cts` `projectDomainFromView`). A stored org type that no longer
compiles fails activation loudly. `cts-server-equality.spec.js` is the
env-gated live proof that the projection compiles byte-identical contracts,
and `cts-v5-equivalence.spec.js` is the graph-protocol gate:
`compile(v4)` and `compile(resolve(migrate(v4)))` must behave identically.

## Process execution

`POST /api/process-definitions/:id/runs` starts a manual v4 trigger backed by
durable MongoDB execution records. Runs, steps, invocations, waits, outputs, and
receipts retain revision, producer, control-scope, and invocation identity.
Before an effect is dispatched, its invocation snapshots the expected completion
sockets and connected routes. Dispatch leaves the task non-terminal: only a
durable receipt can supply terminal output and advance those routes.

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
`effect.changeStatus` requires a domain status workflow. A node whose selected
entity lacks the required capability is rejected as a deterministic
`validation.errors` entry (HTTP 400 at activation) instead of failing later at
runtime. The enforcement pass consumes the per-entity `processCapabilities`
record documented in [server/runtime/README.md](../../runtime/README.md) and is
a no-op when the registry exposes no capability map. The capability derivation
itself is the canonical projection in
[`packages/processes`](../../../packages/processes/README.md).

The pure scheduler lives in `@cutkit/processes`. This service supplies only
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
Current process edits should fork the active definition into a draft and
activate that draft when validation succeeds.

Entity lifecycle profiles and action nodes compile directly into normalized
`@cutkit/workflows` v2 machines. Runtime status resolution uses the active
process workflow before organization workflow overrides and domain defaults, so
action-only process graphs still define the statuses and transitions exposed by
the status runtime.
Authenticated runtime hydration includes those compiled workflows under
`process.workflows`. Shared entity surfaces consume that same effective
contract to suppress non-informative status chrome for one-state lifecycles;
they do not infer visibility from status names or entity types.

`createActiveEmptyProcess()` is the organization-bootstrap path used by signup
and organization creation. The organization service stores the organization's
own `role_admin` identity and the creator assignment, then this feature creates
an explicitly empty v4 definition (no grants, no producer outputs, no screens),
compiles and activates it, and stores the active process id. There are no
starter templates: a new organization starts with zero authored access, and the
creator's owner membership still carries `organizations:admin`/`users:admin`
for tenant management.

Process definitions never store role identities or user assignments. Their
`data.roleGrants` record maps stable organization role ids to process-owned base
feature grants; entity profiles, actions, screens, and transitions add their
own operational mappings. Validation and compilation receive the current
organization role catalog explicitly and reject missing role references. The
compiled contract contains role capabilities but no per-user `userAccess`.
Auth hydration resolves the active organization assignment against that
contract on every request, so editing a team assignment does not mutate or
recompile the active process and a draft can never overwrite assignments.

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
record is created, create actions apply `action.status.to` through the status
runtime, treating it as the process initial state for that new record rather
than a transition from the feature service default. When the compiled action
status includes process-authored `label`, `color`/`severity`, or `icon`
metadata, create and status-mutating update execution stores that display contract under
`status.metadata.display`. Status-badge rendering for generated screens and shared entity cards is defined in [server/core/machines/README.md](../../core/machines/README.md).
If an already-active compiled action was produced before that metadata was
embedded, execution resolves the action `statusRef` or target status against
the semantic `data.statusDefinitions` record and writes the same display
contract at runtime. This keeps existing active process definitions rendering
the authored severity and icon without requiring an immediate compiled-runtime
rebuild.
The successful Create boundary publishes one typed `created` invalidation with
the created entity type/id after the optional initial status has persisted.
Constructor, block, or status failures publish nothing. Mapped Create execution
therefore emits one event per completed tuple while retaining its ordinary
item/list/tree result topology and partial-failure reporting contract.
Generic Create receives block-composed data. `identity.name` and
`identity.slug` are projected to the owning service's `name`/`slug` inputs;
`data` and `specs` values are projected only where the service has no explicit
top-level value. Non-block generic construction inputs remain available beside
those blocks, so an entity can declare an explicit source reference without
turning it into a bespoke effect. A composed Lineage block owns parent ids and
its stored ids are also projected to the owning service's top-level creation
payload. The compiler may use
one declared lineage entity reference for contextual screen placement, and the
effect boundary converts its entity reference to the canonical stored id.
Origin, provenance, status history, and summary are not accepted as generic
constructible blocks.
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
[`@cutkit/processes`](../../../packages/processes/README.md).
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
feature service.
Generic cassette creation calls the cassette entity service, whose create
contract always persists a named OCCS template with the default graph-tree
document;
`bakeCassetteDesignFromTemplate` calls the cassette template service, requires a
template id or resolves the default construction-ready template visible to the
caller, accepts concrete parameters, creates a real `cassette_design` whose
default identity comes from the source cassette,
with geometry/editor provenance, then applies the process target status.
In v4 execution, typed constructor inputs and connected canonical blocks are
collected separately. The constructor creates the complete derived entity
first, then the entity feature's explicit `processUpdate()` applies authored
blocks as merges over the created DTO. This keeps generated geometry and
provenance intact while allowing the same identity, relations, attachments,
specs, and data composition available to ordinary create nodes, except for
service-owned blocks. Cassette-design identity is service-owned and therefore
is not constructible in the process designer.
The typed cassette-design constructor is sourced from a cassette template, not
from a queue. A queue consumes baked designs through its declared
`relations.cassettes` relationship. A producer may request `linkCreatedTo` with
an owner type and relationship key; after creation the runtime validates that
relationship against the domain registry and updates it through the owner's
`processUpdate()` contract. Relations may declare an association-data path;
linking initializes its defaults, unlinking removes it, and copy-on-write
replacement transfers it to the new target. Queue cassette quantity uses this
generic relation-association contract.
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
Returned models are serialized before entity-typed field predicates are evaluated in memory. Predicate
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
`server/features/entity-events` after their canonical mutation succeeds.
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
