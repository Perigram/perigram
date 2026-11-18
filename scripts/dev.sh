#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.dev.yml"

cd "$ROOT"

# Keep bind-mounted files owned by the invoking host user. Compose passes these
# IDs to the app container and the dev image so Nuxt never writes root-owned files.
export PERIGRAM_DEV_UID="$(id -u)"
export PERIGRAM_DEV_GID="$(id -g)"

compose() {
  docker compose --project-directory "$ROOT" -f "$COMPOSE_FILE" "$@"
}

build_target() {
  local target="$1"
  docker buildx bake -f "$COMPOSE_FILE" --allow network.host --set "$target.network=host" "$target"
}

ensure_image() {
  local image="$1" target="$2"
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "Building $target because $image is not present locally..."
    build_target "$target"
  fi
}

repair_app_generated_ownership() {
  # Older dev containers ran Nuxt as root and may have left .nuxt root-owned.
  # Repair it inside a disposable root container so developers never need sudo.
  docker run --rm --user 0:0 --volume "$ROOT:/src" --workdir /src perigram-app:latest \
    sh -c "if [ -d .nuxt ]; then chown -R ${PERIGRAM_DEV_UID}:${PERIGRAM_DEV_GID} .nuxt; fi"
}

usage() {
  cat <<'HELP'
Usage: ./scripts/dev.sh <command>

Commands:
  up                  Build and start the complete development stack
  down                Stop containers; preserve the MongoDB volume
  logs [service]      Follow logs
  ps                  Show service status
  restart [service]   Restart one service or the whole stack
  rebuild [target]    Rebuild app, nesting, plugin-runtime, build123d, or all images
  deps                Rebuild/recreate app after package dependency changes
  shell               Open a shell in the app container
  mongo               Open the Mongo shell
  exec <command...>   Run a command in the app container
  reset --yes         Remove containers and the MongoDB volume (destructive)
HELP
}

command="${1:-help}"
shift || true

if [[ "$command" == "help" || "$command" == "-h" || "$command" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine and Compose v2 first." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

case "$command" in
  up|start)
    if git -C "$ROOT" rev-parse --show-toplevel >/dev/null 2>&1; then
      git -C "$ROOT" submodule update --init --recursive
    fi
    mkdir -p "$ROOT/.local/cortex"
    # BuildKit otherwise sees a host-loopback proxy (for example 127.0.0.1:2081)
    # as its own loopback. Build with host networking so host proxy settings work.
    # The app image is rebuilt for current app dependencies. Large engine/runtime
    # images are built only on first use; rebuild them explicitly when their
    # Dockerfile, Rust sources, or Python dependencies change.
    build_target app
    ensure_image perigram-nesting-worker:latest nesting-worker
    ensure_image perigram-plugin-runtime:latest plugin-runtime
    ensure_image perigram-build123d-executor:latest build123d-executor
    # Stop any previous app first: an old root-running container can otherwise
    # recreate root-owned .nuxt files after the ownership repair has completed.
    compose stop app >/dev/null 2>&1 || true
    repair_app_generated_ownership
    compose up -d --no-build
    compose ps

    app_id="$(compose ps -q app)"
    if [[ -z "$app_id" ]]; then
      echo "The app container was not created." >&2
      compose logs --no-color --tail=100 app >&2 || true
      exit 1
    fi

    echo "Waiting for the app and its database health check..."
    deadline=$((SECONDS + 180))
    while ((SECONDS < deadline)); do
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$app_id" 2>/dev/null || true)"
      case "$health" in
        healthy)
          echo "Seeding the built-in plugin catalog..."
          compose exec -T app node server/scripts/seed-plugin-catalog.js
          echo
          echo "Perigram is ready at http://localhost:${PERIGRAM_DEV_APP_PORT:-3001}"
          exit 0
          ;;
        unhealthy|exited|dead)
          echo "The app did not become healthy (container state: $health)." >&2
          compose ps >&2
          compose logs --no-color --tail=100 app >&2 || true
          exit 1
          ;;
      esac
      sleep 2
    done

    echo "Timed out waiting for application readiness after 180 seconds." >&2
    compose ps >&2
    compose logs --no-color --tail=100 app >&2 || true
    exit 1
    ;;
  down|stop)
    compose down
    ;;
  logs)
    compose logs -f --tail=100 "$@"
    ;;
  ps|status)
    compose ps
    ;;
  restart)
    compose restart "$@"
    ;;
  build|rebuild)
    target="${1:-app}"
    case "$target" in
      app) build_target app ;;
      nesting|nesting-worker)
        build_target nesting-worker
        compose up -d --no-build --force-recreate nesting-worker
        ;;
      plugin-runtime) build_target plugin-runtime ;;
      build123d|build123d-executor) build_target build123d-executor ;;
      all) docker buildx bake -f "$COMPOSE_FILE" --allow network.host --set '*.network=host' ;;
      *) echo "Unknown image target: $target" >&2; usage >&2; exit 2 ;;
    esac
    ;;
  deps)
    build_target app
    repair_app_generated_ownership
    compose up -d --no-build --no-deps --force-recreate app
    ;;
  shell)
    compose exec app sh
    ;;
  mongo)
    compose exec mongo mongo --quiet
    ;;
  exec)
    if (($# == 0)); then
      echo "Usage: ./scripts/dev.sh exec <command...>" >&2
      exit 2
    fi
    compose exec app "$@"
    ;;
  reset)
    if [[ "${1:-}" != "--yes" ]]; then
      echo "This deletes the local MongoDB volume. Re-run as: ./scripts/dev.sh reset --yes" >&2
      exit 2
    fi
    compose down --volumes --remove-orphans
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: $command" >&2
    usage >&2
    exit 2
    ;;
esac
