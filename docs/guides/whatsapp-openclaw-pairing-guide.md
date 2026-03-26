# WhatsApp OpenClaw Pairing Guide

## What It Is

OpenClaw Pairing is the recommended way to connect WhatsApp as an approval
surface in Clawback. It pairs a dedicated work WhatsApp identity through a QR
code, so Clawback can deliver approval prompts without requiring full Meta
Business API setup.

Use it when you want the fastest operator path for WhatsApp approvals in a
self-hosted deployment.

## When To Use It

- You want the simplest WhatsApp setup path for a small operator team.
- You have a dedicated work WhatsApp identity available.
- You want approval prompts delivered over WhatsApp, while Clawback remains the
  source of truth for approval, audit, and identity mapping.

Use Meta Cloud API instead when you need a more formal Meta-managed integration
or webhook-based delivery for a broader deployment.

## Prerequisites

- Admin access to a Clawback workspace
- A dedicated work WhatsApp identity
- A running OpenClaw runtime that Clawback can reach

## Setup

1. Open the workspace **Connections** page.
2. Select the WhatsApp connection card.
3. Choose **OpenClaw Pairing** as the transport mode.
4. Generate a QR code and scan it with the dedicated work identity.
5. Confirm the pairing status in the card.
6. Map workspace users to their WhatsApp phone numbers in the approval-surface
   identity settings.

Only mapped and allowlisted users can receive and act on approval prompts.

## Status Checks

From the WhatsApp connection card you can:

- check whether the OpenClaw runtime is reachable
- confirm whether the pairing session is healthy
- see the paired identity reference
- refresh the probe result after a recovery action

## How It Works

When OpenClaw Pairing is active:

1. Clawback creates a review with signed approve/deny tokens.
2. Clawback asks OpenClaw to deliver the approval prompt over the paired
   WhatsApp session.
3. The operator receives the message and opens the linked review in Clawback.
4. The final approve or deny action still resolves inside Clawback.

OpenClaw handles message delivery. Clawback remains the source of truth for
reviews, identity mapping, and audit.

## Troubleshooting

### Session Dropped

If the session disconnects:

1. Disconnect the stale session from the WhatsApp card.
2. Re-select **OpenClaw Pairing**.
3. Scan a new QR code.

### Runtime Unreachable

If status checks say the runtime is unreachable:

1. Confirm the OpenClaw runtime is running.
2. Check network connectivity between Clawback and OpenClaw.
3. Review the OpenClaw runtime logs.
4. Re-run the pairing-status check.

### Identity Mismatch

If approval actions are rejected because of identity mismatch:

1. Confirm the paired phone number matches the identity mapped in Clawback.
2. Re-check the allowlist.
3. Update the mapped identity if the paired number changed.

## Limits

- OpenClaw Pairing currently supports direct-message approvals only.
- Direct approve/deny actions inside WhatsApp are not part of this pairing path.
- If WhatsApp delivery fails, the review still exists in the Clawback web inbox.

## Related Docs

- [Admin Guide](./admin-guide.md)
- [Troubleshooting](./troubleshooting.md)
- [Known Limitations](./known-limitations.md)
