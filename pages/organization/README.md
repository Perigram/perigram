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

`process.vue` is the first visual process-designer surface. It edits
organization process definitions with Vue Flow, persists drafts through
`/api/process-definitions`, validates them through the process compiler, and
activates compiled runtime contracts for access, navigation, and entity
workflows. Entity lifecycle profiles in the inspector compile directly into
runtime status machines; service nodes gate command execution; socket nodes can
project selected entity fields through the socket runtime API.
