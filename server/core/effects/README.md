# COMPONENT: Effect Runtime

Central effect processor for declared command, task, and workflow hook
consequences.

## Responsibilities

- Executes declared `transition`, `enqueueTask`, `createEntity`, `updateEntity`,
  `emit`, `relatedEntity`, and `artifact` effects.
- Resolves entity services and status transitions through the runtime registry.
- Keeps cross-entity orchestration out of command, task, and hook handlers.
- Returns normalized effect summaries for API responses and run history.
- Publishes each validated domain event through `server/core/events` so
  matching active-process domain-event triggers can start automatically.

## Related

- [Command runtime](../commands/README.md)
- [Task runtime](../tasks/README.md)
- [State machine engine](../machines/README.md)
