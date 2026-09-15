# SYSTEM: CutKit Demo

Multi-tenant CNC manufacturing app and framework extraction sandbox. The app is
a Nuxt/Nitro modular monolith backed by MongoDB and worker services.

## Architecture

```mermaid
flowchart LR
  Core["@cutkit/core<br/>contracts and registries"]
  Domain["@cutkit/domain-cnc<br/>CNC entities/workflows/commands/tasks"]
  Runtime["server/runtime/app-registry<br/>explicit app bindings"]
  Commands["server/core/commands<br/>command_runs"]
  Tasks["server/core/tasks<br/>task_runs"]
  Features["server/features/*<br/>entity services + command handlers"]
  API["server/api/*<br/>Nuxt/Nitro routes"]
  UI["Vue app<br/>pages/components/composables"]
  Workers["workers/*<br/>task executors"]
  Mongo[(MongoDB + GridFS)]

  Domain --> Core
  Runtime --> Domain
  Runtime --> Features
  API --> Commands
  API --> Tasks
  Commands --> Runtime
  Tasks --> Runtime
  Commands --> Mongo
  Tasks --> Mongo
  Features --> Mongo
  UI --> API
  Workers --> Tasks
```

## Vocabulary

| Term | Definition |
|---|---|
| Entity | Persisted business object with canonical blocks. |
| Command | Synchronous business intent and access boundary, recorded in `command_runs`. |
| Task | Async execution boundary, queued in `task_runs` and claimed by workers/executors. |
| Workflow | Entity lifecycle state machine and transition contract. |
| Hook | Workflow transition side-effect contract and registered handler. |
| Attachment | Persisted file/blob metadata linked to an entity. |
| AttachmentKind | Declared file content/preview/storage contract. |
| Adapter | App binding between pure domain definitions and infrastructure. |
| Process Definition | Organization-owned graph that maps organization roles to entity workflows, field policy, services, sockets, screens, and navigation runtime contracts. Role identity and user assignment remain organization data. |

Commands and tasks are not duplicates: commands decide "what business action is
allowed and requested"; tasks execute retryable background work created by those
commands.

## Containers

| Container | Source | Responsibility |
|---|---|---|
| `cutkit-app` | `server/`, `pages/`, `components/`, `composables/` | Nuxt UI, Nitro API, command/task runtimes, feature services. |
| `file-processing-worker` | `workers/fileprocessing/` | Claims `dxf.parseUpload`, processes uploaded DXF files. |
| `cassette-processing-worker` | `workers/cassette-processing/` | Claims `cassette.bakeTemplate`, bakes cassette geometry. |
| `nesting-worker` | `workers/nesting/` | FastAPI HTTP solver for nesting geometry. |
| `mongo` | Docker image | MongoDB documents and GridFS files. |
| `livekit` | Docker image (`livekit/livekit-server`, `livekit.dev.yaml`) | Self-hosted WebRTC SFU for voice/video calls; rooms are derived and token-gated by the `livekit` capability module. |

The geometry-capture worker source remains in `workers/geometry-capture/`, but
the neural-network capture worker is not part of the Docker compose stack or
standard image build script.

## Workflows

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant Cmd as Command Runtime
  participant Task as Task Runtime
  participant Worker
  participant DB as MongoDB

  UI->>API: POST /api/admin/commands/:id/run
  API->>Cmd: executeCommand(commandId)
  Cmd->>DB: command_runs RUNNING
  Cmd->>Task: enqueueTask(...)
  Task->>DB: task_runs QUEUED
  Worker->>API: POST /api/tasks/claim
  API->>Task: claimTask(...)
  Worker->>API: heartbeat / complete / fail
  Task->>DB: task_runs terminal output
  Cmd->>DB: command_runs SUCCEEDED
```

## Development

```bash
npm install
npx vitest run shared/framework-packages.spec.js shared/design-system.spec.js
node scripts/check-arch.js
npm run framework:validate
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

Do not run `npm run build` or start dev servers from coding-agent tasks unless a
human explicitly asks. Worker endpoints require matching `WORKER_TOKEN` on app
and workers; compose files use `cutkit-dev-worker` for local development.
Docker dev starts Nuxt with `--host 0.0.0.0` so the app binds to the container
interface and is reachable through the compose `3000:3000` port mapping.
When opening the dev app from another device on the LAN, also set
`NUXT_DEV_HMR_HOST=<your-laptop-LAN-IP>` so the proxied Vite client advertises
the same browser-visible host for hot-module websocket traffic instead of an
internal container-only endpoint. `NUXT_DEV_HMR_CLIENT_PORT` defaults to
`3000`, and `NUXT_DEV_HMR_PROTOCOL` defaults to `ws`.
The E2E command assumes the app stack is already running and uses Playwright
against the configured `E2E_BASE_URL`.

## Progressive Web App

The app is an installable, offline-capable PWA built on `@vite-pwa/nuxt` with a
custom Workbox service worker (`public/sw.js`, `injectManifest` strategy; the
module compiles it and injects the build-asset precache manifest).

- Online behavior is unchanged: page navigations and `GET /api/**` reads go to
  the server first (`NetworkFirst`) so SSR stays authoritative. When the
  network fails, the service worker serves the last rendered HTML
  (`cutkit-html`) or the last JSON response (`cutkit-api`), so previously seen
  screens keep rendering offline. Build assets and fonts are precached with
  exact revision hashes; realtime streams (`/api/connections/`) are never
  cached.
- Offline mutations are queued in a client-side IndexedDB outbox
  (`utils/outbox.js`, `stores/outbox.js`) and replayed through the same API
  endpoints when connectivity returns. Entity CRUD (`useEntity`), status
  transitions (`useStatusController`), and generated process actions route
  through the outbox; queued operations raise a typed `OfflineQueuedError`,
  and the floating `OfflineOutboxBadge` shows sync state with per-operation
  retry/discard. Successful replays emit the shared entity-event contract, so
  open screens reconcile as if the mutation happened locally.
- Replayed mutations carry an `Idempotency-Key` header deduped by
  `server/core/idempotency` (see
  [its README](./server/core/idempotency/README.md) for the contract).
- Realtime features (connections SSE, LiveKit calls, live chat updates) and
  file uploads remain online-only.
- `public/icon.svg` stays the favicon/install-icon source of truth; the
  rasterized set in `public/favicon/` is generated from it (Inkscape exports
  at 16/32/48/180/192/512; `favicon.ico` packs 16/32/48). Regenerate all sizes
  when the SVG changes instead of editing PNGs by hand.

## Documentation Map

| Area | Doc |
|---|---|
| System graph | [docs/SYSTEM_ARCHITECTURE.md](./docs/SYSTEM_ARCHITECTURE.md) |
| Remote access and deployment | [docs/REMOTE_ACCESS.md](./docs/REMOTE_ACCESS.md) |
| UI component audit | [docs/UI_COMPONENT_AUDIT.md](./docs/UI_COMPONENT_AUDIT.md) |
| Backend | [server/README.md](./server/README.md) |
| Runtime registry | [server/runtime/README.md](./server/runtime/README.md) |
| Commands | [server/core/commands/README.md](./server/core/commands/README.md) |
| Tasks | [server/core/tasks/README.md](./server/core/tasks/README.md) |
| Domain package | [packages/domain-cnc/README.md](./packages/domain-cnc/README.md) |
| Process compiler | [packages/processes/README.md](./packages/processes/README.md) |
| Core package | [packages/core/README.md](./packages/core/README.md) |
| Pages and public entry | [pages/README.md](./pages/README.md) |
| Workers | [workers/README.md](./workers/README.md) |
| E2E workflow tests | [e2e/README.md](./e2e/README.md) |
| Scripts and guardrails | [scripts/README.md](./scripts/README.md) |
| Deploy tooling (Forgejo autodeploy) | [deploy/README.md](./deploy/README.md) |
| Schema specs | [docs/specs/README.md](./docs/specs/README.md) |
| Codex agent assets | [.codex/README.md](./.codex/README.md) |
