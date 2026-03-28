#!/usr/bin/env bash
# Start all Clawback services for local development.
#
# Usage:
#   ./scripts/start-local.sh          # Start everything
#   ./scripts/start-local.sh --skip-infra  # Skip Docker (already running)
#
# Prerequisites:
#   - Docker running
#   - pnpm installed
#   - Node >= 22.12

set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_INFRA=false
for arg in "$@"; do
  case "$arg" in
    --skip-infra) SKIP_INFRA=true ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}▸ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "  ${RED}✗ $1${NC}"; exit 1; }

load_env_file() {
  local file_path="$1"
  if [ -f "$file_path" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$file_path"
    set +a
  fi
}

load_env_file ".env.local"
load_env_file ".env"
load_env_file "infra/compose/.env"

OPENCLAW_REPO_DIR="${OPENCLAW_REPO_DIR:-$(pwd)/../openclaw}"
if [ -n "${CLAWBACK_LOCAL_OPENCLAW_MODE:-}" ]; then
  CLAWBACK_LOCAL_OPENCLAW_MODE="${CLAWBACK_LOCAL_OPENCLAW_MODE}"
elif [ -f "${OPENCLAW_REPO_DIR}/openclaw.mjs" ]; then
  CLAWBACK_LOCAL_OPENCLAW_MODE="host"
else
  CLAWBACK_LOCAL_OPENCLAW_MODE="docker"
fi

if [ -z "${CONTROL_PLANE_PORT:-}" ] || [ "${CONTROL_PLANE_PORT}" = "3001" ]; then
  CONTROL_PLANE_PORT=3011
fi

if [ -z "${OPENCLAW_GATEWAY_PORT:-}" ] || [ "${OPENCLAW_GATEWAY_PORT}" = "18789" ]; then
  OPENCLAW_GATEWAY_PORT=18889
fi

: "${POSTGRES_PORT:=5433}"
: "${CONSOLE_PORT:=3000}"
: "${OPENCLAW_GATEWAY_TOKEN:=clawback-local-token}"
: "${OPENCLAW_GATEWAY_URL:=ws://127.0.0.1:${OPENCLAW_GATEWAY_PORT}}"

export CONTROL_PLANE_PORT
export CONSOLE_PORT
export OPENCLAW_GATEWAY_PORT
export OPENCLAW_GATEWAY_URL
export OPENCLAW_GATEWAY_TOKEN
export NEXT_PUBLIC_CONTROL_PLANE_URL="http://localhost:${CONTROL_PLANE_PORT}"
export CONSOLE_ORIGIN="http://localhost:${CONSOLE_PORT}"
export CLAWBACK_LOCAL_OPENCLAW_MODE

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Clawback Local Development${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# ── Check prerequisites ──────────────────────────────────────────────

step "Checking prerequisites"

command -v node >/dev/null 2>&1 || fail "Node.js is not installed"
ok "Node $(node -v)"

command -v pnpm >/dev/null 2>&1 || fail "pnpm is not installed"
ok "pnpm $(pnpm -v)"

if [ "$SKIP_INFRA" = false ]; then
  command -v docker >/dev/null 2>&1 || fail "Docker is not installed"
  docker info >/dev/null 2>&1 || fail "Docker is not running"
  ok "Docker running"
fi

# ── Start infrastructure ─────────────────────────────────────────────

if [ "$SKIP_INFRA" = false ]; then
  if [ "${CLAWBACK_LOCAL_OPENCLAW_MODE}" = "host" ]; then
    step "Starting infrastructure (Postgres, MinIO)"
    pnpm compose:up:core 2>&1 | tail -3
    ok "Core Docker containers up"
  else
    step "Starting infrastructure (Postgres, MinIO, OpenClaw)"
    pnpm compose:up 2>&1 | tail -4
    ok "Full Docker stack up"
  fi
else
  step "Skipping infrastructure (--skip-infra)"
fi

# ── Wait for Postgres ────────────────────────────────────────────────

step "Waiting for Postgres"
for i in $(seq 1 15); do
  if pg_isready -h 127.0.0.1 -p "$POSTGRES_PORT" -q 2>/dev/null; then
    ok "Postgres accepting connections on port $POSTGRES_PORT"
    break
  fi
  if [ "$i" -eq 15 ]; then
    fail "Postgres not ready after 15 seconds"
  fi
  sleep 1
done

# ── Run migrations ───────────────────────────────────────────────────

step "Running database migrations"
pnpm db:migrate 2>&1 | tail -3
ok "Migrations complete"

# ── Kill any stale processes on our ports ────────────────────────────

step "Clearing ports ${CONSOLE_PORT}, ${CONTROL_PLANE_PORT}"
for port in "$CONSOLE_PORT" "$CONTROL_PLANE_PORT"; do
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    warn "Killed stale process on port $port"
  fi
done
sleep 1

if [ "${CLAWBACK_LOCAL_OPENCLAW_MODE}" = "host" ]; then
  # ── Start host OpenClaw gateway ────────────────────────────────────

  step "Starting host OpenClaw gateway"
  ./scripts/run-host-openclaw.sh --stop >/dev/null 2>&1 || true
  HOST_OPENCLAW_LOG_FILE=".runtime/openclaw/host-gateway.log"
  : > "$HOST_OPENCLAW_LOG_FILE"
  ./scripts/run-host-openclaw.sh >>"$HOST_OPENCLAW_LOG_FILE" 2>&1 &
  HOST_OPENCLAW_PID=$!
  for i in $(seq 1 50); do
    if lsof -ti :"$OPENCLAW_GATEWAY_PORT" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$HOST_OPENCLAW_PID" 2>/dev/null; then
      fail "Host OpenClaw gateway failed to start. See $HOST_OPENCLAW_LOG_FILE"
    fi
    sleep 0.2
  done
  if ! lsof -ti :"$OPENCLAW_GATEWAY_PORT" >/dev/null 2>&1; then
    fail "Host OpenClaw gateway did not bind port $OPENCLAW_GATEWAY_PORT in time. See $HOST_OPENCLAW_LOG_FILE"
  fi
  ok "Host OpenClaw gateway running on port $OPENCLAW_GATEWAY_PORT"

  cleanup() {
    if [ -n "${HOST_OPENCLAW_PID:-}" ]; then
      kill "$HOST_OPENCLAW_PID" 2>/dev/null || true
      wait "$HOST_OPENCLAW_PID" 2>/dev/null || true
    fi
  }

  trap cleanup EXIT INT TERM
else
  step "Using Docker OpenClaw runtime"
  ok "OpenClaw container available on port $OPENCLAW_GATEWAY_PORT"
fi

# ── Start all services ───────────────────────────────────────────────

step "Starting services (console, control-plane, runtime-worker)"
echo ""
echo -e "  ${GREEN}Console:${NC}        http://localhost:${CONSOLE_PORT}"
echo -e "  ${GREEN}Control-plane:${NC}  http://localhost:${CONTROL_PLANE_PORT}"
if [ "${CLAWBACK_LOCAL_OPENCLAW_MODE}" = "host" ]; then
  echo -e "  ${GREEN}OpenClaw gateway:${NC} ws://127.0.0.1:${OPENCLAW_GATEWAY_PORT} (host)"
else
  echo -e "  ${GREEN}OpenClaw gateway:${NC} ws://127.0.0.1:${OPENCLAW_GATEWAY_PORT} (docker)"
fi
echo ""

# Check bootstrap status after services start
(sleep 8 && {
  status=$(curl -s "http://localhost:${CONTROL_PLANE_PORT}/api/setup/status" 2>/dev/null || echo '{}')
  if echo "$status" | grep -q '"bootstrapped":false'; then
    echo ""
    echo -e "  ${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${YELLOW}  First time? Visit http://localhost:${CONSOLE_PORT}/setup${NC}"
    echo -e "  ${YELLOW}  to create the admin account.${NC}"
    echo -e "  ${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  elif echo "$status" | grep -q '"bootstrapped":true'; then
    echo -e "  ${GREEN}Ready!${NC} Log in at http://localhost:${CONSOLE_PORT}/login"
  fi
}) &

# This runs in the foreground so Ctrl+C stops everything
pnpm dev
