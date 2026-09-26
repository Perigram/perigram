# CONTAINER: Workers

The worker tier is the nesting solver only. The polling task workers
(file-processing, cassette-processing, geometry-capture) were deleted with
the queue-era task chains: no code path enqueued their tasks
(`dxf.parseUpload`, `cassette.bakeTemplate`, `vision.extractGeometry`), so
their containers polled queues nothing feeds. The `task_runs` protocol
under `/api/tasks/*` remains available for future task executors that are
registered beside a live enqueue site.

## Services

| Worker | Protocol | Entry point | Responsibility |
|---|---|---|---|
| nesting | HTTP solver | `workers/nesting/worker_service.py` | Pure FastAPI 2D nesting solver called synchronously by the `solveNestingValue` command through `NESTING_WORKER_URL`. |

The nesting service is not a task executor: the app-side
`nesting.solve` V→V command (`server/features/nesting/solve-value.js`,
mounted by the facade pack) validates inputs, calls the solver over HTTP,
and maps results — there is no `task_runs` round trip.

## Docker

Build from the project root (the solver image needs the repo context):

`build-images.sh` builds the app image plus the nesting worker image.
Both compose files and both stack files run `nesting-worker` beside the
app and Mongo. `WORKER_TOKEN` remains the app/worker shared secret for
any future polling executor; the nesting worker does not use it.
