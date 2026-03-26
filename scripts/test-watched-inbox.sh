#!/usr/bin/env bash
#
# Test the real Gmail watch hook shadow flow against the local stack.
#
# Prerequisites:
#   1. Database running (docker compose up -d)
#   2. Seed data applied (pnpm --filter @clawback/db seed)
#   3. Control plane running (pnpm --filter @clawback/control-plane dev)
#
# Usage:
#   ./scripts/test-watched-inbox.sh
#   ./scripts/test-watched-inbox.sh --subject "Custom subject"
#
# The script sends an OpenClaw/gog-style Gmail hook payload to the real Gmail
# watch ingress endpoint and verifies the shadow flow. The workspace and Gmail
# connection IDs are looked up from the seeded Hartwell workspace.

set -euo pipefail

_PORT="${CONTROL_PLANE_PORT:-3001}"
BASE_URL="${CONTROL_PLANE_URL:-http://localhost:${_PORT}}"
HOOK_TOKEN="${CLAWBACK_GMAIL_WATCH_HOOK_TOKEN:-clawback-local-gmail-watch-token}"

SUBJECT="${1:-Re: Apex Labs quarterly check-in}"
EXTERNAL_MESSAGE_ID="gmail-watch-$(date +%s)-$$"

echo "=== Watched Inbox Shadow Flow (Gmail hook) ==="
echo ""
echo "Target:     ${BASE_URL}/api/inbound/gmail-watch/:workspaceId/:connectionId"
echo "Message-ID: ${EXTERNAL_MESSAGE_ID}"
echo "Subject:    ${SUBJECT}"
echo ""

# 1. Look up the workspace and Gmail connection from the seeded data
echo "--- Step 1: Look up workspace and Gmail connection ---"
# We need a session cookie; log in as Dave first
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
echo "Logged in as Dave (HTTP ${LOGIN_CODE})"

# Get the workspace workers and connections
WORKERS_RESPONSE=$(curl -s \
  -b /tmp/clawback-cookies.txt \
  "${BASE_URL}/api/workspace/workers")

# Get workspace ID from the today endpoint
WORKSPACE_ID=$(curl -s \
  -b /tmp/clawback-cookies.txt \
  "${BASE_URL}/api/workspace/today" | python3 -c "
import json, sys
data = json.load(sys.stdin)
# workspace_id can be extracted from any work_item if present
items = data.get('team', [])
if items:
    print(items[0].get('workspace_id', ''))
" 2>/dev/null || echo "")

if [ -z "$WORKSPACE_ID" ]; then
  echo "WARNING: Could not extract workspace_id from today response."
  echo "Trying to use work items endpoint..."
  WORKSPACE_ID=$(curl -s \
    -b /tmp/clawback-cookies.txt \
    "${BASE_URL}/api/workspace/work" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('work_items', [])
if items:
    print(items[0].get('workspace_id', ''))
" 2>/dev/null || echo "")
fi

if [ -z "$WORKSPACE_ID" ]; then
  echo "FAILED: Could not determine workspace_id."
  exit 1
fi
echo "Workspace ID: ${WORKSPACE_ID}"

CONNECTIONS_RESPONSE=$(curl -s \
  -b /tmp/clawback-cookies.txt \
  "${BASE_URL}/api/workspace/connections")

GMAIL_CONNECTION_ID=$(echo "$CONNECTIONS_RESPONSE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for conn in data.get('connections', []):
    if conn.get('provider') == 'gmail' and conn.get('access_mode') == 'read_only':
        print(conn['id'])
        break
" 2>/dev/null || echo "")

if [ -z "$GMAIL_CONNECTION_ID" ]; then
  echo "FAILED: Could not find Gmail read-only connection."
  exit 1
fi
echo "Gmail Connection ID: ${GMAIL_CONNECTION_ID}"
echo ""

# 2. Send the Gmail watch hook payload
echo "--- Step 2: POST Gmail watch hook payload ---"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/gmail-watch/${WORKSPACE_ID}/${GMAIL_CONNECTION_ID}" \
  -H "Content-Type: application/json" \
  -H "x-gog-token: ${HOOK_TOKEN}" \
  -d "{
    \"source\": \"gmail\",
    \"messages\": [{
      \"id\": \"${EXTERNAL_MESSAGE_ID}\",
      \"from\": \"jen@apexlabs.com\",
      \"subject\": \"${SUBJECT}\",
      \"snippet\": \"Hi Dave, just wanted to check in on the quarterly review.\",
      \"body\": \"Hi Dave, just wanted to check in on the quarterly review. Are we still on track for next Tuesday?\"
    }]
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP ${HTTP_CODE}"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -ge 400 ]; then
  echo "FAILED: Gmail watch hook returned HTTP ${HTTP_CODE}"
  exit 1
fi

# 3. Idempotency check
echo "--- Step 3: Idempotency check (same external_message_id) ---"
RESPONSE2=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/gmail-watch/${WORKSPACE_ID}/${GMAIL_CONNECTION_ID}" \
  -H "Content-Type: application/json" \
  -H "x-gog-token: ${HOOK_TOKEN}" \
  -d "{
    \"source\": \"gmail\",
    \"messages\": [{
      \"id\": \"${EXTERNAL_MESSAGE_ID}\",
      \"from\": \"jen@apexlabs.com\",
      \"subject\": \"${SUBJECT}\",
      \"snippet\": \"Duplicate message.\"
    }]
  }")

HTTP_CODE2=$(echo "$RESPONSE2" | tail -1)
BODY2=$(echo "$RESPONSE2" | sed '$d')

echo "HTTP ${HTTP_CODE2} (expect 200 for deduplicated)"
echo "$BODY2" | python3 -m json.tool 2>/dev/null || echo "$BODY2"
echo ""

# 4. Verify shadow items appeared
echo "--- Step 4: Verify shadow items in workspace APIs ---"
echo ""

echo "Work items (should include shadow draft):"
curl -s -b /tmp/clawback-cookies.txt "${BASE_URL}/api/workspace/work" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for wi in data.get('work_items', []):
    if 'shadow' in wi.get('title', '').lower() or wi.get('source_route_kind') == 'watched_inbox':
        print(f'  [{wi[\"status\"]}] {wi[\"title\"]}')
" 2>/dev/null || echo "  (could not parse)"
echo ""

echo "Inbox items (should include shadow):"
curl -s -b /tmp/clawback-cookies.txt "${BASE_URL}/api/workspace/inbox" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for item in data.get('items', []):
    if item.get('kind') == 'shadow':
        print(f'  [{item[\"state\"]}] {item[\"kind\"]}: {item[\"title\"]}')
" 2>/dev/null || echo "  (could not parse)"
echo ""

echo "=== Done ==="
