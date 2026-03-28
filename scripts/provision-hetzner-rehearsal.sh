#!/usr/bin/env bash
#
# Provision a Hetzner Cloud rehearsal VM for Clawback's single-node deployment
# path. This is intentionally hcloud-first: fast enough for ephemeral E2E runs,
# without introducing Terraform state before we need it.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/provision-hetzner-rehearsal.sh [options]

Options:
  --name NAME              Server name (default: clawback-rehearsal-<timestamp>)
  --type TYPE              Hetzner server type (default: cpx31)
  --image IMAGE            Hetzner image (default: ubuntu-24.04)
  --location LOCATION      Hetzner location (default: ash)
  --ssh-key-name NAME      Hetzner SSH key name to use/create
  --public-key-file PATH   Local public key to register if the key name does not exist
  --identity-file PATH     Private key to use for SSH acceptance handoff
  --remote-user USER       SSH user for follow-on acceptance (default: root)
  --context-name NAME      Temporary hcloud context name (default: clawback-rehearsal)
  --run-acceptance         Run scripts/test-remote-stack.sh after provisioning
  --destroy-on-success     Delete the VM after a successful acceptance run
  --help                   Show this help

Environment:
  HCLOUD_TOKEN             Required Hetzner Cloud API token

Optional local file:
  ./.env.hetzner          If present, sourced before argument/env validation

What this does:
  - creates a temporary hcloud config using HCLOUD_TOKEN
  - ensures an SSH key exists in the Hetzner project
  - creates a server with a small rehearsal cloud-init
  - prints the IP and next command, or optionally runs the remote rehearsal
EOF
}

NAME="clawback-rehearsal-$(date +%Y%m%d-%H%M%S)"
SERVER_TYPE="cpx31"
IMAGE="ubuntu-24.04"
LOCATION="ash"
SSH_KEY_NAME=""
PUBLIC_KEY_FILE=""
IDENTITY_FILE=""
REMOTE_USER="root"
CONTEXT_NAME="clawback-rehearsal"
RUN_ACCEPTANCE=0
DESTROY_ON_SUCCESS=0

if [ -f "${REPO_ROOT}/.env.hetzner" ]; then
  set -a
  . "${REPO_ROOT}/.env.hetzner"
  set +a
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --name)
      NAME="${2:-}"
      shift 2
      ;;
    --type)
      SERVER_TYPE="${2:-}"
      shift 2
      ;;
    --image)
      IMAGE="${2:-}"
      shift 2
      ;;
    --location)
      LOCATION="${2:-}"
      shift 2
      ;;
    --ssh-key-name)
      SSH_KEY_NAME="${2:-}"
      shift 2
      ;;
    --public-key-file)
      PUBLIC_KEY_FILE="${2:-}"
      shift 2
      ;;
    --identity-file)
      IDENTITY_FILE="${2:-}"
      shift 2
      ;;
    --remote-user)
      REMOTE_USER="${2:-}"
      shift 2
      ;;
    --context-name)
      CONTEXT_NAME="${2:-}"
      shift 2
      ;;
    --run-acceptance)
      RUN_ACCEPTANCE=1
      shift
      ;;
    --destroy-on-success)
      DESTROY_ON_SUCCESS=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "${HCLOUD_TOKEN:-}" ]; then
  echo "HCLOUD_TOKEN is required. Export it locally or place it in .env.hetzner (ignored by git)." >&2
  exit 1
fi

if ! command -v hcloud >/dev/null 2>&1; then
  echo "hcloud is required locally. See Hetzner's setup guide: https://github.com/hetznercloud/cli/blob/main/docs/tutorials/setup-hcloud-cli.md" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required locally." >&2
  exit 1
fi

if [ -z "$PUBLIC_KEY_FILE" ]; then
  if [ -f "${HOME}/.ssh/clawback-hetzner-rehearsal.pub" ]; then
    PUBLIC_KEY_FILE="${HOME}/.ssh/clawback-hetzner-rehearsal.pub"
  elif [ -f "${HOME}/.ssh/id_ed25519.pub" ]; then
    PUBLIC_KEY_FILE="${HOME}/.ssh/id_ed25519.pub"
  elif [ -f "${HOME}/.ssh/id_rsa.pub" ]; then
    PUBLIC_KEY_FILE="${HOME}/.ssh/id_rsa.pub"
  else
    echo "No default SSH public key found. Pass --public-key-file explicitly." >&2
    exit 1
  fi
fi

if [ ! -f "$PUBLIC_KEY_FILE" ]; then
  echo "Public key file not found: ${PUBLIC_KEY_FILE}" >&2
  exit 1
fi

if [ -z "$IDENTITY_FILE" ] && [ "${PUBLIC_KEY_FILE##*.}" = "pub" ]; then
  CANDIDATE_IDENTITY="${PUBLIC_KEY_FILE%.pub}"
  if [ -f "$CANDIDATE_IDENTITY" ]; then
    IDENTITY_FILE="$CANDIDATE_IDENTITY"
  fi
fi

if [ -z "$SSH_KEY_NAME" ]; then
  SSH_KEY_NAME="clawback-rehearsal-$(basename "${PUBLIC_KEY_FILE}" .pub)"
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/clawback-hcloud.XXXXXX")"
HCLOUD_CONFIG="${TMP_DIR}/cli.toml"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

HCLOUD=(hcloud --config "$HCLOUD_CONFIG" --context "$CONTEXT_NAME")

hcloud --config "$HCLOUD_CONFIG" context create --token-from-env "$CONTEXT_NAME" >/dev/null

SSH_KEY_EXISTS="$("${HCLOUD[@]}" ssh-key list -o json | python3 -c '
import json, sys
items = json.load(sys.stdin)
target = sys.argv[1]
print("1" if any(item.get("name") == target for item in items) else "0")
' "$SSH_KEY_NAME")"

if [ "$SSH_KEY_EXISTS" != "1" ]; then
  "${HCLOUD[@]}" ssh-key create \
    --name "$SSH_KEY_NAME" \
    --public-key-from-file "$PUBLIC_KEY_FILE" \
    >/dev/null
fi

SERVER_JSON="$("${HCLOUD[@]}" server create \
  --name "$NAME" \
  --type "$SERVER_TYPE" \
  --image "$IMAGE" \
  --location "$LOCATION" \
  --ssh-key "$SSH_KEY_NAME" \
  --user-data-from-file "${REPO_ROOT}/infra/hetzner/cloud-init.rehearsal.yaml" \
  -o json)"

SERVER_ID="$(printf '%s' "$SERVER_JSON" | python3 -c 'import json, sys; data=json.load(sys.stdin); print(data["server"]["id"])')"
SERVER_IP="$(printf '%s' "$SERVER_JSON" | python3 -c 'import json, sys; data=json.load(sys.stdin); print(data["server"]["public_net"]["ipv4"]["ip"])')"

echo "Provisioned Hetzner rehearsal server:"
echo "  name: ${NAME}"
echo "  id:   ${SERVER_ID}"
echo "  ip:   ${SERVER_IP}"
echo "  ssh:  ${REMOTE_USER}@${SERVER_IP}"

if [ "$RUN_ACCEPTANCE" -ne 1 ]; then
  echo ""
  echo "Next step:"
  if [ -n "$IDENTITY_FILE" ]; then
    echo "  ./scripts/test-remote-stack.sh --host ${REMOTE_USER}@${SERVER_IP} --identity ${IDENTITY_FILE}"
  else
    echo "  ./scripts/test-remote-stack.sh --host ${REMOTE_USER}@${SERVER_IP}"
  fi
  echo ""
  echo "Cleanup when done:"
  echo "  ./scripts/destroy-hetzner-rehearsal.sh --server ${SERVER_ID}"
  exit 0
fi

SSH_OPTS=(
  -o BatchMode=yes
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=5
)
if [ -n "$IDENTITY_FILE" ]; then
  SSH_OPTS+=(-i "$IDENTITY_FILE")
fi

for _ in $(seq 1 40); do
  if ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${SERVER_IP}" true 2>/dev/null; then
    break
  fi
  sleep 3
done

if ! ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${SERVER_IP}" true >/dev/null 2>&1; then
  echo "Provisioned server did not become reachable over SSH in time." >&2
  exit 1
fi

REMOTE_TEST_CMD=("${REPO_ROOT}/scripts/test-remote-stack.sh" --host "${REMOTE_USER}@${SERVER_IP}")
if [ -n "$IDENTITY_FILE" ]; then
  REMOTE_TEST_CMD+=(--identity "$IDENTITY_FILE")
fi
"${REMOTE_TEST_CMD[@]}"

if [ "$DESTROY_ON_SUCCESS" -eq 1 ]; then
  "${REPO_ROOT}/scripts/destroy-hetzner-rehearsal.sh" --server "${SERVER_ID}"
fi
