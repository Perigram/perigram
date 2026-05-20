# COMPONENT: Operations Runtime

Runs framework operations after centralized access checks.

## Contract

`executeServerOperation(operationId, input, auth)` loads the operation definition, resolves declared entity inputs through registered entity services, calls the access engine, and then invokes the registered operation handler.

Handlers receive `{ operation, entities, data, auth }` and return normalized operation result fields (`entities`, `artifacts`, `jobs`, `transitions`, `data`). Handlers do domain work only; permission decisions belong in the access engine.

## Related

- [Access engine](../access/README.md)
- [Nesting feature](../../features/nesting/README.md)
