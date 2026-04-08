#!/usr/bin/env bash
#
# Update an existing remote Clawback deployment by syncing the current repo
# snapshot over SSH and restarting the supported production Compose stack.
#
# This is intentionally narrow: it assumes the remote host already exists, the
# repo workspace already has a valid .env, and Docker Compose is already
# available. It does not provision cloud resources, mint TLS certs, or rewrite
# remote secrets.
#
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-remote-stack.sh --host user@host [options]

Options:
  --host USER@HOST      SSH target for the remote VM (required)
  --identity PATH       SSH identity file
  --port PORT           SSH port (default: 22)
  --workspace PATH      Remote workspace directory (default: ~/clawback-deploy)
  --env-file PATH       Remote env file path (default: .env within workspace)
  --skip-rsync          Reuse the existing remote checkout/workspace
  --no-build            Restart without rebuilding images
  --help                Show this help

What this does:
  - rsync the current repo snapshot to the remote workspace
  - preserve the remote env file and runtime state volumes
  - run docker compose -f docker-compose.prod.yml up -d [--build]

What this does not do:
  - create or update DNS, TLS, SMTP, Gmail, or model-provider secrets
  - seed or reset the remote database
  - run acceptance tests automatically after deploy
EOF
}

HOST=""
IDENTITY=""
SSH_PORT="22"
WORKSPACE="~/clawback-deploy"
REMOTE_ENV_FILE=".env"
SKIP_RSYNC=0
NO_BUILD=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --identity)
      IDENTITY="${2:-}"
      shift 2
      ;;
    --port)
      SSH_PORT="${2:-}"
      shift 2
      ;;
    --workspace)
      WORKSPACE="${2:-}"
      shift 2
      ;;
    --env-file)
      REMOTE_ENV_FILE="${2:-}"
      shift 2
      ;;
    --skip-rsync)
      SKIP_RSYNC=1
      shift
      ;;
    --no-build)
      NO_BUILD=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$HOST" ]; then
  echo "--host is required." >&2
  usage >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SSH_OPTS=(
  -p "$SSH_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

if [ -n "$IDENTITY" ]; then
  SSH_OPTS+=(-i "$IDENTITY")
fi

REMOTE_WORKSPACE_LITERAL="$WORKSPACE"

if [ "$SKIP_RSYNC" -ne 1 ]; then
  RSYNC_SSH="ssh -p ${SSH_PORT} -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
  if [ -n "$IDENTITY" ]; then
    RSYNC_SSH="${RSYNC_SSH} -i $(printf '%q' "$IDENTITY")"
  fi

  ssh "${SSH_OPTS[@]}" "$HOST" "bash -s" -- "$REMOTE_WORKSPACE_LITERAL" <<'REMOTE_PREP'
set -euo pipefail
WORKSPACE="${1:-}"
WORKSPACE="${WORKSPACE/#\~/$HOME}"
mkdir -p "$WORKSPACE"
REMOTE_PREP

  rsync -az --delete \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude '.next/' \
    --exclude 'dist/' \
    --exclude 'coverage/' \
    --exclude '.playwright/' \
    --exclude 'playwright-report/' \
    --exclude 'test-results/' \
    --exclude '.turbo/' \
    --exclude '.DS_Store' \
    --exclude '.env' \
    -e "$RSYNC_SSH" \
    "${REPO_ROOT}/" "${HOST}:${REMOTE_WORKSPACE_LITERAL}/"
fi

ssh "${SSH_OPTS[@]}" "$HOST" "bash -s" -- "$REMOTE_WORKSPACE_LITERAL" "$REMOTE_ENV_FILE" "$NO_BUILD" <<'REMOTE_DEPLOY'
set -euo pipefail

WORKSPACE="${1:-}"
REMOTE_ENV_FILE="${2:-.env}"
NO_BUILD="${3:-0}"

WORKSPACE="${WORKSPACE/#\~/$HOME}"
cd "$WORKSPACE"

if [ ! -f "$REMOTE_ENV_FILE" ]; then
  echo "Remote env file not found: ${WORKSPACE}/${REMOTE_ENV_FILE}" >&2
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$REMOTE_ENV_FILE")
if [ "$NO_BUILD" -eq 1 ]; then
  "${COMPOSE[@]}" up -d
else
  "${COMPOSE[@]}" up -d --build
fi

echo "Remote deploy complete in ${WORKSPACE} using ${REMOTE_ENV_FILE}."
REMOTE_DEPLOY
