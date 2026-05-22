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

Service contracts and service action definitions come from the explicit app
registry built by `server/runtime/cutkit-registry.js`. The CNC adapter binds
domain contracts and feature handlers into that registry. The generic runtime
does not import domain packages or feature modules directly. Tooling lists action
definitions through `listServiceActions()`. Each listed definition includes its
`service`, `action`, source, triggers, access requirements, and whether a server
handler is currently registered.

Domain adapters bind into a passed registry. Runtime code should consume
`getCutkitRegistry()` instead of relying on module-local side effects.

The admin operation registry route also includes declared process definitions
from the registered domain. These entries are contract-visible in Workbench but
are not executed by `executeServiceAction()`; process execution is owned by the
process runtime and worker adapters.

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

Application clients can execute registered service actions through:

- `POST /api/operations/:id/run`

That generic route is used by `CassetteDesigner` for
`saveCassetteTemplate`, so designer saves pass through the domain operation
contract instead of calling cassette CRUD directly.

## Related

- [Access engine](../access/README.md)
- [Process runtime](../processes/README.md)
- [Nesting feature](../../features/nesting/README.md)
