# COMPONENT: Task Runtime

Generic asynchronous queue backed by `task_runs`.

## Responsibilities

- Enqueues declared task definitions with normalized `input.entities` and
  `input.parameters`.
- Supports claim, heartbeat, complete, fail, retry, cancel, and list operations.
- Uses claim tokens and lease expiry so workers cannot complete runs they do not
  own.
- Applies retry state (`RETRY_WAIT`) before terminal failure when attempts remain.
- Persists normalized `createTaskResult()` output.

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

## Related

- [Command runtime](../commands/README.md)
- [Workers](../../../workers/README.md)
