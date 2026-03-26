#!/usr/bin/env bash
#
# T17: Verify the Hartwell seed produces data visible across all workspace pages.
#
# Prerequisites:
#   1. Database running (docker compose up -d)
#   2. Seed data applied (pnpm --filter @clawback/db seed)
#   3. Control plane running (pnpm --filter @clawback/control-plane dev)
#
# Usage:
#   ./scripts/verify-seed.sh
#
# Logs in as Dave and checks each workspace API for expected data.

set -euo pipefail

_PORT="${CONTROL_PLANE_PORT:-3001}"
BASE_URL="${CONTROL_PLANE_URL:-http://localhost:${_PORT}}"
PASS=0
FAIL=0

pass() {
  PASS=$((PASS + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo "  FAIL: $1"
}

check_count() {
  local label="$1"
  local actual="$2"
  local min="$3"
  if [ "$actual" -ge "$min" ] 2>/dev/null; then
    pass "${label}: ${actual} (>= ${min} expected)"
  else
    fail "${label}: got ${actual}, expected >= ${min}"
  fi
}

echo "=== T17: Verify Seed Data ==="
echo ""

# 1. Log in as Dave
echo "--- Logging in as Dave ---"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -c /tmp/clawback-verify-cookies.txt \
  -d '{"email": "dave@hartwell.com", "password": "demo1234"}')

LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
if [ "$LOGIN_CODE" -ge 400 ]; then
  echo "FAILED: Login returned HTTP ${LOGIN_CODE}"
  echo "Make sure the control plane is running and seeded."
  exit 1
fi
echo "  Logged in as Dave (HTTP ${LOGIN_CODE})"
echo ""

# Helper: GET with cookies and return body
api_get() {
  curl -s -b /tmp/clawback-verify-cookies.txt "${BASE_URL}$1"
}

# 2. Today
echo "--- /api/workspace/today ---"
TODAY=$(api_get "/api/workspace/today")
TODAY_FOR_YOU=$(echo "$TODAY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('for_you',[])))" 2>/dev/null || echo "0")
TODAY_TEAM=$(echo "$TODAY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('team',[])))" 2>/dev/null || echo "0")
TODAY_SNAPSHOTS=$(echo "$TODAY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('worker_snapshots',[])))" 2>/dev/null || echo "0")
check_count "for_you items" "$TODAY_FOR_YOU" 1
check_count "team items" "$TODAY_TEAM" 5
check_count "worker_snapshots" "$TODAY_SNAPSHOTS" 3
echo ""

# 3. Workers
echo "--- /api/workspace/workers ---"
WORKERS=$(api_get "/api/workspace/workers")
WORKER_COUNT=$(echo "$WORKERS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('workers',[])))" 2>/dev/null || echo "0")
check_count "workers" "$WORKER_COUNT" 3
echo ""

# 4. Work
echo "--- /api/workspace/work ---"
WORK=$(api_get "/api/workspace/work")
WORK_COUNT=$(echo "$WORK" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('work_items',[])))" 2>/dev/null || echo "0")
check_count "work items" "$WORK_COUNT" 5

# Check for shadow draft
SHADOW_DRAFTS=$(echo "$WORK" | python3 -c "
import json,sys
d=json.load(sys.stdin)
count = sum(1 for wi in d.get('work_items',[]) if 'shadow' in wi.get('title','').lower())
print(count)
" 2>/dev/null || echo "0")
check_count "shadow draft work items" "$SHADOW_DRAFTS" 1

# Check for different statuses
PENDING_REVIEW=$(echo "$WORK" | python3 -c "
import json,sys
d=json.load(sys.stdin)
count = sum(1 for wi in d.get('work_items',[]) if wi.get('status') == 'pending_review')
print(count)
" 2>/dev/null || echo "0")
check_count "pending_review work items" "$PENDING_REVIEW" 1
echo ""

# 5. Inbox
echo "--- /api/workspace/inbox ---"
INBOX=$(api_get "/api/workspace/inbox")
INBOX_COUNT=$(echo "$INBOX" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('items',[])))" 2>/dev/null || echo "0")
check_count "inbox items" "$INBOX_COUNT" 5

# Check for shadow inbox items
SHADOW_INBOX=$(echo "$INBOX" | python3 -c "
import json,sys
d=json.load(sys.stdin)
count = sum(1 for i in d.get('items',[]) if i.get('kind') == 'shadow')
print(count)
" 2>/dev/null || echo "0")
check_count "shadow inbox items" "$SHADOW_INBOX" 2

# Check for review inbox items
REVIEW_INBOX=$(echo "$INBOX" | python3 -c "
import json,sys
d=json.load(sys.stdin)
count = sum(1 for i in d.get('items',[]) if i.get('kind') == 'review')
print(count)
" 2>/dev/null || echo "0")
check_count "review inbox items" "$REVIEW_INBOX" 1

# Check for resolved inbox items (denied review)
RESOLVED_INBOX=$(echo "$INBOX" | python3 -c "
import json,sys
d=json.load(sys.stdin)
count = sum(1 for i in d.get('items',[]) if i.get('state') == 'resolved')
print(count)
" 2>/dev/null || echo "0")
check_count "resolved inbox items (denied review)" "$RESOLVED_INBOX" 1
echo ""

# 6. Connections
echo "--- /api/workspace/connections ---"
CONNS=$(api_get "/api/workspace/connections")
CONN_COUNT=$(echo "$CONNS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('connections',[])))" 2>/dev/null || echo "0")
check_count "connections" "$CONN_COUNT" 3
echo ""

# 7. Connectors
echo "--- /api/connectors ---"
CONNECTORS=$(api_get "/api/connectors")
CONNECTOR_COUNT=$(echo "$CONNECTORS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('connectors',[])))" 2>/dev/null || echo "0")
check_count "connectors" "$CONNECTOR_COUNT" 1

COMPANY_DOCS_ID=$(echo "$CONNECTORS" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for connector in d.get("connectors", []):
    if connector.get("name") == "Company Docs" and connector.get("type") == "local_directory":
        print(connector.get("id", ""))
        break
' 2>/dev/null || true)

if [ -n "${COMPANY_DOCS_ID}" ]; then
  pass "seeded Company Docs connector present"

  SYNC_JOBS=$(api_get "/api/connectors/${COMPANY_DOCS_ID}/sync-jobs")
  SYNC_JOB_COUNT=$(echo "$SYNC_JOBS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('sync_jobs',[])))" 2>/dev/null || echo "0")
  check_count "Company Docs sync jobs" "$SYNC_JOB_COUNT" 1

  COMPANY_DOCS_INDEXED=$(echo "$SYNC_JOBS" | python3 -c '
import json,sys
d=json.load(sys.stdin)
jobs = d.get("sync_jobs", [])
latest = jobs[0] if jobs else {}
stats = latest.get("stats") or {}
print(stats.get("indexed_document_count", 0))
' 2>/dev/null || echo "0")
  check_count "Company Docs indexed documents" "$COMPANY_DOCS_INDEXED" 1
else
  fail "seeded Company Docs connector missing"
fi
echo ""

# 8. Activity
echo "--- /api/workspace/activity ---"
ACTIVITY=$(api_get "/api/workspace/activity")
ACTIVITY_COUNT=$(echo "$ACTIVITY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('events',[])))" 2>/dev/null || echo "0")
check_count "activity events" "$ACTIVITY_COUNT" 6

# Check for shadow_draft_created activity
SHADOW_ACTIVITY=$(echo "$ACTIVITY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
count = sum(1 for e in d.get('events',[]) if e.get('result_kind') == 'shadow_draft_created')
print(count)
" 2>/dev/null || echo "0")
check_count "shadow_draft_created events" "$SHADOW_ACTIVITY" 1

# Check for review_denied activity
DENIED_ACTIVITY=$(echo "$ACTIVITY" | python3 -c "
import json,sys
d=json.load(sys.stdin)
count = sum(1 for e in d.get('events',[]) if e.get('result_kind') == 'review_denied')
print(count)
" 2>/dev/null || echo "0")
check_count "review_denied events" "$DENIED_ACTIVITY" 1
echo ""

# 9. Reviews (check pending review exists)
echo "--- /api/workspace/inbox (pending review check) ---"
PENDING_REVIEWS=$(echo "$INBOX" | python3 -c "
import json,sys
d=json.load(sys.stdin)
count = sum(1 for i in d.get('items',[]) if i.get('kind') == 'review' and i.get('state') == 'open')
print(count)
" 2>/dev/null || echo "0")
check_count "open review inbox items" "$PENDING_REVIEWS" 1
echo ""

# Summary
echo "=== Summary ==="
echo "  Passed: ${PASS}"
echo "  Failed: ${FAIL}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "VERIFICATION FAILED: ${FAIL} checks did not pass."
  exit 1
else
  echo "All checks passed. Seed data is complete."
fi
