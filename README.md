# Perigram

Perigram is a platform for defining typed data, processes and capabilities, then running them through one extensible application and plugin system.

## Development

**Requirements:** Git, Docker Engine and Docker Compose v2. Node.js and MongoDB are provided by the containers.

```sh
git clone https://github.com/Perigram/perigram.git
cd perigram
./scripts/dev.sh up
```

The first run initializes submodules, builds the app and worker images, starts MongoDB, initializes its replica set, and starts LiveKit, plugin executors, and the managed plugin runtime worker. Open [http://localhost:3001](http://localhost:3001). The host port defaults to `3001` so the dev stack can coexist with another app using `3000`; override it with `PERIGRAM_DEV_APP_PORT` in `.env`.

The development stack uses its own Compose project (`perigram-dev`), project-scoped containers, network, and MongoDB volume. It can run alongside other Compose projects without reusing their containers or networks. MongoDB is published on `127.0.0.1:27018` for optional host access; LiveKit is published on ports `17880`–`17882`. The app and services communicate over the private Compose network. The app is published on host port `3001` by default (container port `3000`); set `PERIGRAM_DEV_APP_PORT` in `.env` to choose another host port.

If package downloads fail during image builds on a network that requires a host-local proxy, configure a proxy endpoint reachable from Docker's build network. Compose forwards `DOCKER_BUILD_HTTP_PROXY`, `DOCKER_BUILD_HTTPS_PROXY`, and `DOCKER_BUILD_NO_PROXY` as build-only arguments (the usual `HTTP_PROXY`/`HTTPS_PROXY` and lowercase shell variables are accepted as fallbacks). On Linux, a proxy bound only to `127.0.0.1` is not reachable from build containers: configure the proxy to listen on the Docker bridge interface (or another host-reachable interface), then use `host.docker.internal` as its host. For example, with a proxy listening on host port 2081:

```sh
export DOCKER_BUILD_HTTP_PROXY=http://host.docker.internal:2081
export DOCKER_BUILD_HTTPS_PROXY=http://host.docker.internal:2081
./scripts/dev.sh up
```

Do not expose a proxy listener to untrusted networks. Keep proxy credentials in your local environment; do not commit them to `.env` or the repository. Build proxy arguments are not persisted as image environment variables.

MongoDB data survives `down` and normal restarts. To delete the local database and start clean, run `./scripts/dev.sh reset --yes`.

| Command | Purpose |
|---|---|
| `./scripts/dev.sh up` | Build and start the full stack |
| `./scripts/dev.sh down` | Stop the stack; keep database data |
| `./scripts/dev.sh ps` | Show service status |
| `./scripts/dev.sh logs [service]` | Follow logs |
| `./scripts/dev.sh restart [service]` | Restart services |
| `./scripts/dev.sh shell` | Open a shell in the app |
| `./scripts/dev.sh mongo` | Open the Mongo shell |
| `./scripts/dev.sh exec <command>` | Run a command in the app container |
| `./scripts/dev.sh deps` | Rebuild the app after dependency changes |
| `./scripts/dev.sh reset --yes` | Delete containers and the local database volume |

Optional local settings go in the root `.env` file. Defaults work for the standard local stack. Common overrides are `NUXT_DEV_HMR_HOST` (browser access from another device), `WORKER_TOKEN`, `OLLAMA_BASE_URL`, and the `TRANSCRIPTION_*`, `MEETINGS_*`, and `LIVEKIT_RECORDINGS_S3_*` integration settings. A local Cortex checkout can be mounted with `CONFIG_BOT_CORTEX_HOST_PATH`.

### Agent worktrees and package resolution

Agent sessions run in git worktrees (`.agent-worktrees/`, protocol in [AGENTS.md](./AGENTS.md)). The root `package.json` maps `#packages/*` to the `@perigram/*` workspace names, and `@perigram/*` resolves through `node_modules`: a worktree that symlinks the primary checkout's `node_modules` loads the primary checkout's package sources for every `#packages/*` import. Edits to `packages/**` inside such a worktree therefore do not reach its own test runs. Validate package changes from a worktree with a throwaway vitest config aliasing `@perigram/*` to the worktree's package entry points, and treat the post-merge run from the primary checkout as the authoritative validation.

## Checks

Install host dependencies with `npm ci`, then run:

```sh
npm test -- --run
npx vitest run --config vitest.ssr.config.js
npm run framework:validate
node scripts/check-arch.js
npm run docs:validate
npm run plugin-deps:check
E2E_BASE_URL=http://localhost:3001 npm run test:e2e
```

E2E tests require the development stack to be running.

## Production

A push to `staging` runs [the Forgejo deployment workflow](.forgejo/workflows/deploy.yml), which calls `scripts/deploy.sh`. The script builds and replaces the app, plugin executors, and managed plugin runtime worker, publishes the plugin catalog, applies plugin migrations, backfills per-instance revision tokens, materializes installed plugin assets into organization-owned storage, and verifies the deployed app assets. It includes the build123d executor.

Before the first deploy, an operator must:

1. Provision MongoDB, LiveKit, LiveKit Egress, Redis, S3-compatible recording storage, public DNS and a TLS reverse proxy. These infrastructure services are managed outside this repository.
2. Register a self-hosted Forgejo Actions runner with the `deploy` label, Docker access, and network access to those services.
3. Add these Forgejo repository Actions secrets:

   - Required: `NUXT_MONGODB_URI`, `BASE_URL`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_INTERNAL_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
   - Optional: `BUILD_HTTP_PROXY`, `BUILD_HTTPS_PROXY`, `BUILD_NO_PROXY`, `TRANSCRIPTION_PROVIDER`, `TRANSCRIPTION_LOCAL_BASE_URL`, `MEETINGS_LLM_BASE_URL`, `MEETINGS_LLM_MODEL`, `LIVEKIT_RECORDINGS_S3_ENDPOINT`, `LIVEKIT_RECORDINGS_S3_BUCKET`, `LIVEKIT_RECORDINGS_S3_UPLOAD_ENDPOINT`, `GARAGE_ACCESS_KEY`, `GARAGE_SECRET_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

4. Push the release commit to `staging`.

Optional integrations can remain unset. Keep credentials in Forgejo secrets, never in the repository. Build proxy secrets are needed only when the runner cannot reach package registries directly.

## Code map

- `SPEC.md` — product and architecture contracts.
- `TODO.md` — active implementation plan.
- `TESTING.md` — test-layer acceptance policy and CI scope.
- `packages/` — shared contracts, type system, process compiler and plugin SDK.
- `server/` — API, persistence and runtime services.
- `workers/` — plugin declarations and executors.
- `components/`, `pages/`, `composables/`, `stores/` — Nuxt application.
- `e2e/`, `test-data/`, `test-tools/` — tests and fixtures.
- `scripts/` — repository guards and maintenance entry points ([inventory](./scripts/README.md)).

Start with the [package overview](./packages/README.md), [server overview](./server/README.md), and [worker overview](./workers/README.md). The [cluster infrastructure contract](./k8s/README.md) and [repository agent assets](./.codex/README.md) document their respective areas.

Subsystem-specific contracts live in the `README.md` beside their code.
