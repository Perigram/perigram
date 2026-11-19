# COMPONENT: Task Runtime

Generic asynchronous queue backed by `task_runs`.

Parent: [server](../../README.md).

## Responsibilities

- Enqueues declared task definitions with normalized `input.entities` and
  `input.parameters`.
- Supports claim, heartbeat, complete, fail, retry, cancel, lookup, and list
  operations.
- Uses claim tokens and lease expiry so workers cannot complete runs they do not
  own.
- Applies retry state (`RETRY_WAIT`) before terminal failure when attempts remain;
  executor errors with 4xx `statusCode` are treated as non-retryable.
- Managed plugin tasks retry pure/read operations up to three attempts;
  stateful/effect operations use one attempt unless declared idempotent.
- Persists normalized `createTaskResult()` output.
- Validates terminal `entities` (including effect-contributed entities)
  against the task's declared per-output contracts at completion phase:
  undeclared types, command-owned outputs without persisted references, and
  graph-owned outputs carrying persisted entities are rejected; completion
  results may re-report immediate-declared outputs.
- Notifies the process layer after any terminal transition: success calls
  `continueActionFromTask` (correlating the task run to the waiting process
  invocation by its dispatch task-run id), and failure/cancellation call
  `failActionFromTask`. Notification errors are logged and leave the task
  run terminal.
- Executes declared task effects after a handler returns and before the run is
  finalized.

Task definitions come from the app registry, or ride the enqueue call as
runtime-declared contracts (plugin services compose theirs from the
install snapshot — `enqueueTask`'s `options.definition`), in which case
completion resolves the contract back through the plugins feature.
Managed package tasks carry the organization, plugin version, runtime id,
operation id, and input; the shared `plugin-runtime` worker reads pinned
assets and invokes scoped host capabilities through claim-bound routes.
Worker-specific payloads and IO live in worker processes or feature adapters.

## Transitions

| From | Event / guard | To |
|---|---|---|
| none | `enqueueTask` | queued |
| queued / retryWait after `runAfter` | `claimTask` | running |
| running with expired lease | `claimTask` | running, new claim token |
| running | `completeTaskRun`, claim token | succeeded |
| running | `failTaskRun`, claim token, retryable and attempts remain | retryWait |
| running | `failTaskRun`, claim token, no retry | failed |
| running | `heartbeatTaskRun`, claim token | running |
| non-terminal | `cancelTaskRun` | cancelled |
| failed / retryWait | `retryTaskRun` | queued |

When no static task definitions are registered, claim updates use the default `RUNNING` status.

Status names come from the task definition's six `status` entries
(`queued`, `running`, `retryWait`, `succeeded`, `failed`, `cancelled`);
the runtime defaults to the uppercase spelling. The terminal kinds are
`succeeded`, `failed`, and `cancelled`.

- A terminal run applies a repeated `completeTaskRun` or `failTaskRun`
  delivery as a no-op before effects, process notification, and result
  validation.
- `completeTaskRun` and `failTaskRun` require the running status and the
  current claim token. `claimTask` reclaims an expired lease with a new
  token; the previous token then fails completion.
- `enqueueTask` returns the existing run for a repeated `idempotencyKey`
  while that run is non-terminal.
- The lease is the recovery rule for running; the retry backoff returns a
  retry-wait run to the queue.

## Access

The admin task-run listing is organization-scoped and requires
`organizations:admin`. Worker claim/complete routes remain separately
authenticated by the configured worker or connector token.

## API

- `GET /api/admin/tasks`
- `POST /api/tasks/claim`
- `POST /api/tasks/:id/heartbeat`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/fail`
- `GET /api/tasks/:id/plugin-package` (platform runtime claim only)
- `POST /api/tasks/:id/plugin-capability` (platform runtime claim only;
  journals host-verified capability evidence onto the run)
- `POST /api/tasks/:id/cancel`

All worker endpoints accept two credentials (`server/core/tasks/worker-auth.js`):
the deployment-wide `WORKER_TOKEN` (global scope, matched against the
`x-worker-token` header), used by platform workers such as `plugin-runtime`,
and per-install plugin connector tokens, whose
claims are pinned to the installing organization's queue for that plugin
(`plugin.<pluginId>@<organizationId>`); connector scope may not target
task ids directly.

## Files

- `service.js` - queue API, claim-token checks, result normalization.
- `worker-auth.js` - dual worker credentials: global `WORKER_TOKEN` and
  per-install plugin connector tokens with queue scoping.
- `repository.js` - Mongo persistence for `task_runs`.
- `../effects/README.md` - centralized effect processor used for task results.

## Related

- [Command runtime](../commands/README.md)
- [Workers](../../../workers/README.md)
