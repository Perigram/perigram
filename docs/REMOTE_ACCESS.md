# Remote Access Runbook

This runbook covers the legacy R240 self-hosted path. Production currently runs
on Railway; use [DEPLOYMENT.md](./DEPLOYMENT.md) for the active Railway app and
database workflow. Keep this file for VPN/SSH access to the R240 host and for
the old Swarm rollout path. It intentionally does not store private keys, sudo
passwords, full WireGuard configs, cookies, or tokens.

## Current Targets

| Target | Value |
|---|---|
| WireGuard endpoint | `78.30.216.48:51820` |
| Local WireGuard interface | `cutkit-r330` |
| Local WireGuard config | `/etc/wireguard/cutkit-r330.conf` |
| R240 SSH alias | `cutkit-r240` |
| R240 SSH target | `cutkit@192.168.0.106` |
| R240 app URL | `http://192.168.0.106:7100` |
| Remote checkout | `/home/cutkit/cutkit-demo` |
| Forgejo (git server) | `http://192.168.0.106:3002` (HTTP), `ssh://git@192.168.0.106:2222` (Git SSH) |
| Git origin | `git@192.168.0.106:cutkit/cutkit-demo.git` via port `2222` |
| GitHub mirror | `github` remote at `https://github.com/1suo/cutkit-demo.git` |
| Swarm app service | `cutkit_app` |
| Autodeploy webhook | `http://192.168.0.106:8088/hook` (push to `staging`) |

The VPN-only LAN address is expected. A public internet connection first goes to
the WireGuard endpoint, then SSH/app traffic goes through the VPN to
`192.168.0.106`.

## Local Secret Material

These files may exist on the workstation but must not be committed:

- `/etc/wireguard/cutkit-r330.conf` - root-owned active WireGuard config,
  contains private material.
- `~/.config/cutkit-wireguard/isuo-workstation.key` - WireGuard private key.
- `~/.config/cutkit-wireguard/isuo-workstation.pub` - WireGuard public key.
- `~/.ssh/cutkit_r240_ed25519` - SSH private key for `cutkit-r240`; also
  registered in Forgejo as the workstation key.
- `~/.ssh/config` - contains the `cutkit-r240` host alias.

On R240 (not committed anywhere):

- `~/forgejo` - Forgejo data directory (admin credentials and DB secrets live
  in the SQLite database / `app.ini`).
- `~/autodeploy/webhook.env` - autodeploy webhook HMAC secret (mode `0600`).
- `~/.ssh/cutkit_git_deploy` - R240 SSH key registered in Forgejo for the
  checkout/deploy transport.

Store complete secrets only in a password manager or the local root-owned/key
files above. Do not put them in git, TODO notes, Obsidian, or chat transcripts.

## Connect

```bash
sudo wg-quick up cutkit-r330
sudo wg show cutkit-r330
ping 10.44.0.1
ping 192.168.0.106
ssh -F /home/isuo/.ssh/config cutkit-r240 'hostname'
curl http://192.168.0.106:7100/api/service/health
```

If `/etc/wireguard/cutkit-r330.conf` is missing, ask the server admin for a
client WireGuard config for this workstation, the server public key, endpoint,
assigned client IP, allowed IPs/routes, and confirmation that this workstation's
SSH public key is present in `/home/cutkit/.ssh/authorized_keys` on R240.

## Git Server: Forgejo on R240

Forgejo runs as a Docker container on R240 and is the primary git remote for
this repository. Ports are bound to the private LAN address only:

- HTTP web UI / API: `http://192.168.0.106:3002`
- Git over SSH: `ssh://git@192.168.0.106:2222/<owner>/<repo>.git`
- Container data: `/home/cutkit/forgejo` (persistent; includes `app.ini`, the
  SQLite database, repositories, and SSH keys)
- Container: `forgejo` (restart `unless-stopped`)

The workstation `origin` remote points at Forgejo:

```bash
git remote -v
# origin  git@192.168.0.106:cutkit/cutkit-demo.git (fetch)
# origin  git@192.168.0.106:cutkit/cutkit-demo.git (push)
# github  https://github.com/1suo/cutkit-demo.git (fetch/push)   <- mirror
```

Git SSH to Forgejo uses port `2222` with the workstation key
`~/.ssh/cutkit_r240_ed25519`:

```bash
git config core.sshCommand 'ssh -p 2222 -i ~/.ssh/cutkit_r240_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
```

The R240 checkout clones/pushes over the same Forgejo SSH transport using the
R240 deploy key `~/.ssh/cutkit_git_deploy`.

## MongoDB DNS Note

The main stack's services connect to MongoDB via `MONGODB_URI`/`MONGO_URI`
using the Swarm service name `cutkit_mongo`:

```
mongodb://cutkit_mongo:27017/cutkit_dev
```

Do not point them at the bare service name `mongo`. The separate
`cutkit-demo-agent` compose stack attaches its own `mongo` container to the
same `cutkit-network` overlay with the alias `mongo`, so the short name
resolves to both databases and the driver can land on the wrong one (an empty
`cutkit_dev`), producing `Invalid credentials (User not found: ...)` on login.

## Deploy Staging

Pushing to the `staging` branch on Forgejo auto-deploys. The deploy runner
(`deploy/deploy-staging.sh`) is triggered by the Forgejo push webhook through
the receiver service (`deploy/webhook-receiver.py`). See
[deploy/README.md](../deploy/README.md) for the pipeline and installer.

Manual staging deploy from the workstation:

```bash
git push origin staging
```

Then monitor the R240 Swarm roll:

```bash
ssh -F /home/isuo/.ssh/config cutkit-r240 \
  'docker service ps cutkit_app --no-trunc --format "{{.Name}} {{.Image}} {{.CurrentState}} {{.Error}}" | head -5'
```

## Verify

```bash
curl -fsS http://192.168.0.106:7100/api/service/health
ssh -F /home/isuo/.ssh/config cutkit-r240 \
  'docker service ps cutkit_app --no-trunc --format "{{.Name}} {{.Image}} {{.CurrentState}} {{.Error}}" | head -5'
ssh -F /home/isuo/.ssh/config cutkit-r240 \
  'docker service logs --tail 100 cutkit_app'
```

## Known Notes

- `192.168.0.67` appears in older docs/env as a historical LAN target. Current
  R240 app access for this setup is `192.168.0.106:7100` over WireGuard.
- `BASE_URL` and `NUXT_PUBLIC_BASE_URL` may still show the historical
  `192.168.0.67:7100` in the Swarm service environment; direct app testing here
  uses `http://192.168.0.106:7100`.
- The legacy bare repo `/home/cutkit/cutkit-demo.git` and the `lan` remote are
  retired in favor of Forgejo; the checkout and deploys now go through the
  Forgejo origin. The `local` branch is a local integration branch only and is
  not pushed to Forgejo.
