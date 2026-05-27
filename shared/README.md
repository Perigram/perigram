# COMPONENT: Shared Contracts

Cross-runtime JavaScript contracts used by both browser-facing Nuxt code and
server features.

Modules in this directory are portable runtime contracts. They must not import
other repo files through Nuxt-only `~/` or `~~/` aliases because server scripts,
workers, and direct Node imports do not own that resolver. Use repository
package imports such as `#shared/...` for shared contracts; Nuxt code may still
import shared modules through its root alias at the call site.

## Core Files
- `access-control.js`: Shared permission grant evaluator for feature levels,
  UI actions, entity lineage scopes, and workflow-transition scopes.
- `permission-templates.js`: Access presets that expand into copied membership
  permission grants when a preset is assigned. Runtime checks consume the
  decomposed grants and do not branch on verbal preset labels.
- `ui-permissions.js`: Compatibility UI resolver backed by the same grant
  evaluator as the server access engine.
- `*.spec.js`: Contract tests for shared framework and permission behavior.

`scripts/check-arch.js` enforces the no-Nuxt-root-alias rule for portable
runtime modules under `shared/`, `test-data/`, and `packages/`, and rejects
parent-relative cross-root imports from `shared/` and `test-data/`.

## Permission Model
Access uses feature keys such as `projects`, `queues`, `cassettes`,
`nesting_runs`, `artifacts`, `warehouses`, `catalogs`, `requisitions`,
`materials`, `layer_standards`, `users`, and `organizations` with levels
`none`, `read`, `write`, and `admin`.

Permission values may be legacy strings (`queues: 'write'`) or grant objects /
arrays:

```js
{
  queues: [{ level: 'write', scope: { projectId: 'project-a' } }],
  projects: [{ level: 'write', transitions: ['PRODUCED->MILLED'] }],
  requisitions: {
    level: 'admin',
    actions: { create: false, approve: true, reject: true, fulfill: true }
  }
}
```

Scopes are matched against entity lineage (`organizationId`, `projectId`,
`queueId`, `warehouseId`) or the entity id. Transition scopes match
`from->to`, target state, or `{ from, to }`. Workbench test access uses the
same permission object shape, so fixture ownership and per-run access overrides
exercise production access code.

Workflow definitions must not duplicate app preset names for access policy; they
should declare feature permission requirements, lifecycle capabilities, and
hooks. Verbal labels such as `ContractorAdmin` are presets only. Persisted user
records must already carry copied permission grants; loading a user does not
expand grants from the preset label. Workbench `testAccess` grants use the same
explicit permission shape.

## Related
- [users feature](../server/features/users/README.md) - Stores preset label,
  membership, and copied permission data on user records.
- [admin pages](../pages/admin/README.md) - Workbench editor for permission
  template drafts and UI action visibility drafts.
