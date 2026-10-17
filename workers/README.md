# CONTAINER: Workers

The worker tier is the nesting solver and the plugins' executors (documents, tech-drawing, facade).
The polling task workers
(file-processing, cassette-processing, geometry-capture) were deleted with
the queue-era task chains: no code path enqueued their tasks
(`dxf.parseUpload`, `cassette.bakeTemplate`, `vision.extractGeometry`), so
their containers polled queues nothing feeds. The `task_runs` protocol
under `/api/tasks/*` remains available for future task executors that are
registered beside a live enqueue site.

## Services

| Worker | Protocol | Entry point | Responsibility |
|---|---|---|---|
| nesting | HTTP solver | `workers/nesting/worker_service.py` | Pure FastAPI 2D nesting solver called by the facade executor through `NESTING_WORKER_URL`. |
| facade | Endpoint-mode plugin executor | `workers/facade/index.js` | The facade plugin's compute (DXF extraction, OCCS bake, nesting solve mapping, cassette import, sheet DXF) — see [workers/facade](./facade/README.md). |

| documents | Endpoint-mode plugin executor | `workers/documents/index.js` | Table projections, text extraction, and CSV composition over values; serves the text/csv editor surfaces and their vendored runtimes as static GETs — see [workers/documents](./documents/README.md). |
| tech-drawing | Static-serving plugin executor (declarations-only plugin, no services) | `workers/tech-drawing/index.js` | Serves the sketch editor surface module and vendored runtimes as static GETs — see [workers/tech-drawing](./tech-drawing/README.md). |

The nesting service is not a task executor: the facade executor's
`nesting-solve` service validates inputs, calls the solver over HTTP,
and maps results — there is no `task_runs` round trip.

## Docker

Build from the project root (the solver image needs the repo context):

`build-images.sh` builds the app image plus the nesting worker image.
Both compose files and both stack files run `nesting-worker` beside the
app and Mongo. `WORKER_TOKEN` remains the app/worker shared secret for
any future polling executor; the nesting worker does not use it.
