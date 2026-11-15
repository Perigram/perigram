# Perigram

Perigram is a process-programming platform. Organizations define typed data,
processes and capabilities; the platform compiles those definitions into
runtime contracts and executes them through a modular Nuxt/Nitro application,
MongoDB and installable worker plugins.

## Run locally

**Requirements:** Git, Docker Engine and Docker Compose v2. No host Node.js or
MongoDB installation is needed to run the app.

Clone with its nesting-solver submodule:

```bash
git clone --recurse-submodules https://github.com/Perigram/perigram.git
cd perigram
./scripts/dev.sh up
```

Open [http://localhost:3000](http://localhost:3000).

The first start builds the app and worker images, creates the local Docker
network, starts MongoDB and LiveKit, initializes MongoDB's `rs0` replica set,
then starts the app and plugin executors. MongoDB data persists in the
`mongo-data` volume across normal restarts.

If you already cloned without submodules, run
`git submodule update --init --recursive` before the first build.

### Development commands

| Command | Effect |
|---|---|
| `./scripts/dev.sh up` | Build and start the full development stack |
| `./scripts/dev.sh down` | Stop containers; keep MongoDB data |
| `./scripts/dev.sh logs [service]` | Follow all logs or one service |
| `./scripts/dev.sh ps` | Show service status |
| `./scripts/dev.sh restart [service]` | Restart a service (or all services) |
| `./scripts/dev.sh deps` | Rebuild and recreate the app container after dependency changes |
| `./scripts/dev.sh shell` | Open a shell in the app container |
| `./scripts/dev.sh mongo` | Open the Mongo shell |
| `./scripts/dev.sh reset --yes` | Delete containers **and the local database volume** |

The script creates the shared `perigram-network` bridge if it does not exist.
Use `down` for a normal stop; `reset --yes` is destructive.

Optional local settings can be supplied through a root `.env` file. Common
ones are `NUXT_DEV_HMR_HOST` (the host/LAN address seen by a browser on another
device), `WORKER_TOKEN`, `OLLAMA_BASE_URL`, and the `TRANSCRIPTION_*`,
`MEETINGS_*`, and `LIVEKIT_RECORDINGS_S3_*` settings. Defaults are suitable
for local development. A local Cortex checkout can be mounted by setting
`CONFIG_BOT_CORTEX_HOST_PATH`; otherwise the empty `.local/cortex` directory
is mounted.

### Tests and checks

For host-side tests, install the locked dependencies with `npm ci`, then run:

```bash
npm test -- --run
npx vitest run --config vitest.ssr.config.js
npm run framework:validate
npm run docs:validate
npm run plugin-deps:check
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

The E2E suite expects the development stack to be running. The same checks are
run by the repository's CI workflow. Use `./scripts/dev.sh exec <command>` to
run a command inside the app container instead of installing Node.js locally.

## Production deployment

Production deployment is automated by
[`.forgejo/workflows/deploy.yml`](./.forgejo/workflows/deploy.yml). A push to
`staging` starts the Forgejo deployment workflow; there is no separate
`DEPLOYMENT.md` runbook or manual `docker run` sequence.

Before the first deploy, the operator must:

1. Provision production MongoDB, LiveKit, recording egress (Redis + LiveKit
   Egress + S3-compatible storage), public DNS and the TLS reverse proxy.
2. Register a self-hosted Forgejo Actions runner with the `deploy` label,
   Docker daemon access, and network access to the production services.
3. Add the required values under **Forgejo → Repository → Settings → Actions
   → Secrets**:

   | Secret | Purpose |
   |---|---|
   | `NUXT_MONGODB_URI` | Production MongoDB connection string |
   | `BASE_URL` | Public application origin |
   | `LIVEKIT_PUBLIC_URL` / `LIVEKIT_INTERNAL_URL` | Browser and server LiveKit addresses |
   | `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit credentials |
   | `BUILD_HTTP_PROXY` / `BUILD_HTTPS_PROXY` / `BUILD_NO_PROXY` | Optional build-network proxy settings |
   | `TRANSCRIPTION_PROVIDER` / `TRANSCRIPTION_LOCAL_BASE_URL` | Optional transcription service |
   | `MEETINGS_LLM_BASE_URL` / `MEETINGS_LLM_MODEL` | Optional meeting-summary model |
   | `LIVEKIT_RECORDINGS_S3_ENDPOINT` / `LIVEKIT_RECORDINGS_S3_BUCKET` / `LIVEKIT_RECORDINGS_S3_UPLOAD_ENDPOINT` | Optional recording storage endpoints |
   | `GARAGE_ACCESS_KEY` / `GARAGE_SECRET_KEY` | Recording storage credentials |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Optional web-push keys |

4. Push the intended release to `staging`. The workflow calls
   [`scripts/deploy.sh`](./scripts/deploy.sh); it builds the images, updates
   the plugin catalog/installs, rolls out the app and verifies that the served
   Nuxt assets belong to the new build.

Optional integrations can be left empty; their features remain disabled.
Build proxy values are needed only when the runner cannot reach package
registries directly. Keep all credentials in Forgejo secrets, never in
committed files.

## Project map

- `SPEC.md` — product and architecture contracts; §28 describes the unified
  graph system and node editor.
- `TODO.md` — active implementation sequence and outstanding verification.
- `packages/` — the core, CTS, process compiler and plugin SDK contracts.
- `server/` — API, runtime composition, persistence and feature services.
- `workers/` — plugin listings and their executor implementations.
- `components/`, `pages/`, `composables/`, `stores/` — Nuxt application.
- `e2e/`, `test-data/`, `test-tools/` — test suites and fixtures.

- [Cluster infrastructure contract](./k8s/README.md).
- [Repository-local Codex agent assets](./.codex/README.md).

Subsystem contracts live beside their code in the relevant `README.md`.
Start with [the package map](./packages/README.md), [server overview](./server/README.md),
or [worker overview](./workers/README.md).
