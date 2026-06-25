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
tenant relationship; process assignments are the runtime role source.
When a draft is activated, the service preserves the current active process
assignments for the organization before compiling. Team Management owns user to
process-role assignment, so an older designer draft cannot erase assignments
that were changed after the draft was forked.

Manual generated-screen actions execute through the active process definition,
not through client-selected entity routes. `executeActiveProcessAction()` loads
the active compiled action, verifies that the user's compiled role assignment
contains that action id, and then delegates by action kind: entity creation,
entity update, status transition, command execution, or outbound organization
projection. The process graph remains the source for whether the button exists;
the delegated entity/status/command service remains the access and business
logic boundary. Create-entity actions are authorized as create operations by
the process action itself before the created entity exists; the delegated
entity service receives a temporary action-scoped create grant for that feature
instead of requiring an already-existing status-scoped entity grant. After the
record is created, create actions apply `action.status.to` through the status
runtime, treating it as the process initial state for that new record rather
than a transition from the feature service default. When the compiled action
status includes process-authored `label`, `color`/`severity`, or `icon`
metadata, create and change-status execution stores that display contract under
`status.metadata.display` so generated screens and shared entity cards render
the actual process status badge instead of falling back to global raw-state
labels.
If an already-active compiled action was produced before that metadata was
embedded, execution resolves the action `statusRef` or target status against
the semantic `data.statusDefinitions` record and writes the same display
contract at runtime. This keeps existing active process definitions rendering
the authored severity and icon without requiring an immediate compiled-runtime
rebuild.
Create actions also carry a construction contract. Generic construction passes
prompted values to the registered entity service and derives parent ids from
the incoming graph entity input, for example a queue create action wired from a
project output sends `projectId` to the queue service. The active action
runtime requires that parent id when the compiled action declares
`parentEntityType`; a missing parent is rejected before the domain constructor
runs, rather than creating an unowned root record. The runtime normalizes
canonical creation blocks before delegating: `identity.name` and
`identity.slug` become the service `name`/`slug` fields, and `data`, `specs`,
and `summary` entries are projected to top-level constructor keys when that key
is not already present. This keeps block/value nodes aligned with the entity
service contracts without adding compatibility routes or generic blob creation.
Typed construction modes delegate to the domain constructor instead of generic
entity creation:
`createDefaultOccsTemplate` calls the cassette template service to create a
named OCCS `cassette` template with the default graph-tree document;
`bakeCassetteDesignFromTemplate` calls the cassette template service, requires a
template id or resolves the default construction-ready template visible to the
caller, accepts concrete parameters and a name, creates a real `cassette_design`
with geometry/editor provenance, then applies the process target status.
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
must read while executing the command but that should not become ordinary user
list/detail access. For example, a manual `solveNesting` action on a queue can
run from a generated queue detail only when that action id is present in the
user's compiled action manifest for the opened queue entity. The action gets
transient read access to the cassette templates/designs referenced by the saved
queue job, while queue job edits still require the separate `queues:write`
entity grant. A queue write grant alone does not expose the command action, and
a command action grant does not expose queue mutation controls.
When a synchronous run-command action returns entity refs and the visual graph
wires a typed output handle into a downstream `changeStatus` node, execution
applies that target process status to each returned entity through the status
runtime. Async command results that include task/job refs are not projected at
command-return time; the task completion boundary owns final output status and
child-output linking. This prevents commands such as `solveNesting` from
moving a `nesting_run` out of its solver state before the `nesting.solve` task
can apply the domain completion intent and attach generated `sheet_design`
records. The migration script
`server/scripts/migrate-process-command-output-statuses.js` applies the same
graph-derived status projection to existing active-process command outputs; it
must not hardcode status names.
Activation and the process-construction migration normalize stored create
actions whose construction mode no longer belongs to the selected entity type
before recompiling the active runtime contract.
Compiled process access is windowed by graph state. Status-change nodes do not
append permanent grants; they inherit the incoming entity access until edited,
then replace the target-status role set with the node's selected grants. Parent
lineage scopes are preserved by the compiler, so child actions created from a
scoped parent branch emit lineage-scoped grants such as `scope.projectId`
instead of global child-entity permissions.

Socket projection is exposed as a runtime operation for outbound sockets. The
socket API loads the source entity through the app registry, enforces read
access, copies only the socket projection fields, applies excluded fields, and
returns receiver lifecycle metadata for the target organization to interpret.
Inbound sockets are receiver contracts in the active process graph and cannot
be used by the outbound projection API.
