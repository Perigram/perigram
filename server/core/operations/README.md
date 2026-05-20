# COMPONENT: Operations Runtime

Runs framework operations after centralized access checks and records execution
history for admin diagnostics.

## Contract

`executeServerOperation(operationId, input, auth)` loads the operation definition, resolves declared entity inputs through registered entity services, calls the access engine, and then invokes the registered operation handler.

Handlers receive `{ operation, entities, parameters, data, auth }` and return normalized operation result fields (`entities`, `artifacts`, `jobs`, `transitions`, `data`). `data` is a compatibility alias for `parameters`; new callers should send `{ entities, parameters }`. Handlers do domain work only; permission decisions belong in the access engine.

Operation definitions come from `@cutkit/domain-cnc` (`cncOperations`) and are
registered at service load time. Admin UI lists those definitions through
`listServerOperations()` as a global operation registry. Each listed definition
includes its source and whether a server handler is currently registered.
Operation ids are opaque ids; ownership is expressed by the operation `service`
field, for example `solveNesting` is owned by the nesting service and
`generateArtifact` is owned by the artifacts service.

Operation parameters are typed by simple field descriptors on
`operation.input.parameters`. The runtime applies defaults, validates required
parameters and primitive field types, and stores the normalized parameter object
with the run.

## Run History

`repository.js` stores operation execution records in `operation_runs`.
Records include:

- `operationId`
- `status` (`RUNNING`, `SUCCEEDED`, `FAILED`)
- sanitized `input.entities` and `input.parameters`
- `entityRefs`
- sanitized auth context (`userId`, `organizationId`, `role`)
- `result` or `error`
- `startedAt`, `finishedAt`, `createdAt`, `updatedAt`

The admin endpoints expose definitions, run history, and execution:

- `GET /api/admin/operations`
- `GET /api/admin/operations/runs`
- `POST /api/admin/operations/:id/run`

## Related

- [Access engine](../access/README.md)
- [Nesting feature](../../features/nesting/README.md)
