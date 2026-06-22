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
permissions as compatibility fallback data.

`process.vue` is the visual process-designer surface. It edits organization
process definitions with Vue Flow, persists drafts through
`/api/process-definitions`, validates them through the process compiler, and
activates compiled runtime contracts for access, navigation, entity workflows,
services, sockets, and field policies. The route uses the authenticated app
layout with a full canvas workspace and floating palette, toolbar, properties,
and validation panels over it. The graph palette creates action nodes for
entity creation, status changes, command runs, and sending projected entity
data to another organization. Service/socket nodes can still load from older
drafts, but new graphs should use action nodes.
The properties pane is a bounded floating aside; its tab body owns vertical
scrolling so long entity lifecycle, role, or assignment forms remain reachable
without moving the canvas.
When older saved graphs still contain role/user layout nodes, the route filters
those non-canvas nodes out and reconstructs entity/service/socket nodes from
the process records so active definitions do not open to a blank canvas. Truly
empty processes render compact canvas add controls for the same three object
types.

The inspector edits compiler-owned fields directly:

- the roles tab owns abstract process role kind, explicit grant JSON, and app navigation routes;
- entity nodes own entity type, lifecycle mode, inline status-machine states/transitions, transition role access, node role access, and public/write/private field policy;
- action nodes own action kind, target entity or command, status source/target, trigger mode, trigger roles, and derived typed inputs/outputs;
- service nodes own command selection, run/view roles, and command-derived inputs/outputs;
- socket nodes own direction, entity type, projected/excluded fields, send/receive roles, and receiver lifecycle;
- the assignments tab owns concrete user ids and their process role ids.

Role and user assignment records are intentionally not Vue Flow nodes. Roles are
reusable process metadata assigned onto entity access rules, service/socket
access rules, and status-machine transitions; user assignments bind actual
users to those abstract roles without forcing user records into the canvas
layout.
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
