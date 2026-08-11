#!/usr/bin/env bash
set -euo pipefail

# CutKit staging autodeploy runner.
# Fetches origin/staging into the R240 checkout, builds the app image, and
# rolls the Swarm service. Intended to be triggered by the Forgejo webhook
# receiver, but safe to run by hand.

CHECKOUT_DIR="${CHECKOUT_DIR:-/home/cutkit/cutkit-demo}"
SERVICE_NAME="${SERVICE_NAME:-cutkit_app}"
IMAGE_PREFIX="${IMAGE_PREFIX:-cutkit-app}"
GIT_BRANCH="${GIT_BRANCH:-staging}"
HTTP_PROXY_PORT="${HTTP_PROXY_PORT:-12334}"

run() {
  echo "[deploy-staging] $(date -Is) ${GIT_BRANCH} -> ${SERVICE_NAME}"

  cd "${CHECKOUT_DIR}"
  git fetch origin "${GIT_BRANCH}"
  git checkout -B "${GIT_BRANCH}" "origin/${GIT_BRANCH}"
  git reset --hard "origin/${GIT_BRANCH}"

  local short
  short="$(git rev-parse --short HEAD)"
  local tag="${IMAGE_PREFIX}:${GIT_BRANCH}-${short}"
  echo "[deploy-staging] building ${tag}"

  docker build \
    --network host \
    --build-arg HTTP_PROXY="http://127.0.0.1:${HTTP_PROXY_PORT}" \
    --build-arg HTTPS_PROXY="http://127.0.0.1:${HTTP_PROXY_PORT}" \
    -t "${tag}" \
    -t "${IMAGE_PREFIX}:latest" \
    .

  echo "[deploy-staging] rolling ${SERVICE_NAME}"
  docker service update --image "${tag}" --detach=false "${SERVICE_NAME}"

  echo "[deploy-staging] done ${tag}"
}

run
