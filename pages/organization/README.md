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
and screen preview from the active process contract.

`process.vue` is the visual process-designer surface. It edits organization
process definitions with Vue Flow, persists drafts through
`/api/process-definitions`, validates them through the process compiler, and
activates compiled runtime contracts for access, screen manifests, navigation,
entity workflows, services, sockets, and field policies. The route uses the authenticated app
layout with a full canvas workspace and floating palette, toolbar, properties,
and validation panels over it. The graph palette creates action nodes for
entity creation, status changes, command runs, and sending projected entity
data to another organization. Service/socket nodes can still load from older
drafts, but new graphs should use action nodes.
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

- the roles tab owns abstract process role kind, explicit grant JSON, and app screen routes;
- entity nodes own entity type, lifecycle mode, inline status-machine states/transitions, transition role access, node role access, and public/write/private field policy;
- action nodes own action kind, target entity or command, status source/target, trigger mode, trigger roles, and derived typed inputs/outputs;
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
Entity creation actions may declare a parent entity type, which appears as an
explicit parent input on the node. Archive is modeled as a status target on a
change-status action, and cross-organization transfer is modeled as a
send-to-organization action with projection fields.

Loading an active process is read-only. Saving changes forks the current graph
into a draft first, because active process definitions cannot be patched
directly.
Drafts created from active processes keep `sourceProcessDefinitionId` so the
activation path can replace the current runtime contract without mutating the
active source in place.
