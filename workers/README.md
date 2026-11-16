# CONTAINER: Workers

The worker tier currently contains the nesting solver and transitional
plugin executors. Under SPEC §20 (owner direction 2026-11-16), documents
and build123d are migrating to organization-owned frontend packages; their
executor containers are temporary and must not be expanded. The `task_runs` protocol
under `/api/tasks/*` is the
[task runtime's](../server/core/tasks/README.md) contract.

Parent: [root README](../README.md).
Target law: [SPEC.md](./SPEC.md).

## Services

| Worker | Protocol | Entry point | Responsibility |
|---|---|---|---|
| nesting | HTTP solver | `workers/nesting/worker_service.py` | 2D nesting solver, called by the facade executor through `NESTING_WORKER_URL` — see [workers/nesting](./nesting/README.md). |
| facade | Endpoint-mode plugin executor | `workers/facade/index.js` | The facade plugin's compute and surfaces — see [workers/facade](./facade/README.md). |
| documents | Endpoint-mode plugin executor | `workers/documents/index.js` | The documents plugin's projections and text/csv surfaces — see [workers/documents](./documents/README.md). |
| tech-drawing | Endpoint-mode plugin executor | `workers/tech-drawing/index.js` | Serves the DXF placement service, the sketch and DXF editor surface modules, and vendored runtimes (the CadCraft browser edition included) — see [workers/tech-drawing](./tech-drawing/README.md). |
| build123d (transitional) | Legacy endpoint-mode executor — retire after browser package migration | `workers/build123d/server.py` | Existing compatibility executor only. Target: browser Pyodide/OCP.wasm runtime derived from [1suo/build123d-flow](https://github.com/1suo/build123d-flow) — see [workers/build123d](./build123d/README.md) and SPEC §20. |

## Docker

The solver image builds from the project root (the Dockerfile needs the
repo context — [building locally](./nesting/README.md)); the dev and
local compose files run `nesting-worker` beside the app and Mongo.
`WORKER_TOKEN` is the task runtime's app/worker shared secret
([server/core/tasks](../server/core/tasks/README.md)).
