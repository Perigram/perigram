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
services, sockets, and field policies. The route uses a real `StandardPage`
header/action surface, process metrics, a typed palette, and
domain-specific node components from
[components/process-designer](../../components/process-designer/README.md).

The inspector edits compiler-owned fields directly:

- role nodes own kind, explicit grant JSON, and app navigation routes;
- entity nodes own entity type, lifecycle mode, role access, and public/write/private field policy;
- service nodes own command selection, run/view roles, and command-derived inputs/outputs;
- socket nodes own direction, entity type, projected/excluded fields, send/receive roles, and receiver lifecycle;
- assignment nodes own user id, process roles, and binding JSON.

Loading an active process is read-only. Saving changes forks the current graph
into a draft first, because active process definitions cannot be patched
directly.
