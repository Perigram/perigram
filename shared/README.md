# COMPONENT: Shared Contracts

Cross-runtime JavaScript contracts used by both browser-facing Nuxt code and
server features.

## Core Files
- `permission-templates.js`: Backend feature access levels by app role. Users
  copy these defaults into membership permissions and the admin workbench edits
  drafts from the same source.
- `ui-permissions.js`: UI action visibility by app role, feature key, and
  action name.
- `*.spec.js`: Contract tests for shared framework and permission behavior.

## Permission Model
Backend access uses feature keys such as `projects`, `queues`, `cassettes`,
`nesting_runs`, `artifacts`, `warehouses`, `catalogs`, `requisitions`,
`materials`, `users`, and `organizations` with levels `none`, `read`, `write`,
and `admin`.

UI visibility is a separate action matrix keyed by the same feature names where
possible. Workflow definitions must not duplicate app role names for access
policy; they should keep lifecycle state, capabilities, and hooks.

## Related
- [users feature](../server/features/users/README.md) - Stores role,
  membership, and copied permission data on user records.
- [admin pages](../pages/admin/README.md) - Workbench editor for permission
  template drafts and UI action visibility drafts.
