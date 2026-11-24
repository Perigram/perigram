#!/usr/bin/env bash
set -Eeuo pipefail

required=(NUXT_MONGODB_URI BASE_URL LIVEKIT_PUBLIC_URL LIVEKIT_INTERNAL_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET)
missing=()
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if (("${#missing[@]}" > 0)); then
  printf 'Missing deployment configuration: %s\n' "${missing[*]}" >&2
  exit 2
fi
BUILD_CA_BUNDLE="${BUILD_CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}"
if [[ ! -f "$BUILD_CA_BUNDLE" ]]; then
  printf 'Missing deployment CA bundle: %s\n' "$BUILD_CA_BUNDLE" >&2
  exit 2
fi

BUILD_HTTP_PROXY="${BUILD_HTTP_PROXY:-}"
BUILD_HTTPS_PROXY="${BUILD_HTTPS_PROXY:-}"
BUILD_NO_PROXY="${BUILD_NO_PROXY:-localhost,127.0.0.1}"
WORKER_TOKEN="${WORKER_TOKEN:-$(od -An -N32 -tx1 /dev/urandom | tr -d '[:space:]')}"
TRANSCRIPTION_PROVIDER="${TRANSCRIPTION_PROVIDER:-none}"
TRANSCRIPTION_LOCAL_BASE_URL="${TRANSCRIPTION_LOCAL_BASE_URL:-}"
MEETINGS_LLM_BASE_URL="${MEETINGS_LLM_BASE_URL:-}"
MEETINGS_LLM_MODEL="${MEETINGS_LLM_MODEL:-}"
LIVEKIT_RECORDINGS_S3_ENDPOINT="${LIVEKIT_RECORDINGS_S3_ENDPOINT:-}"
LIVEKIT_RECORDINGS_S3_BUCKET="${LIVEKIT_RECORDINGS_S3_BUCKET:-}"
LIVEKIT_RECORDINGS_S3_UPLOAD_ENDPOINT="${LIVEKIT_RECORDINGS_S3_UPLOAD_ENDPOINT:-}"
GARAGE_ACCESS_KEY="${GARAGE_ACCESS_KEY:-}"
GARAGE_SECRET_KEY="${GARAGE_SECRET_KEY:-}"
NUXT_VAPID_PUBLIC_KEY="${NUXT_VAPID_PUBLIC_KEY:-}"
NUXT_VAPID_PRIVATE_KEY="${NUXT_VAPID_PRIVATE_KEY:-}"
GITHUB_SHA="${GITHUB_SHA:-unknown}"

retry() {
  local attempt=0
  until "$@"; do
    attempt=$((attempt + 1))
    if ((attempt >= 5)); then
      echo "Command failed after 5 attempts: $*" >&2
      return 1
    fi
    echo "Attempt $attempt failed; retrying..." >&2
    sleep $((attempt * 10))
  done
}

build_args=(
  --build-arg "HTTP_PROXY=$BUILD_HTTP_PROXY"
  --build-arg "HTTPS_PROXY=$BUILD_HTTPS_PROXY"
  --build-arg "NO_PROXY=$BUILD_NO_PROXY"
)

echo "Reclaiming Docker build space..."
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -af >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true
docker system df 2>/dev/null || true

echo "Pulling base images..."
for image in node:24.15.0-slim rust:1.83 python:3.11-slim python:3.14-slim node:24-alpine denoland/deno:alpine; do
  retry docker pull "$image" || echo "WARN: pull $image failed; build may still resolve it"
done

echo "Building application and worker images..."
retry docker build --network=host "${build_args[@]}" \
  --build-arg PORT=3001 --build-arg "GIT_COMMIT_SHA=$GITHUB_SHA" \
  -t perigram:staging .
retry docker build --network=host "${build_args[@]}" \
  --secret "id=build_ca_bundle,src=$BUILD_CA_BUNDLE" \
  -t perigram-nesting:staging -f workers/nesting/Dockerfile .
retry docker build --network=host "${build_args[@]}" \
  --build-arg PLUGIN=facade -t perigram-executor-facade:staging \
  -f workers/plugin-executor.Dockerfile .
retry docker build --network=host "${build_args[@]}" \
  --build-arg PLUGIN=tech-drawing -t perigram-executor-tech-drawing:staging \
  -f workers/plugin-executor.Dockerfile .
retry docker build --network=host "${build_args[@]}" \
  -t perigram-build123d-executor:staging -f workers/build123d/Dockerfile workers/build123d
retry docker build --network=host "${build_args[@]}" \
  -t perigram-plugin-runtime:staging -f workers/plugin-runtime.Dockerfile .
retry docker build --network=host "${build_args[@]}" \
  -t perigram-seed:staging -f deploy/seed.Dockerfile .

echo "Checking catalog seed image package imports..."
docker run --rm --entrypoint node perigram-seed:staging --input-type=module -e \
  "await import('#packages/plugin-sdk/listing'); await import('#packages/cts')"

echo "Starting plugin executor plane..."
docker rm -f perigram-nesting perigram-facade-executor \
  perigram-documents-executor perigram-tech-drawing-executor \
  perigram-build123d-executor perigram-plugin-runtime >/dev/null 2>&1 || true
docker run -d --name perigram-nesting --restart unless-stopped \
  --network host perigram-nesting:staging
docker run -d --name perigram-facade-executor --restart unless-stopped \
  --network host -e FACADE_EXECUTOR_PORT=8790 \
  -e NESTING_WORKER_URL=http://127.0.0.1:8000/nest \
  perigram-executor-facade:staging
docker run -d --name perigram-tech-drawing-executor --restart unless-stopped \
  --network host -e TECH_DRAWING_EXECUTOR_PORT=8792 \
  perigram-executor-tech-drawing:staging
docker run -d --name perigram-build123d-executor --restart unless-stopped \
  --network host -e BUILD123D_EXECUTOR_PORT=8793 \
  perigram-build123d-executor:staging

echo "Checking plugin executor plane..."
docker run --rm --network host perigram:staging sh -ec '
  for port in 8000 8790 8792; do
    attempt=0
    until curl -sS -o /dev/null "http://127.0.0.1:$port/"; do
      attempt=$((attempt + 1))
      if [ "$attempt" -ge 15 ]; then echo "service on :$port did not answer" >&2; exit 1; fi
      sleep 2
    done
    echo ":$port ready"
  done
  attempt=0
  until curl -fsS -o /dev/null http://127.0.0.1:8793/health; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 15 ]; then echo "build123d executor did not answer on :8793" >&2; exit 1; fi
    sleep 2
  done
  echo ":8793 ready"
'

echo "Publishing plugin catalog and applying idempotent installs..."
docker run --rm --network host \
  -e "NUXT_MONGODB_URI=$NUXT_MONGODB_URI" \
  -e FACADE_EXECUTOR_URL=http://127.0.0.1:8790 \
  -e TECH_DRAWING_EXECUTOR_URL=http://127.0.0.1:8792 \
  -e BUILD123D_EXECUTOR_URL=http://127.0.0.1:8793 \
  perigram-seed:staging sh -ec '
    node server/scripts/seed-plugin-catalog.js &&
    node server/scripts/migrate-facade-pack-to-plugin.js &&
    node server/scripts/migrate-nesting-browser-runtime.js &&
    node server/scripts/migrate-tech-drawing-pack-to-plugin.js &&
    node server/scripts/migrate-documents-pack-to-plugin.js
  '

echo "Replacing application container..."
docker rm -f perigram-staging >/dev/null 2>&1 || true
if docker run --rm --network host perigram:staging \
    sh -c 'curl -fsS -m 2 -o /dev/null http://127.0.0.1:3001/'; then
  echo "Port 3001 is still occupied after removing perigram-staging." >&2
  echo "Inspect with: docker ps -a | grep -i peri; ss -ltnp | grep 3001" >&2
  exit 1
fi

docker run -d --name perigram-staging --restart unless-stopped \
  --network host \
  -e "NUXT_MONGODB_URI=$NUXT_MONGODB_URI" \
  -e "WORKER_TOKEN=$WORKER_TOKEN" \
  -e "BASE_URL=$BASE_URL" \
  -e "NUXT_PUBLIC_BASE_URL=$BASE_URL" \
  -e FACADE_EXECUTOR_URL=http://127.0.0.1:8790 \
  -e TECH_DRAWING_EXECUTOR_URL=http://127.0.0.1:8792 \
  -e BUILD123D_EXECUTOR_URL=http://127.0.0.1:8793 \
  -e "LIVEKIT_PUBLIC_URL=$LIVEKIT_PUBLIC_URL" \
  -e "LIVEKIT_INTERNAL_URL=$LIVEKIT_INTERNAL_URL" \
  -e "LIVEKIT_API_KEY=$LIVEKIT_API_KEY" \
  -e "LIVEKIT_API_SECRET=$LIVEKIT_API_SECRET" \
  -e "TRANSCRIPTION_PROVIDER=$TRANSCRIPTION_PROVIDER" \
  -e "TRANSCRIPTION_LOCAL_BASE_URL=$TRANSCRIPTION_LOCAL_BASE_URL" \
  -e "MEETINGS_LLM_BASE_URL=$MEETINGS_LLM_BASE_URL" \
  -e "MEETINGS_LLM_MODEL=$MEETINGS_LLM_MODEL" \
  -e "LIVEKIT_RECORDINGS_S3_ENDPOINT=$LIVEKIT_RECORDINGS_S3_ENDPOINT" \
  -e "LIVEKIT_RECORDINGS_S3_BUCKET=$LIVEKIT_RECORDINGS_S3_BUCKET" \
  -e "LIVEKIT_RECORDINGS_S3_ACCESS_KEY=$GARAGE_ACCESS_KEY" \
  -e "LIVEKIT_RECORDINGS_S3_SECRET_KEY=$GARAGE_SECRET_KEY" \
  -e "LIVEKIT_RECORDINGS_S3_UPLOAD_ENDPOINT=$LIVEKIT_RECORDINGS_S3_UPLOAD_ENDPOINT" \
  -e "NUXT_VAPID_PUBLIC_KEY=$NUXT_VAPID_PUBLIC_KEY" \
  -e "NUXT_VAPID_PRIVATE_KEY=$NUXT_VAPID_PRIVATE_KEY" \
  perigram:staging

echo "Applying idempotent organization data migrations..."
docker run --rm --network host \
  -e "NUXT_MONGODB_URI=$NUXT_MONGODB_URI" \
  perigram-seed:staging sh -ec '
    node server/scripts/backfill-instance-revisions.js --apply &&
    node server/scripts/migrate-plugin-assets-to-organization-storage.js
  '

docker run -d --name perigram-plugin-runtime --restart unless-stopped \
  --network host --memory=512m --cpus=1 --pids-limit=64 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --tmpfs /tmp:rw,nosuid,nodev,size=128m \
  -e "PERIGRAM_APP_URL=http://127.0.0.1:3001" \
  -e "WORKER_TOKEN=$WORKER_TOKEN" \
  -e PLUGIN_RUNTIME_WORKER_ID=managed-runtime-staging \
  perigram-plugin-runtime:staging

echo "Verifying the deployed build..."
[[ -n "$(docker ps --filter name=perigram-staging --filter status=running -q)" ]] \
  || { echo "perigram-staging is not running" >&2; exit 1; }

attempt=0
while ! REF="$(docker run --rm --network host perigram:staging \
    sh -c "curl -fsS -m 5 http://127.0.0.1:3001/" \
    | grep -oE '/_nuxt/[A-Za-z0-9._-]+\.js' | sort -u | sed -n '1,3p')" || [[ -z "$REF" ]]; do
  attempt=$((attempt + 1))
  if ((attempt >= 15)); then
    echo "The app did not serve Nuxt chunks on :3001" >&2
    exit 1
  fi
  sleep 2
done

image_chunks="$(docker run --rm --entrypoint sh perigram:staging \
  -c 'ls /src/.output/public/_nuxt/')"
while IFS= read -r asset; do
  [[ -z "$asset" ]] && continue
  if ! grep -qx "${asset#/_nuxt/}" <<< "$image_chunks"; then
    echo "Served asset $asset is absent from the image just built" >&2
    exit 1
  fi
done <<< "$REF"

echo "Deployment verified: the running app serves assets from this build."
