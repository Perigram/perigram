# Perigram

Perigram is a platform for defining typed data, processes and capabilities, then running them through one extensible application and plugin system.

## Development

**Requirements:** Git, Docker Engine and Docker Compose v2. Node.js and MongoDB are provided by the containers.

```sh
git clone https://github.com/Perigram/perigram.git
cd perigram
./scripts/dev.sh up
```

The first run initializes submodules, builds the app and worker images, starts MongoDB, initializes its replica set, and starts LiveKit and the plugin executors. Open [http://localhost:3000](http://localhost:3000).

Build steps use the host network, so a proxy already listening on the host's loopback interface works without changing its bind address or opening a firewall port. If your proxy listens on port `2081`, set:

```sh
export DOCKER_BUILD_HTTP_PROXY=http://127.0.0.1:2081
export DOCKER_BUILD_HTTPS_PROXY=http://127.0.0.1:2081
./scripts/dev.sh up
```

The `DOCKER_BUILD_HTTP_PROXY`, `DOCKER_BUILD_HTTPS_PROXY`, and `DOCKER_BUILD_NO_PROXY` values are passed only as build arguments, not saved in resulting images. The usual `HTTP_PROXY`/`HTTPS_PROXY` variables are accepted as fallbacks. The dev script converts the older `host.docker.internal` proxy hostname to `127.0.0.1` for host-network builds. Host networking applies only to image build steps; running services remain on the project Docker network. Keep proxy credentials in your local environment, not in `.env` or the repository.

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
| `./scripts/dev.sh app` | Rebuild/recreate only the app; keep dependencies running |
| `./scripts/dev.sh deps` | Alias for `app` |
| `./scripts/dev.sh reset --yes` | Delete containers and the local database volume |

Optional local settings go in the root `.env` file. Defaults work for the standard local stack. Common overrides are `NUXT_DEV_HMR_HOST` (browser access from another device), `WORKER_TOKEN`, `OLLAMA_BASE_URL`, and the `TRANSCRIPTION_*`, `MEETINGS_*`, and `LIVEKIT_RECORDINGS_S3_*` integration settings. A local Cortex checkout can be mounted with `CONFIG_BOT_CORTEX_HOST_PATH`.

## Checks

Install host dependencies with `npm ci`, then run:

```sh
npm test -- --run
npx vitest run --config vitest.ssr.config.js
npm run framework:validate
npm run docs:validate
npm run plugin-deps:check
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

E2E tests require the development stack to be running.

## Production

A push to `staging` runs [the Forgejo deployment workflow](.forgejo/workflows/deploy.yml), which calls `scripts/deploy.sh`. The script builds and replaces the app and its plugin executors, publishes the plugin catalog, applies plugin migrations, and verifies the deployed app assets. It includes the build123d executor.

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
- `packages/` — shared contracts, type system, process compiler and plugin SDK.
- `server/` — API, persistence and runtime services.
- `workers/` — plugin declarations and executors.
- `components/`, `pages/`, `composables/`, `stores/` — Nuxt application.
- `e2e/`, `test-data/`, `test-tools/` — tests and fixtures.

Start with the [package overview](./packages/README.md), [server overview](./server/README.md), and [worker overview](./workers/README.md). The [cluster infrastructure contract](./k8s/README.md) and [repository agent assets](./.codex/README.md) document their respective areas.

Subsystem-specific contracts live in the `README.md` beside their code.
