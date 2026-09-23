#!/usr/bin/env bash
set -euo pipefail

# Installs the Perigram Forgejo autodeploy pipeline on R240 as a user systemd
# service (linger is enabled for the perigram user, so no sudo is needed):
#   - copies webhook receiver + deploy runner to ~/autodeploy
#   - writes webhook.env with the shared secret
#   - installs and starts the perigram-autodeploy user service
#   - registers the Forgejo webhook (push event) against the repo
#
# Usage:
#   bash deploy/install-autodeploy.sh <FORGEJO_HTTP> <ADMIN_TOKEN> <REPO_OWNER/REPO_NAME>

FORGEJO_HTTP="${1:?usage: install-autodeploy.sh <forgejo-http> <admin-token> <owner/repo>}"
ADMIN_TOKEN="${2:?missing admin token}"
REPO="${3:?missing owner/repo}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTODEPLOY_DIR="${HOME}/autodeploy"
SERVICE=perigram-autodeploy.service
WEBHOOK_PORT="${PERIGRAM_WEBHOOK_PORT:-8088}"
WEBHOOK_HOST="${PERIGRAM_WEBHOOK_HOST:-192.168.0.106}"
BIND="${PERIGRAM_WEBHOOK_BIND:-192.168.0.106}"

mkdir -p "${AUTODEPLOY_DIR}"

cp "${SCRIPT_DIR}/webhook-receiver.py" "${AUTODEPLOY_DIR}/webhook-receiver.py"
cp "${SCRIPT_DIR}/deploy-staging.sh" "${AUTODEPLOY_DIR}/deploy-staging.sh"
chmod +x "${AUTODEPLOY_DIR}/webhook-receiver.py" "${AUTODEPLOY_DIR}/deploy-staging.sh"

# Reuse an existing secret or generate a fresh one.
if [ -f "${AUTODEPLOY_DIR}/webhook.env" ] && grep -q PERIGRAM_WEBHOOK_SECRET "${AUTODEPLOY_DIR}/webhook.env"; then
  echo "[install] reusing existing webhook secret"
else
  SECRET=$(openssl rand -hex 24)
  printf 'PERIGRAM_WEBHOOK_SECRET=%s\nPERIGRAM_WEBHOOK_BIND=%s\nPERIGRAM_WEBHOOK_PORT=%s\n' \
    "${SECRET}" "${BIND}" "${WEBHOOK_PORT}" > "${AUTODEPLOY_DIR}/webhook.env"
  echo "[install] generated new webhook secret in ${AUTODEPLOY_DIR}/webhook.env"
fi

chmod 600 "${AUTODEPLOY_DIR}/webhook.env"

mkdir -p "${HOME}/.config/systemd/user"
cp "${SCRIPT_DIR}/perigram-autodeploy.service" "${HOME}/.config/systemd/user/${SERVICE}"
systemctl --user daemon-reload
systemctl --user enable --now "${SERVICE}"
sleep 1
systemctl --user status --no-pager "${SERVICE}" | head -8

# Register the Forgejo webhook (idempotent by URL).
HOOK_URL="http://${WEBHOOK_HOST}:${WEBHOOK_PORT}/hook"
SECRET_VALUE=$(grep '^PERIGRAM_WEBHOOK_SECRET=' "${AUTODEPLOY_DIR}/webhook.env" | cut -d= -f2-)

EXISTING=$(curl -fsS -H "Authorization: token ${ADMIN_TOKEN}" \
  "http://${FORGEJO_HTTP}/api/v1/repos/${REPO}/hooks" | python3 -c \
  "import json,sys; print(next((h['id'] for h in json.load(sys.stdin) if h.get('url')=='${HOOK_URL}'), ''))" 2>/dev/null || true)

if [ -n "${EXISTING}" ]; then
  echo "[install] webhook already registered (id=${EXISTING})"
else
  curl -fsS -X POST -H "Authorization: token ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"forgejo\",\"active\":true,\"events\":[\"push\"],\"config\":{\"url\":\"${HOOK_URL}\",\"content_type\":\"json\",\"secret\":\"${SECRET_VALUE}\",\"http_method\":\"POST\"}}" \
    "http://${FORGEJO_HTTP}/api/v1/repos/${REPO}/hooks" -o /dev/null
  echo "[install] registered webhook at ${HOOK_URL}"
fi

echo "[install] autodeploy installed"
