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

Before enabling the workflow, the operator must:

1. Provide the production MongoDB database and URI, LiveKit server, recording
   egress (Redis + LiveKit Egress + S3-compatible storage), public DNS and TLS
   reverse proxy.
2. Register a self-hosted Forgejo Actions runner with the `deploy` label and
   Docker daemon access. It must be able to reach the production data-plane
   services and pull the required base images.
3. Add these repository secrets in **Forgejo → Repository → Settings → Actions
   → Secrets**:
   - `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
   - `GARAGE_ACCESS_KEY` and `GARAGE_SECRET_KEY`
   - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (optional; web push stays
     disabled until both are set).
4. Verify the production endpoints and service addresses in the deploy
   workflow match the provisioned infrastructure, then push the intended
   release to `staging`.

The workflow builds the app and plugin executor images, updates the plugin
catalog/installs, replaces the running app, and checks that the served Nuxt
assets belong to the new build. A failed image build leaves the currently
running app untouched. Keep production credentials in Forgejo secrets, never
in `.env` files committed to the repository.

## Project map

- `SPEC.md` — product and architecture contracts; §28 describes the unified
  graph system and node editor.
- `TODO.md` — active implementation sequence and outstanding verification.
- `packages/` — the core, CTS, process compiler and plugin SDK contracts.
- `server/` — API, runtime composition, persistence and feature services.
- `workers/` — plugin listings and their executor implementations.
- `components/`, `pages/`, `composables/`, `stores/` — Nuxt application.
- `e2e/`, `test-data/`, `test-tools/` — test suites and fixtures.

Subsystem contracts live beside their code in the relevant `README.md`.
Start with [the package map](./packages/README.md), [server overview](./server/README.md),
or [worker overview](./workers/README.md).
