#!/usr/bin/env bash
#
# Destroy a Hetzner Cloud rehearsal VM using a temporary hcloud context.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/destroy-hetzner-rehearsal.sh --server <id-or-name> [options]

Options:
  --server ID|NAME       Hetzner server id or name to delete (required)
  --context-name NAME    Temporary hcloud context name (default: clawback-rehearsal)
  --help                 Show this help

Environment:
  HCLOUD_TOKEN           Required Hetzner Cloud API token

Optional local file:
  ./.env.hetzner         If present, sourced before argument/env validation
EOF
}

SERVER=""
CONTEXT_NAME="clawback-rehearsal"

if [ -f "${REPO_ROOT}/.env.hetzner" ]; then
  set -a
  . "${REPO_ROOT}/.env.hetzner"
  set +a
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --server)
      SERVER="${2:-}"
      shift 2
      ;;
    --context-name)
      CONTEXT_NAME="${2:-}"
      shift 2
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

if [ -z "$SERVER" ]; then
  echo "--server is required." >&2
  usage >&2
  exit 1
fi

if [ -z "${HCLOUD_TOKEN:-}" ]; then
  echo "HCLOUD_TOKEN is required. Export it locally or place it in .env.hetzner (ignored by git)." >&2
  exit 1
fi

if ! command -v hcloud >/dev/null 2>&1; then
  echo "hcloud is required locally." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/clawback-hcloud.XXXXXX")"
HCLOUD_CONFIG="${TMP_DIR}/cli.toml"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

hcloud --config "$HCLOUD_CONFIG" context create --token-from-env "$CONTEXT_NAME" >/dev/null
hcloud --config "$HCLOUD_CONFIG" --context "$CONTEXT_NAME" server delete "$SERVER"
