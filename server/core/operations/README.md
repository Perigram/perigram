# COMPONENT: Service Action Runtime

Runs framework service actions after centralized access checks and records
execution history for diagnostics.

## Contract

`executeServiceAction(actionId, input, auth)` loads the service action
definition, resolves declared entity inputs through registered entity services,
calls the access engine, and then invokes the registered service action handler.

Handlers receive `{ action, entities, parameters, data, auth }` and return
normalized service action result fields (`entities`, `artifacts`, `jobs`,
`transitions`, `events`, `data`). Handlers do domain work only; permission
decisions belong in the access engine.

Service contracts and service action definitions come from `@cutkit/domain-cnc`
(`cncServiceContracts`, `cncServiceActions`) and are registered at service load
time. Tooling lists action definitions through `listServiceActions()`. Each
listed definition includes its `service`, `action`, source, triggers, access
requirements, and whether a server handler is currently registered.

Action parameters are typed by simple field descriptors on
`action.input.parameters`. The runtime applies defaults, validates required
parameters and primitive field types, and stores the normalized parameter object
with the run.

## Run History

`repository.js` stores service action execution records in
`service_action_runs`.
Records include:

- `actionId`
- `service`
- `action`
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
