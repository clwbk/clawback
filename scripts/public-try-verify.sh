#!/usr/bin/env bash
#
# Public try verification: run the core verification steps in sequence.
#
# Prerequisites:
#   1. Database running (docker compose up -d)
#   2. Seed data applied (pnpm db:seed)
#   3. Control plane running (pnpm --filter @clawback/control-plane dev)
#
# Usage:
#   ./scripts/public-try-verify.sh
#
# Runs health check, seed verification, forward email flow, watched inbox flow,
# and review flow. Prints pass/fail for each step. Exits non-zero if any fail.

set -euo pipefail

resolve_base_url() {
  if [ -n "${CONTROL_PLANE_URL:-}" ]; then
    echo "${CONTROL_PLANE_URL}"
    return
  fi

  if [ -n "${CONTROL_PLANE_PORT:-}" ]; then
    echo "http://localhost:${CONTROL_PLANE_PORT}"
    return
  fi

  # Probe the common local dev ports so the verifier works both with:
  # - `pnpm dev` on :3001
  # - `./scripts/start-local.sh` on :3011
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/healthz 2>/dev/null | grep -q '^200$'; then
    echo "http://localhost:3001"
    return
  fi

  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3011/healthz 2>/dev/null | grep -q '^200$'; then
    echo "http://localhost:3011"
    return
  fi

  echo "http://localhost:3001"
}

BASE_URL="$(resolve_base_url)"
API_TOKEN="${CLAWBACK_RUNTIME_API_TOKEN:-clawback-local-runtime-api-token}"
INBOUND_WEBHOOK_TOKEN="${CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN:-clawback-local-inbound-email-token}"
GMAIL_WATCH_HOOK_TOKEN="${CLAWBACK_GMAIL_WATCH_HOOK_TOKEN:-clawback-local-gmail-watch-token}"
COOKIE_JAR="/tmp/clawback-public-try-verify-cookies.txt"

PASS=0
FAIL=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${GREEN}PASS${NC}: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${RED}FAIL${NC}: $1"
}

section() {
  echo ""
  echo -e "${BLUE}── $1 ──${NC}"
}

# =========================================================================
# Step 1: Stack Health
# =========================================================================
section "Step 1: Stack Health"

# Check /healthz (liveness)
HEALTHZ_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/healthz" 2>/dev/null || echo "000")
if [ "$HEALTHZ_CODE" = "200" ]; then
  pass "Liveness check /healthz (${BASE_URL})"
else
  fail "Liveness check /healthz failed (HTTP ${HEALTHZ_CODE}). Is the control plane running?"
  echo ""
  echo -e "${RED}Cannot continue without the control plane. Exiting.${NC}"
  exit 1
fi

# Check /readyz (readiness — Postgres + PgBoss)
READYZ_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/readyz" 2>/dev/null || echo "000")
if [ "$READYZ_CODE" = "200" ]; then
  pass "Readiness check /readyz (Postgres + queue)"
else
  READYZ_BODY=$(curl -s "${BASE_URL}/readyz" 2>/dev/null || echo "{}")
  fail "Readiness check /readyz failed (HTTP ${READYZ_CODE}): ${READYZ_BODY}"
fi

# Check /api/setup/status (bootstrap status)
SETUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/setup/status" 2>/dev/null || echo "000")
if [ "$SETUP_CODE" = "200" ]; then
  pass "Setup status reachable"
else
  fail "Setup status not reachable (HTTP ${SETUP_CODE})"
fi

# Login as seeded admin
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d '{"email": "dave@hartwell.com", "password": "demo1234"}' 2>/dev/null)

LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)

if [ "$LOGIN_CODE" = "200" ]; then
  pass "Login as Dave (admin) succeeded"
else
  fail "Login as Dave failed (HTTP ${LOGIN_CODE}). Is the database seeded?"
  echo ""
  echo -e "${RED}Cannot continue without login. Run: pnpm db:seed${NC}"
  exit 1
fi

CSRF_TOKEN=$(echo "$LOGIN_RESPONSE" | sed '$d' | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('csrf_token', ''))
" 2>/dev/null || echo "")

if [ -n "$CSRF_TOKEN" ]; then
  pass "CSRF token acquired from login response"
else
  fail "CSRF token missing from login response"
  echo ""
  echo -e "${RED}Cannot continue without a CSRF token for review actions.${NC}"
  exit 1
fi

# =========================================================================
# Step 2: Seeded Data
# =========================================================================
section "Step 2: Seeded Data"

api_get() {
  curl -s -b "$COOKIE_JAR" "${BASE_URL}$1"
}

count_json() {
  echo "$1" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('$2', [])
print(len(items))
" 2>/dev/null || echo "0"
}

# Workers
WORKERS=$(api_get "/api/workspace/workers")
WORKER_COUNT=$(count_json "$WORKERS" "workers")
if [ "$WORKER_COUNT" -ge 3 ] 2>/dev/null; then
  pass "Workers: ${WORKER_COUNT} found (>= 3 expected)"
else
  fail "Workers: ${WORKER_COUNT} found (expected >= 3)"
fi

# Work items
WORK=$(api_get "/api/workspace/work")
WORK_COUNT=$(count_json "$WORK" "work_items")
if [ "$WORK_COUNT" -ge 5 ] 2>/dev/null; then
  pass "Work items: ${WORK_COUNT} found (>= 5 expected)"
else
  fail "Work items: ${WORK_COUNT} found (expected >= 5)"
fi

# Inbox items
INBOX=$(api_get "/api/workspace/inbox")
INBOX_COUNT=$(count_json "$INBOX" "items")
if [ "$INBOX_COUNT" -ge 5 ] 2>/dev/null; then
  pass "Inbox items: ${INBOX_COUNT} found (>= 5 expected)"
else
  fail "Inbox items: ${INBOX_COUNT} found (expected >= 5)"
fi

# Connections
CONNS=$(api_get "/api/workspace/connections")
CONN_COUNT=$(count_json "$CONNS" "connections")
if [ "$CONN_COUNT" -ge 3 ] 2>/dev/null; then
  pass "Connections: ${CONN_COUNT} found (>= 3 expected)"
else
  fail "Connections: ${CONN_COUNT} found (expected >= 3)"
fi

SMTP_CONNECTED=$(echo "$CONNS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for conn in data.get('connections', []):
    if conn.get('provider') == 'smtp_relay' and conn.get('status') == 'connected':
        print('1')
        break
else:
    print('0')
" 2>/dev/null || echo "0")

# Activity events
ACTIVITY=$(api_get "/api/workspace/activity")
ACTIVITY_COUNT=$(count_json "$ACTIVITY" "events")
if [ "$ACTIVITY_COUNT" -ge 6 ] 2>/dev/null; then
  pass "Activity events: ${ACTIVITY_COUNT} found (>= 6 expected)"
else
  fail "Activity events: ${ACTIVITY_COUNT} found (expected >= 6)"
fi

# =========================================================================
# Step 3: Forward Email Flow
# =========================================================================
section "Step 3: Forward Email Flow"

FWD_MSG_ID="<public-try-verify-fwd-$(date +%s)-$$@test.example.com>"

FWD_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/email/postmark" \
  -H "Content-Type: application/json" \
  -H "x-clawback-webhook-token: ${INBOUND_WEBHOOK_TOKEN}" \
  -d "{
    \"From\": \"Public Try Verify <public-try-verify@example.com>\",
    \"OriginalRecipient\": \"followup@hartwell.clawback.dev\",
    \"To\": \"followup@hartwell.clawback.dev\",
    \"Subject\": \"Public try verify: forward email test\",
    \"MessageID\": \"${FWD_MSG_ID}\",
    \"TextBody\": \"This is a public try verification test email.\"
  }")

FWD_CODE=$(echo "$FWD_RESPONSE" | tail -1)

if [ "$FWD_CODE" -lt 400 ]; then
  pass "Forward email accepted (HTTP ${FWD_CODE})"
else
  fail "Forward email rejected (HTTP ${FWD_CODE})"
fi

# Idempotency check
FWD_RESPONSE2=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/email/postmark" \
  -H "Content-Type: application/json" \
  -H "x-clawback-webhook-token: ${INBOUND_WEBHOOK_TOKEN}" \
  -d "{
    \"From\": \"Public Try Verify <public-try-verify@example.com>\",
    \"OriginalRecipient\": \"followup@hartwell.clawback.dev\",
    \"To\": \"followup@hartwell.clawback.dev\",
    \"Subject\": \"Public try verify: forward email test\",
    \"MessageID\": \"${FWD_MSG_ID}\",
    \"TextBody\": \"Duplicate.\"
  }")

FWD_CODE2=$(echo "$FWD_RESPONSE2" | tail -1)

if [ "$FWD_CODE2" -lt 400 ]; then
  pass "Forward email idempotency (HTTP ${FWD_CODE2})"
else
  fail "Forward email idempotency failed (HTTP ${FWD_CODE2})"
fi

# Error case: unknown address
FWD_ERR=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/email/postmark" \
  -H "Content-Type: application/json" \
  -H "x-clawback-webhook-token: ${INBOUND_WEBHOOK_TOKEN}" \
  -d "{
    \"From\": \"Nobody <nobody@example.com>\",
    \"OriginalRecipient\": \"nobody@unknown.clawback.dev\",
    \"To\": \"nobody@unknown.clawback.dev\",
    \"Subject\": \"Should fail\",
    \"MessageID\": \"<public-try-verify-err@test.example.com>\",
    \"TextBody\": \"Unknown address.\"
  }")

FWD_ERR_CODE=$(echo "$FWD_ERR" | tail -1)

if [ "$FWD_ERR_CODE" = "404" ]; then
  pass "Unknown address returns 404"
else
  fail "Unknown address returned HTTP ${FWD_ERR_CODE} (expected 404)"
fi

# =========================================================================
# Step 4: Watched Inbox Flow
# =========================================================================
section "Step 4: Watched Inbox Flow"

# Look up workspace ID from work items
WORKSPACE_ID=$(echo "$WORK" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('work_items', [])
if items:
    print(items[0].get('workspace_id', ''))
" 2>/dev/null || echo "")

CONNECTION_ID=$(echo "$CONNS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for conn in data.get('connections', []):
    if conn.get('provider') == 'gmail' and conn.get('access_mode') == 'read_only':
        print(conn['id'])
        break
" 2>/dev/null || echo "")
CONNECTION_STATUS=$(echo "$CONNS" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for conn in data.get('connections', []):
    if conn.get('provider') == 'gmail' and conn.get('access_mode') == 'read_only':
        print(conn.get('status', ''))
        break
" 2>/dev/null || echo "")

if [ -z "$WORKSPACE_ID" ] || [ -z "$CONNECTION_ID" ]; then
  echo -e "  ${YELLOW}SKIP${NC}: No Gmail read-only connection found — watched inbox test skipped (optional)"
elif [ "$CONNECTION_STATUS" != "connected" ]; then
  echo -e "  ${YELLOW}SKIP${NC}: Gmail read-only connection is not connected — watched inbox test skipped (optional)"
elif true; then
  WATCHED_MSG_ID="<public-try-verify-watched-$(date +%s)-$$@gmail.com>"

  WATCHED_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${BASE_URL}/api/inbound/gmail-watch/${WORKSPACE_ID}/${CONNECTION_ID}" \
    -H "Content-Type: application/json" \
    -H "x-gog-token: ${GMAIL_WATCH_HOOK_TOKEN}" \
    -d "{
      \"source\": \"gmail\",
      \"messages\": [{
        \"id\": \"${WATCHED_MSG_ID}\",
        \"from\": \"public-try-verify@apexlabs.com\",
        \"subject\": \"Public try verify: watched inbox test\",
        \"snippet\": \"This is a public try verification watched inbox event.\",
        \"body\": \"This is a public try verification watched inbox event.\"
      }]
    }")

  WATCHED_CODE=$(echo "$WATCHED_RESPONSE" | tail -1)

  if [ "$WATCHED_CODE" -lt 400 ]; then
    pass "Watched inbox event accepted (HTTP ${WATCHED_CODE})"
  else
    fail "Watched inbox event rejected (HTTP ${WATCHED_CODE})"
  fi

  # Idempotency
  WATCHED_RESPONSE2=$(curl -s -w "\n%{http_code}" \
    -X POST "${BASE_URL}/api/inbound/gmail-watch/${WORKSPACE_ID}/${CONNECTION_ID}" \
    -H "Content-Type: application/json" \
    -H "x-gog-token: ${GMAIL_WATCH_HOOK_TOKEN}" \
    -d "{
      \"source\": \"gmail\",
      \"messages\": [{
        \"id\": \"${WATCHED_MSG_ID}\",
        \"from\": \"public-try-verify@apexlabs.com\",
        \"subject\": \"Public try verify: watched inbox test\",
        \"snippet\": \"Duplicate.\"
      }]
    }")

  WATCHED_CODE2=$(echo "$WATCHED_RESPONSE2" | tail -1)

  if [ "$WATCHED_CODE2" -lt 400 ]; then
    pass "Watched inbox idempotency (HTTP ${WATCHED_CODE2})"
  else
    fail "Watched inbox idempotency failed (HTTP ${WATCHED_CODE2})"
  fi
fi

# =========================================================================
# Step 5: Review Flow
# =========================================================================
section "Step 5: Review Flow"

# Re-fetch inbox to find a pending review
INBOX_FRESH=$(api_get "/api/workspace/inbox")
REVIEW_ID=$(echo "$INBOX_FRESH" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data.get('items', []):
    if item.get('kind') == 'review' and item.get('state') == 'open' and item.get('review_id'):
        print(item['review_id'])
        break
" 2>/dev/null || echo "")

if [ -z "$REVIEW_ID" ]; then
  fail "No pending review found in inbox (cannot test review flow)"
else
  pass "Found pending review: ${REVIEW_ID}"

  # Get review details
  REVIEW_BEFORE=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}")
  REVIEW_STATUS=$(echo "$REVIEW_BEFORE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('status', 'unknown'))
" 2>/dev/null || echo "unknown")
  REVIEW_ACTION_KIND=$(echo "$REVIEW_BEFORE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('action_kind', 'unknown'))
" 2>/dev/null || echo "unknown")

  if [ "$REVIEW_STATUS" = "pending" ]; then
    pass "Review status is pending (as expected)"
  else
    fail "Review status is '${REVIEW_STATUS}' (expected 'pending')"
  fi

  if [ "$REVIEW_ACTION_KIND" = "send_email" ] && [ "$SMTP_CONNECTED" != "1" ]; then
    echo -e "  ${YELLOW}SKIP${NC}: Review approval skipped because the pending review is send_email and SMTP is not connected"
  else
    # Approve the review
    RESOLVE_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}/resolve" \
      -H "Content-Type: application/json" \
      -H "x-csrf-token: ${CSRF_TOKEN}" \
      -b "$COOKIE_JAR" \
      -d '{"decision": "approved", "rationale": "Approved via public-try verification script."}')

    RESOLVE_CODE=$(echo "$RESOLVE_RESPONSE" | tail -1)

    if [ "$RESOLVE_CODE" -lt 400 ]; then
      pass "Review approved (HTTP ${RESOLVE_CODE})"
    else
      fail "Review approval failed (HTTP ${RESOLVE_CODE})"
    fi

    # Verify post-resolution state
    REVIEW_AFTER=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}")
    REVIEW_STATUS_AFTER=$(echo "$REVIEW_AFTER" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('status', 'unknown'))
" 2>/dev/null || echo "unknown")

    if [ "$REVIEW_STATUS_AFTER" = "approved" ] || [ "$REVIEW_STATUS_AFTER" = "completed" ]; then
      pass "Review status after approval: ${REVIEW_STATUS_AFTER}"
    else
      fail "Review status after approval: '${REVIEW_STATUS_AFTER}' (expected 'approved' or 'completed')"
    fi
  fi
fi

# =========================================================================
# Step 6: Review Deny Flow
# =========================================================================
section "Step 6: Review Deny"

# Find another pending review for deny test
INBOX_DENY=$(api_get "/api/workspace/inbox")
DENY_REVIEW_ID=$(echo "$INBOX_DENY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data.get('items', []):
    if item.get('kind') == 'review' and item.get('state') == 'open' and item.get('review_id'):
        print(item['review_id'])
        break
" 2>/dev/null || echo "")

if [ -z "$DENY_REVIEW_ID" ]; then
  echo -e "  ${YELLOW}SKIP${NC}: No additional pending review found for deny test"
else
  DENY_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${BASE_URL}/api/workspace/reviews/${DENY_REVIEW_ID}/resolve" \
    -H "Content-Type: application/json" \
    -H "x-csrf-token: ${CSRF_TOKEN}" \
    -b "$COOKIE_JAR" \
    -d '{"decision": "denied", "rationale": "Denied via public-try verification script."}')

  DENY_CODE=$(echo "$DENY_RESPONSE" | tail -1)

  if [ "$DENY_CODE" -lt 400 ]; then
    pass "Review denied (HTTP ${DENY_CODE})"
  else
    fail "Review deny failed (HTTP ${DENY_CODE})"
  fi

  DENY_AFTER=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/reviews/${DENY_REVIEW_ID}")
  DENY_STATUS=$(echo "$DENY_AFTER" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('status', 'unknown'))
" 2>/dev/null || echo "unknown")

  if [ "$DENY_STATUS" = "denied" ] || [ "$DENY_STATUS" = "completed" ]; then
    pass "Review status after denial: ${DENY_STATUS}"
  else
    fail "Review status after denial: '${DENY_STATUS}' (expected 'denied' or 'completed')"
  fi
fi

# =========================================================================
# Summary
# =========================================================================
echo ""
echo -e "${BLUE}═══════════════════════════════════${NC}"
echo -e "${BLUE}  Public Try Verification Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════${NC}"
echo ""
echo -e "  Total:  ${TOTAL}"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed: ${FAIL}${NC}"
fi
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}PUBLIC TRY VERIFICATION FAILED: ${FAIL} check(s) did not pass.${NC}"
  echo ""
  echo "See docs/guides/troubleshooting.md for troubleshooting."
  exit 1
else
  echo -e "${GREEN}All checks passed. The stack looks healthy for public try.${NC}"
fi
