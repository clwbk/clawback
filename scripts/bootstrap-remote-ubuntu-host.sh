#!/usr/bin/env bash
#
# Bootstrap a fresh Ubuntu/Debian host for Clawback's single-node Compose
# rehearsal path.
#
# This is intentionally narrow: it installs Docker Engine + Compose v2 and the
# few host tools needed by test-remote-stack.sh. It does not provision DNS,
# TLS, SMTP, or any cloud-specific resources.
#
# Usage:
#   ./scripts/bootstrap-remote-ubuntu-host.sh --host root@203.0.113.10
#   ./scripts/bootstrap-remote-ubuntu-host.sh --host ubuntu@203.0.113.10 --identity ~/.ssh/id_ed25519
#
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/bootstrap-remote-ubuntu-host.sh --host user@host [options]

Options:
  --host USER@HOST      SSH target for the remote VM (required)
  --identity PATH       SSH identity file
  --port PORT           SSH port (default: 22)
  --help                Show this help

What this does:
  - validates the remote host is Ubuntu or Debian
  - installs curl, rsync, python3, and Docker Engine with Compose v2
  - enables the Docker service
  - adds the connected user to the docker group for future SSH sessions

What this does not do:
  - configure TLS, reverse proxy, SMTP, Gmail, or DNS
  - clone or deploy the Clawback repo
  - run any product acceptance checks
EOF
}

HOST=""
IDENTITY=""
SSH_PORT="22"

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
    --)
      shift
      break
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

SSH_OPTS=(
  -p "$SSH_PORT"
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
)

if [ -n "$IDENTITY" ]; then
  SSH_OPTS+=(-i "$IDENTITY")
fi

ssh "${SSH_OPTS[@]}" "$HOST" "bash -s" <<'REMOTE_BOOTSTRAP'
set -euo pipefail

if [ ! -f /etc/os-release ]; then
  echo "Remote host does not expose /etc/os-release." >&2
  exit 1
fi

. /etc/os-release
OS_ID="${ID:-}"
OS_CODENAME="${VERSION_CODENAME:-}"

case "$OS_ID" in
  ubuntu|debian) ;;
  *)
    echo "Unsupported remote OS: ${OS_ID}. This bootstrap script targets Ubuntu/Debian only." >&2
    exit 1
    ;;
esac

if [ -z "$OS_CODENAME" ]; then
  echo "Could not determine VERSION_CODENAME from /etc/os-release." >&2
  exit 1
fi

if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo -n"
elif [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  echo "Remote user must be root or passwordless sudo-capable." >&2
  exit 1
fi

TARGET_USER="$(id -un)"

export DEBIAN_FRONTEND=noninteractive

if command -v cloud-init >/dev/null 2>&1; then
  $SUDO cloud-init status --wait >/dev/null 2>&1 || true
fi

wait_for_apt() {
  local attempts=0
  while [ "$attempts" -lt 60 ]; do
    if $SUDO bash -lc '
      for lock in /var/lib/apt/lists/lock /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend /var/cache/apt/archives/lock; do
        if [ -e "$lock" ] && command -v fuser >/dev/null 2>&1 && fuser "$lock" >/dev/null 2>&1; then
          exit 1
        fi
      done
      exit 0
    '; then
      return 0
    fi
    sleep 2
    attempts=$((attempts + 1))
  done
  echo "Timed out waiting for apt/dpkg locks to clear." >&2
  exit 1
}

wait_for_apt
$SUDO apt-get update -y
wait_for_apt
$SUDO apt-get install -y ca-certificates curl gnupg lsb-release rsync python3

$SUDO install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
fi

DOCKER_LIST="/etc/apt/sources.list.d/docker.list"
DOCKER_REPO="deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} ${OS_CODENAME} stable"
if [ ! -f "$DOCKER_LIST" ] || ! grep -q "download.docker.com/linux/${OS_ID}" "$DOCKER_LIST"; then
  echo "$DOCKER_REPO" | $SUDO tee "$DOCKER_LIST" >/dev/null
fi

wait_for_apt
$SUDO apt-get update -y
wait_for_apt
$SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
$SUDO systemctl enable --now docker

if getent group docker >/dev/null 2>&1; then
  $SUDO usermod -aG docker "$TARGET_USER" || true
fi

docker --version >/dev/null 2>&1 || $SUDO docker --version >/dev/null 2>&1
$SUDO docker compose version >/dev/null

echo "Remote bootstrap complete on ${PRETTY_NAME} for user ${TARGET_USER}."
echo "Reconnect on a new SSH session to pick up docker group membership if needed."
REMOTE_BOOTSTRAP

echo "Bootstrap complete for ${HOST}."
