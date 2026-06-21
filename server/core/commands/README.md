# COMPONENT: Command Runtime

Generic runtime for declared domain commands.

## Responsibilities

- Loads command definitions from `server/runtime/app-registry.js`.
- Resolves declared entity inputs through registered entity services.
- Runs `assertCommandAccess()` before invoking the handler.
- Checks active process service availability before command access when the
  organization process declares command-backed services. If a process gates
  services, commands not represented by enabled service nodes are denied; run
  roles on the service node further constrain execution by process role id.
- Invokes only handlers registered in the app registry.
- Persists run history in `command_runs`.
- Returns normalized `createCommandResult()` output.

Handlers receive `{ command, entities, parameters, data, auth }` and may return
`entities`, `attachments`, `tasks`, `transitions`, `events`, `effects`, and
`data`. The runtime validates and executes returned effects after the handler
finishes.
Handlers do business work; access decisions stay in `server/core/access`.

## API

- `GET /api/admin/commands`
- `GET /api/admin/commands/runs?commandId=&limit=`
- `POST /api/admin/commands/:id/run`
- `POST /api/commands/:id/run`

## Files

- `service.js` - command execution, input normalization, access check, handler dispatch.
- `../effects/README.md` - centralized effect processor used after handler completion.
- `repository.js` - Mongo persistence for `command_runs`.

## Related

- [Access engine](../access/README.md)
- [Task runtime](../tasks/README.md)
- [Runtime registry](../../runtime/README.md)
