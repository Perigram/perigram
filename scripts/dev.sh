#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.dev.yml"
NETWORK="perigram-network"

cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine and Compose v2 first." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required (docker compose)." >&2
  exit 1
fi

compose() {
  docker compose --project-directory "$ROOT" -f "$COMPOSE_FILE" "$@"
}

ensure_network() {
  if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
    docker network create "$NETWORK" >/dev/null
    echo "Created Docker network: $NETWORK"
  fi
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
  deps                Rebuild/recreate app after package dependency changes
  shell               Open a shell in the app container
  mongo               Open the Mongo shell
  exec <command...>   Run a command in the app container
  reset --yes         Remove containers and the MongoDB volume (destructive)
HELP
}

command="${1:-help}"
shift || true

case "$command" in
  up|start)
    ensure_network
    mkdir -p "$ROOT/.local/cortex"
    compose up -d --build
    compose ps
    echo
    echo "Perigram is starting at http://localhost:3000"
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
  deps)
    ensure_network
    compose build app
    compose up -d --no-deps --force-recreate app
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
