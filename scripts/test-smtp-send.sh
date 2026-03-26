#!/usr/bin/env bash
#
# Test the full SMTP send lifecycle: forward email -> approve review -> verify send.
#
# Prerequisites:
#   1. Database running (docker compose up -d)
#   2. Seed data applied (pnpm --filter @clawback/db seed)
#   3. Control plane running (pnpm --filter @clawback/control-plane dev)
#
# Optional SMTP configuration (set before starting the control plane):
#   CLAWBACK_SMTP_HOST
#   CLAWBACK_SMTP_PORT
#   CLAWBACK_SMTP_USERNAME
#   CLAWBACK_SMTP_PASSWORD
#   CLAWBACK_SMTP_FROM_ADDRESS
#
# Without SMTP configured, reviewed send execution is not supportable as a real
# delivery path. This script will report that state honestly.
#
# Usage:
#   ./scripts/test-smtp-send.sh
#
# The script:
#   1. Sends a forwarded email to create a work item (pending_review)
#   2. Finds the resulting review
#   3. Approves the review
#   4. Checks work item execution state
#   5. Reports the final state honestly

set -euo pipefail

_PORT="${CONTROL_PLANE_PORT:-3001}"
BASE_URL="${CONTROL_PLANE_URL:-http://localhost:${_PORT}}"
API_TOKEN="${CLAWBACK_RUNTIME_API_TOKEN:-clawback-local-runtime-api-token}"
COOKIE_JAR="/tmp/clawback-smtp-test-cookies.txt"
SMTP_NOT_READY=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step() { echo -e "\n${BLUE}── $1 ──${NC}"; }
ok()   { echo -e "  ${GREEN}OK${NC}: $1"; }
warn() { echo -e "  ${YELLOW}WARN${NC}: $1"; }
err()  { echo -e "  ${RED}FAIL${NC}: $1"; }

MESSAGE_ID="<smtp-test-$(date +%s)-$$@mail.example.com>"
SUBJECT="SMTP test: follow-up for approval"
RECIPIENT="client@testcompany.com"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  SMTP Send Lifecycle Test${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# ── Step 1: Log in as Dave ───────────────────────────────────────────────
step "Step 1: Log in as Dave (admin)"

LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_JAR" \
  -d '{"email": "dave@hartwell.com", "password": "demo1234"}')

LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)

if [ "$LOGIN_CODE" -ge 400 ]; then
  err "Login failed (HTTP ${LOGIN_CODE}). Make sure the stack is running and seeded."
  exit 1
fi
ok "Logged in as Dave (HTTP ${LOGIN_CODE})"

CSRF_TOKEN=$(echo "$LOGIN_RESPONSE" | sed '$d' | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('csrf_token', ''))
" 2>/dev/null || echo "")

# ── Step 1b: SMTP status pre-check ───────────────────────────────────
step "Step 1b: Check SMTP relay configuration status"

# Find the smtp_relay connection ID
CONNS_RESPONSE=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/connections")
SMTP_CONN_ID=$(echo "$CONNS_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data.get('connections', []):
    if c.get('provider') == 'smtp_relay':
        print(c['id'])
        break
" 2>/dev/null || echo "")
SMTP_CONN_STATUS=$(echo "$CONNS_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for c in data.get('connections', []):
    if c.get('provider') == 'smtp_relay':
        print(c.get('status', ''))
        break
" 2>/dev/null || echo "")

if [ -z "$SMTP_CONN_ID" ]; then
  warn "No smtp_relay connection found in workspace. SMTP status check skipped."
else
  SMTP_STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -b "$COOKIE_JAR" \
    "${BASE_URL}/api/workspace/connections/${SMTP_CONN_ID}/smtp-status")

  SMTP_STATUS_CODE=$(echo "$SMTP_STATUS_RESPONSE" | tail -1)
  SMTP_STATUS_BODY=$(echo "$SMTP_STATUS_RESPONSE" | sed '$d')

  if [ "$SMTP_STATUS_CODE" -ge 400 ]; then
    warn "SMTP status endpoint returned HTTP ${SMTP_STATUS_CODE}"
  else
    SMTP_ENV_CONFIGURED=$(echo "$SMTP_STATUS_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('env_configured', False))
" 2>/dev/null || echo "Unknown")

    if [ "$SMTP_ENV_CONFIGURED" = "True" ]; then
      ok "SMTP env vars configured (host, port, from_address present)"
      echo "$SMTP_STATUS_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'    Host:         {d.get(\"host\", \"?\")}')
print(f'    Port:         {d.get(\"port\", \"?\")}')
print(f'    From:         {d.get(\"from_address\", \"?\")}')
print(f'    Auth present: user={d.get(\"username_present\", False)}, pass={d.get(\"password_present\", False)}')
" 2>/dev/null || true

      if [ "$SMTP_CONN_STATUS" != "connected" ]; then
        step "Step 1c: Activate the seeded SMTP connection"
        CONFIGURE_RESPONSE=$(curl -s -w "\n%{http_code}" \
          -X POST "${BASE_URL}/api/workspace/connections/${SMTP_CONN_ID}/smtp-configure" \
          -H "Content-Type: application/json" \
          -H "x-csrf-token: ${CSRF_TOKEN}" \
          -b "$COOKIE_JAR" \
          -d '{}')
        CONFIGURE_CODE=$(echo "$CONFIGURE_RESPONSE" | tail -1)
        CONFIGURE_BODY=$(echo "$CONFIGURE_RESPONSE" | sed '$d')

        if [ "$CONFIGURE_CODE" -ge 400 ]; then
          warn "smtp-configure returned HTTP ${CONFIGURE_CODE}; approval may still fail later"
          echo "$CONFIGURE_BODY" | python3 -m json.tool 2>/dev/null || echo "$CONFIGURE_BODY"
        else
          ok "SMTP connection activated (HTTP ${CONFIGURE_CODE})"
          SMTP_CONN_STATUS="connected"
        fi
      else
        ok "SMTP connection is already active"
      fi
    else
      warn "SMTP env vars NOT fully configured — send execution will fail after approval"
      echo "$SMTP_STATUS_BODY" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'    host_present:         {d.get(\"host_present\", False)}')
print(f'    port_present:         {d.get(\"port_present\", False)}')
print(f'    from_address_present: {d.get(\"from_address_present\", False)}')
" 2>/dev/null || true
    fi
  fi
fi

# ── Step 2: Send forwarded email ────────────────────────────────────────
step "Step 2: Send forwarded email"

echo "  Message-ID: ${MESSAGE_ID}"
echo "  To: followup@hartwell.clawback.dev"
echo "  Subject: ${SUBJECT}"

WEBHOOK_TOKEN="${CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN:-clawback-local-inbound-email-token}"

FWD_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/email/postmark" \
  -H "Content-Type: application/json" \
  -H "x-clawback-webhook-token: ${WEBHOOK_TOKEN}" \
  -d "{
    \"MessageID\": \"${MESSAGE_ID}\",
    \"From\": \"${RECIPIENT}\",
    \"OriginalRecipient\": \"followup@hartwell.clawback.dev\",
    \"To\": \"followup@hartwell.clawback.dev\",
    \"Subject\": \"${SUBJECT}\",
    \"TextBody\": \"Hi, just checking in on the project timeline. Can we schedule a review call this week?\",
    \"HtmlBody\": \"<p>Hi, just checking in on the project timeline. Can we schedule a review call this week?</p>\"
  }")

FWD_CODE=$(echo "$FWD_RESPONSE" | tail -1)
FWD_BODY=$(echo "$FWD_RESPONSE" | sed '$d')

if [ "$FWD_CODE" -ge 400 ]; then
  err "Forward email failed (HTTP ${FWD_CODE})"
  echo "$FWD_BODY" | python3 -m json.tool 2>/dev/null || echo "$FWD_BODY"
  exit 1
fi
ok "Email forwarded (HTTP ${FWD_CODE})"

# Extract work item ID if returned
WORK_ITEM_ID=$(echo "$FWD_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('work_item_id', data.get('workItemId', '')))
" 2>/dev/null || echo "")
REVIEW_ID_FROM_FORWARD=$(echo "$FWD_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('review_id', data.get('reviewId', '')))
" 2>/dev/null || echo "")

if [ -n "$WORK_ITEM_ID" ]; then
  echo "  Work Item ID: ${WORK_ITEM_ID}"
fi
if [ -n "$REVIEW_ID_FROM_FORWARD" ]; then
  echo "  Review ID:    ${REVIEW_ID_FROM_FORWARD}"
fi

# ── Step 3: Wait briefly and find the review ─────────────────────────────
step "Step 3: Find the review for the new work item"

sleep 1

INBOX_RESPONSE=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/inbox")

REVIEW_ID=$(echo "$INBOX_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
# Prefer the review tied to the work item or explicit review id from the forward response.
target_work_item_id = sys.argv[1]
target_review_id = sys.argv[2]
for item in data.get('items', []):
    if item.get('kind') != 'review' or item.get('state') != 'open' or not item.get('review_id'):
        continue
    if target_review_id and item.get('review_id') == target_review_id:
        print(item['review_id'])
        raise SystemExit
    if target_work_item_id and item.get('work_item_id') == target_work_item_id:
        print(item['review_id'])
        raise SystemExit
# Fall back to the most recent open review only if we could not correlate one directly.
for item in data.get('items', []):
    if item.get('kind') == 'review' and item.get('state') == 'open' and item.get('review_id'):
        print(item['review_id'])
        break
" "$WORK_ITEM_ID" "$REVIEW_ID_FROM_FORWARD" 2>/dev/null || echo "")

if [ -z "$REVIEW_ID" ]; then
  warn "No open review found in inbox."
  echo "  The forward email flow may not have created a review."
  echo "  This can happen if the worker's action boundary mode is 'auto'."
  echo ""
  echo "  Checking work items for status..."

  WORK_RESPONSE=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/work")
  echo "$WORK_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for wi in data.get('work_items', [])[:5]:
    print(f'  [{wi[\"status\"]}] {wi[\"title\"]}')
" 2>/dev/null || echo "  (could not parse work items)"
  echo ""
  echo "  To test the full SMTP flow, ensure a review is pending."
  echo "  The seeded data includes a pending review. Try:"
  echo "    ./scripts/test-approve-review.sh"
  exit 0
fi

ok "Found review: ${REVIEW_ID}"

# Show review details
REVIEW_DETAIL=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}")
echo "$REVIEW_DETAIL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'  Status:      {d.get(\"status\", \"?\")}')
print(f'  Action:      {d.get(\"action_kind\", \"?\")}')
print(f'  Destination: {d.get(\"action_destination\", \"?\")}')
" 2>/dev/null || true

# ── Step 4: Approve the review ──────────────────────────────────────────
step "Step 4: Approve the review"

RESOLVE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}/resolve" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -b "$COOKIE_JAR" \
  -d '{"decision": "approved", "rationale": "Approved via SMTP test script."}')

RESOLVE_CODE=$(echo "$RESOLVE_RESPONSE" | tail -1)
RESOLVE_BODY=$(echo "$RESOLVE_RESPONSE" | sed '$d')

if [ "$RESOLVE_CODE" -ge 400 ]; then
  RESOLVE_ERROR_CODE=$(echo "$RESOLVE_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('code', ''))
" 2>/dev/null || echo "")

  if [ "$RESOLVE_ERROR_CODE" = "review_execution_not_configured" ]; then
    SMTP_NOT_READY=1
    warn "Review stayed pending because reviewed send is not configured yet (HTTP ${RESOLVE_CODE})"
    echo "$RESOLVE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESOLVE_BODY"
  else
    err "Review approval failed (HTTP ${RESOLVE_CODE})"
    echo "$RESOLVE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESOLVE_BODY"
    exit 1
  fi
else
  ok "Review approved (HTTP ${RESOLVE_CODE})"
fi

# ── Step 5: Check work item status progression ──────────────────────────
step "Step 5: Verify work item execution state"

# Small delay for async send execution
if [ "$SMTP_NOT_READY" -eq 0 ]; then
  sleep 2
fi

# Re-fetch review to see execution state
REVIEW_AFTER=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}")
echo ""
echo "  Review state after approval:"
echo "$REVIEW_AFTER" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'    Status:         {d.get(\"status\", \"?\")}')
print(f'    Resolved at:    {d.get(\"resolved_at\", \"null\")}')
exec_status = d.get('execution_status', d.get('executionStatus', 'not present'))
print(f'    Execution:      {exec_status}')
" 2>/dev/null || echo "    (could not parse review)"

# Check work items
echo ""
echo "  Work items (most recent first):"
WORK_AFTER=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/work")
echo "$WORK_AFTER" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for wi in d.get('work_items', [])[:5]:
    print(f'    [{wi[\"status\"]}] {wi[\"title\"]}')
" 2>/dev/null || echo "    (could not parse work items)"

WORK_ITEM_DETAIL=""
if [ -n "$WORK_ITEM_ID" ]; then
  WORK_ITEM_DETAIL=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/work/${WORK_ITEM_ID}" 2>/dev/null || echo "")
fi

echo ""
echo "  Exact work item under test:"
echo "$WORK_ITEM_DETAIL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'    Status:         {d.get(\"status\", \"?\")}')
print(f'    Execution:      {d.get(\"execution_status\", d.get(\"executionStatus\", \"not present\"))}')
outcome = d.get('execution_outcome_json') or d.get('executionOutcome') or {}
if isinstance(outcome, dict) and outcome:
    print(f'    Outcome kind:   {outcome.get(\"kind\", \"?\")}')
    print(f'    Outcome status: {outcome.get(\"status\", \"?\")}')
    if outcome.get('provider_message_id'):
        print(f'    Provider msg:   {outcome[\"provider_message_id\"]}')
" 2>/dev/null || echo "    (could not load the exact work item)"

# Check activity for send events
echo ""
echo "  Activity for this work item:"
ACTIVITY_AFTER=$(curl -s -b "$COOKIE_JAR" "${BASE_URL}/api/workspace/activity")
echo "$ACTIVITY_AFTER" | python3 -c "
import json, sys
d = json.load(sys.stdin)
work_item_id = sys.argv[1]
review_id = sys.argv[2]
matches = []
for evt in d.get('events', []):
    if work_item_id and evt.get('work_item_id') == work_item_id:
        matches.append(evt)
        continue
    if review_id and evt.get('review_id') == review_id:
        matches.append(evt)
if not matches:
    print('    (no scoped activity events found)')
else:
    for evt in matches[:5]:
        print(f'    [{evt[\"result_kind\"]}] {evt[\"title\"]}')
" "$WORK_ITEM_ID" "$REVIEW_ID" 2>/dev/null || echo "    (could not parse activity)"

# ── Step 6: Assert activity events ───────────────────────────────────
step "Step 6: Assert activity events for reviewed-send path"

HAS_SENT_EVENT="false"
HAS_FAILED_EVENT="false"
HAS_APPROVED_EVENT="false"
HAS_REQUESTED_EVENT="false"

ACTIVITY_SUMMARY=$(echo "$ACTIVITY_AFTER" | python3 -c "
import json, sys
d = json.load(sys.stdin)
work_item_id = sys.argv[1]
review_id = sys.argv[2]
events = []
for evt in d.get('events', []):
    if work_item_id and evt.get('work_item_id') == work_item_id:
        events.append(evt)
        continue
    if review_id and evt.get('review_id') == review_id:
        events.append(evt)
sent = [e for e in events if e.get('result_kind') == 'work_item_sent']
failed = [e for e in events if e.get('result_kind') == 'send_failed']
approved = [e for e in events if e.get('result_kind') == 'review_approved']
requested = [e for e in events if e.get('result_kind') == 'review_requested']
print(f'sent={len(sent)}|failed={len(failed)}|approved={len(approved)}|requested={len(requested)}')
" "$WORK_ITEM_ID" "$REVIEW_ID" 2>/dev/null || echo "sent=0|failed=0|approved=0|requested=0")

SENT_COUNT=$(echo "$ACTIVITY_SUMMARY" | sed 's/.*sent=\([0-9]*\).*/\1/')
FAILED_COUNT=$(echo "$ACTIVITY_SUMMARY" | sed 's/.*failed=\([0-9]*\).*/\1/')
APPROVED_COUNT=$(echo "$ACTIVITY_SUMMARY" | sed 's/.*approved=\([0-9]*\).*/\1/')
REQUESTED_COUNT=$(echo "$ACTIVITY_SUMMARY" | sed 's/.*requested=\([0-9]*\).*/\1/')

if [ "$REQUESTED_COUNT" -gt 0 ] 2>/dev/null; then
  ok "review_requested event(s) found: ${REQUESTED_COUNT}"
else
  warn "No review_requested activity event found"
fi

if [ "$SMTP_NOT_READY" -eq 1 ]; then
  # When SMTP is not configured, approval was blocked — no approved or sent events expected
  ok "SMTP not configured — no approval or send events expected"
  if [ "$APPROVED_COUNT" -gt 0 ] 2>/dev/null; then
    warn "Unexpected review_approved event found when SMTP was not ready"
  fi
else
  if [ "$APPROVED_COUNT" -gt 0 ] 2>/dev/null; then
    ok "review_approved event(s) found: ${APPROVED_COUNT}"
  else
    warn "No review_approved activity event found"
  fi

  if [ "$SENT_COUNT" -gt 0 ] 2>/dev/null; then
    ok "work_item_sent event(s) found: ${SENT_COUNT} — email delivery confirmed in activity log"
  elif [ "$FAILED_COUNT" -gt 0 ] 2>/dev/null; then
    warn "send_failed event(s) found: ${FAILED_COUNT} — SMTP delivery was attempted but failed"
    echo "$ACTIVITY_AFTER" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for evt in d.get('events', []):
    if evt.get('result_kind') == 'send_failed':
        print(f'    send_failed: {evt.get(\"title\", \"?\")}')
        if evt.get('summary'):
            print(f'      detail: {evt[\"summary\"]}')
        break
" 2>/dev/null || true
  else
    warn "No work_item_sent or send_failed activity event found"
    echo "    This may indicate async execution has not completed yet."
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  SMTP Send Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

FINAL_REVIEW_STATUS=$(echo "$REVIEW_AFTER" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status', 'unknown'))
" 2>/dev/null || echo "unknown")

FINAL_WORK_STATUS=$(echo "$WORK_ITEM_DETAIL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('status', 'unknown'))
" 2>/dev/null || echo "unknown")

FINAL_EXEC_STATUS=$(echo "$WORK_ITEM_DETAIL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('execution_status', d.get('executionStatus', 'not_tracked')))
" 2>/dev/null || echo "not_tracked")

FINAL_OUTCOME_STATUS=$(echo "$WORK_ITEM_DETAIL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
outcome = d.get('execution_outcome_json') or d.get('executionOutcome') or {}
print(outcome.get('status', ''))
" 2>/dev/null || echo "")

FINAL_ERROR_CLASSIFICATION=$(echo "$WORK_ITEM_DETAIL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
outcome = d.get('execution_outcome_json') or d.get('executionOutcome') or {}
print(outcome.get('error_classification', outcome.get('errorClassification', '')))
" 2>/dev/null || echo "")

FINAL_ATTEMPT=$(echo "$WORK_ITEM_DETAIL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
outcome = d.get('execution_outcome_json') or d.get('executionOutcome') or {}
print(outcome.get('attempt_count', outcome.get('attemptCount', '')))
" 2>/dev/null || echo "")

FINAL_PROVIDER_MESSAGE_ID=$(echo "$WORK_ITEM_DETAIL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
outcome = d.get('execution_outcome_json') or d.get('executionOutcome') or {}
print(outcome.get('provider_message_id', outcome.get('providerMessageId', '')))
" 2>/dev/null || echo "")

echo "  Review status:    ${FINAL_REVIEW_STATUS}"
echo "  Work item status: ${FINAL_WORK_STATUS}"
echo "  Execution status: ${FINAL_EXEC_STATUS}"
if [ -n "$FINAL_OUTCOME_STATUS" ]; then
  echo "  Outcome status:   ${FINAL_OUTCOME_STATUS}"
fi
if [ -n "$FINAL_ERROR_CLASSIFICATION" ]; then
  echo "  Error class:      ${FINAL_ERROR_CLASSIFICATION}"
fi
if [ -n "$FINAL_ATTEMPT" ]; then
  echo "  Attempt:          ${FINAL_ATTEMPT}"
fi
if [ -n "$FINAL_PROVIDER_MESSAGE_ID" ]; then
  echo "  Provider msg id:  ${FINAL_PROVIDER_MESSAGE_ID}"
fi
echo ""
echo "  Activity assertions:"
echo "    review_requested:  ${REQUESTED_COUNT:-0}"
echo "    review_approved:   ${APPROVED_COUNT:-0}"
echo "    work_item_sent:    ${SENT_COUNT:-0}"
echo "    send_failed:       ${FAILED_COUNT:-0}"
echo ""

if [ "$SMTP_NOT_READY" -eq 1 ]; then
  echo -e "  ${YELLOW}Review remains pending until SMTP is configured and the action can actually execute.${NC}"
elif [ "$FINAL_REVIEW_STATUS" = "completed" ]; then
  echo -e "  ${GREEN}Review approved successfully.${NC}"
else
  echo -e "  ${YELLOW}Unexpected review status: ${FINAL_REVIEW_STATUS}${NC}"
fi

if [ "$SMTP_NOT_READY" -eq 1 ]; then
  echo -e "  ${YELLOW}No execution started. Configure SMTP, then retry approval from Inbox or Work.${NC}"
  echo ""
  echo "  Required env vars before restarting the control plane:"
  echo "    CLAWBACK_SMTP_HOST"
  echo "    CLAWBACK_SMTP_PORT"
  echo "    CLAWBACK_SMTP_USERNAME"
  echo "    CLAWBACK_SMTP_PASSWORD"
  echo "    CLAWBACK_SMTP_FROM_ADDRESS"
elif [ "$FINAL_EXEC_STATUS" = "completed" ]; then
  echo -e "  ${GREEN}Send execution completed.${NC}"
elif [ "$FINAL_EXEC_STATUS" = "failed" ]; then
  echo -e "  ${YELLOW}Send execution failed after approval.${NC}"
  if [ -n "$FINAL_ERROR_CLASSIFICATION" ]; then
    echo "  Error class: ${FINAL_ERROR_CLASSIFICATION}"
    if [ "$FINAL_ERROR_CLASSIFICATION" = "permanent" ]; then
      echo "  This is a permanent failure — SMTP is likely not configured."
    else
      echo "  This is a transient failure — SMTP may be temporarily unreachable."
    fi
  fi
  echo ""
  echo "  Approval authorized the action. Delivery depends on the configured transport."
  echo "  Failure after approval is visible, classified, and recoverable."
  echo "  Retry is safe — the attempt counter increments, the system does not double-send."
  echo ""
  echo "  To enable real SMTP delivery, set these env vars before starting the stack:"
  echo "    CLAWBACK_SMTP_HOST"
  echo "    CLAWBACK_SMTP_PORT"
  echo "    CLAWBACK_SMTP_USERNAME"
  echo "    CLAWBACK_SMTP_PASSWORD"
  echo "    CLAWBACK_SMTP_FROM_ADDRESS"
elif [ "$FINAL_EXEC_STATUS" = "not_tracked" ]; then
  echo -e "  ${YELLOW}Execution status not tracked. SMTP-backed reviewed send is not ready in this stack.${NC}"
  echo ""
  echo "  This is not a valid reviewed-send confirmation."
fi

echo ""
echo "Done."
