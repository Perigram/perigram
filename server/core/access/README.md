# COMPONENT: Access Engine

Centralized authorization for entity services, workflow transitions, and command handlers.

## Contract

- `assertEntityAccess()`: Checks one entity against a feature permission level.
- `assertCommandAccess()`: Checks command permission requirements before a handler runs.
- `assertTransitionAccess()`: Checks workflow transition access requirements.
- `createLineageFilter()`: Builds organization lineage filters from memberships.

Access is derived from membership permission grants and entity lineage.
Legacy grants are simple levels (`queues: 'write'`). Granular grants can scope a
level to lineage ids, entity ids, UI actions, workflow transitions, or a
logical rule:

```js
{
  queues: [{ level: 'write', scope: { projectId: 'project-a' } }],
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
entity field paths.

Workflow transitions and command definitions declare required feature
permissions; the engine evaluates those requirements against the current entity
and transition. Processors and handlers perform domain work after access has
already passed.

Preset labels are compatibility labels only. User records store copied
membership permissions produced from access presets, and test surfaces such as
the admin workbench can submit custom permission grants for a single run.

When the active organization has an active process definition, auth middleware
adds `effectivePermissions` compiled from the user's process role assignments.
The evaluator consumes those grants before membership permissions. No separate
process-specific access engine exists; process roles compile into the same
grant shape documented here.

## Related

- [State machine engine](../machines/README.md)
- [Server features](../../features/README.md)
- [Shared contracts](../../../shared/README.md)
