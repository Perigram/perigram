# COMPONENT: Deploy Tooling

The CI deploy runs as a Forgejo Action on the self-hosted runner (poseidon,
label `deploy`). Since 2026-09-27 (owner word) the CI deploy **is the public
app** at `perigram.sodalab.pro`; hera keeps the data plane (MongoDB, LiveKit).

## Current Pipeline

```mermaid
flowchart LR
  Dev["git push origin staging"] --> F["Forgejo on zeus<br/>192.168.0.15 (forgejo.sodalab.pro)"]
  F -->|Actions: .forgejo/workflows/deploy.yml| R["self-hosted runner 'deploy'<br/>(docker:cli, poseidon 192.168.0.230)"]
  R -->|git clone --branch staging| SRC["repo checkout perigram/perigram"]
  R -->|docker build via LAN hiddify proxy| IMG["perigram:staging (PORT=3001)"]
  R -->|docker rm -f + docker run --network=host| C["container perigram-staging<br/>on poseidon :3001"]
  Z["zeus tls-front (nginx :443)"] -->|proxy perigram.sodalab.pro| C
```

The workflow file lives **on the `staging` branch**
(`.forgejo/workflows/deploy.yml`) because only staging deploys from it.
Editing the pipeline means editing that branch.

## Contract

- Trigger: push to `staging` in `perigram/perigram`. Every merge into staging
  redeploys the public app.
- The runner clones from `forgejo.sodalab.pro` resolved to `192.168.0.15`
  via `--add-host` (LAN path, not the public edge).
- Build networking: `registry.npmjs.org` is provider-blocked on runner hosts,
  so the `npm ci` layer pins `HTTP_PROXY/HTTPS_PROXY` to the LAN hiddify relay
  `http://192.168.0.100:12334` with `NO_PROXY` covering localhost, LAN and
  NetBird ranges (Штаб coordination 2026-09-27). `--dns-result-order=ipv4first`
  is kept as a harmless belt-and-suspenders.
- Image: production `Dockerfile` (multi-stage `npm ci` → `npm run build`).
- Rollout: the old `perigram-staging` container is removed and recreated with
  `--restart unless-stopped --network=host` on port `3001`. The build happens
  before the removal, so failed builds leave the previous container serving.
- Public edge: nginx on zeus — the `tls-front-443` / `tls-front` /
  `tls-portprobe` containers share `/home/storage/nginx-mixed.conf`; the
  `perigram.sodalab.pro` server block proxies to `http://192.168.0.230:3001`
  (512 MB upload limit) through the `perigram_staging` upstream with
  `keepalive 32` — a new TCP connection per proxied request lost its first
  SYN to port-collision drops on the zeus→poseidon path, stalling asset
  loads ~1s each and breaking first paint; the keepalive pool keeps warm
  upstream connections instead. The http block also carries `gzip on` with
  `gzip_proxied any` for html/json/svg: the proxied SSR document is
  ~740KB raw and streamed uncompressed for seconds over a thin WAN
  uplink, painting the shell unstyled until CSS lands; compressed it
  ships at ~100KB. **Rollback to the hera K3s ingress:** point
  the upstream back to `http://192.168.0.248:80` in that block and
  `nginx -s reload`.
- Data plane (inline in deploy.yml, no credentials — lab LAN/NetBird):
  `NUXT_MONGODB_URI=mongodb://192.168.0.248:27017/cutkit?directConnection=true`
  (hera mongo; `directConnection=true` is required — the single-node
  replica set advertises its own hostname to clients, and from outside the
  mongo network that name does not resolve, the driver topology closes, and
  every API 500s while pages still render — the 2026-09-30 "broken layouts"
  staging incident), `BASE_URL=https://perigram.sodalab.pro`, calls on the
  zeus LiveKit through the app origin (`wss://perigram.sodalab.pro/livekit`
  → the plane's 7880 with websocket upgrade headers — one hostname for every
  client network the app itself works on; the dedicated
  `livekit.sodalab.pro` server block stays as an alias, keys
  inline; RoomService
  traffic from the runner rides the LAN address `ws://192.168.0.15:7880`,
  since poseidon is not a NetBird peer), local STT + qwen on the
  data-worker peer (`10.77.167.148:31135/:31136`) — reached through
  `192.168.0.15:31135/:31136`, host-network socat forwards on zeus
  (`stt-forward` / `llm-forward` containers, NetBird upstream), since the
  runner has no NetBird route — and recordings in the
  `livekit-egress` garage bucket — read through the app edge
  (`https://perigram.sodalab.pro/recordings/...` → garage web `:3902`),
  uploaded with the inline garage key through the plane-local S3 API
  (`http://127.0.0.1:8333`, see
  [the livekit feature](../server/features/livekit/README.md#recordings)).
- Call recordings need an external egress plane beside the LiveKit server
  the app targets: Redis, a `livekit/egress` container (SYS_ADMIN for
  Chrome), and an S3-compatible bucket readable by the app
  (`LIVEKIT_RECORDINGS_S3_*` env). The working plane on zeus runs
  host-networked (`/srv/livekit/docker-compose.yml`): LiveKit with
  `rtc.udp_port: 50100` (a single UDP mux port — a `port_range_*`-only
  config parses but binds **no** UDP socket, and every peer connection
  dies with `could not establish pc connection`), redis and the garage S3
  API bound to localhost, garage's web endpoint (`:3902`) public through
  the perigram vhost. UFW on zeus allows 7880/7881/tcp and 50100/udp from
  the LAN; the NetBird `wt0` interface is accept-all.
- The nginx edge containers bind-mount the **single file**
  `/home/storage/nginx-mixed.conf`; an edit that replaces the file (editors
  and `sed -i` do) leaves the running containers pinned to the old inode —
  `nginx -s reload` then reloads stale config. Restart the `tls-front*`
  containers after editing it.
- The `netbird.sodalab.pro` vhost carries `http2 on;` on its listener
  (2026-10-03): gRPC management streams over TLS `:443` require HTTP/2 via
  ALPN, and without it a peer enrolled with
  `https://netbird.sodalab.pro:443` registers but never holds a stream —
  `RST_STREAM … PROTOCOL_ERROR` reconnect loop, no WireGuard handshakes.
  Peers on the plain `http://85.174.249.129:8081` path never traverse
  nginx: signal and relay ride sslh → `127.0.0.1:18081` straight into
  `netbird-server:80`, which is why the mesh mostly worked while the TLS
  path was broken.
- The nginx config also carries a dormant `staging.perigram.sodalab.pro`
  server block (same target); it is unreachable until a DNS record exists
  for that name. It can be activated or deleted independently.

## Configuration

Auth-only values still come from Forgejo repository secrets
(**Settings → Actions → Secrets**) and are passed by the workflow:

| Secret | Consumed by | State (2026-09-29) |
|---|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push | empty = push disabled, as before |

Web Push enablement runbook: generate a key pair once with
`npx web-push generate-vapid-keys` (`web-push` ships with the app
dependencies), store the two values as the secrets above, and push to
`staging` — the workflow passes them through as `NUXT_VAPID_PUBLIC_KEY` /
`NUXT_VAPID_PRIVATE_KEY` and the redeploy reconfigures push. Until both
secrets exist the server reports push disabled
(`/api/notifications/config` → `enabled: false`) and the profile
notifications toggle shows that only in-tab delivery is active.

`NUXT_MONGODB_URI` / `LIVEKIT_*` / `TRANSCRIPTION_*` / `MEETINGS_*` no longer
come from secrets (see Contract — the service plane is inline). ConfigBot/Ollama
env is intentionally absent on this deploy — it is a prod-only,
cluster-internal feature.

## Plugin marketplace release steps

The CI deploys the whole plugin plane beside the app: the nesting
worker, the three plugin executors (each a `workers/plugin-executor.Dockerfile`
image — the plugin's own dependency install beside the zero-dep SDK),
the catalog seed, and the idempotent per-org builtin installs
(facade/tech-drawing/documents) run on every push to `staging`, and the
app carries the executor URLs (`FACADE/DOCUMENTS/TECH_DRAWING_EXECUTOR_URL`
on 127.0.0.1:879x). Listing version bumps ride the same push: installed
organizations see the upgrade in the Plugins page.

```bash
NUXT_MONGODB_URI=mongodb://192.168.0.248:27017/cutkit?directConnection=true \
  node server/scripts/seed-plugin-catalog.js
```

The dev stack keeps its compose services (`docker-compose.dev.yml`) —
same executors, repo-mounted instead of imaged.

## Development Stack

Local development uses `docker-compose.dev.yml` + `Dockerfile.dev`: source is
bind-mounted at `/src` while `node_modules` comes from an anonymous volume
backed by the image. After any dependency change, rebuild **and** recreate
with `docker compose -f docker-compose.dev.yml up -d app --renew-anon-volumes`
— a plain rebuild keeps the stale module set. LAN dev needs
`NUXT_DEV_HMR_HOST` (root README, Development).

## Legacy

Retired paths, kept for archaeology until deleted:

- `webhook-receiver.py`, `deploy-staging.sh`, `install-autodeploy.sh`,
  `perigram-autodeploy.service` — the old R240 push-webhook pipeline (Swarm
  service `perigram_app`, port 7100). R240 is no longer part of any deploy.
- `.github/workflows/publish.yml` — the old GitHub Actions path (ghcr.io
  images, `docker stack deploy` to the Hetzner host). The GitHub remote is a
  mirror only.
- Railway production (`perigram-demo-production.up.railway.app`) is
  decommissioned.
- The `staging.perigram.sodalab.pro` public name (2026-09-27 evening) was
  prepared and then dropped by owner word in favour of the plain
  `perigram.sodalab.pro`; no DNS record was ever created.

## Related

- [Remote access runbook](../docs/REMOTE_ACCESS.md)
- [System README](../README.md)

- `debug-logs.yml` (manual dispatch from Forgejo Actions) prints the last
  push/notification lines and recent output of the staging container — use it
  before SSH-ing anywhere to read server-side push diagnostics.
