# CONTAINER: Workers

Worker services execute retryable `task_runs` declared by `@cutkit/domain-cnc`.
The app owns task persistence and exposes the worker protocol under
`/api/tasks/*`; workers authenticate with `x-worker-token`.

## Services

| Worker | Task | Entry point | Responsibility |
|---|---|---|---|
| fileprocessing | `dxf.parseUpload` | `workers/fileprocessing/main.py` | Reads uploaded DXF payloads, extracts metadata/geometry, writes preview files. |
| cassette-processing | `cassette.bakeTemplate` | `workers/cassette-processing/main.py` | Bakes cassette templates into concrete geometry/DXF data. |
| nesting | `nesting.solve` HTTP executor | `workers/nesting/worker_service.py` | Pure FastAPI 2D nesting solver called by the app/adapter. |

## Protocol

1. App enqueues a `task_runs` record through `server/core/tasks`.
2. Worker calls `POST /api/tasks/claim` with `taskId`, `workerType`,
   `workerId`, and `x-worker-token`.
3. Worker sends heartbeat/complete/fail calls with the claim token returned by
   the claim response.
4. App records the normalized task output in `task_runs`.

`WORKER_TOKEN` must be set on the app and workers. Local compose files default
to `cutkit-dev-worker`; production stacks expect `WORKER_TOKEN` from the
environment/secrets.

## Docker

Build workers from the project root. `cassette-processing` imports code from the
file-processing worker, so root build context is required.

## Related

- [Task runtime](../server/core/tasks/README.md)
- [fileprocessing](./fileprocessing/README.md)
- [cassette-processing](./cassette-processing/README.md)
- [nesting](./nesting/README.md)
