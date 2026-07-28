# COMPONENT: Organization Pages

Organization pages manage the current tenant context.

`index.vue` is a thin route wrapper around the generated organization overview
screen from auth hydration. The server stores that screen in the user's screen
manifest with `template: "organizationOverview"` and a list of accessible
organization system screens. The page does not decide which organization
sections exist; it renders the hydrated screen contract.

`billing.vue` renders the generated organization billing screen from auth
hydration. Billing packages are loaded from
`/api/organizations/:id/billing/packages`, account state from
`/api/organizations/:id/billing/account`, and checkout/payment sync through the
same organization billing route group. User profile routes do not buy or hold
credits. Billing checkout is a billing-screen action gated by
`organizations:admin`; team management and process design are separate route
screens gated by their own effective permissions.

`users.vue` is the team management route for invitations, membership approval,
user creation, and process role assignment. The page reads roles from the
active process definition, and writes assignments through
`/api/process-definitions/active/assignments`. It is the operational owner for
assigning actual users to abstract process roles. It does not expose membership
role labels as process roles. Invites, user creation, and assignment editing all
preserve multiple selected process role ids. The role dialog derives assignment
binding fields from selected process screens instead of showing raw JSON, and
previews graph-derived access plus compiled screen routes from the current role
selection before saving. Missing assignment bindings are still surfaced from the
compiled active process so overloaded/scoped screens do not silently disappear
when a user lacks a required project or entity binding.
The route expects `/api/users` to return canonical user DTO blocks with
`identity.name`, `data.email`, and membership summary fields visible under
`users:read`; it derives the active organization id from the loaded organization
store first and falls back to the auth membership list.

`process.vue` is the visual process-designer surface. It edits organization
process definitions with Vue Flow, persists drafts through
`/api/process-definitions`, validates them through the process compiler, and
activates compiled runtime contracts for access, screen manifests, navigation,
entity workflows, services, sockets, and field policies. The checkmark apply
button saves or forks the visible graph, activates the resulting process
definition, and surfaces activation warnings/errors in the validation panel so
operators can tell when the graph became the organization's active process.
The route uses the
authenticated app layout with a full canvas workspace and compact floating
controls over it. The graph palette is a compact, descriptive control grouped
into start/input, values, entities/fields, selection/filtering, actions, flow,
and advanced data structures. Its framework metadata comes from
`createProcessDesignerContract(cncDomain)`; the route supplies CNC as the active
domain implementation rather than importing separate CNC field/construction
registries. The palette is deliberately not the exhaustive runtime catalog:
automatic conversions and trigger-payload plumbing are inserted by connection
planning and cannot be added as unexplained empty nodes. Advanced scheduling,
control, collection, and tree operations remain available behind an explicit
reveal. Palette rows explain the concrete job before adding the node, while
text, number, and yes/no choices create correctly typed literals immediately.
The properties pane is a bounded floating aside; its tab body owns vertical
scrolling so long entity lifecycle and role forms remain reachable without
moving the canvas.
When older saved graphs still contain role/user layout nodes, the route filters
those non-canvas nodes out and reconstructs entity/service/socket nodes from
the process records so active definitions do not open to a blank canvas. Truly
empty processes render compact canvas add controls for the same three object
types.
The route now delegates process round-tripping to `@cutkit/processes`:
canonical semantic records project into Vue Flow nodes through
`definitionToCanvas()`, and saving writes the visible canvas back through
`canvasToDefinition()`. Canvas layout is therefore presentation state; roles,
entity lifecycles, action definitions, services, organization sends, screens,
and assignments remain the process source of truth. If a stored process contains
only compiled runtime data and no semantic records, the designer shows a clear
validation error instead of guessing a canvas.
On load, the route fetches the active process and the current process list,
selects the active process first, and falls back to the newest usable draft or
saved definition only when active is unavailable. Empty canvases show a passive
current-process state; they do not propose starter action buttons over the
workspace.
The screens tab authors the generated UI manifest for operational user screens:
fixed templates, one or more typed entity sources, one or more display regions,
entity display surfaces, required access, assignment binding, and process
action ids. It does not expose raw JSON as the normal authoring surface. When
activated, compiled user screens are routed through `/screens/:screenKey`; the
semantic route entered in the designer is retained as process metadata.
Screen feature choices, new screen defaults, and new canvas entity/action/socket
defaults are derived from the domain entity registry. The designer must not
hardcode app navigation routes or concrete CNC entity names as generic process
defaults; concrete starter graphs belong in process templates.

The inspector edits the selected canvas record only. Status definitions live
in a dedicated toolbar manager, so definition-plane status metadata is not
mixed into node inspection. The remaining inspector surfaces are:

- the roles tab owns human process role labels and derived access summaries;
- the service access tab owns service runtime identities used by service run/view access;
- the screens tab owns screen id, label, generated UI template, source entity/mode rows, display region rows, route, placement, required access, role ids, assignment binding, and screen action ids;
- entity nodes own entity type, lifecycle mode, inline status-machine states/transitions, transition role access, node role access, and public/write/private field policy;
- the action-node inspector owns fixed action kind, trigger mode, per-role access level, target entity or command, target status, update fields, projection fields, derived typed data sockets, and completion event socket; the canvas node shows only the accurate semantic summary and ports;
- process algebra nodes own task-specific controls for their palette type:
  traversal for entity references, entity-to-block decomposition, block/path
  output selection, text transform, comparison condition, boolean composition,
  or collection result; the route derives kind, operation/mode, and typed
  sockets from those controls. Entity and block settings are recalculated from
  incoming wires during graph sync, so process nodes that read entities or
  blocks follow the connected source contract in real time;
- service nodes own command selection, run/view service identities, prepaid
  token billing metadata, and command-derived inputs/outputs;
- socket nodes own direction, entity type, projected/excluded fields, send/receive roles, and receiver lifecycle;

Role and user assignment records are intentionally not Vue Flow nodes. Roles are
reusable human process responsibilities assigned onto entity access rules,
action access grants, screens, socket access rules, and status-machine
transitions. They do not own navigation routes or raw grant JSON. The role tab
therefore edits labels and shows a derived access summary from the graph.
Service execution identities are edited as separate service identities and
are assigned to service run/view access; they are not user roles and cannot
trigger manual actions. Concrete user assignment editing belongs to Team
management, not the process designer.
Action nodes are the preferred process-design surface for new behavior because
they describe what happens. Entity profiles remain process resources for
lifecycle and field-policy contracts, while action nodes reference those
resources and compile into runtime trigger contracts.
Entity creation actions expose an optional parent input socket and derive the
parent contract from the incoming edge instead of a parent-type dropdown.
The designer always renders that optional socket so a parent can be wired. Until
an entity edge is connected it is a generic parent target and compiles as a root
create; after wiring it relabels to the concrete parent entity type.
Update-entity actions consume their entity from the incoming edge, expose one
left-side data socket per selected mutable field, and compile those selected
fields against the domain field policy for the concrete incoming entity type.
Change-status actions do not select an entity type; the entity arrives through
the left data socket and only the target status is configured on the node.
Archive is modeled as that target status, and cross-organization transfer is
modeled as a send-to-organization action with projection fields.
The node title for a change-status action is the actual target status label
from the connected status definition, falling back only to the target state id.
Designer sync treats generic action labels such as `Action` or `status` as
empty for status actions so generated screens and the canvas do not show
placeholder verbs where a lifecycle state is required.
Inbound organization socket nodes model receiver inputs from other
organizations and produce received entities into the local graph. Outbound
socket nodes consume local entities and produce projected payloads for another
organization.
Canvas nodes show explicit expected input and produced output socket labels
instead of input/output counts: action and service node handles are labeled
with typed entity/status contracts, socket node handles are labeled with the
transfer input and projected output fields, and entity nodes render their field
policy as the process data contract. Socket rows use theme surfaces while
handles use stable contract colors for entity, block, data, status, event,
projection, attachment, and task ports, and the canvas keeps only the contract
label visible so path/required metadata does not duplicate the socket name. New
palette nodes are placed at the center of the current viewport, and wires use
curved Vue Flow edges rather than orthogonal step routing.
Open input sockets do not display error badges: they show where composition is
possible. Required-input failures belong to explicit graph validation.
The designer resolves the source and target handle contracts before saving a
wire. Incompatible concrete ports are rejected immediately with a localized
toast and are also reported by process compiler validation when stale persisted
graphs contain them. Generic parent sockets remain connectable; the compiler
continues to decide whether the connected entity is a valid domain lineage
parent. Entity-typed construction inputs are separate data sockets, not create
parent sockets. Saved create-action parent labels are not used as the edge
contract, so an old `cassette` label on the parent input does not make the
canvas reject queue or library parent wires before compiler lineage checks run.
Command collection outputs can connect to same-entity row actions through the
standard entity handle.
The canvas keeps data and event contracts visually separate. Left and right data
handles are not headed with literal "inputs" or "outputs"; the socket label
itself is the contract. Event-triggered actions receive the event on the left
side of a separated bottom band and emit completion from the right side of that
same band. Action nodes expose only `manual` and `event` trigger modes.
`manual` means the action is user-started; access level and role grants live
under `action.access` and decide which process roles see the user-facing
action. `event` runs automatically from another node's event output. Service
identities stay in service access controls rather than manual trigger
selectors. Change-status action grants also store the status transition
condition under `action.access.statusFrom/statusTo`, derived from the incoming
entity socket and target status.
Entity decomposition and value composition use the complete canonical block
vocabulary exported by `@cutkit/core`. The selected domain entity narrows which
blocks exist, while core block entries plus domain field access/field groups
drive the editable field choices. Typed construction modes expose their
mode-specific inputs on create nodes, so derived constructors do not render an
empty generic input contract.
Status-definition nodes are entity agnostic. They render the final status tag
directly on the node, edit status id, label, severity, icon, and lifecycle
evidence requirements, and apply to whichever entity lifecycle or action target
they are wired into. Evidence requirements are stored on the status definition
as `lifecycle.description`, `lifecycle.attachments`, and
`lifecycle.snapshots`; the process compiler copies them to the generated
workflow state so runtime status actions can collect descriptions/proof files
and capture relation snapshots when that state is entered. New status nodes
start from a neutral `STATUS` id with no label, so lifecycle meaning is authored
by the process designer rather than guessed by the palette.
When normalizing stale status-node labels, the designer only compares against
entity types from the active domain registry. It does not keep a baked list of
domain names in the Vue surface.

Loading an active process is read-only. Saving changes forks the current graph
into a draft first, because active process definitions cannot be patched
directly.
Drafts created from active processes keep `sourceProcessDefinitionId` so the
activation path can replace the current runtime contract without mutating the
active source in place.
