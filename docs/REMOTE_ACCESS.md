# Remote Access Runbook

Hosts and access paths for the current self-hosted setup. This file
intentionally does not store private keys, sudo passwords, VPN configs,
cookies, or tokens — secrets live only in a password manager, SOPS
(labsite), or the local root-owned key files listed below.

## Current Targets

| Target | Address | Role |
|---|---|---|
| zeus | `192.168.0.15` (LAN), SSH alias `r330` (user `storage`, NOPASSWD sudo) | Forgejo (`forgejo` container, `127.0.0.1:3000`), public TLS edge (nginx containers `tls-front-443`/`tls-front`/`tls-portprobe` share `/home/storage/nginx-mixed.conf`), NetBird server, ntfy |
| Staging host / CI runner | `192.168.0.230` (poseidon, backup-01) | Forgejo Actions `deploy` runner (unit `gitea-runner-perigram`, declared in NixOS config); runs the `perigram-staging` container on host network `:3001` |
| App (public) | `https://perigram.sodalab.pro` → zeus :443 → `192.168.0.230:3001` | The CI deploy (push to `staging` = redeploy of the public app) |
| hera / perigram-01 | `192.168.0.248` (LAN), wt0 `10.77.8.3` | Data plane: MongoDB `:27017` (db `cutkit`), LiveKit `:7880`; K3s server with the former prod `perigram-app` pod still alive on NodePort `:30080` (fallback path) |
| Forgejo (public) | `https://forgejo.sodalab.pro` → zeus :443 | Primary git remote (`perigram/perigram`) |
| NetBird mesh | `10.77.0.0/16` (workstation: `wt0`) | Overlay for hosts that are not LAN-reachable; peer IPs come from `netbird status` |

## Workstation Access

- SSH alias `r330` (user `storage`) works over the LAN; no VPN needed.
- The `origin` remote is HTTPS `https://forgejo.sodalab.pro/perigram/perigram.git`
  (org-split R-20260927-11); pushes go through the global credential helper
  as `evo`.
- Poseidon and hera are reached as `root@192.168.0.230` / `root@192.168.0.248`
  over the LAN. Poseidon is reachable from the LAN only — it is not a NetBird
  peer; from outside the office use the public app URL instead.

## Git Remotes

```bash
git remote -v
# origin   https://forgejo.sodalab.pro/perigram/perigram.git   (Forgejo on zeus)
```

Deploy flow and secrets are documented in
[deploy/README.md](../deploy/README.md).

## Local Secret Material

These files may exist on the workstation but must not be committed:

- `~/.ssh/perigram_r240_ed25519` — legacy R240 key (also registered in Forgejo)
- `~/.config/perigram-wireguard/` — legacy WireGuard keys for the R240 VPN
- `~/.git-credentials` — Forgejo HTTPS token (mode `0600`)

Store complete secrets only in a password manager, SOPS (labsite) or the
local root-owned/key files above. Do not put them in git, TODO notes,
Obsidian, or chat transcripts.

## Legacy: R240 / WireGuard

The previous topology ran everything on R240 (`192.168.0.106`, WireGuard
endpoint `78.30.216.48:51820`, interface `perigram-r330`, app on `:7100`,
Forgejo on `:3002`, Swarm service `perigram_app`, webhook autodeploy). None of
it is part of the current deploy path; the machine is routinely powered off
and only reachable over NetBird (`10.77.132.108`) when it is on. The
`/etc/wireguard/perigram-r330.conf` and R240 SSH material above belong to this
retired path.

## MongoDB Note

Dev/staging services connect with `MONGODB_URI`/`NUXT_MONGODB_URI`. The dev
compose network exposes the database as `perigram_mongo`; keep using that name
so connections never land on an unrelated `mongo` alias attached to the same
network. The CI deploy points at the hera data plane
(`mongodb://192.168.0.248:27017/cutkit`, lab LAN, no auth).
