# Remote Access Runbook

Hosts and access paths for the current self-hosted setup. This file
intentionally does not store private keys, sudo passwords, WireGuard configs,
cookies, or tokens — secrets live only in a password manager or the local
root-owned key files listed below.

## Current Targets

| Target | Address | Role |
|---|---|---|
| zeus | `192.168.0.15` (LAN), SSH alias `zeus` (user `storage`) | Forgejo (`forgejo` container, `127.0.0.1:3000`), public TLS edge (`tls-front` nginx :443 → `perigram.sodalab.pro`), NetBird server, sslh port multiplexing |
| Staging host | `192.168.0.230` | Forgejo Actions `deploy` runner; runs the `perigram-staging` container on host network `:3001` |
| Forgejo (public) | `https://forgejo.sodalab.pro` → zeus :443 | Primary git remote (`sodalab/perigram`) |
| App (public) | `https://perigram.sodalab.pro` → `192.168.0.230:3001` | Staging app |
| NetBird mesh | `10.77.0.0/16` (workstation: `wt0`) | Overlay for hosts that are not LAN-reachable; peer IPs come from `netbird status` |

## Workstation Access

- SSH alias `zeus` (user `storage`) works over the LAN; no VPN needed.
- The `forgejo` git remote uses a local SSH tunnel
  (`127.0.0.1:13000` → `zeus:127.0.0.1:3000`); if pushes fail with
  "Could not connect to server", the tunnel process died — re-establish it
  before retrying. The `origin` remote uses the public HTTPS URL and stored
  credentials instead.
- Hosts without a LAN route (for example the staging host) are reached over
  the NetBird mesh; check `netbird status` for peer IPs.
- Git credentials for Forgejo HTTPS live in `~/.git-credentials`
  (`credential.helper store`); the GitHub remote authenticates through
  `gh auth`.

## Git Remotes

```bash
git remote -v
# origin   https://forgejo.sodalab.pro/1suo/perigram.git   (public Forgejo)
# forgejo  http://127.0.0.1:13000/sodalab/perigram.git     (SSH tunnel)
# github   https://github.com/1suo/cutkit-demo.git         (mirror only)
# lan      cutkit@192.168.0.106:...                        (legacy R240 bare repo)
```

Deploy flow and secrets are documented in
[deploy/README.md](../deploy/README.md).

## Local Secret Material

These files may exist on the workstation but must not be committed:

- `~/.ssh/cutkit_r240_ed25519` — legacy R240 key (also registered in Forgejo)
- `~/.config/cutkit-wireguard/` — legacy WireGuard keys for the R240 VPN
- `~/.git-credentials` — Forgejo HTTPS token (mode `0600`)

Store complete secrets only in a password manager or the local root-owned/key
files above. Do not put them in git, TODO notes, Obsidian, or chat transcripts.

## Legacy: R240 / WireGuard

The previous topology ran everything on R240 (`192.168.0.106`, WireGuard
endpoint `78.30.216.48:51820`, interface `cutkit-r330`, app on `:7100`,
Forgejo on `:3002`, Swarm service `cutkit_app`, webhook autodeploy). None of
it is part of the current deploy path; the machine is routinely powered off
and only reachable over NetBird (`10.77.132.108`) when it is on. The
`/etc/wireguard/cutkit-r330.conf` and R240 SSH material above belong to this
retired path.

## MongoDB Note

Dev/staging services connect with `MONGODB_URI`/`NUXT_MONGODB_URI`. The dev
compose network exposes the database as `cutkit_mongo`; keep using that name
so connections never land on an unrelated `mongo` alias attached to the same
network.
