#!/usr/bin/env bash
#
# T14: Test the approve-and-send review flow against the local stack.
#
# Prerequisites:
#   1. Database running (docker compose up -d)
#   2. Seed data applied (pnpm --filter @clawback/db seed)
#   3. Control plane running (pnpm --filter @clawback/control-plane dev)
#
# Usage:
#   ./scripts/test-approve-review.sh              # approves the first pending review
#   ./scripts/test-approve-review.sh deny          # denies the first pending review
#   ./scripts/test-approve-review.sh approve REV_ID  # approves a specific review
#
# The script logs in as Dave, finds a pending review, resolves it, and
# prints the resulting state changes.

set -euo pipefail

_PORT="${CONTROL_PLANE_PORT:-3001}"
BASE_URL="${CONTROL_PLANE_URL:-http://localhost:${_PORT}}"

DECISION="${1:-approved}"
REVIEW_ID="${2:-}"

if [ "$DECISION" != "approved" ] && [ "$DECISION" != "denied" ] && [ "$DECISION" != "deny" ]; then
  echo "Usage: $0 [approved|denied|deny] [review_id]"
  exit 1
fi

# Normalize "deny" to "denied"
if [ "$DECISION" = "deny" ]; then
  DECISION="denied"
fi

echo "=== T14: Review Resolution Flow ==="
echo ""
echo "Decision: ${DECISION}"
echo ""

# 1. Log in as Dave
echo "--- Step 1: Log in as Dave ---"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -c /tmp/clawback-cookies.txt \
  -d '{"email": "dave@hartwell.com", "password": "demo1234"}')

LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
if [ "$LOGIN_CODE" -ge 400 ]; then
  echo "FAILED: Login returned HTTP ${LOGIN_CODE}"
  echo "Make sure the control plane is running and seeded."
  exit 1
fi

# Get CSRF token from login response body
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')
CSRF_TOKEN=$(echo "$LOGIN_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('csrf_token', ''))
" 2>/dev/null || echo "")

echo "Logged in (HTTP ${LOGIN_CODE})"
echo ""

# 2. Find a pending review
if [ -z "$REVIEW_ID" ]; then
  echo "--- Step 2: Find pending review ---"
  INBOX_RESPONSE=$(curl -s \
    -b /tmp/clawback-cookies.txt \
    "${BASE_URL}/api/workspace/inbox")

  REVIEW_ID=$(echo "$INBOX_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data.get('items', []):
    if item.get('kind') == 'review' and item.get('state') == 'open' and item.get('review_id'):
        print(item['review_id'])
        break
" 2>/dev/null || echo "")

  if [ -z "$REVIEW_ID" ]; then
    echo "No pending review found in inbox."
    echo ""
    echo "Tip: Run ./scripts/test-forward-email.sh first to create a review."
    exit 1
  fi
fi

echo "Review ID: ${REVIEW_ID}"
echo ""

# 3. Get current review state
echo "--- Step 3: Current review state ---"
REVIEW_BEFORE=$(curl -s \
  -b /tmp/clawback-cookies.txt \
  "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}")

echo "$REVIEW_BEFORE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'  Status: {data.get(\"status\", \"unknown\")}')
print(f'  Action: {data.get(\"action_kind\", \"unknown\")}')
print(f'  Destination: {data.get(\"action_destination\", \"unknown\")}')
" 2>/dev/null || echo "$REVIEW_BEFORE"
echo ""

# 4. Resolve the review
echo "--- Step 4: Resolve review (${DECISION}) ---"
RATIONALE="Approved via test script."
if [ "$DECISION" = "denied" ]; then
  RATIONALE="Denied via test script — tone needs revision."
fi

RESOLVE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}/resolve" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -b /tmp/clawback-cookies.txt \
  -d "{
    \"decision\": \"${DECISION}\",
    \"rationale\": \"${RATIONALE}\"
  }")

RESOLVE_CODE=$(echo "$RESOLVE_RESPONSE" | tail -1)
RESOLVE_BODY=$(echo "$RESOLVE_RESPONSE" | sed '$d')

echo "HTTP ${RESOLVE_CODE}"
echo "$RESOLVE_BODY" | python3 -m json.tool 2>/dev/null || echo "$RESOLVE_BODY"
echo ""

if [ "$RESOLVE_CODE" -ge 400 ]; then
  echo "FAILED: Review resolution returned HTTP ${RESOLVE_CODE}"
  exit 1
fi

# 5. Verify state changes
echo "--- Step 5: Verify state changes ---"
echo ""

echo "Review after resolution:"
curl -s -b /tmp/clawback-cookies.txt \
  "${BASE_URL}/api/workspace/reviews/${REVIEW_ID}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f'  Status: {data.get(\"status\", \"unknown\")}')
print(f'  Resolved at: {data.get(\"resolved_at\", \"null\")}')
" 2>/dev/null || echo "  (could not parse)"
echo ""

echo "Work items:"
curl -s -b /tmp/clawback-cookies.txt "${BASE_URL}/api/workspace/work" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for wi in data.get('work_items', []):
    print(f'  [{wi[\"status\"]}] {wi[\"title\"]}')
" 2>/dev/null || echo "  (could not parse)"
echo ""

echo "Inbox items:"
curl -s -b /tmp/clawback-cookies.txt "${BASE_URL}/api/workspace/inbox" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data.get('items', []):
    print(f'  [{item[\"state\"]}] {item[\"kind\"]}: {item[\"title\"]}')
" 2>/dev/null || echo "  (could not parse)"
echo ""

echo "Recent activity:"
curl -s -b /tmp/clawback-cookies.txt "${BASE_URL}/api/workspace/activity" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for evt in data.get('events', [])[:5]:
    print(f'  [{evt[\"result_kind\"]}] {evt[\"title\"]}')
" 2>/dev/null || echo "  (could not parse)"
echo ""

echo "=== Done ==="
