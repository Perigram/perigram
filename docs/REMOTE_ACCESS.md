# Remote Access Runbook

This project is deployed on the R240 host behind the CutKit WireGuard VPN.
Use this runbook for agent access, deployment, and basic checks. It intentionally
does not store private keys, sudo passwords, full WireGuard configs, cookies, or
tokens.

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
| Remote bare repo | `/home/cutkit/cutkit-demo.git` |
| Swarm app service | `cutkit_app` |

The VPN-only LAN address is expected. A public internet connection first goes to
the WireGuard endpoint, then SSH/app traffic goes through the VPN to
`192.168.0.106`.

## Local Secret Material

These files may exist on the workstation but must not be committed:

- `/etc/wireguard/cutkit-r330.conf` - root-owned active WireGuard config,
  contains private material.
- `~/.config/cutkit-wireguard/isuo-workstation.key` - WireGuard private key.
- `~/.config/cutkit-wireguard/isuo-workstation.pub` - WireGuard public key.
- `~/.ssh/cutkit_r240_ed25519` - SSH private key for `cutkit-r240`.
- `~/.ssh/config` - contains the `cutkit-r240` host alias.

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

## Deploy From Local Branch

Use the `local` branch. Push to the remote bare repo through the SSH alias:

```bash
git -c core.sshCommand='ssh -F /home/isuo/.ssh/config -o StrictHostKeyChecking=accept-new' \
  push cutkit-r240:/home/cutkit/cutkit-demo.git local:local
```

Then update the remote checkout, build, and roll the service:

```bash
ssh -F /home/isuo/.ssh/config cutkit-r240 \
  'cd /home/cutkit/cutkit-demo && git fetch /home/cutkit/cutkit-demo.git local && git checkout local && git reset --hard FETCH_HEAD && git rev-parse --short HEAD'

ssh -F /home/isuo/.ssh/config cutkit-r240 \
  'cd /home/cutkit/cutkit-demo && docker build -t cutkit-app:local-<commit> -t cutkit-app:latest .'

ssh -F /home/isuo/.ssh/config cutkit-r240 \
  'docker service update --image cutkit-app:local-<commit> --detach=false cutkit_app'
```

Replace `<commit>` with the short commit hash from the remote checkout.

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
