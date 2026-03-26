#!/usr/bin/env bash
#
# Test the real provider-backed forwarded-email flow against the local stack.
#
# Prerequisites:
#   1. Database running (docker compose up -d)
#   2. Seed data applied (pnpm --filter @clawback/db seed)
#   3. Control plane running (pnpm --filter @clawback/control-plane dev)
#
# Usage:
#   ./scripts/test-forward-email.sh
#   ./scripts/test-forward-email.sh --subject "Custom subject"
#
# The script sends a Postmark-style inbound email payload to the real provider
# webhook endpoint. The forwarding address matches the seeded Hartwell Follow-Up
# worker route: followup@hartwell.clawback.dev

set -euo pipefail

_PORT="${CONTROL_PLANE_PORT:-3001}"
BASE_URL="${CONTROL_PLANE_URL:-http://localhost:${_PORT}}"
WEBHOOK_TOKEN="${CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN:-clawback-local-inbound-email-token}"

SUBJECT="${1:-Re: Q3 Renewal Discussion}"
MESSAGE_ID="<test-$(date +%s)-$$@mail.example.com>"

echo "=== Forward Email Follow-Up Flow (Postmark) ==="
echo ""
echo "Target:     ${BASE_URL}/api/inbound/email/postmark"
echo "Message-ID: ${MESSAGE_ID}"
echo "Subject:    ${SUBJECT}"
echo ""

# 1. Send the forwarded email via the Postmark-style webhook
echo "--- Step 1: POST provider-backed forwarded email ---"
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/email/postmark" \
  -H "Content-Type: application/json" \
  -H "x-clawback-webhook-token: ${WEBHOOK_TOKEN}" \
  -d "{
    \"From\": \"Sarah Example <sarah@acmecorp.com>\",
    \"OriginalRecipient\": \"followup@hartwell.clawback.dev\",
    \"To\": \"followup@hartwell.clawback.dev\",
    \"Subject\": \"${SUBJECT}\",
    \"MessageID\": \"${MESSAGE_ID}\",
    \"TextBody\": \"Hi Dave, wanted to follow up on our renewal discussion. Can we schedule a call next week to finalize terms?\",
    \"HtmlBody\": \"<p>Hi Dave, wanted to follow up on our renewal discussion. Can we schedule a call next week to finalize terms?</p>\",
    \"Attachments\": []
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP ${HTTP_CODE}"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" -ge 400 ]; then
  echo "FAILED: Webhook returned HTTP ${HTTP_CODE}"
  exit 1
fi

# 2. Test idempotency — send the same email again
echo "--- Step 2: Idempotency check (same message_id) ---"
RESPONSE2=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/email/postmark" \
  -H "Content-Type: application/json" \
  -H "x-clawback-webhook-token: ${WEBHOOK_TOKEN}" \
  -d "{
    \"From\": \"Sarah Example <sarah@acmecorp.com>\",
    \"OriginalRecipient\": \"followup@hartwell.clawback.dev\",
    \"To\": \"followup@hartwell.clawback.dev\",
    \"Subject\": \"${SUBJECT}\",
    \"MessageID\": \"${MESSAGE_ID}\",
    \"TextBody\": \"Hi Dave, wanted to follow up on our renewal discussion.\"
  }")

HTTP_CODE2=$(echo "$RESPONSE2" | tail -1)
BODY2=$(echo "$RESPONSE2" | sed '$d')

echo "HTTP ${HTTP_CODE2} (expect 200 for deduplicated)"
echo "$BODY2" | python3 -m json.tool 2>/dev/null || echo "$BODY2"
echo ""

# 3. Test unknown address returns 404
echo "--- Step 3: Error case (unknown address) ---"
RESPONSE3=$(curl -s -w "\n%{http_code}" \
  -X POST "${BASE_URL}/api/inbound/email/postmark" \
  -H "Content-Type: application/json" \
  -H "x-clawback-webhook-token: ${WEBHOOK_TOKEN}" \
  -d "{
    \"From\": \"Nobody <nobody@example.com>\",
    \"OriginalRecipient\": \"nobody@unknown.clawback.dev\",
    \"To\": \"nobody@unknown.clawback.dev\",
    \"Subject\": \"Should fail\",
    \"MessageID\": \"<unknown-test@mail.example.com>\",
    \"TextBody\": \"This should return 404.\"
  }")

HTTP_CODE3=$(echo "$RESPONSE3" | tail -1)
BODY3=$(echo "$RESPONSE3" | sed '$d')

echo "HTTP ${HTTP_CODE3} (expect 404)"
echo "$BODY3" | python3 -m json.tool 2>/dev/null || echo "$BODY3"
echo ""

echo "=== Done ==="
echo ""
echo "To verify the items appeared in the workspace APIs, log in as Dave"
echo "(dave@hartwell.com / demo1234) and check:"
echo "  - GET ${BASE_URL}/api/workspace/work"
echo "  - GET ${BASE_URL}/api/workspace/inbox"
echo "  - GET ${BASE_URL}/api/workspace/activity"
echo "  - GET ${BASE_URL}/api/workspace/today"
