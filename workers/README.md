# CONTAINER: Workers

The worker tier contains the nesting solver, the platform-managed plugin
runtime, and transitional integration executors. Installed plugin packages
are organization-owned data; the shared runtime executes server-capable
operations across organizations. Build123d remains transitional until its
upstream browser runtime is ready. The `task_runs` protocol
under `/api/tasks/*` is the
[task runtime's](../server/core/tasks/README.md) contract.

Parent: [root README](../README.md).
Target law: [SPEC.md](./SPEC.md).

## Services

| Worker | Protocol | Entry point | Responsibility |
|---|---|---|---|
| plugin-runtime | Managed task worker | `workers/plugin-runtime/index.ts` | Claims shared runtime tasks and executes pinned JavaScript packages in isolated Deno subprocesses with package-scoped reads, bounded memory/time, and host-mediated capabilities — see [workers/plugin-runtime](./plugin-runtime/README.md). |
| nesting | HTTP solver | `workers/nesting/worker_service.py` | 2D nesting solver, called by the facade executor through `NESTING_WORKER_URL` — see [workers/nesting](./nesting/README.md). |
| facade | Endpoint and surface host | `workers/facade/index.js` | Serves the remaining endpoint-mode operations and installed surface modules; managed operations run through the shared plugin runtime — see [workers/facade](./facade/README.md). |
| documents | Plugin package | `workers/documents/` | Documents types, template engines, and editor/preview surfaces; every operation runs behind the browser Worker, the managed `plugin-runtime` worker, or the synchronous managed projection boundary — see [workers/documents](./documents/README.md). |
| tech-drawing | Endpoint-mode plugin executor | `workers/tech-drawing/index.js` | Serves the DXF placement service, the sketch and DXF editor surface modules, and vendored runtimes (the CadCraft browser edition included) — see [workers/tech-drawing](./tech-drawing/README.md). |
| build123d (transitional) | Legacy endpoint-mode executor — retire after browser package migration | `workers/build123d/server.py` | Existing compatibility executor only. Target: browser Pyodide/OCP.wasm runtime derived from [1suo/build123d-flow](https://github.com/1suo/build123d-flow) — see [workers/build123d](./build123d/README.md) and SPEC §20. |

## Docker

The managed runtime image builds from the project root using `workers/plugin-runtime.Dockerfile`; its worker polls the app task API with the global `WORKER_TOKEN`. The solver image builds from the project root (the Dockerfile needs the
repo context — [building locally](./nesting/README.md)); the dev and
local compose files run `nesting-worker` beside the app and Mongo.
`WORKER_TOKEN` is the task runtime's app/worker shared secret
([server/core/tasks](../server/core/tasks/README.md)). The managed plugin
runtime claims the shared `plugin-runtime` worker type; package code receives
host capabilities through task-scoped server routes.
