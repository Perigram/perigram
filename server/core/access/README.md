# COMPONENT: Access Engine

Centralized authorization for entity services, workflow transitions, and command handlers.

Parent: [server](../../README.md).

## Contract

- `assertEntityAccess()`: Checks one entity against a feature permission level.
- `assertCommandAccess()`: Checks command permission requirements before a handler runs.
- `assertTransitionAccess()`: Checks workflow transition access requirements.
  A transition authorizes by process role, by permission grants, or by the
  system actor (`access.system`); `system: true` with no role or permission
  grants names the system actor alone — non-system callers are refused
  (deadline edges compile exactly that shape, SPEC §7).
- `createLineageFilter()`: Builds the active-organization lineage filter, with
  membership-derived filtering only for legacy auth contexts that do not carry
  an active organization id.

Access is derived from membership permission grants and entity lineage.
Ordinary entity access is isolated to `auth.organizationId`: an entity from a
different membership cannot consume the active organization's compiled
`effectivePermissions`. Collection services use the same active organization
as their coarse lineage prefilter before applying per-entity grants.
Legacy grants are simple levels (`queues: 'write'`). Granular grants can scope a
level to entity type, organization or entity ids, UI actions, workflow
transitions, or a logical rule:

```js
{
  queues: [{ level: 'write', scope: { instanceId: 'queue-42' } }],
  projects: [{
    level: 'write',
    transitions: ['PRODUCED->MILLED'],
    rule: {
      all: [
        { fact: 'status.primary', equals: 'ACTIVE' },
        { not: { fact: 'action', equals: 'delete' } }
      ]
    }
  }]
}
```

Rules are additive filters on otherwise valid grants. The shared evaluator
supports nested `all` / `any` / `not` gates and predicates over feature, level,
action, entity type/id, lineage fields, primary status, transition fields, and
entity field paths. Entity access callers can also pass an explicit action such
as `create`; grants with `actions.create === false` then deny the create
operation even when their level would otherwise satisfy `write`.

The action names used in access grants (`create`, `update`, `delete`) align with
the activation-time service-capability check (`create`↔`service.create`,
`update`↔`service.processUpdate`, `delete`↔`service.remove`), so a process whose
effect targets an entity lacking the binding is rejected before any
action-scoped grant is computed. The capability projection is documented in
[`packages/processes`](../../../packages/processes/README.md); see the
activation enforcement contract in
[process-definitions/README.md](../../features/process-definitions/README.md).

Workflow transitions and command definitions declare required feature
permissions; the engine evaluates those requirements against the current entity
and transition. Processors and handlers perform domain work after access has
already passed.

Preset labels are compatibility labels only. User records store copied
membership permissions produced from access presets, and test surfaces such as
the admin workbench can submit custom permission grants for a single run.

When the active organization has an active process definition, auth middleware
adds `effectivePermissions` compiled from the user's process role assignments.
The precedence is shared with client-side field redaction through
`resolveEffectivePermissions()` in
[`shared/access-control.js`](../../../shared/README.md): active process grants,
then the entity's organization membership grants, then legacy user-level grants.
The evaluator consumes those grants before membership permissions. Process
roles compile into the same grant shape documented here.
Process Designer and Team preview that shape through the shared typed grant
builder and assignment preview. Decisions use this evaluator with concrete
entity, status, action, transition, and lineage context; screen layout never
implies backend authority.

Service-level `hasLineagePermission()` callers must pass the full auth
context — a reduced `{ memberships }` object hides `effectivePermissions`. The shared evaluator then uses
`auth.effectivePermissions` first and falls back to membership/user permissions
only when the organization has no active process-derived grants for the user.
Status transition auth preserves `effectivePermissions` so lifecycle access
compiled from process roles is checked during transition execution as well.
Manual process execution first rejects an action absent from the caller's
compiled role assignment. An allowed Create then receives only request-local
grants for the target feature and constructor source entity types; these grants
let registered services perform their normal create/read checks and are never
added to the user's persisted role permissions.

## Related

- [State machine engine](../machines/README.md)
- [Server features](../../features/README.md)
- [Shared contracts](../../../shared/README.md)
