# COMPONENT: Organization Pages

Organization pages manage the current tenant context.

`process.vue` is the first visual process-designer surface. It edits
organization process definitions with Vue Flow, persists drafts through
`/api/process-definitions`, validates them through the process compiler, and
activates compiled runtime contracts for access, navigation, and entity
workflows.
