# Deployment Guide

This guide covers setting up CutKit in various environments.

## 💻 Local Development (Recommended)

The fastest way to develop is running the app locally and using Docker only for infrastructure (MongoDB and workers).

1.  **Start Infrastructure**:
    ```bash
    ./start-dev.sh
    ```
    *This starts MongoDB (v4.4) and connects via a tmux session for logs.*

2.  **Manual Start (Alternative)**:
    ```bash
    # Start DB
    docker-compose -f docker-compose.local.yml up -d mongo
    # Start App
    npm run dev
    ```

## ☁️ Cloud Deployment (Railway)

Railway is the current hosted production target.

Current production shape:

- Service: `cutkit-demo`
- Public URL: `https://cutkit-demo-production.up.railway.app`
- Database: Railway Mongo service on the project private network
- Health check: `GET /api/service/health`

Operational notes:

1.  **App/database split**: Production app vars `MONGODB_URI`, `MONGO_URI`,
    and `NUXT_MONGO_URI` point at the Railway private Mongo hostname with
    `authSource=admin`. Do not switch back to Atlas without re-validating the
    network path.
2.  **Redeploy vs restart**: Railway restarts can keep the current deployment
    env snapshot. After changing production env vars, prefer a full
    `railway redeploy --service cutkit-demo --environment production`.
3.  **Local seeding**: `railway run` executes on the local workstation, so it
    cannot resolve Railway private hostnames. For one-off local seeds against
    production, use the Railway Mongo public proxy URI only for that command.
4.  **Deploy**: `railway up --service cutkit-demo --environment production`
    deploys the root app `Dockerfile`.

## 🏠 Self-Hosted (Docker Swarm)

For production on your own server.

For the R240 deployment path, VPN/SSH targets, Forgejo git server, and the
push-to-deploy workflow, use [REMOTE_ACCESS.md](./REMOTE_ACCESS.md).

Pushing to the `staging` branch of the Forgejo origin auto-deploys the Swarm
app via the webhook receiver and `deploy/deploy-staging.sh`; see
[deploy/README.md](../deploy/README.md). Manual setup for a fresh host:

1.  **Init Swarm**: `docker swarm init`
2.  **Secrets**:
    ```bash
    echo "your_key" | docker secret create stripe_secret_key -
    echo "your_secret" | docker secret create github_client_secret -
    ```
3.  **Deploy Stack**:
    ```bash
    docker stack deploy -c docker-stack.yml cutkit
    ```

## ConfigBot And Local Models

ConfigBot v0.1 uses deterministic draft generation from the committed
domain-cnc/framework catalog. If Ollama is available, chat answers can also use
a local model.

Recommended model setup on the LAN server:

```bash
ollama pull qwen3:4b
ollama pull bge-m3
```

Current `192.168.0.67` setup uses a user-local Ollama binary at
`/home/cutkit/.local/bin/ollama` and an enabled user systemd service named
`cutkit-ollama.service` listening on `0.0.0.0:11434`. The service is active for
the `cutkit` user session; host-level boot persistence still requires enabling
user linger or installing a system service with sudo.

Relevant app environment variables:

- `OLLAMA_BASE_URL` - Ollama endpoint, defaulted to
  `http://192.168.0.67:11434` in the Swarm stack and
  `http://host.docker.internal:11434` in `docker-compose.dev.yml`.
- `CONFIG_BOT_CHAT_MODEL` - default `qwen3:4b`.
- `CONFIG_BOT_EMBED_MODEL` - default `bge-m3` for future embedding work.
- `CONFIG_BOT_CORTEX_PATH` - container path to cutkit-cortex notes used during
  reindex, default `/opt/cutkit-cortex`.
- `CONFIG_BOT_CORTEX_HOST_PATH` - host path mounted read-only into the app
  container, default `/home/cutkit/Documents/cutkit-cortex` in the Swarm stack.

After deployment, open `/admin/config-bot` as a user with `config_bot: admin`
and run Reindex before asking documentation questions. Draft generation works
without Ollama; repository writes are intentionally disabled in v0.1.

Deployment preflight:

```bash
ssh cutkit@192.168.0.67 'hostname && ollama list'
curl http://192.168.0.67:11434/api/tags
```

## 🛠 Troubleshooting

*   **Memory Issues**: The Docker development app passes
    `NODE_OPTIONS=--max-old-space-size=4096` to Nuxt by default. Override that
    environment variable only when the host has a known lower memory budget.
*   **MongoDB**: Older CPUs require `mongo:4.4` (newer versions require AVX support).
*   **Logs**:
    *   `docker service logs -f cutkit_app`
    *   `docker logs -f nesting-worker`
