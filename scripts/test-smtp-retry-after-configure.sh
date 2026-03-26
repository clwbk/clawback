#!/usr/bin/env bash
#
# Rehearsal script for the "SMTP absent first, then configured, then retry"
# acceptance path described in:
#   docs/beta/g-reviewed-send-acceptance-checklist.md (gap #5)
#
# This script exercises one scenario at a time. It is a rehearsal aid, not
# a fully autonomous test -- it cannot restart the control plane or set env
# vars on your behalf.
#
# Usage:
#
#   Phase 1 -- SMTP is NOT configured. Creates a review, approves it,
#   expects failure, and prints the work item ID for later retry:
#
#     ./scripts/test-smtp-retry-after-configure.sh
#
#   Phase 2 -- SMTP IS configured. Set the env vars, restart the control
#   plane, then continue the work item:
#     - approve the review if it is still pending
#     - retry the send if execution already failed after approval
#
#     ./scripts/test-smtp-retry-after-configure.sh --retry WORK_ITEM_ID
#
# Prerequisites:
#   1. Database running (docker compose up -d)
#   2. Seed data applied (pnpm --filter @clawback/db seed)
#   3. Control plane running (pnpm --filter @clawback/control-plane dev)

set -euo pipefail

_PORT="${CONTROL_PLANE_PORT:-3001}"
BASE_URL="${CONTROL_PLANE_URL:-http://localhost:${_PORT}}"
WEBHOOK_TOKEN="${CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN:-clawback-local-inbound-email-token}"
COOKIE_JAR="/tmp/clawback-smtp-retry-cookies.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}-- $1 --${NC}"; }
ok()   { echo -e "  ${GREEN}OK${NC}: $1"; }
warn() { echo -e "  ${YELLOW}WARN${NC}: $1"; }
err()  { echo -e "  ${RED}FAIL${NC}: $1"; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
RETRY_WORK_ITEM_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --retry)
      RETRY_WORK_ITEM_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 [--retry WORK_ITEM_ID]"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Shared: Log in as Dave
# ---------------------------------------------------------------------------
login_as_dave() {
  step "Log in as Dave (admin)"

  LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -c "$COOKIE_JAR" \
    -d '{"email": "dave@hartwell.com", "password": "demo1234"}')

  LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)

  if [ "$LOGIN_CODE" -ge 400 ]; then
    err "Login failed (HTTP ${LOGIN_CODE}). Is the stack running and seeded?"
    exit 1
  fi
  ok "Logged in as Dave (HTTP ${LOGIN_CODE})"

  CSRF_TOKEN=$(echo "$LOGIN_RESPONSE" | sed '$d' | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('csrf_token', ''))
" 2>/dev/null || echo "")
}

# ---------------------------------------------------------------------------
# Shared: Report review + work-item state
# ---------------------------------------------------------------------------
report_state() {
  local review_id="$1"
  local label="$2"

  echo ""
  echo "  ${label}:"

  REVIEW_JSON=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/reviews/${review_id}")
  echo "$REVIEW_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'    Review status:    {d.get(\"status\", \"?\")}')
exec_st = d.get('execution_status', d.get('executionStatus', 'not present'))
print(f'    Execution status: {exec_st}')
fk = d.get('failure_kind', d.get('failureKind', ''))
if fk:
    print(f'    Failure kind:     {fk}')
" 2>/dev/null || echo "    (could not parse review)"

  echo ""
  echo "  Recent work items:"
  curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/work" | python3 -c "
import json, sys
for wi in json.load(sys.stdin).get('work_items', [])[:5]:
    print(f'    [{wi[\"status\"]}] exec={wi.get(\"execution_status\",\"?\")} -- {wi[\"title\"]}')
" 2>/dev/null || echo "    (could not parse work items)"
}

# ===========================================================================
# PHASE 2: Retry an existing work item after SMTP was configured
# ===========================================================================
if [ -n "$RETRY_WORK_ITEM_ID" ]; then
  echo -e "${BLUE}============================================${NC}"
  echo -e "${BLUE}  Phase 2: Retry after SMTP configured${NC}"
  echo -e "${BLUE}============================================${NC}"

  login_as_dave

  # Check SMTP status first
  step "Check SMTP configuration status"
  CONNECTIONS_JSON=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/connections")
  SMTP_CONN_ID=$(echo "$CONNECTIONS_JSON" | python3 -c "
import json, sys
for c in json.load(sys.stdin).get('connections', []):
    if c.get('provider') == 'smtp_relay':
        print(c['id'])
        break
" 2>/dev/null || echo "")

  if [ -n "$SMTP_CONN_ID" ]; then
    SMTP_STATUS=$(curl -s -b "$COOKIE_JAR" \
      "${BASE_URL}/api/workspace/connections/${SMTP_CONN_ID}/smtp-status")
    ENV_CONFIGURED=$(echo "$SMTP_STATUS" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('env_configured', False))
" 2>/dev/null || echo "False")

    if [ "$ENV_CONFIGURED" = "True" ]; then
      ok "SMTP env vars are configured"
    else
      warn "SMTP env vars are NOT configured"
      echo "  Set CLAWBACK_SMTP_HOST, CLAWBACK_SMTP_PORT, CLAWBACK_SMTP_FROM_ADDRESS"
      echo "  and restart the control plane before retrying."
      exit 1
    fi

    # Optionally activate the connection via smtp-configure
    step "Activate SMTP connection (POST smtp-configure)"
    CONFIGURE_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST "${BASE_URL}/api/workspace/connections/${SMTP_CONN_ID}/smtp-configure" \
      -H "Content-Type: application/json" \
      -H "x-csrf-token: ${CSRF_TOKEN}" \
      -b "$COOKIE_JAR" \
      -d '{}')
    CONFIGURE_CODE=$(echo "$CONFIGURE_RESPONSE" | tail -1)

    if [ "$CONFIGURE_CODE" -ge 400 ]; then
      warn "smtp-configure returned HTTP ${CONFIGURE_CODE} (may already be connected)"
    else
      ok "SMTP connection activated (HTTP ${CONFIGURE_CODE})"
    fi
  else
    warn "No smtp_relay connection found. Proceeding anyway -- retry may still work."
  fi

  # Retrieve the work item to find its review
  step "Look up work item ${RETRY_WORK_ITEM_ID}"
  WI_JSON=$(curl -s -b "$COOKIE_JAR" \
    "${BASE_URL}/api/workspace/work/${RETRY_WORK_ITEM_ID}" 2>/dev/null || echo "")

  REVIEW_ID=$(echo "$WI_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('review_id', ''))
" 2>/dev/null || echo "")

  if [ -z "$REVIEW_ID" ]; then
    err "Could not find a review attached to work item ${RETRY_WORK_ITEM_ID}"
    exit 1
  fi
  ok "Attached review: ${REVIEW_ID}"

  report_state "$REVIEW_ID" "State before retry"

  REVIEW_JSON=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}")
  REVIEW_STATUS=$(echo "$REVIEW_JSON" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('status', ''))
" 2>/dev/null || echo "")
  WORK_EXEC_STATUS=$(echo "$WI_JSON" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('execution_status', ''))
" 2>/dev/null || echo "")

  if [ "$REVIEW_STATUS" = "pending" ]; then
    step "Approve the pending review now that SMTP is configured"
    ACTION_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}/resolve" \
      -H "Content-Type: application/json" \
      -H "x-csrf-token: ${CSRF_TOKEN}" \
      -b "$COOKIE_JAR" \
      -d '{"decision": "approved", "rationale": "Approved via retry-after-configure rehearsal."}')
    ACTION_CODE=$(echo "$ACTION_RESPONSE" | tail -1)
    ACTION_BODY=$(echo "$ACTION_RESPONSE" | sed '$d')

    if [ "$ACTION_CODE" -ge 400 ]; then
      err "Approval failed after SMTP configuration (HTTP ${ACTION_CODE})"
      echo "$ACTION_BODY" | python3 -m json.tool 2>/dev/null || echo "$ACTION_BODY"
      exit 1
    fi
    ok "Pending review approved (HTTP ${ACTION_CODE})"
  elif [ "$WORK_EXEC_STATUS" = "completed" ]; then
    ok "Work item is already completed; nothing to retry"
    echo ""
    echo "Done."
    exit 0
  else
    step "Retry reviewed send (POST /api/workspace/work/${RETRY_WORK_ITEM_ID}/retry-send)"
    ACTION_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST "${BASE_URL}/api/workspace/work/${RETRY_WORK_ITEM_ID}/retry-send" \
      -H "Content-Type: application/json" \
      -H "x-csrf-token: ${CSRF_TOKEN}" \
      -b "$COOKIE_JAR" \
      -d '{}')
    ACTION_CODE=$(echo "$ACTION_RESPONSE" | tail -1)
    ACTION_BODY=$(echo "$ACTION_RESPONSE" | sed '$d')

    if [ "$ACTION_CODE" -ge 400 ]; then
      err "Retry failed (HTTP ${ACTION_CODE})"
      echo "$ACTION_BODY" | python3 -m json.tool 2>/dev/null || echo "$ACTION_BODY"
      exit 1
    fi
    ok "Retry accepted (HTTP ${ACTION_CODE})"
  fi

  sleep 2
  report_state "$REVIEW_ID" "State after continuation"

  echo ""
  echo -e "${BLUE}============================================${NC}"
  echo -e "${BLUE}  Phase 2 complete${NC}"
  echo -e "${BLUE}============================================${NC}"
  echo ""
  echo "  If execution_status is 'completed', the post-configure continuation path works."
  echo "  If using Mailpit/MailHog, check http://localhost:8025 for the delivered email."
  echo ""
  echo "Done."
  exit 0
fi

# ===========================================================================
# PHASE 1: SMTP absent -- create review, approve, expect failure
# ===========================================================================
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Phase 1: SMTP absent -- expect failure${NC}"
echo -e "${BLUE}============================================${NC}"

login_as_dave

# ── Check SMTP is absent ──────────────────────────────────────────────────
step "Check SMTP configuration status"
CONNECTIONS_JSON=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/connections")
SMTP_CONN_ID=$(echo "$CONNECTIONS_JSON" | python3 -c "
import json, sys
for c in json.load(sys.stdin).get('connections', []):
    if c.get('provider') == 'smtp_relay':
        print(c['id'])
        break
" 2>/dev/null || echo "")

if [ -n "$SMTP_CONN_ID" ]; then
  SMTP_STATUS=$(curl -s -b "$COOKIE_JAR" \
    "${BASE_URL}/api/workspace/connections/${SMTP_CONN_ID}/smtp-status")
  ENV_CONFIGURED=$(echo "$SMTP_STATUS" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('env_configured', False))
" 2>/dev/null || echo "False")

  if [ "$ENV_CONFIGURED" = "True" ]; then
    warn "SMTP env vars appear to be set. Phase 1 expects them to be absent."
    echo "  The approval may succeed instead of failing. Proceeding anyway."
  else
    ok "SMTP env vars are not set (expected for Phase 1)"
  fi
else
  warn "No smtp_relay connection found in workspace."
fi

# ── Forward an email to create a review ───────────────────────────────────
step "Forward email to create a work item + review"

MESSAGE_ID="<smtp-retry-test-$(date +%s)-$$@mail.example.com>"
SUBJECT="Retry test: schedule project review call"

echo "  Message-ID: ${MESSAGE_ID}"
echo "  To: followup@hartwell.clawback.dev"
echo "  Subject: ${SUBJECT}"

FWD_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/email/postmark" \
  -H "Content-Type: application/json" \
  -H "x-clawback-webhook-token: ${WEBHOOK_TOKEN}" \
  -d "{
    \"MessageID\": \"${MESSAGE_ID}\",
    \"From\": \"client@testcompany.com\",
    \"OriginalRecipient\": \"followup@hartwell.clawback.dev\",
    \"To\": \"followup@hartwell.clawback.dev\",
    \"Subject\": \"${SUBJECT}\",
    \"TextBody\": \"Hi, can we sync on the project timeline this week? Thanks.\"
  }")

FWD_CODE=$(echo "$FWD_RESPONSE" | tail -1)
FWD_BODY=$(echo "$FWD_RESPONSE" | sed '$d')

if [ "$FWD_CODE" -ge 400 ]; then
  err "Forward email failed (HTTP ${FWD_CODE})"
  echo "$FWD_BODY" | python3 -m json.tool 2>/dev/null || echo "$FWD_BODY"
  exit 1
fi
ok "Email forwarded (HTTP ${FWD_CODE})"

WORK_ITEM_ID=$(echo "$FWD_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('work_item_id', data.get('workItemId', '')))
" 2>/dev/null || echo "")

if [ -n "$WORK_ITEM_ID" ]; then
  echo "  Work Item ID: ${WORK_ITEM_ID}"
fi

# ── Find the review ──────────────────────────────────────────────────────
step "Find the review"
sleep 1

INBOX_RESPONSE=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/inbox")

REVIEW_ID=$(echo "$INBOX_RESPONSE" | python3 -c "
import json, sys
for item in json.load(sys.stdin).get('items', []):
    if item.get('kind') == 'review' and item.get('state') == 'open' and item.get('review_id'):
        print(item['review_id'])
        break
" 2>/dev/null || echo "")

if [ -z "$REVIEW_ID" ]; then
  err "No open review found in inbox."
  echo "  Cannot proceed with approval test."
  exit 1
fi
ok "Found review: ${REVIEW_ID}"

# Also resolve work item ID if we didn't get it from the forward response
if [ -z "$WORK_ITEM_ID" ]; then
  WORK_ITEM_ID=$(curl -s -b "$COOKIE_JAR" \
    "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('work_item_id', d.get('workItemId', '')))
" 2>/dev/null || echo "")
fi

# ── Approve the review (expect 503 if SMTP absent) ───────────────────────
step "Approve the review (expect failure if SMTP is not configured)"

RESOLVE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}/resolve" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -b "$COOKIE_JAR" \
  -d '{"decision": "approved", "rationale": "Approved via retry-after-configure test."}')

RESOLVE_CODE=$(echo "$RESOLVE_RESPONSE" | tail -1)
RESOLVE_BODY=$(echo "$RESOLVE_RESPONSE" | sed '$d')

if [ "$RESOLVE_CODE" -ge 400 ]; then
  RESOLVE_ERROR_CODE=$(echo "$RESOLVE_BODY" | python3 -c "
import json, sys
print(json.load(sys.stdin).get('code', ''))
" 2>/dev/null || echo "")

  if [ "$RESOLVE_ERROR_CODE" = "review_execution_not_configured" ]; then
    ok "Approval correctly blocked: SMTP not configured (HTTP ${RESOLVE_CODE})"
    echo "  Review stays pending -- exactly what we want."
  else
    err "Approval failed with unexpected error (HTTP ${RESOLVE_CODE})"
    echo "$RESOLVE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESOLVE_BODY"
  fi
else
  warn "Approval succeeded (HTTP ${RESOLVE_CODE}). SMTP may already be configured."
  echo "  This is valid for a configured stack but does not test the retry path."
fi

# ── Report state ──────────────────────────────────────────────────────────
step "Report current state"
report_state "$REVIEW_ID" "Review state after approval attempt"

# ── Next steps ────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Phase 1 complete${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "  To complete the retry-after-configure acceptance path:"
echo ""
echo "  1. Set SMTP env vars:"
echo "       export CLAWBACK_SMTP_HOST=localhost"
echo "       export CLAWBACK_SMTP_PORT=1025"
echo "       export CLAWBACK_SMTP_FROM_ADDRESS=noreply@clawback.dev"
echo ""
echo "     (For local testing, start Mailpit first:"
echo "       docker run -p 1025:1025 -p 8025:8025 axllent/mailpit)"
echo ""
echo "  2. Restart the control plane so it picks up the new env vars."
echo ""
if [ -n "$WORK_ITEM_ID" ]; then
  echo "  3. Run Phase 2:"
  echo "       ./scripts/test-smtp-retry-after-configure.sh --retry ${WORK_ITEM_ID}"
else
  echo "  3. Run Phase 2 (substitute the work item ID from above):"
  echo "       ./scripts/test-smtp-retry-after-configure.sh --retry WORK_ITEM_ID"
fi
echo ""
echo "Done."
