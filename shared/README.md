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
  UI actions, entity lineage scopes, workflow-transition scopes, and optional
  logical grant rules.
- `permission-templates.js`: Access presets that expand into copied membership
  permission grants when a preset is assigned. Runtime checks consume the
  decomposed grants and do not branch on verbal preset labels.
- `entity-field-access.js`: Field-level display/redaction helpers shared by
  Nuxt cards and server API serialization. It consumes `@cutkit/domain-cnc`
  field policies plus the same grant evaluator used by UI actions and backend
  access checks.
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

Default presets always floor `materials` and `layer_standards` to at least
`read`, because system tools, pens, and layer catalogs are part of the base
app runtime rather than optional user content.

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

Grant objects may also include `rule`, an additive logical filter evaluated
after level/action/scope/transition checks:

```js
{
  projects: {
    level: 'write',
    rule: {
      all: [
        { fact: 'lineage.projectId', equals: 'project-a' },
        { fact: 'status.primary', equals: 'ACTIVE' },
        { not: { fact: 'action', equals: 'delete' } }
      ]
    }
  }
}
```

Rules support `all`, `any`, and `not` gates plus predicates over feature,
level, action, entity type/id, entity lineage, primary status, transition
fields, arbitrary entity fields, and explicit context facts. Supported
comparators are `exists`, `equals`, `notEquals`, `in`, `includes`, and
`atLeast` for access levels.

Workflow definitions must not duplicate app preset names for access policy; they
should declare feature permission requirements, lifecycle capabilities, and
hooks. Preset labels are compatibility labels only. Persisted user records must
already carry copied permission grants; loading a user does not expand grants
from the preset label. Workbench `testAccess` grants use the same explicit
permission shape.

Entity field display is stricter than entity read access. Entity read access
decides whether the record may be fetched; `entity-field-access.js` decides
which DTO paths may be shown. A path must be declared in
`cncEntityFieldAccess` and the active membership must satisfy the policy level.
No field policy means no display and no API serialization for auth-bound DTOs.

## Related
- [users feature](../server/features/users/README.md) - Stores membership and
  copied permission data on user records.
- [admin pages](../pages/admin/README.md) - Workbench editor for permission
  template drafts and UI action visibility drafts.
