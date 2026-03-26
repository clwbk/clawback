#!/usr/bin/env bash
#
# Single-command delivery proof: start Mailpit if needed, run the send
# lifecycle, then confirm the email landed in Mailpit's inbox.
#
# Usage:  ./scripts/test-delivery-proof.sh
#
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}OK${NC}: $1"; }
warn() { echo -e "  ${YELLOW}WARN${NC}: $1"; }
fail() { echo -e "  ${RED}FAIL${NC}: $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAILPIT_UI="http://localhost:8025"
MAILPIT_API="${MAILPIT_UI}/api/v1/messages"

echo -e "${BLUE}━━  Delivery Proof  ━━${NC}"

# ── 1. Ensure Mailpit is running ──────────────────────────────────────
echo -e "\n${BLUE}1. Checking Mailpit${NC}"
if curl -sf "${MAILPIT_UI}/api/v1/messages?limit=1" >/dev/null 2>&1; then
  ok "Mailpit already running at ${MAILPIT_UI}"
else
  warn "Mailpit not reachable — starting container"
  bash "${SCRIPT_DIR}/start-mailpit.sh"
  sleep 2
  if ! curl -sf "${MAILPIT_UI}/api/v1/messages?limit=1" >/dev/null 2>&1; then
    fail "Mailpit failed to start"; exit 1
  fi
  ok "Mailpit started"
fi

# ── 2. Export SMTP env vars pointing at Mailpit ───────────────────────
echo -e "\n${BLUE}2. Setting SMTP env vars for Mailpit${NC}"
export CLAWBACK_SMTP_HOST=localhost
export CLAWBACK_SMTP_PORT=1025
export CLAWBACK_SMTP_FROM_ADDRESS=clawback@localhost
export CLAWBACK_SMTP_USERNAME=
export CLAWBACK_SMTP_PASSWORD=
export CLAWBACK_SMTP_SECURE=false
ok "SMTP → localhost:1025 (no auth)"

# ── 3. Record pre-send message count ─────────────────────────────────
PRE_COUNT=$(curl -sf "${MAILPIT_API}?limit=1" | python3 -c "
import json,sys; print(json.load(sys.stdin).get('messages_count',0))" 2>/dev/null || echo 0)

# ── 4. Run the full send lifecycle ────────────────────────────────────
echo -e "\n${BLUE}3. Running send lifecycle (test-smtp-send.sh)${NC}"
bash "${SCRIPT_DIR}/test-smtp-send.sh"

# ── 5. Check Mailpit for the new email ────────────────────────────────
echo -e "\n${BLUE}4. Checking Mailpit inbox for delivered email${NC}"
sleep 1
POST_COUNT=$(curl -sf "${MAILPIT_API}?limit=1" | python3 -c "
import json,sys; print(json.load(sys.stdin).get('messages_count',0))" 2>/dev/null || echo 0)

if [ "$POST_COUNT" -gt "$PRE_COUNT" ]; then
  ok "New email(s) in Mailpit (before: ${PRE_COUNT}, after: ${POST_COUNT})"
  # Show the latest message summary
  curl -sf "${MAILPIT_API}?limit=1" | python3 -c "
import json,sys
data = json.load(sys.stdin)
for m in data.get('messages',[])[:1]:
    fr = ', '.join(a.get('Address','') for a in m.get('From',{}).get('Address','') and [m['From']] or [])
    to = ', '.join(a.get('Address','') for a in m.get('To',[]))
    print(f'    From:    {fr}')
    print(f'    To:      {to}')
    print(f'    Subject: {m.get(\"Subject\",\"?\")}')
" 2>/dev/null || true
  echo ""
  echo -e "  ${GREEN}DELIVERY PROOF PASSED${NC} — email captured in Mailpit."
  echo "  Inspect at: ${MAILPIT_UI}"
else
  warn "No new email in Mailpit (count stayed at ${PRE_COUNT})."
  echo "  The send may have failed or SMTP vars were not picked up by the control plane."
  echo "  If the control plane was already running, restart it with the SMTP env vars set."
  echo "  Then re-run:  ./scripts/test-delivery-proof.sh"
fi
