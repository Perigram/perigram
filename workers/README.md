# CONTAINER: Workers

The worker tier is the nesting solver and the plugins' executors
(documents, tech-drawing, facade). The `task_runs` protocol under
`/api/tasks/*` is the
[task runtime's](../server/core/tasks/README.md) contract.

Parent: [root README](../README.md).

## Services

| Worker | Protocol | Entry point | Responsibility |
|---|---|---|---|
| nesting | HTTP solver | `workers/nesting/worker_service.py` | 2D nesting solver, called by the facade executor through `NESTING_WORKER_URL` — see [workers/nesting](./nesting/README.md). |
| facade | Endpoint-mode plugin executor | `workers/facade/index.js` | The facade plugin's compute and surfaces — see [workers/facade](./facade/README.md). |
| documents | Endpoint-mode plugin executor | `workers/documents/index.js` | The documents plugin's projections and text/csv surfaces — see [workers/documents](./documents/README.md). |
| tech-drawing | Static-serving plugin executor (declarations-only plugin, no services) | `workers/tech-drawing/index.js` | Serves the sketch editor surface module and vendored runtimes — see [workers/tech-drawing](./tech-drawing/README.md). |

## Docker

The solver image builds from the project root (the Dockerfile needs the
repo context — [building locally](./nesting/README.md)). Every compose
and stack file runs `nesting-worker`: the dev compose and the main stack
file beside the app and Mongo, the local compose and the external stack
beside Mongo only, the workers-only stack alone.
`WORKER_TOKEN` is the task runtime's app/worker shared secret
([server/core/tasks](../server/core/tasks/README.md)).
