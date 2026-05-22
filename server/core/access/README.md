# COMPONENT: Access Engine

Centralized authorization for entity services, workflow transitions, and command handlers.

## Contract

- `assertEntityAccess()`: Checks one entity against a feature permission level.
- `assertCommandAccess()`: Checks command permission requirements before a handler runs.
- `assertTransitionAccess()`: Checks workflow transition access requirements.
- `createLineageFilter()`: Builds organization lineage filters from memberships.

Access is derived from membership permissions (`none`, `read`, `write`, `admin`) and entity lineage. Workflow transitions and command definitions declare required feature permissions; processors and handlers perform domain work after access has already passed.

## Related

- [State machine engine](../machines/README.md)
- [Server features](../../features/README.md)
