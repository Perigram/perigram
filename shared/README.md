# COMPONENT: Shared Contracts

Cross-runtime JavaScript contracts used by both browser-facing Nuxt code and
server features.

## Core Files
- `access-control.js`: Shared permission grant evaluator for feature levels,
  UI actions, entity lineage scopes, and workflow-transition scopes.
- `permission-templates.js`: Role presets that expand into copied membership
  permission grants. Runtime checks should consume the decomposed grants, not
  branch on verbal role names.
- `ui-permissions.js`: Compatibility UI resolver backed by the same grant
  evaluator as the server access engine.
- `*.spec.js`: Contract tests for shared framework and permission behavior.

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

Workflow definitions must not duplicate app role names for access policy; they
should declare feature permission requirements, lifecycle capabilities, and
hooks. Verbal roles such as `ContractorAdmin` are presets only.

## Related
- [users feature](../server/features/users/README.md) - Stores role,
  membership, and copied permission data on user records.
- [admin pages](../pages/admin/README.md) - Workbench editor for permission
  template drafts and UI action visibility drafts.
