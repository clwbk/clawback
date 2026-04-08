#!/usr/bin/env bash
#
# Deployed-stack acceptance test.
#
# Boots the full production Docker Compose stack from scratch, waits for all
# services to become healthy, seeds demo data, and runs the public-try
# verifier against it.  Tears everything down on exit (success or failure).
#
# Prerequisites:
#   - Docker (with Compose v2) installed and the daemon running
#   - Ports 3000, 3001, 80, and 443 available
#
# Usage:
#   ./scripts/test-deployed-stack.sh
#
# What this proves:
#   - docker-compose.prod.yml builds all images successfully
#   - Postgres starts and passes its healthcheck
#   - The migrate service runs to completion
#   - Control-plane starts, passes /healthz (liveness) and /readyz (readiness)
#   - Console (Next.js) starts and responds on port 3000
#   - /setup page is reachable (bootstrap flow works)
#   - Seed data can be applied inside the containerised control-plane builder
#   - The full public-try verification suite passes against the deployed stack
#
# What this does NOT prove:
#   - OpenClaw runtime actually processes agent tasks (no LLM key supplied)
#   - SMTP, Slack, WhatsApp, Gmail integrations work end-to-end
#   - MinIO object storage is exercised beyond starting
#   - TLS / reverse-proxy / DNS behaviour
#   - Multi-node or Kubernetes deployment
#   - Performance under load
#
# Assumptions:
#   - The host has enough resources to build all images (~4 GB RAM, ~8 GB disk)
#   - No other process is bound to the fixed host ports above
#   - The openclaw container image pulls successfully (network access)
#
# Risks:
#   - The openclaw healthcheck may be slow on first pull; the 120 s timeout
#     should be sufficient but CI runners with cold caches may need more
#   - Seed script runs inside the builder stage image which has full pnpm +
#     tsx available; if the Dockerfile stages change, the seed exec may break

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---- Colours (disabled when stdout is not a tty) ----
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' NC=''
fi

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}PASS${NC}: $1"; }
fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}FAIL${NC}: $1"; }

# ---- Generate a temporary .env with safe random values ----
TMPENV=$(mktemp "${TMPDIR:-/tmp}/clawback-test-env.XXXXXX")

random_secret() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 40 || true; }

pick_free_ports() {
  python3 - "$1" <<'PY'
import socket
import sys

count = int(sys.argv[1])
sockets = []

try:
    for _ in range(count):
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        sockets.append(sock)
    for sock in sockets:
        print(sock.getsockname()[1])
finally:
    for sock in sockets:
        sock.close()
PY
}

POSTGRES_PASSWORD="$(random_secret)"
MINIO_ROOT_PASSWORD="$(random_secret)"
OPENCLAW_GATEWAY_TOKEN="$(random_secret)"
COOKIE_SECRET="$(random_secret)"
CLAWBACK_RUNTIME_API_TOKEN="$(random_secret)"
CLAWBACK_APPROVAL_SURFACE_SECRET="$(random_secret)"
CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN="$(random_secret)"
CLAWBACK_GMAIL_WATCH_HOOK_TOKEN="$(random_secret)"
mapfile -t FREE_PORTS < <(pick_free_ports 5)
# Keep the acceptance harness isolated from ambient dev-shell exports such as
# OPENCLAW_GATEWAY_PORT from start-local.sh. Allow explicit overrides only via
# TEST_DEPLOYED_STACK_* variables.
POSTGRES_PORT="${TEST_DEPLOYED_STACK_POSTGRES_PORT:-${FREE_PORTS[0]}}"
MINIO_API_PORT="${TEST_DEPLOYED_STACK_MINIO_API_PORT:-${FREE_PORTS[1]}}"
MINIO_CONSOLE_PORT="${TEST_DEPLOYED_STACK_MINIO_CONSOLE_PORT:-${FREE_PORTS[2]}}"
OPENCLAW_GATEWAY_PORT="${TEST_DEPLOYED_STACK_OPENCLAW_GATEWAY_PORT:-${FREE_PORTS[3]}}"
OPENCLAW_BRIDGE_PORT="${TEST_DEPLOYED_STACK_OPENCLAW_BRIDGE_PORT:-${FREE_PORTS[4]}}"

cat > "$TMPENV" <<ENVEOF
POSTGRES_DB=clawback
POSTGRES_USER=clawback
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_PORT=${POSTGRES_PORT}

MINIO_ROOT_USER=minio
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_API_PORT=${MINIO_API_PORT}
MINIO_CONSOLE_PORT=${MINIO_CONSOLE_PORT}

OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}
OPENCLAW_BRIDGE_PORT=${OPENCLAW_BRIDGE_PORT}

CONTROL_PLANE_PORT=3001
COOKIE_SECRET=${COOKIE_SECRET}
CLAWBACK_RUNTIME_API_TOKEN=${CLAWBACK_RUNTIME_API_TOKEN}
CLAWBACK_APPROVAL_SURFACE_SECRET=${CLAWBACK_APPROVAL_SURFACE_SECRET}
CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN=${CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN}
CLAWBACK_GMAIL_WATCH_HOOK_TOKEN=${CLAWBACK_GMAIL_WATCH_HOOK_TOKEN}

CONSOLE_PORT=3000
CONSOLE_ORIGIN=http://localhost:3000
CONTROL_PLANE_INTERNAL_URL=http://control-plane:3001
CLAWBACK_DOMAIN=localhost
ENVEOF

echo -e "${BLUE}Generated temp .env at ${TMPENV}${NC}"
echo -e "${BLUE}Using temp service ports postgres=${POSTGRES_PORT} minio=${MINIO_API_PORT}/${MINIO_CONSOLE_PORT} openclaw=${OPENCLAW_GATEWAY_PORT}/${OPENCLAW_BRIDGE_PORT}${NC}"

# ---- Compose project name (avoid clashing with other runs) ----
PROJECT_NAME="clawback-test-$$"
COMPOSE="docker compose -f ${REPO_ROOT}/docker-compose.prod.yml --env-file ${TMPENV} -p ${PROJECT_NAME}"

# ---- Teardown trap ----
cleanup() {
  echo ""
  echo -e "${BLUE}---- Tearing down stack ----${NC}"
  $COMPOSE down -v --remove-orphans 2>/dev/null || true
  rm -f "$TMPENV"
  rm -f /tmp/clawback-deployed-stack-cookies.txt
  echo -e "${BLUE}Cleanup complete.${NC}"
}
trap cleanup EXIT

# ====================================================================
# Step 1: Build and start the stack
# ====================================================================
echo ""
echo -e "${BLUE}==== Step 1: Build and start the stack ====${NC}"
$COMPOSE up -d --build

# ====================================================================
# Step 2: Wait for control-plane /healthz (implies postgres + migrate done)
# ====================================================================
echo ""
echo -e "${BLUE}==== Step 2: Wait for control-plane health ====${NC}"

TIMEOUT=120
ELAPSED=0
INTERVAL=3

while true; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/healthz 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ]; then
    pass "Control-plane /healthz responded 200 after ${ELAPSED}s"
    break
  fi
  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    fail "Control-plane /healthz did not respond 200 within ${TIMEOUT}s (last: HTTP ${CODE})"
    echo ""
    echo -e "${RED}Dumping container logs for debugging:${NC}"
    $COMPOSE logs --tail=40
    exit 1
  fi
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done

# ====================================================================
# Step 3: Check /readyz
# ====================================================================
echo ""
echo -e "${BLUE}==== Step 3: Readiness check ====${NC}"

READYZ_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/readyz 2>/dev/null || echo "000")
if [ "$READYZ_CODE" = "200" ]; then
  pass "Control-plane /readyz returned 200"
else
  fail "Control-plane /readyz returned HTTP ${READYZ_CODE}"
fi

# ====================================================================
# Step 4: Check console on port 3000
# ====================================================================
echo ""
echo -e "${BLUE}==== Step 4: Console reachability ====${NC}"

# Console may take a few extra seconds after control-plane is up
CONSOLE_TIMEOUT=60
CONSOLE_ELAPSED=0

while true; do
  CONSOLE_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  # Accept 200 or 3xx (Next.js may redirect to /login or /setup)
  if [ "$CONSOLE_CODE" -ge 200 ] && [ "$CONSOLE_CODE" -lt 400 ] 2>/dev/null; then
    pass "Console at port 3000 responded HTTP ${CONSOLE_CODE} after ${CONSOLE_ELAPSED}s"
    break
  fi
  if [ "$CONSOLE_ELAPSED" -ge "$CONSOLE_TIMEOUT" ]; then
    fail "Console at port 3000 did not respond within ${CONSOLE_TIMEOUT}s (last: HTTP ${CONSOLE_CODE})"
    break
  fi
  sleep 3
  CONSOLE_ELAPSED=$((CONSOLE_ELAPSED + 3))
done

# ====================================================================
# Step 5: Check /setup page
# ====================================================================
echo ""
echo -e "${BLUE}==== Step 5: Setup page ====${NC}"

SETUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/setup/status 2>/dev/null || echo "000")
if [ "$SETUP_CODE" = "200" ]; then
  pass "Setup status endpoint reachable"
else
  fail "Setup status endpoint returned HTTP ${SETUP_CODE}"
fi

# ====================================================================
# Step 6: Check migration completed
# ====================================================================
echo ""
echo -e "${BLUE}==== Step 6: Migration service ====${NC}"

MIGRATE_EXIT=$($COMPOSE ps -a --format json 2>/dev/null \
  | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    svc = json.loads(line)
    if 'migrate' in svc.get('Service', '') or 'migrate' in svc.get('Name', ''):
        ec = svc.get('ExitCode', -1)
        print(ec)
        break
" 2>/dev/null || echo "-1")

if [ "$MIGRATE_EXIT" = "0" ]; then
  pass "Migration service exited with code 0"
else
  fail "Migration service exit code: ${MIGRATE_EXIT} (expected 0)"
fi

# ====================================================================
# Step 7: Seed demo data
# ====================================================================
echo ""
echo -e "${BLUE}==== Step 7: Seed demo data ====${NC}"

# The migrate service uses the 'builder' target which has pnpm + tsx.
# We run the seed via a one-off container using the same image.
MIGRATE_IMAGE=$($COMPOSE images migrate --format json 2>/dev/null \
  | python3 -c "
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    img = json.loads(line)
    repo = img.get('Repository', '')
    tag = img.get('Tag', 'latest')
    if repo:
        print(f'{repo}:{tag}')
        break
" 2>/dev/null || echo "")

if [ -z "$MIGRATE_IMAGE" ]; then
  # Fallback: build the image name from the project name
  MIGRATE_IMAGE="${PROJECT_NAME}-migrate:latest"
fi

echo "  Using image: ${MIGRATE_IMAGE}"

SEED_OUTPUT=$(docker run --rm \
  --network "${PROJECT_NAME}_default" \
  -e DATABASE_URL="postgres://clawback:${POSTGRES_PASSWORD}@postgres:5432/clawback" \
  "$MIGRATE_IMAGE" \
  node packages/db/dist/seed.js 2>&1) && SEED_RC=0 || SEED_RC=$?

if [ "$SEED_RC" -eq 0 ]; then
  pass "Seed completed successfully"
else
  fail "Seed failed (exit code ${SEED_RC})"
  echo "  Seed output:"
  echo "$SEED_OUTPUT" | head -20 | sed 's/^/    /'
fi

# ====================================================================
# Step 8: Run public-try verifier
# ====================================================================
echo ""
echo -e "${BLUE}==== Step 8: Public-try verification ====${NC}"

export CONTROL_PLANE_URL="http://localhost:3001"
export CONTROL_PLANE_PORT="3001"
export CLAWBACK_RUNTIME_API_TOKEN
export CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN
export CLAWBACK_GMAIL_WATCH_HOOK_TOKEN

if "${SCRIPT_DIR}/public-try-verify.sh"; then
  pass "public-try-verify.sh passed"
else
  fail "public-try-verify.sh failed"
fi

# ====================================================================
# Summary
# ====================================================================
echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}  Deployed-Stack Acceptance Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed: ${FAIL}${NC}"
fi
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}DEPLOYED-STACK ACCEPTANCE FAILED: ${FAIL} check(s) did not pass.${NC}"
  exit 1
else
  echo -e "${GREEN}All deployed-stack acceptance checks passed.${NC}"
fi
