#!/usr/bin/env bash
#
# Run the existing deployed-stack acceptance test on a fresh Ubuntu/Debian VM
# over SSH. This keeps the remote rehearsal aligned with docker-compose.prod.yml
# instead of introducing a second deployment path.
#
# Usage:
#   ./scripts/test-remote-stack.sh --host root@203.0.113.10
#   ./scripts/test-remote-stack.sh --host ubuntu@203.0.113.10 --identity ~/.ssh/id_ed25519
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/test-remote-stack.sh --host user@host [options]

Options:
  --host USER@HOST      SSH target for the remote VM (required)
  --identity PATH       SSH identity file
  --port PORT           SSH port (default: 22)
  --workspace PATH      Remote workspace directory (default: ~/clawback-remote-rehearsal)
  --skip-bootstrap      Assume Docker + Compose are already installed remotely
  --help                Show this help

What this proves:
  - a fresh Ubuntu/Debian VM can be bootstrapped for Clawback's supported
    single-node Docker Compose deployment
  - the repo can be copied to that host and build successfully
  - scripts/test-deployed-stack.sh passes remotely (build, health, seed,
    public-try verification, teardown)

What this does not prove:
  - TLS, DNS, reverse proxy, SMTP, Gmail, or cloud-specific provisioning
  - persistent production deployment with a retained .env
  - multi-node or HA behavior
EOF
}

HOST=""
IDENTITY=""
SSH_PORT="22"
WORKSPACE="~/clawback-remote-rehearsal"
SKIP_BOOTSTRAP=0

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
    --)
      shift
      break
      ;;
    --skip-bootstrap)
      SKIP_BOOTSTRAP=1
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

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required locally." >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required locally." >&2
  exit 1
fi

SSH_OPTS=(
  -p "$SSH_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

if [ -n "$IDENTITY" ]; then
  SSH_OPTS+=(-i "$IDENTITY")
fi

if [ "$SKIP_BOOTSTRAP" -ne 1 ]; then
  BOOTSTRAP_CMD=(
    "${SCRIPT_DIR}/bootstrap-remote-ubuntu-host.sh"
    --host "$HOST"
    --port "$SSH_PORT"
  )
  if [ -n "$IDENTITY" ]; then
    BOOTSTRAP_CMD+=(--identity "$IDENTITY")
  fi
  "${BOOTSTRAP_CMD[@]}"
fi

REMOTE_WORKSPACE_LITERAL="$WORKSPACE"

RSYNC_SSH="ssh -p ${SSH_PORT} -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
if [ -n "$IDENTITY" ]; then
  RSYNC_SSH="${RSYNC_SSH} -i $(printf '%q' "$IDENTITY")"
fi

ssh "${SSH_OPTS[@]}" "$HOST" "bash -s" -- "$REMOTE_WORKSPACE_LITERAL" <<'REMOTE_PREP'
set -euo pipefail

WORKSPACE="${1:-}"
if [ -z "$WORKSPACE" ]; then
  echo "Remote workspace argument is required." >&2
  exit 1
fi

WORKSPACE="${WORKSPACE/#\~/$HOME}"
mkdir -p "$WORKSPACE"
REMOTE_PREP

rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'dist/' \
  --exclude 'coverage/' \
  --exclude 'playwright-report/' \
  --exclude 'test-results/' \
  --exclude '.turbo/' \
  --exclude '.DS_Store' \
  -e "$RSYNC_SSH" \
  "${REPO_ROOT}/" "${HOST}:${REMOTE_WORKSPACE_LITERAL}/"

ssh "${SSH_OPTS[@]}" "$HOST" "bash -s" -- "$REMOTE_WORKSPACE_LITERAL" <<'REMOTE_RUN'
set -euo pipefail

WORKSPACE="${1:-}"
if [ -z "$WORKSPACE" ]; then
  echo "Remote workspace argument is required." >&2
  exit 1
fi

WORKSPACE="${WORKSPACE/#\~/$HOME}"
mkdir -p "$WORKSPACE"
cd "$WORKSPACE"
./scripts/test-deployed-stack.sh
REMOTE_RUN

echo "Remote deployed-stack rehearsal passed on ${HOST}."
