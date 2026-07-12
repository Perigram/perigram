# COMPONENT: Task Runtime

Generic asynchronous queue backed by `task_runs`.

## Responsibilities

- Enqueues declared task definitions with normalized `input.entities` and
  `input.parameters`.
- Supports claim, heartbeat, complete, fail, retry, cancel, lookup, and list
  operations.
- Uses claim tokens and lease expiry so workers cannot complete runs they do not
  own.
- Applies retry state (`RETRY_WAIT`) before terminal failure when attempts remain;
  executor errors with 4xx `statusCode` are treated as non-retryable.
- Persists normalized `createTaskResult()` output.
- Dispatches registered app-side task executors from `server/plugins/task-executors.js`.
  External workers still use the claim protocol; app-side executors claim runs
  internally and then call `completeTaskRun()` / `failTaskRun()`.
- Executes declared task effects after a handler returns and before the run is
  finalized.

Task definitions come from the app registry. Worker-specific payloads and IO live
in worker processes or feature adapters; this runtime is domain-agnostic.

## API

- `GET /api/admin/tasks`
- `POST /api/tasks/claim`
- `POST /api/tasks/:id/heartbeat`
- `POST /api/tasks/:id/complete`
- `POST /api/tasks/:id/fail`
- `POST /api/tasks/:id/cancel`

All worker endpoints require `WORKER_TOKEN` on the app and matching
`x-worker-token` from workers.

## Files

- `service.js` - queue API, claim-token checks, result normalization.
- `repository.js` - Mongo persistence for `task_runs`.
- `server/plugins/task-executors.js` - background dispatcher for registered
  app-side executors such as HTTP solver adapters.
- `../effects/README.md` - centralized effect processor used for task results.

## Related

- [Command runtime](../commands/README.md)
- [Workers](../../../workers/README.md)
