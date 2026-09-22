# COMPONENT: Knowledge (OpenKnowledge)

Org-wide knowledge base capability module over the self-hosted
OpenKnowledge web editor (https://github.com/inkeep/open-knowledge). The
pattern mirrors the [livekit feature](../livekit/README.md): the app owns
admission, a separate container owns the service. OpenKnowledge itself has
no multi-tenant auth model — its sharing model is git-based — so every
request is gated by this module before it reaches the container.

## License Boundary

OpenKnowledge is GPL-3.0-or-later. It must stay a separate network
service: no OpenKnowledge code is imported into the Nuxt monolith, and no
app code is added to its image. The only coupling is the authenticated
HTTP proxy below. GPL has no network copyleft, so serving it behind the
app does not affect the app's license; embedding its source would.

## Admission Contract

The service is org-wide, like support chat: admins and every
organization member are admitted. Organization membership follows the
platform's own resolution (`resolveProcessAuth`): the user's explicit
current organization, else their first `memberships[]` entry — most user
records carry no top-level `organizationId`. No process feature grant
applies; capability toggles are not part of the app's onboarding flow.

| Caller | Admission |
|---|---|
| Unauthenticated | `401` |
| Admin | Admitted |
| Organization member | Admitted |
| No organization | `403` |

`GET /api/knowledge/info` reports `{ enabled, admitted, url? }` without
throwing so the UI can hide the entry for denied users. `enabled` is false
only when `OPENKNOWLEDGE_INTERNAL_URL` is explicitly emptied; it does not
probe the container (a down container surfaces as proxy `502`).

## API

| Endpoint | Responsibility |
|---|---|
| `GET /api/knowledge/info` | Admission snapshot for the current user; `{ enabled, admitted, url }`. |
| `ANY /api/knowledge/proxy/**` | Authenticated catch-all reverse proxy to the OpenKnowledge container. |

The UI contract: the sidebar `CommunicationMenu` shows a Knowledge entry
only when `admitted`, and it opens the editor as a home-workspace tab
(page id `knowledge`,
[`components/knowledge/KnowledgeWorkspacePage.vue`](../../../components/knowledge/README.md))
hosting the proxy URL in a same-origin iframe — not an external browser
tab.

The proxy strips the `/api/knowledge/proxy` prefix, preserves method,
headers, body, and query string, and forwards to
`OPENKNOWLEDGE_INTERNAL_URL`. The UI opens `/api/knowledge/proxy/` in a
browser tab, so the session cookie carries admission on every proxied
request. The entry URL keeps its trailing slash deliberately:
OpenKnowledge emits relative asset paths (`./assets/...`), which resolve
against the proxy prefix only when the page itself is served at the
prefix root. Two route files share one handler
(`server/features/knowledge/proxy.js`): the bare route serves the prefix
root (Nitro's catch-all does not match an empty subpath) and the catch-all
serves everything below it. The original Host header is forwarded
explicitly — `proxyRequest` would otherwise send the container-internal
host, which OpenKnowledge's host admission rejects.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `OPENKNOWLEDGE_INTERNAL_URL` | `http://openknowledge:4310` | Network-internal base URL of the container; set empty to disable the feature. |
| `OPENKNOWLEDGE_EXTERNAL_URL` | `http://localhost:3000` | Browser-facing app origin. OpenKnowledge's host admission allowlists the proxy-forwarded Host/Origin headers against this URL; override it when the app is reached on another host (for example a LAN IP). |

The `openknowledge` compose service (dev compose only, like LiveKit) is
built from [`deploy/openknowledge/Dockerfile`](../../../deploy/openknowledge/Dockerfile):
Node 24 + git, the `@inkeep/open-knowledge` npm CLI, and `ok start`
serving on port 4310. The build runs on the host network
(`build.network: host`): its apt/npm steps need package mirrors, and
build sandboxes on egress-restricted hosts cannot reach them. Runtime
flags are load-bearing, verified against the CLI's actual behavior:

- `ok start` refuses to serve an uninitialized directory, so the container
  entrypoint runs `ok init --no-mcp` on first boot (the volume has no
  coding agents to wire) before exec'ing the server.
- `--bind 0.0.0.0` — the default bind is loopback-only, unreachable from
  the app container.
- `--external-url "$OPENKNOWLEDGE_EXTERNAL_URL"` — OK's host admission
  answers `403 urn:ok:error:host-not-allowed` for Host/Origin headers not
  derived from the external URL, so it must equal the browser-facing app
  origin (the proxy forwards the browser's headers unchanged).
- `--idle-shutdown off` — the default 30-minute idle shutdown would reap
  the service between clients.
- `OK_ALLOW_EXTERNAL=1` — the server admits only allowlisted Host/Origin
  headers; the container's sole exposure is the app proxy, so external
  headers are consented to unconditionally.

Documents live in the `openknowledge-data` named volume (`/workspace`);
OpenKnowledge keeps its timeline and recovery in a git repository inside
that workspace (the image bakes a global git identity for it).

## Scoping Limitations

- The backing workspace is deployment-scoped, not per-organization: every
  admitted member of every organization on the deployment shares one
  knowledge base. Single-organization deployments are the intended shape;
  per-org workspaces would need per-org containers or path-scoped
  rewrites the flat web editor cannot honor.
- The proxy forwards HTTP only. OpenKnowledge's websocket endpoints
  (live collab on `/collab`) answer `501` cleanly — attempting them
  through the HTTP proxy would fail with socket errors, and an escaped
  unhandled rejection takes down the dev module bridge; the editor falls
  back to its non-socket behavior.
- Realtime integration with the connections layer is intentionally
  absent: OpenKnowledge has no event contract to fan out.

## Related

- [LiveKit calls](../livekit/README.md) — the capability-module-over-container pattern this mirrors
- [API routes](../../api/README.md)
- [Server features](../README.md)
