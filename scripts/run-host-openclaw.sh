#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PID_FILE="$REPO_ROOT/.runtime/openclaw/host-gateway.pid"

STOP=false

for arg in "$@"; do
  case "$arg" in
    --stop) STOP=true ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

load_env_file() {
  local file_path="$1"
  if [ -f "$file_path" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$file_path"
    set +a
  fi
}

load_env_file "$REPO_ROOT/.env.local"
load_env_file "$REPO_ROOT/.env"
load_env_file "$REPO_ROOT/infra/compose/.env"
load_env_file "$REPO_ROOT/.runtime/openclaw/config/.env"

if [ -z "${CONTROL_PLANE_PORT:-}" ] || [ "${CONTROL_PLANE_PORT}" = "3001" ]; then
  CONTROL_PLANE_PORT=3011
fi

if [ -z "${OPENCLAW_GATEWAY_PORT:-}" ] || [ "${OPENCLAW_GATEWAY_PORT}" = "18789" ]; then
  OPENCLAW_GATEWAY_PORT=18889
fi

: "${OPENCLAW_GATEWAY_TOKEN:=clawback-local-token}"
: "${OPENCLAW_STATE_DIR:=$REPO_ROOT/.runtime/openclaw/config}"
: "${OPENCLAW_REPO_DIR:=$REPO_ROOT/../openclaw}"
: "${OPENCLAW_GATEWAY_URL:=ws://127.0.0.1:${OPENCLAW_GATEWAY_PORT}}"
: "${CLAWBACK_LOCAL_OPENCLAW_MODE:=host}"

export CONTROL_PLANE_PORT
export OPENCLAW_GATEWAY_PORT
export OPENCLAW_GATEWAY_TOKEN
export CLAWBACK_LOCAL_OPENCLAW_MODE

OPENCLAW_ENTRYPOINT="$OPENCLAW_REPO_DIR/openclaw.mjs"

if [ ! -f "$OPENCLAW_ENTRYPOINT" ]; then
  echo "OpenClaw repo entrypoint not found at $OPENCLAW_ENTRYPOINT" >&2
  exit 1
fi

mkdir -p "$(dirname "$PID_FILE")"

read_running_pid() {
  if [ ! -f "$PID_FILE" ]; then
    return 1
  fi

  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    return 1
  fi

  if kill -0 "$pid" 2>/dev/null; then
    printf '%s\n' "$pid"
    return 0
  fi

  rm -f "$PID_FILE"
  return 1
}

stop_gateway() {
  local pid
  if ! pid="$(read_running_pid)"; then
    return 0
  fi

  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 50); do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$PID_FILE"
      return 0
    fi
    sleep 0.1
  done

  kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
}

if [ "$STOP" = true ]; then
  stop_gateway
  exit 0
fi

if read_running_pid >/dev/null 2>&1; then
  exit 0
fi

if lsof -ti :"$OPENCLAW_GATEWAY_PORT" >/dev/null 2>&1; then
  echo "Port $OPENCLAW_GATEWAY_PORT is already in use. Stop the conflicting service or choose a different OPENCLAW_GATEWAY_PORT." >&2
  exit 1
fi

node "$REPO_ROOT/infra/scripts/prepare-local-compose.mjs" >/dev/null

echo "$$" >"$PID_FILE"
CHILD_PID=""
STOP_REQUESTED=false

stop_child() {
  if [ -z "$CHILD_PID" ]; then
    return 0
  fi

  kill "$CHILD_PID" 2>/dev/null || true
  wait "$CHILD_PID" 2>/dev/null || true
  CHILD_PID=""
}

cleanup() {
  STOP_REQUESTED=true
  stop_child
  rm -f "$PID_FILE"
}
trap cleanup EXIT INT TERM

while true; do
  env \
    OPENCLAW_STATE_DIR="$OPENCLAW_STATE_DIR" \
    OPENCLAW_GATEWAY_TOKEN="$OPENCLAW_GATEWAY_TOKEN" \
    node "$OPENCLAW_ENTRYPOINT" gateway run --allow-unconfigured --bind loopback --port "$OPENCLAW_GATEWAY_PORT" &
  CHILD_PID=$!
  if wait "$CHILD_PID"; then
    EXIT_CODE=0
  else
    EXIT_CODE=$?
  fi
  CHILD_PID=""

  if [ "$STOP_REQUESTED" = true ]; then
    exit 0
  fi

  echo "OpenClaw gateway exited with code $EXIT_CODE. Restarting in 1s..." >&2
  sleep 1
done
