# COMPONENT: Organization Pages

Organization pages manage the current tenant context.

`index.vue` is the organization workspace route linked from the user menu and
profile organization cards. It exposes team management and process design as
first-class organization actions and is the breadcrumb parent for organization
routes.

`users.vue` is the team management route for invitations, membership approval,
user creation, and process role assignment. The page reads roles from the
active process definition, and writes assignments through
`/api/process-definitions/active/assignments`. It is the operational owner for
assigning actual users to abstract process roles. It does not expose membership
role labels as process roles. The role
dialog derives assignment binding fields from selected process screens instead
of showing raw JSON, and previews graph-derived access plus screen routes from
the current role selection before saving. Missing assignment bindings are still
surfaced from the compiled active process so overloaded/scoped screens do not
silently disappear when a user lacks a required project or entity binding.
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
controls over it. The graph palette is a one-line icon button set that creates
action nodes for entity creation, entity data updates, status changes, command
runs, sending projected entity data to another organization, and inbound or
outbound organization socket nodes.
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

The inspector edits compiler-owned fields directly:

- the roles tab owns human process role labels and derived access summaries;
- the service access tab owns service runtime identities used by service run/view access;
- the screens tab owns screen id, label, generated UI template, source entity/mode rows, display region rows, route, placement, required access, role ids, assignment binding, and screen action ids;
- entity nodes own entity type, lifecycle mode, inline status-machine states/transitions, transition role access, node role access, and public/write/private field policy;
- action nodes own fixed action kind, trigger mode, access level, access-granted roles, target entity or command, target status, update fields, projection fields, derived typed data sockets, and completion event socket;
- service nodes own command selection, run/view service identities, and command-derived inputs/outputs;
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
Update-entity actions consume their entity from the incoming edge, expose one
left-side data socket per selected mutable field, and compile those selected
fields against the domain field policy for the concrete incoming entity type.
Change-status actions do not select an entity type; the entity arrives through
the left data socket and only the target status is configured on the node.
Archive is modeled as that target status, and cross-organization transfer is
modeled as a send-to-organization action with projection fields.
Inbound organization socket nodes model receiver inputs from other
organizations and produce received entities into the local graph. Outbound
socket nodes consume local entities and produce projected payloads for another
organization.
Canvas nodes show explicit expected input and produced output socket labels
instead of input/output counts: action and service node handles are labeled
with typed entity/status contracts, socket node handles are labeled with the
transfer input and projected output fields, and entity nodes render their field
policy as the process data contract.
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

Loading an active process is read-only. Saving changes forks the current graph
into a draft first, because active process definitions cannot be patched
directly.
Drafts created from active processes keep `sourceProcessDefinitionId` so the
activation path can replace the current runtime contract without mutating the
active source in place.
