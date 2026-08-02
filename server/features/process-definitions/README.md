# COMPONENT: Process Definitions

Organization-owned process definitions store the visual process graph and the
compiled runtime contract for roles, user assignments, entity workflows, field
policies, service availability, sockets, screen manifests, and navigation.
Runtime role permissions are derived from the graph during compilation:
entity-profile access and screen requirements create grants, screen manifests
create navigation, and service run/view access uses service identities
instead of user roles. If a role has grants but no authored screen for the
granted entity feature, compilation creates a generated entity-list screen for
that role/feature instead of relying on static app navigation.

Activation is the only path that affects runtime behavior. The service
requires canonical semantic process records, validates the draft, verifies the
process transpiler round-trip, compiles the runtime contract, archives the
previous active process for the organization, marks the selected process
`ACTIVE`, and stores its id on the organization.

Activation and all write boundaries normalize the semantic source to
`dataflowVersion: 3`. The migration replaces old graph node types with catalog
operations and clears the old compiled snapshot; validation or compilation
failure stops activation instead of retaining a v2 runtime beside a v3 graph.
Starter templates pass through the same migration.

## Durable orchestration

The feature persists orchestration capability records in
`orchestration_runs` and `orchestration_step_runs`. These are not domain
entities and are not registered in the CNC entity catalog. A run owns its
definition id, organization id, trigger payload, control tokens, foreach
scopes, join arrivals, wake time, retry state, terminal result/error, and an
optimistic `revision`. A step receipt owns one effect idempotency key and its
running/succeeded/failed result. Unique step keys prevent a resumed request
from applying the same external effect twice.

`POST /api/process-definitions/:id/runs` starts a manual v3 trigger and drives
it until success, failure, or a wait boundary.
`POST /api/process-definitions/runs/:id/resume` provides an explicit recovery
resume, and `GET /api/process-definitions/runs/:id` reads the authorized run.
The process-orchestration Nitro plugin polls due `wakeAt` records. Effect nodes
are either manual or automatic-from-socket. Date algebra feeds an explicit
wait-until control step, which persists the wake boundary before forwarding its
event to the automatic effect. Entity/domain subscriptions require a separate
process-entry contract and are not inferred from effect configuration.
The originating actor/access snapshot is stored with the run so a due
continuation re-enters the normal feature access boundary. API handlers do not
touch orchestration collections.

The pure scheduler lives in `@cutkit/processes`. This service supplies only
authorized read adapters and effect adapters. Reads use registered entity
services. Effects delegate to command, entity, status, projection, producer, or
attachment services and never write another feature's repository. Generic
Create consumes connected canonical blocks. Update flattens only writable
fields present in connected replacement blocks. Lineage entity references are
normalized to stored ids at this boundary, while lifecycle status remains a
dedicated status-runtime input. Legacy leaf-field effects migrate to explicit
block composers rather than remaining a second execution contract.
Pure block operations resolve exact paths from the domain's entity-independent
block schema registry. The effect adapter deliberately switches back to the
target entity schema when projecting constructible or writable values. Stored
process nodes retain selected block paths but not copied schema snapshots, so
runtime behavior follows the activated domain contract rather than stale graph
metadata.
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

`createActiveFromTemplate()` is the organization-bootstrap path used by signup
and organization creation. It creates the starter process, assigns the creator
to the process admin role, compiles it, activates it, and stores the active
process id on the organization.

Active process assignment changes are allowed through
`assignUserToActiveProcess()`. This updates `data.assignments`, recompiles the
active process in place, and makes the new effective permissions, screens, and
navigation available on the next auth hydration. Assignment updates preserve the
process status value object and only touch its audit metadata, so repository
serialization continues through the shared entity model. Memberships remain the
tenant relationship; process assignments are the runtime role source. Before
that recompile, assignment applies the same feature-local legacy status-action
normalization used by auth hydration, so stored `changeStatus` actions become
canonical `updateEntity` actions in the semantic process source and do not
break signup/team assignment paths.
When a draft is activated, the service preserves the current active process
assignments for the organization before compiling. Team Management owns user to
process-role assignment, so an older designer draft cannot erase assignments
that were changed after the draft was forked.

Manual generated-screen actions execute through the active process definition,
not through client-selected entity routes. For v3 definitions,
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
`status.metadata.display` so generated screens and shared entity cards render
the actual process status badge instead of falling back to global raw-state
labels.
If an already-active compiled action was produced before that metadata was
embedded, execution resolves the action `statusRef` or target status against
the semantic `data.statusDefinitions` record and writes the same display
contract at runtime. This keeps existing active process definitions rendering
the authored severity and icon without requiring an immediate compiled-runtime
rebuild.
Generic Create receives block-composed data. `identity.name` and
`identity.slug` are projected to the owning service's `name`/`slug` inputs;
`data` and `specs` values are projected only where the service has no explicit
top-level value. A composed Lineage block owns parent ids. The compiler may use
one declared lineage entity reference for contextual screen placement, and the
effect boundary converts its entity reference to the canonical stored id.
Origin, provenance, status history, and summary are not accepted as generic
constructible blocks.
Parent-scoped create actions also pass declared containment lineage and pinned
parent revision provenance in the initial create payload. The owning feature
service must persist that context during create; process definitions do not
write child rows directly or patch another feature's collection after creation.
Create Entity owns both generic and typed domain construction. Generic mode
receives canonical blocks; any other declared mode receives only its fixed
`construction.inputs` sockets and delegates to the corresponding domain
constructor. Producer identifiers remain internal runtime metadata rather than
separate authoring nodes:
`createDefaultOccsTemplate` calls the cassette template service to create a
named OCCS `cassette` template with the default graph-tree document;
`bakeCassetteDesignFromTemplate` calls the cassette template service, requires a
template id or resolves the default construction-ready template visible to the
caller, accepts concrete parameters and a name, creates a real `cassette_design`
with geometry/editor provenance, then applies the process target status.
The typed cassette-design constructor is sourced from a cassette template, not
from a queue. A queue consumes existing baked designs through its
`data.job.items[]` contract; process graphs should model that as a queue update
or queue-specific action after the design exists, not as a queue parent edge
into `bakeCassetteDesignFromTemplate`.
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
For dataflow v3, Run Service sockets are resolved from the current registered
command definition at authoring, validation, and durable-resume boundaries.
The durable executor partitions those flat typed socket values into the
command runtime's `entities` and `parameters` envelope; it does not accept a
generic nested parameters socket. Command results are projected back onto
typed entity and attachment output sockets while the full result remains the
fallback output for commands without declared entity/attachment outputs.
Entity query nodes also stay inside feature access boundaries. The application
registry gives every registered entity service one explicit
`processList(filters, auth)` adapter matching that feature's real list
signature. Process evaluation calls only this adapter, serializes returned
models, and then evaluates entity-typed field predicates in memory. Predicate
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
connected entity patch attached to the status mutation. Non-status
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
Generated queue composition has one additional active-process boundary for
existing cassette-design sources. `POST
/api/process-definitions/active/queues/:id/items` requires an active process,
loads the queue through the queue feature, loads the selected cassette design
through the cassette-design feature, checks read access for both, and then
appends the canonical `data.job.items[]` row through queue `processUpdate()`
with a narrow request-local queue write grant. It does not expose arbitrary
queue patching and is separate from process producer actions that create a new
`cassette_design` before appending it.
Activation and the process-construction migration normalize stored create
actions whose construction mode no longer belongs to the selected entity type
before recompiling the active runtime contract.
Compiled process access is windowed by graph state. Status-mutating update
nodes do not append permanent grants; they inherit the incoming entity access
until edited, then replace the target-status role set with the node's selected
grants. Parent lineage scopes are preserved by the compiler, so child actions
created from a scoped parent branch emit lineage-scoped grants such as
`scope.projectId` instead of global child-entity permissions.

Socket projection is exposed as a runtime operation for outbound sockets. The
socket API loads the source entity through the app registry, enforces read
access, copies only the socket projection fields, applies excluded fields, and
returns receiver lifecycle metadata for the target organization to interpret.
Inbound sockets are receiver contracts in the active process graph and cannot
be used by the outbound projection API.

Auth hydration returns the compiled process screen manifest as-is. Generated
process `home` screens may be synthesized from inferred `auto_*` list screens,
so stored process definitions should still be recompiled with
`server/scripts/migrate-process-compiled-runtime.js` whenever the compiler
changes that contract.
When an active process still carries a stale compiled runtime that predates
action entity contracts, auth hydration recompiles the active process
definition in memory from its semantic source before returning role action
assignments. If that semantic source still uses legacy `changeStatus` action
kinds, hydration applies the feature-local in-memory `updateEntity`
normalization before recompiling. The durable cleanup script reuses that pure
normalizer and adds database persistence/recompile behavior; runtime modules
must not import `server/scripts/*` because Nitro dev output preserves script
relative package imports from `.nuxt/dev`. This preserves the strict current
`contracts.inputs` / `contracts.outputs` protocol for generated workspaces
such as queue cassette producers without adding UI fallbacks for older output
shapes. The migration scripts remain the durable cleanup path for stored
process data.
