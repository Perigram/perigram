# COMPONENT: Organization Pages

Organization pages manage the current tenant context.

`index.vue` is the organization workspace route linked from the user menu and
profile organization cards. It exposes team management and process design as
first-class organization actions and is the breadcrumb parent for organization
routes.

`users.vue` is the team management route for invitations, membership approval,
user creation, and process role assignment. The page reads roles from the
active process definition, writes assignments through
`/api/process-definitions/active/assignments`, and treats copied membership
permissions as compatibility fallback data. It is the operational owner for
assigning actual users to abstract process roles and shows the compiled access
and screen preview from the active process contract. Missing assignment
bindings are surfaced in the role dialog so overloaded/scoped screens do not
silently disappear when a user lacks a required project or entity binding.

`process.vue` is the visual process-designer surface. It edits organization
process definitions with Vue Flow, persists drafts through
`/api/process-definitions`, validates them through the process compiler, and
activates compiled runtime contracts for access, screen manifests, navigation,
entity workflows, services, sockets, and field policies. The route uses the
authenticated app layout with a full canvas workspace and compact floating
controls over it. The graph palette is a one-line icon button set that creates
action nodes for entity creation, status changes, command runs, and sending
projected entity data to another organization. Service/socket nodes can still
load from older drafts, but new graphs should use action nodes.
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

The inspector edits compiler-owned fields directly:

- the roles tab owns abstract process role kind, explicit grant JSON, and quick app screen routes;
- the screens tab owns screen id, label, kind, route, placement, required access, role ids, assignment bindings, and screen actions;
- entity nodes own entity type, lifecycle mode, inline status-machine states/transitions, transition role access, node role access, and public/write/private field policy;
- action nodes own fixed action kind, trigger mode, trigger roles, target entity or command, target status, projection fields, derived typed data sockets, and completion event socket;
- service nodes own command selection, run/view roles, and command-derived inputs/outputs;
- socket nodes own direction, entity type, projected/excluded fields, send/receive roles, and receiver lifecycle;

Role and user assignment records are intentionally not Vue Flow nodes. Roles are
reusable process metadata assigned onto entity access rules, screen routes,
service/socket access rules, and status-machine transitions. Concrete user
assignment editing belongs to Team management, not the process designer.
Action nodes are the preferred process-design surface for new behavior because
they describe what happens. Entity profiles remain process resources for
lifecycle and field-policy contracts, while action nodes reference those
resources and compile into runtime trigger contracts.
Entity creation actions expose an optional parent input socket and derive the
parent contract from the incoming edge instead of a parent-type dropdown.
Change-status actions do not select an entity type; the entity arrives through
the left data socket and only the target status is configured on the node.
Archive is modeled as that target status, and cross-organization transfer is
modeled as a send-to-organization action with projection fields.
Canvas nodes show explicit expected input and produced output socket labels
instead of input/output counts: action and service node handles are labeled
with typed entity/status contracts, socket node handles are labeled with the
transfer input and projected output fields, and entity nodes render their field
policy as the process data contract.
The canvas uses left-to-right data flow and top-to-bottom trigger/access/event
flow.
Left and right data handles are not headed with literal "inputs" or "outputs";
the socket label itself is the contract. Top handles are explicitly labeled as
user/system/event triggers, service run access, or receiver access so unlabeled
control sockets do not appear on process nodes. Action nodes expose only
`manual` triggers, which are gated by non-service process roles and become
user-facing actions, and `event` triggers, which run automatically from another
node's event output. Service roles stay in service access controls rather than
manual trigger selectors. Action nodes also expose a bottom completion-event
handle so every executable process step can trigger downstream event-driven
actions.

Loading an active process is read-only. Saving changes forks the current graph
into a draft first, because active process definitions cannot be patched
directly.
Drafts created from active processes keep `sourceProcessDefinitionId` so the
activation path can replace the current runtime contract without mutating the
active source in place.
