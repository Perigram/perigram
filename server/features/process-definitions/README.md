# COMPONENT: Process Definitions

Organization-owned process definitions store the current semantic process
graph and compile it into the runtime contract: role grants, field and
lineage policy, workflow overlays, service availability, screens, and
navigation. The `typeId` is the lifecycle and schema authority;
`producerOutputId` is optional origin provenance for existing-instance
operations. Runtime role permissions derive from action and screen
contracts; service run/view access uses service identities. A role with
grants but no authored screen receives the generated entity-list surface
for the granted type.

Activation is the only path that affects runtime behavior, and
activation is **additive**: an organization may hold several `ACTIVE`
definitions at once, compiled as if all their authored graphs were one
canvas. Consumers: the compiler
([packages/processes](../../../packages/processes/README.md)), the
state and command/task runtimes, generated screens, and agent authoring.

Parent: [server/features](../README.md).
Target law: [SPEC.md](./SPEC.md).

## Lifecycle: author → validate → activate

| Phase | Contract |
|---|---|
| Author | Definitions store the canonical `perigram.graph` envelope from `createProcessGraphDocument`: nodes carry their authored data and process record, process-wide records and the authored viewport live in graph metadata, and the activation envelope fields stay top-level. Saves project the authored process domain and carry its structural floor — every graph node needs a unique id, a canvas type the designer renders, and a numeric position, and addresses its `processNodes`/`ctsTypes` record; every edge addresses existing nodes; every data edge names both sockets (`sourceHandle`/`targetHandle`) and, past the persisted rewrites, each handle addresses a socket the addressed record carries (`graphIntegrityProblems` and `graphEdgeSocketProblems` from [packages/processes](../../../packages/processes/README.md)). Declaration edges — the tree's `role: 'type'` wires — are node-to-node by design and exempt. An identity-only PATCH leaves data untouched; drafts may fail validation mid-edit and still save, since semantic validity is the validator's job. |
| Validate | Recompiles both sides from canonical authored records and produces the semantic Apply diff through `diffProcessContracts` (`packages/processes/src/contract-diff.js`): added/removed/changed actions, screens, and role grants; per-typeId CRUD capability changes; per-producer workflow state/transition/entry changes; field-policy section changes; and the statuses the next contract removes, by typeId. Draft validation overlays the draft's declaration graph on the projected CTS domain and validates the same recursive state/edge records that APPLY posts. |
| Activate | Requires the canonical graph envelope, validates the authored projection, verifies the process transpiler round-trip, compiles the runtime contract, and marks the definition `ACTIVE`. Each activation writes the activated canonical snapshot to `data.activated`; the runtime compiles `data.activated || data` for every active-set member, so live draft edits stay out of the runtime. Re-activation records the superseded snapshot in `data.history` (capped at 50); the Definitions pane restores a history entry as the definition's data, and restoring goes live through activation. |
| Deactivate | Removes one definition from the active set (state returns to `DRAFT`, editable and re-activatable) and re-derives the runtime contract. |
| Archive | Moves a definition to `ARCHIVED` from `DRAFT`, `ACTIVE`, or `ARCHIVED`; the runtime contract drops an active definition on the same request. |
| Type lifetime | Definitions reference type ids. An org type lives until explicitly deleted through the [cts-types](../cts-types/README.md) removal ceremony; activation and deletion leave types and their data untouched. |

Publication is one state machine; `data.migrations.state` is a separate
axis with `none`, `required`, `applied`, and `incomplete`.

| From | Event | To |
|---|---|---|
| — | create | `DRAFT` |
| `DRAFT` | activate | `ACTIVE` |
| `ACTIVE` | activate (re-activation) | `ACTIVE` |
| `ARCHIVED` | activate | `ACTIVE` |
| `ACTIVE` | deactivate | `DRAFT` |
| any | archive | `ARCHIVED` |

An `ACTIVE` definition with an `incomplete` migration is one named state:
the contract is live while the declared re-targets resume on the next
activation.

Turned-off definitions and version-history snapshots retain their data
and declaration copies; the runtime (hydration, screens, navigation) is
dictated by the `ACTIVE` definitions only.

Activation is additive across the set: `mergeActiveDefinitions` (in
`compiler-adapter.js`) merges the active set's authored data — graph
nodes and edges concatenated with id dedupe, the record maps
key-unioned, per-role `roleGrants` unioned — in activation order, later
activations winning key conflicts, and the merged data compiles through
the one compiler seam. The migration gate and the semantic Apply diff
resolve both sides additively: the previous contract is the merged
compile of the other active definitions, the next contract is that merge
plus the activating draft — states another active definition owns never
read as removals. The active set is queried from the definitions
collection (`findActiveSetByOrganization`); `/active` returns the most
recently activated definition for boot convenience.

Activation with live instances holding a removed workflow state fails
with HTTP 409 and `migrationRequired` data carrying the migration plan
(one row per typeId, its removed states, and live counts), checked
through the registered instance services with the activating actor's
auth context. A typeId whose status check cannot run is skipped, and a
drifted previous contract (one that fails to compile) leaves the diff
unavailable while activation proceeds.

The compiled runtime contract is derived from fresh semantic records for
every validate/apply/evaluation. Stored definitions containing only
`data.compiled` are rejected at validation and activation: the compiled
snapshot serves inspection, and authoring edits the semantic records.

## Migration gate and plan (canonical)

Apply turns the removed-status gate into a confirmed migration.
`migration-plan.js` owns the contract:

- **Plan** (`migrationPlan` on the validate response and on the 409
  data): one row per typeId with live instances in removed primary
  states — `{ statuses: [{ typeId, removed: [{ state, count }],
  targets }] }`, where `targets` are the type's retained primary states
  in the next compiled contract (recomputed from both sides,
  server-derived). The plan is the whole database impact statement for
  instance mutations: compatible declaration evolution needs no instance
  rewrite (absent-from-row renders absent), field-policy changes are
  redaction-only, and the append-only logs stay untouched. Declared migrations (CTS SPEC §11
  deferred tier) will land in this same plan when that tier is built.
- **Decision** — migration decisions are authored data on the
  definition: `data.migrations.statuses` carries `[{ typeId, from, to }]`
  alongside the graph records, and activation reads the declaration (the
  activate request body carries no migration data). The
  `declareStatusMappings` service entry (the agent tool
  `declare_status_mappings`) merges the declaration server-side through
  the same update boundary — no whole-document echo; an empty list
  clears the declaration back to the 409 gate. Every removed state with
  a live count must be covered by one declared mapping whose `to` is a
  retained target for that typeId; partial or off-target declarations
  are HTTP 400 with the plan attached. A declared row outside the
  current plan's requirements is a no-op, so declarations from earlier
  applies stay harmless.
- **Axis** — `data.migrations.state` is `none` (nothing to apply),
  `required` (the gate holds a plan), `applied` (the last run re-targeted
  every stranded instance), or `incomplete` (activation landed and at
  least one re-target failed; the next activation resumes). The axis is
  persisted beside the authored `statuses` and the `applied` summary.
- **Ordering** — activate, then migrate, inside one request. The status
  machine resolves the *active* contract (`resolveActiveWorkflow`), so
  re-targeting runs against machines that already contain the targets.
  After the new contract is active, each affected instance re-targets
  through `stateService.setInitialStateForOrganization` (initial-state
  semantics: the `status_events` record carries `fromState: null`; the
  old→new mapping is preserved in the migration summary on the
  definition). The producer output whose machine contains the target
  state is resolved per write and passed as `producerOutputId` metadata.
  Reads go through the registered instance service's `processList` with
  the activating actor's auth; business-entity writes stay owned by the
  target feature services.
- **Idempotent resume** — re-targeting skips instances already moved
  off the removed state, so re-posting activate re-runs the declared
  mappings and completes an interrupted migration. The applied summary
  is persisted as `data.migrations.applied` on the activated definition
  (`appliedAt`, actor, applied counts, failures) beside the declarations
  it executed. A migration step failing after activation returns HTTP
  500 with `migrationIncomplete` and the partial summary; every
  re-target publishes the shared typed invalidation event, so open
  screens reconcile exactly as if the mutation happened through an
  action.

Creation, update, validation, activation, and preview accept the authored
process projection; create and update persist the canonical graph envelope.
Save and activation persist the current records.

## Action execution seam

Run and step states follow the transition table owned by
[packages/processes](../../../packages/processes/README.md) § Runtime
orchestration. Activation compiles the contract; the organization backend serves it
continuously. A manual action executes through
`executeActiveProcessAction()`: it verifies the compiled role
assignment, resolves the authored effect's manual start, and evaluates
the action's dataflow in-process — the same graph evaluator preview uses
(`packages/processes` orchestration) over the lowered definition, driven
to settled or the first async boundary, with every effect re-entering
its registered service/command/status boundary under the originating
actor's access snapshot (including the compiled `effectivePermissions`
consumed by entity adapters). It returns the effect result — a wait
reference when the evaluation parks on an async command. The delegated
entity/status/command service remains the access and business-logic
boundary; `command_runs` and `task_runs` are the audit trail.

Durable effect dispatch classifies once (`operationKindOf`) and keeps
the record's species kind: `cts.construct`/`cts.mutate`/`cts.remove` run
through the construction/update/delete adapters, `cts.command`/
`cts.service` run commands, `cts.transition` executes through the
status runtime using its declared `state` reference — target path, axis
(`state.axis` becomes the transition region), and note. `cts.emit`
persists one `process_events` record and dispatches it to subscriber

A construct action re-run (`rerun: true` in the execute body beside the
constructed record's `instanceId`) skips the graph and re-derives the
record through the instance service's `rederive` — the compiled action
is the entry, the stored inputs are the run's inputs (SPEC §24).
entries. Effect nodes
are manual, automatic-from-socket, scheduled, or event-subscribed;
time-driven status moves belong to
the deadline scanner's declared deadlines.

## Time-driven runs (canonical: `run-store.js`, `run-scanner.js`)

Wait Until parks an evaluation at the pending-effect boundary with a
`wakeAt` date-time; the parked execution persists to
`process_executions` beside the definition snapshot it started with,
and the run scanner (`server/plugins/process-run-scanner.js`,
`PROCESS_RUN_SCAN_INTERVAL_MS`, default 15s) resumes it at the authored
time under its original actor, re-parking or completing through the same
boundaries. Scheduled entries (`trigger.schedule` — one-shot `at` or
re-arming ISO `interval`) fire as the SYSTEM principal of the
organization; every fire is ledgered as a `process_executions` document
(`kind: 'schedule'`), and a one-shot fires only while no ledger entry
exists for its entry node. Emitted events deliver inline at emit and the
scanner retries pending `process_events` records; delivery starts one run
per matching subscriber entry, the event riding the run trigger.

| Record | From | Event | To |
|---|---|---|---|
| Event delivery | `pending` | subscribers dispatched | `dispatched` |
| Event delivery | `pending` | delivery error, attempts below the cap | `pending` |
| Event delivery | `pending` | delivery error at the cap | `failed` |
| Schedule entry | `unfired` | due and fired | `fired` |
| Schedule entry | `fired` | interval elapses | `unfired` |
| Schedule entry | `unfired` | fire error | `unfired` |

Event attempts and last error are facts on the record; the delivery cap is
`EVENT_DELIVERY_MAX_ATTEMPTS` in `run-store.js`. A schedule entry's ledger
row (`process_executions`, `kind: 'schedule'`) is its state; a failed fire
persists no row and retries on the next scan. Runs parked on an async
command task keep their in-process continuation; a restart drops those
(the task runtime records the work) while Wait Until parks survive it.


Consumer effects accept the operated entity in every shape the run
context produces — a typed `{ type, id }` ref, a full DTO, or the bare
instance id the manual action transport posts as `instanceId`; the
effect boundary normalizes all three against the effect's `typeId`
before the service call. Create, update, and status effects receive one
scalar input tuple per invocation from the package-owned effect mapper;
every invocation independently re-enters the registered
service/status boundary with the complete auth context. A fully
successful mapped step keeps the historical bare effect result; a step
with failed aligned items completes with a `{ result, failures,
completedMutations }` output whose shape-preserving result tree carries
each MutationFailure record in its own slot. Completed writes stay
applied when a later item fails; `completedMutations` identifies them.

### Async completion

An async command effect (a command whose result carries task/job refs)
parks the evaluation at the task boundary. The enqueued task-run id keys
an in-process continuation; the task runtime's terminal boundary
(`continueActionFromTask` / `failActionFromTask` in this service, called
from [core/tasks](../../core/tasks/README.md)) resumes the parked
evaluation with the task's projected completion output — terminal
`TaskResult` entities land on the sockets the effect declared — and
drives it to settled with the originating actor context. A task outcome
with an unknown task-run id is an uncorrelated no-op. A server restart
between dispatch and completion drops the continuation; the task's
terminal handler still applies its domain effects. A notification error
leaves the parked continuation unresumed.

### Create

Create-entity actions are authorized as create operations by the
process action itself before the created entity exists; the delegated
feature service receives a temporary action-scoped create grant for
that feature. After the record is created, the action applies `action.state.to`
through the status runtime as the process initial state for the new
record. When the compiled action status includes process-authored
`label`, `color`/`severity`, or `icon` metadata, create and
status-mutating update execution stores that display contract under
`status.metadata.display` (status-badge rendering for generated screens
and shared entity cards is defined in
[core/machines](../../core/machines/README.md)); when the compiled
action predates that embedding, execution resolves the action
`stateRef` or target status against the semantic `data.stateDefinitions`
record and writes the same contract at runtime, so already-active
definitions render the authored severity and icon. The successful
Create boundary publishes one typed `created` invalidation with the
created type/id after the optional initial status has persisted;
constructor, block, or status failures publish nothing. Mapped Create
execution emits one event per completed tuple while retaining its
ordinary item/list/tree result topology and partial-failure reporting.

Generic mode receives block-composed data: `identity.name` is projected
to the owning service's `name` input, `data` and `specs` values are
projected only where the service has no explicit top-level value, and
non-block generic construction inputs remain available beside the
blocks, so an entity can declare an explicit source reference beside its
composed blocks. A composed Lineage block owns parent ids; its stored
ids are also projected to the owning service's top-level creation
payload, and lineage entity references are copied from the compiled
binding into the creation payload. The compiler may use one declared
lineage entity reference for contextual screen placement; the effect
boundary converts its entity reference to the canonical stored id.
Provenance is stamped by the effect boundary; constructible blocks
cover identity, data, specs, and relations.

Typed modes receive their fixed `construction.inputs` together with
canonical constructible blocks and delegate initial creation to the
corresponding domain constructor. For a typed construction input, an
explicit connected/authored value wins, then the declared construction
default is used, and an absent optional value is omitted; required
inputs without either value fail graph validation. Generic block
construction forwards only connected or explicitly defaulted fields;
the service-owned identity uid is generated by the target feature
service. The effect maps prompted drafts through the live domain
contract's construction inputs (the catalog's single derivation over
the resolved mode, authored entries merging over their contract twins
and authored extras kept; the record's own list serves only where the
domain declares no contract for the type): the persisted record's
`construction.inputs` is an authoring-time copy that can go stale, and a
prompted value that arrived through a contract-derived port survives the
draft mapping. In v4 execution, typed constructor
inputs and connected canonical blocks are collected separately: the
constructor creates the complete entity first, then the entity
feature's explicit `processUpdate()` applies authored blocks as merges
over the created DTO, keeping service-owned fields intact while allowing
the same identity, relations, attachments, specs, and data composition
available to ordinary create nodes.

Every Create payload receives the active organization as canonical
`lineage.organizationId`; parent-scoped actions additionally pass
declared containment lineage and pinned parent revision provenance, and
the owning feature service persists that context during create. A
producer may request `linkCreatedTo` with an owner type and relationship
key; after creation the runtime validates that relationship against the
domain registry and updates it through the owner's `processUpdate()`.
Relations may declare an association-data path; linking initializes its
defaults, unlinking removes it, and copy-on-write replacement transfers
it to the new target.

Typed construction and run-command actions execute with request-local
grants for the target entity they create and for the source entities
declared by the construction or command contract; the grants expire
with the request and join no persisted role. Execution grants are
read-scoped: a standing entity write grant alone exposes no command
action, and a command action grant exposes no mutation controls.

### Update

Generic Update receives field values through the same typed process
dataflow; relation collection changes are composed with ordinary list/tree
operations before the leaf write, then persisted through the target
feature's `processUpdate()` contract. Manual Update effects compile into
the normal generated action manifest; Relations data connections without an
effect remain non-executable dataflow.

Status-mutating `updateEntity` actions go through the status runtime
with the connected entity patch attached to the status mutation. Both
`updateEntity` paths emit the updated typed entity DTO as the node
result, matching the declared entity output type: the status path
returns the entity snapshot written by the transactional
status-plus-patch boundary, so downstream nodes and generated screens
always receive a current typed entity. Non-status `updateEntity` actions
delegate to the feature's explicit `processUpdate()` handler: after
loading the target through its owning feature service and checking
write access, the runtime hands the handler the nested §3 wire patch —
leaf writes at their §3 slots (`fields.*`, `name`, `relations.*`), built
by the one patch conversion home in this service
(`wirePatchFromChanges`) — which the handler persists through the owning
feature boundary; lifecycle writes stay status-runtime-owned.

Immediately before a compiled Create constructor or Modify persistence
call, the effect adapter normalizes each connected Relations replacement
against the current graph-declared owner/key/target/cardinality
contract. It resolves every target through its registered
`processGetById` adapter with the run auth context, applies ordinary
read access (including active-organization isolation), and removes
duplicate targets from many-valued replacements by the same type/id
identity Link and Unlink use; a revision pin adds no second association
to the same entity. A failed check leaves the owner persistence method
uncalled. The check lives at the compiled effect because the feature
services lack the graph metadata; non-relation patches keep their service
semantics.

### Change status, archive, delete

Change Status forwards authored region/path scope, lifecycle evidence,
and actor assignments (SPEC §7: the node's user-typed `actors` value) to
the status runtime and returns the updated entity DTO. Archive uses the
compiled domain archive intent or the `ARCHIVED` state. Hard deletion
delegates to the registered `processDelete(id, auth)` adapter after
domain and runtime capability checks; delete actions must be manual,
admin-scoped, and present in the caller's compiled action manifest.
Collection topology and failure behavior are owned by the shared
process mutation mapper documented in
[packages/processes](../../../packages/processes/README.md).

### Relation link and unlink

Compiled process-relation actions execute directly at the
active-definition boundary: Link merges the selected typed reference
according to relation cardinality; contextual Unlink removes the exact
reference supplied by the linked entity row. Persistence delegates to
the owner entity's `processUpdate` service, and auth hydration and
execution resolve actions from the same freshly compiled canonical
graph. An Unlink action whose relation entry declares
`unlink: 'delete'` deletes the unlinked target instance through its
entity service after the reference write (the `cts.remove` delete and
event path; the default `detach` policy removes the reference alone).

Compiled Link actions grant their exposed roles read access to the
declared target entity feature so generated entity pickers can load
authorized choices; the owner entity's create-construction fields stay
with the owner. Link option resolution keeps embedded creators scoped
to their construction source: it reads the source typeId from the
normalized creator contract, uses domain containment to resolve both
the owner's parent and the source's parent, then crosses the single
matching process-declared Link relation between those parents. Source
and derived-target reads use the embedded creator's temporary execution
grants, while owner and ancestor reads retain the caller's ordinary
access checks. An unresolved or ambiguous scoped path returns no
candidates. The same endpoint returns existing derived targets for
normal selection and source entities for the embedded Create-new flow.

Submitting `relationCreator` to the Link action runs that exact embedded
constructor and persists the returned reference through the owner's
`processUpdate()` boundary. An embedded creator request may also declare
`relationReplaces` for one target already linked through that same
relation: after creation, the relation runtime verifies the old
reference belongs to the owner and replaces it with the new target in
one owner update — the generic copy-on-write path for editing immutable
derived entities from an owning context. `linkCreatedTo` is accepted
only when the domain declares the requested many-valued owner
relationship and its target matches the created type; the runtime
resolves the owner from action context and uses its explicit
`processGetById()` and `processUpdate()` methods with a narrow
request-local write grant.

Relation writes evaluate the entry's declared target domain (`where`,
CTS SPEC §6) over the target's stored row at the write boundary — the
same expression `relation-option-resolver.js` filters Link-picker
candidates with (one evaluator home:
[shared/relation-domain.js](../../../shared/relation-domain.js)) — so a
value outside the domain is refused whatever offered it.

### Run command and run service

Run-command actions use the same action-scoped execution model: the
action must be present in the user's compiled action manifest, then the
command executes with a temporary grant on the action's input entity
feature so the command runtime can enforce its normal domain access
contract. Domain command definitions may also declare
`access.executionGrants` for records the handler must read while
executing the command but that should stay out of ordinary user
list/detail access.

Run Service sockets are resolved from the current registered command
definition at authoring and validation boundaries. The executor
partitions those flat typed socket values into the command runtime's
`entities` and `parameters` envelope; command results are projected
back onto typed entity and attachment output sockets while the full
result remains the fallback output for commands without declared
entity/attachment outputs. When a synchronous run-command action
returns entity refs and the visual graph wires a typed output handle
into a downstream status-mutating `updateEntity` node, execution applies
that target process status to each returned entity through the status
runtime. Async command results that include task/job refs park at the
task boundary (see [Async completion](#async-completion)); the task
completion boundary owns final output status and child-output linking.

Activation resolves required entity profiles from command metadata; the
validator derives the list from the domain command contract.

### Derived exports

Declaration-derived export actions (SPEC §21, the hydration
payload's `exports` bindings) execute through
`executeDerivedExportAction`: the `(typeId, kind)` binding must be
declared by an installed plugin, and the `generateAttachment` command
gates the run on the caller's write grant over the source instance.

### Serialization

Preview and action-evaluation responses leave the process runtime
through `serializeProcessResult` from
[packages/processes](../../../packages/processes/README.md): evaluator
missing-field markers are converted to the machine-readable tag
`{ missing: true, path }` at any depth, while present `null` values
stay `null`, so consumers distinguish an absent field from a nullable
one directly from the JSON response.

## Compiled outputs and gates

Activation validates every effect node's service binding against the
registered per-type capability record. `cts.construct` requires `create`
(a registered create mode matching the construction mode), `cts.mutate`
requires `processUpdate`, `cts.remove` requires `delete`, and
`cts.transition` requires `archive` for an archive intent, else a status
workflow: the domain machine when one is served, else the draft's own
seeded state vocabulary (SPEC §7 — machines are graph-derived, so the
draft's state nodes satisfy the gate exactly like the machine
`compileWorkflows` builds from them). A node whose selected type lacks
the required capability is rejected as a deterministic
`validation.errors` entry (HTTP 400) at activation time. The enforcement
pass consumes the per-type `processCapabilities` record documented in [server/runtime](../../runtime/README.md) and is a no-op
when the registry exposes no capability map; the capability derivation
itself is the canonical projection in
[packages/processes](../../../packages/processes/README.md).

Entity lifecycle profiles and action nodes compile directly into
normalized core workflow v2 machines. Runtime status resolution
uses the active process workflow before organization overrides and
domain defaults, so action-only process graphs still define the statuses
and transitions exposed by the status runtime. Authenticated runtime
hydration includes those compiled workflows under `process.workflows`;
shared entity surfaces consume that same effective contract to suppress
non-informative status chrome for one-state lifecycles, resolving
visibility from the contract.

Role identities and user assignments live outside process definitions:
the `data.roleGrants` record maps stable organization role ids to
process-owned base feature grants; entity profiles, actions, screens,
and transitions add their own operational mappings. Validation and
compilation receive the current organization role catalog explicitly and
reject missing role references. The compiled contract contains role
capabilities; per-user access resolves at hydration, which reads the
active organization assignment against that contract on every request —
assignment edits take effect on the next request and leave the active
process untouched. Availability is visibility: hydration's generator
action contract (`process.actions`) carries only the actions the
assignment's roles can run, so an action no assigned role carries
renders on no surface; the run gate (`assertCompiledActionAvailable`)
stays the execution authority.

The same save-boundary rewrites that enforce the structural floor
collapse an effect's access to its primary grant — one grant per
effect, its lane. Active-runtime compilation normalizes stored create
actions whose construction mode is absent from the selected typeId's
declaration and applies the deterministic producer-identity migration
in memory, so older stored definitions remain executable before the
persisted migration is applied; ambiguous producer ownership still fails.

Process definition management accepts the active organization
membership's stored `organizations` grants as a narrow recovery path,
keyed on stored grants alone and local to process-definition operations.

## Feature access boundaries

Entity query nodes stay inside feature access boundaries. Registered
services expose `processList`/`processGetById` adapters as defined in
[server/runtime](../../runtime/README.md); process evaluation calls only
these adapters for current/exact entity reads, parent resolution,
relation-target validation, update-target loading, and socket
projection.

`executeProcessQuery` forwards the concrete filter object to the
adapter's `processList` verbatim with the full auth context — the
children read's `lineage.<key>` filter is the shipped shape. Filtering is
process algebra: predicate conditions and gates stay algebra values,
evaluated in memory by `entityFilter` over the serialized models
([packages/processes](../../../packages/processes/README.md)). Parent,
Children, and Related reads resolve from the domain
`containment` and `relations` contracts via the pure helpers in
`entity-sources.js`: Parent loads the declared lineage parent through
`processGetById`, Children query declared children through `processList`
with the `lineage.<key>` filter, and Related resolves each stored relation
reference through `processGetById` by its declared target type. They
receive the full auth context; a missing or denied parent/relation
target fails clearly, and root entities and empty relation values return
null or an empty list.

Process create, update, status-mutating update, and command-output
status mutations publish typed invalidation events through
[instance-events](../instance-events/README.md) after their canonical
mutation succeeds. Generated screens consume those events through the
shared browser-local entity sync contract and then reload their normal
sources.

Compiled process access is windowed by graph state. Status-mutating
update nodes inherit the incoming entity access until edited, then
replace the target-status role set with the node's selected grants.
Parent lineage scopes are preserved by the compiler, so child actions
created from a scoped parent branch emit grants scoped by the parent's
lineage key to the scoped instance.

## Deadline scanner

The deadline scanner (`deadline-scanner.js`, wired by the
`deadline-scanner` nitro plugin) lives here because its input is the
activation-written compiled snapshot: on an interval it resolves every
organization's `ACTIVE` definitions, walks their compiled machines'
states for declared deadlines (custom lifecycle workflows), and moves
overdue instances — `stateChangedAt` (falling back to
`status.timestamp`) older than the declared duration — through the
status engine as SYSTEM. Scan input is the stored `data.compiled`
snapshot only; auth decisions always recompile and read a fresh path.
Rescans are self-stabilizing: moved instances leave the state query, and
guard/access refusals are counted and retried on the next tick. The
same snapshot-read law serves `listActiveWorkflowStates(auth)` — the
active set's emitted types with their primary-region state paths,
picker data for the [agent bot wake rules](../agent-bots/README.md).

## Authoring seams

Agent authoring rides the same headless seam the designer uses
(`createDefinitionAuthoring`) through two service entries:
`composeDefinition` (gestures onto a fresh draft) and `editDefinition`
(gestures onto an existing definition's stored authored document —
server-owned activation records preserved, the same step grammar and
legality gates; the tool catalog in
[agent-bots](../agent-bots/README.md) serves them as
`compose_process_definition` / `edit_process_definition`).
Gesture values are contract-gated: `configure` writes record semantics
only (`value` on literals, `access` lanes, `construction` modes, the
per-kind authored fields) and refuses `inputDefaults`; socket defaults
ride `setInputDefault (id, input, value)`, which refuses sockets the node
does not declare (the error lists the node's input sockets) and authors
entity references only in the `{type, id}` picker shape. The compile-side
default normalize drops defaults addressing undeclared sockets.
`listConstructionModes(organizationId)` serves the projected domain's
per-type construction modes with each type's default to the
[agent-bots](../agent-bots/README.md) vocabulary's `detail:
'construction'` view. The seam
resolves ports against the **draft-overlay domain**: every declaration
step (`declareClass`/`declareTypeRef`/`declareField`/`wireDeclaration`)
re-seats the session onto `declarationOverlayDomain` over the projected
domain, and `editDefinition` seats the stored draft's own unapplied
declarations before the first step — the tree's declarations are ports
immediately, so a field declares and wires in one session. A
declaration the registry refuses, or field records
whose `typeId` matches no class, ride the very `Unknown port` step error
as a named cause (`draft overlay: <type> skipped: <reason>` / `… field
record(s) matched no class typeId`), so the failure names its cause and
the next action.

`applyTreeDeclarations(id, auth)` is the designer Apply's declaration
step as a service entry (the agent tool `apply_declarations`): it
compiles the draft's in-tree declaration tree and posts each
declaration through the cts-types `defineType` boundary — the same posts
the designer's APPLY makes client-side before activating. Validation
overlays the draft's own declarations; the activation compile resolves
types against the registry — an in-tree-declared draft needs its
declarations applied before activation. A registry refusal (breaking
type diff, SPEC §11) returns as a structured per-type failure; posts are
idempotent re-posts.

`rewriteRetiredWirePaths` (`packages/cts` graph-protocol) runs at the
definition-resolution seam and in the save-boundary persisted rewrites:
retired `name` construction-input entries, `name` socket defaults, and
edges wired into the retired name handle drop before validation,
compilation, execution, or storage sees the draft. `retireStateScopeAuthoring`
runs in the same chain and strips class-scoped state authoring the same
way: state→class `declares` wires and the state
`typeId`/`initial`/`terminal` scope fields (SPEC §7 — states wire into
create/transition operations and parent states only).

`createActiveEmptyProcess()` is the organization-bootstrap path: it
authors the organization's first definition through the authoring seam —
empty, stationing the organization's starter constructs (the mounted
packs' plus the installed plugins' via
`starterConstructsForOrganization` in [plugins](../plugins/README.md);
the documents pack's markdown-first set carries the visible-by-default
law, SPEC §4), each as a manual construct granted to `role_admin` —
then compiles and activates it. The signup flow that calls it is owned
by [organizations](../organizations/README.md) (`createInitialForUser`).
Organizations created before the starter set existed are repaired by
`server/scripts/station-documents-types.js` (the additive stationing
operator).

`findTypeReferences(organizationId, typeId)` is the blast-radius probe
type authoring consumes before destructive changes (see
[cts-types](../cts-types/README.md)): it lists the org's non-archived
definitions whose nodes, screens, or draft declaration children edges
bind a CTS type.

## Socket projection and auth hydration

Socket projection is exposed as a runtime operation for outbound
sockets. The socket API loads the source entity through the app
registry, enforces read access, copies only the socket projection
fields, applies excluded fields, and returns receiver lifecycle metadata
for the target organization to interpret. Inbound sockets are receiver
contracts in the active process graph; the outbound projection API
serves outbound sockets only.

Auth hydration compiles the current semantic process graph before
resolving screens, actions, workflows, and grants, and manual action
execution uses that same compiler path. Evaluation resolves the same
projected domain the compile path used, so block records bound to
org-authored types pass the runtime block check. The stored compiled value
is an activation snapshot; both runtime boundaries compile the canonical
graph.

## API

| Route | Responsibility |
|---|---|
| `GET /api/process-definitions` | List the organization's definitions. |
| `POST /api/process-definitions` | Create a definition from current semantic records. |
| `GET /api/process-definitions/active` | Most recently activated definition (boot convenience). |
| `POST /api/process-definitions/preview` | Evaluate a draft node preview (`preview`). An endpoint value service evaluates through the endpoint adapter (including deterministic-cache replay); a managed pure/read value service executes through the installed, version-pinned plugin runtime worker. Effectful, claim, and local-only services are not run by server preview. Preview does not write `command_runs`. |
| `GET /api/process-definitions/:id` | Read one definition. |
| `PATCH /api/process-definitions/:id` | Save (`update`; identity-only PATCH leaves data untouched). |
| `DELETE /api/process-definitions/:id` | Remove (`remove`). |
| `POST /api/process-definitions/:id/validate` | Validate and return the semantic Apply diff. |
| `POST /api/process-definitions/:id/activate` | Activate (migration declarations; activate-then-migrate in one request). |
| `POST /api/process-definitions/:id/deactivate` | Remove one definition from the active set. |
| `POST /api/process-definitions/:id/archive` | Archive the definition. |
| `POST /api/process-definitions/active/actions/:id/execute` | Execute a manual compiled action (`executeActiveProcessAction`). |
| `GET /api/process-definitions/active/actions/:id/options` | Relation choices for a compiled action (`getActiveRelationOptions`). |
| `POST /api/process-definitions/active/exports/run` | Run a plugin-declared derived export (`executeDerivedExportAction`). |
| `POST /api/process-definitions/sockets/:id/project` | Outbound socket projection (`projectEntityThroughSocket`). |

## Related

- [server/features](../README.md) — feature classification and shared service rules
- [cts-types](../cts-types/README.md) — registry view, declaration boundary, type removal
- [organizations](../organizations/README.md) — signup bootstrap, role catalog
- [plugins](../plugins/README.md) — starter constructs, export bindings
- [agent-bots](../agent-bots/README.md) — authoring tools, wake rules
- [core/tasks](../../core/tasks/README.md) — task/claim protocol and terminal boundary
- [core/machines](../../core/machines/README.md) — status runtime and stamps
- [server/runtime](../../runtime/README.md) — app registry, service adapters, capability records
- [packages/processes](../../../packages/processes/README.md) — compiler and evaluator semantics


## Destructive action access

A compiled `cts.remove` action is a hard delete and requires an admin-level `delete` grant on the target feature. A write-level update grant is not sufficient. The runtime adapter repeats the same action check before persistence.
