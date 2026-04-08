#!/usr/bin/env bash
#
# Preflight check for a real Hetzner + TLS deployment.
#
# This does not provision or deploy anything. It reports whether the local
# machine has the minimum tools, secrets, and domain configuration needed to
# make real deployment progress.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE=""

usage() {
  cat <<'EOF'
Usage: ./scripts/check-hetzner-deploy-prereqs.sh [--env-file PATH]

Options:
  --env-file PATH   Source an env file before checking prerequisites
  --help            Show this help

What this checks:
  - required local tools for Hetzner + TLS deploy work
  - whether HCLOUD_TOKEN is present locally
  - whether a usable SSH public key exists locally
  - whether the required production env vars are set
  - whether CLAWBACK_DOMAIN / CONSOLE_ORIGIN are coherent
  - whether the chosen domain currently resolves in public DNS

This is a preflight only. It does not create servers, write DNS, or deploy.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
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

if [ -n "$ENV_FILE" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "Env file not found: $ENV_FILE" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -f "${REPO_ROOT}/.env.hetzner" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${REPO_ROOT}/.env.hetzner"
  set +a
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo -e "  ${GREEN}PASS${NC}: $1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  echo -e "  ${YELLOW}WARN${NC}: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo -e "  ${RED}FAIL${NC}: $1"
}

section() {
  echo ""
  echo -e "${BLUE}── $1 ──${NC}"
}

check_command() {
  local cmd="$1"
  local label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "$label available ($cmd)"
  else
    fail "$label missing ($cmd)"
  fi
}

require_env() {
  local name="$1"
  local label="$2"
  if [ -n "${!name:-}" ]; then
    pass "$label set ($name)"
  else
    fail "$label missing ($name)"
  fi
}

section "Local Tooling"

check_command hcloud "Hetzner CLI"
check_command ssh "SSH client"
check_command rsync "rsync"
check_command openssl "OpenSSL"
check_command dig "DNS lookup tool"
check_command curl "curl"

section "Hetzner Access"

if [ -n "${HCLOUD_TOKEN:-}" ]; then
  pass "Hetzner token set (HCLOUD_TOKEN)"
else
  fail "Hetzner token missing (HCLOUD_TOKEN)"
fi

PUBLIC_KEY_FILE=""
if [ -f "${HOME}/.ssh/clawback-hetzner-rehearsal.pub" ]; then
  PUBLIC_KEY_FILE="${HOME}/.ssh/clawback-hetzner-rehearsal.pub"
elif [ -f "${HOME}/.ssh/id_ed25519.pub" ]; then
  PUBLIC_KEY_FILE="${HOME}/.ssh/id_ed25519.pub"
elif [ -f "${HOME}/.ssh/id_rsa.pub" ]; then
  PUBLIC_KEY_FILE="${HOME}/.ssh/id_rsa.pub"
fi

if [ -n "$PUBLIC_KEY_FILE" ]; then
  pass "SSH public key available ($PUBLIC_KEY_FILE)"
else
  fail "No default SSH public key found (~/.ssh/clawback-hetzner-rehearsal.pub, id_ed25519.pub, or id_rsa.pub)"
fi

section "Required Production Env"

require_env CLAWBACK_DOMAIN "Public hostname"
require_env CONSOLE_ORIGIN "Public console origin"
require_env POSTGRES_PASSWORD "Postgres password"
require_env MINIO_ROOT_PASSWORD "MinIO root password"
require_env OPENCLAW_GATEWAY_TOKEN "OpenClaw gateway token"
require_env OPENAI_API_KEY "Model provider key"
require_env COOKIE_SECRET "Cookie secret"
require_env CLAWBACK_RUNTIME_API_TOKEN "Runtime API token"
require_env CLAWBACK_APPROVAL_SURFACE_SECRET "Approval surface secret"

section "Domain / TLS Coherence"

if [ -n "${CLAWBACK_DOMAIN:-}" ] && [ -n "${CONSOLE_ORIGIN:-}" ]; then
  expected_origin="https://${CLAWBACK_DOMAIN}"
  if [ "${CONSOLE_ORIGIN}" = "${expected_origin}" ]; then
    pass "CONSOLE_ORIGIN matches CLAWBACK_DOMAIN (${expected_origin})"
  else
    fail "CONSOLE_ORIGIN must equal https://${CLAWBACK_DOMAIN} (got ${CONSOLE_ORIGIN})"
  fi
fi

if [ -n "${CLAWBACK_DOMAIN:-}" ] && command -v dig >/dev/null 2>&1; then
  DNS_RESULT="$(dig +short "${CLAWBACK_DOMAIN}" | tr '\n' ' ' | sed 's/[[:space:]]\+$//')"
  if [ -n "$DNS_RESULT" ]; then
    pass "Public DNS resolves ${CLAWBACK_DOMAIN} -> ${DNS_RESULT}"
  else
    warn "Public DNS does not currently resolve ${CLAWBACK_DOMAIN}"
  fi
else
  warn "Domain DNS check skipped"
fi

section "DNS Control"

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] || [ -n "${AWS_ACCESS_KEY_ID:-}" ] || [ -n "${GANDI_API_KEY:-}" ]; then
  pass "At least one DNS provider credential is present for automation"
else
  warn "No DNS API credential detected. Manual DNS is still fine, but you need control of the chosen zone."
fi

section "Minimum To Proceed Right Now"

if [ -z "${HCLOUD_TOKEN:-}" ]; then
  echo "  - set HCLOUD_TOKEN"
fi
if [ -z "${CLAWBACK_DOMAIN:-}" ]; then
  echo "  - choose a real public hostname you control"
fi
if [ -z "${CONSOLE_ORIGIN:-}" ]; then
  echo "  - set CONSOLE_ORIGIN=https://<that-hostname>"
fi
for required_name in \
  POSTGRES_PASSWORD \
  MINIO_ROOT_PASSWORD \
  OPENCLAW_GATEWAY_TOKEN \
  OPENAI_API_KEY \
  COOKIE_SECRET \
  CLAWBACK_RUNTIME_API_TOKEN \
  CLAWBACK_APPROVAL_SURFACE_SECRET; do
  if [ -z "${!required_name:-}" ]; then
    echo "  - set ${required_name}"
  fi
done
if [ -z "$PUBLIC_KEY_FILE" ]; then
  echo "  - make a usable local SSH key available"
fi
if [ -n "${CLAWBACK_DOMAIN:-}" ] && [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${AWS_ACCESS_KEY_ID:-}" ] && [ -z "${GANDI_API_KEY:-}" ]; then
  echo "  - be ready to create the DNS A record manually for ${CLAWBACK_DOMAIN}"
fi

echo ""
echo "Summary: ${PASS_COUNT} passed, ${WARN_COUNT} warnings, ${FAIL_COUNT} failed"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

