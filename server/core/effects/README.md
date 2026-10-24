# COMPONENT: Effect Runtime

Central effect processor for declared command, task, and workflow hook
consequences.

## Responsibilities

- Executes declared `transition`, `enqueueTask`, `createEntity`, `updateEntity`,
  `emit`, `relatedEntity`, and `artifact` effects.
- Resolves entity services and status transitions through the runtime registry.
- Keeps cross-entity orchestration out of command, task, and hook handlers.
- Returns normalized effect summaries for API responses and run history.
- Validates each emitted domain event against the registry's declared event
  definitions (undeclared events, and declared events lacking an effect
  policy while being non-informational, throw 500) and publishes it through
  `publishDomainEvent` in `server/core/events/service.js`, a pass-through
  that returns the normalized event.

## Related

- [Command runtime](../commands/README.md)
- [Task runtime](../tasks/README.md)
- [State machine engine](../machines/README.md)
