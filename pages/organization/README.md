# COMPONENT: Organization Pages

Organization pages manage the current tenant context.

`index.vue` is the organization workspace route linked from the user menu and
profile organization cards. It exposes team management and process design as
first-class organization actions and is the breadcrumb parent for organization
routes.

`users.vue` is the team management route for invitations, membership approval,
user creation, and permission editing.

`process.vue` is the first visual process-designer surface. It edits
organization process definitions with Vue Flow, persists drafts through
`/api/process-definitions`, validates them through the process compiler, and
activates compiled runtime contracts for access, navigation, and entity
workflows.
