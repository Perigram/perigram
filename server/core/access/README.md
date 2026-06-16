# COMPONENT: Access Engine

Centralized authorization for entity services, workflow transitions, and command handlers.

## Contract

- `assertEntityAccess()`: Checks one entity against a feature permission level.
- `assertCommandAccess()`: Checks command permission requirements before a handler runs.
- `assertTransitionAccess()`: Checks workflow transition access requirements.
- `createLineageFilter()`: Builds organization lineage filters from memberships.

Access is derived from membership permission grants and entity lineage.
Legacy grants are simple levels (`queues: 'write'`). Granular grants can scope a
level to lineage ids, entity ids, UI actions, or workflow transitions:

```js
{
  queues: [{ level: 'write', scope: { projectId: 'project-a' } }],
  projects: [{ level: 'write', transitions: ['PRODUCED->MILLED'] }]
}
```

Workflow transitions and command definitions declare required feature
permissions; the engine evaluates those requirements against the current entity
and transition. Processors and handlers perform domain work after access has
already passed.

Preset labels are compatibility labels only. User records store copied
membership permissions produced from access presets, and test surfaces such as
the admin workbench can submit custom permission grants for a single run.

## Related

- [State machine engine](../machines/README.md)
- [Server features](../../features/README.md)
- [Shared contracts](../../../shared/README.md)
