# Mailpit Delivery Proof Guide

How to verify that Clawback's reviewed-send path actually delivers email, using
a local SMTP capture tool.

**Audience:** Developers running the acceptance checklist (Run B) or anyone who
wants to confirm real email delivery without sending to a live mailbox.

## What Is Mailpit

[Mailpit](https://github.com/axllent/mailpit) is a local SMTP server that
captures all outbound email and displays it in a web UI. Nothing leaves your
machine. You send to it on port 1025, and read what arrived at
`http://localhost:8025`.

This is the recommended way to verify the SMTP-present reviewed-send path
described in the [0.4 signoff](../beta/0.4-signoff-2026-03-26.md).

## Quick Path (Single Command)

If the control plane is already running with Mailpit SMTP vars (or you want the
script to set them for you), run:

```bash
./scripts/test-delivery-proof.sh
```

This will start Mailpit if it is not already running, set the SMTP env vars, run
the full send lifecycle, and check Mailpit's inbox for the delivered email.

If you prefer to run each step manually, continue below.

## 1. Start Mailpit

The fastest path is the included helper script:

```bash
./scripts/start-mailpit.sh
```

Or run the Docker command directly:

```bash
docker run -d --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Verify it is running:

```bash
docker ps --filter name=mailpit --format '{{.Names}} {{.Status}}'
```

Open the web UI at **http://localhost:8025** — it should show an empty inbox.

## 2. Configure Clawback SMTP Env Vars

Set the following environment variables **before starting the control plane**.
Add them to your `.env` file or export them in your shell:

```bash
CLAWBACK_SMTP_HOST=localhost
CLAWBACK_SMTP_PORT=1025
CLAWBACK_SMTP_FROM_ADDRESS=clawback@localhost
CLAWBACK_SMTP_USERNAME=
CLAWBACK_SMTP_PASSWORD=
CLAWBACK_SMTP_SECURE=false
```

Mailpit accepts any connection without authentication, so username and password
are left empty.

Then start (or restart) the control plane:

```bash
pnpm --filter @clawback/control-plane dev
```

## 3. Verify SMTP Is Recognized

Confirm the control plane sees the SMTP configuration. Find the `smtp_relay`
connection ID from the connections endpoint, then check its status:

```bash
# Log in (adjust credentials to your seed data)
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -c /tmp/clawback-cookies.txt \
  -d '{"email": "dave@hartwell.com", "password": "demo1234"}'

# Find the smtp_relay connection
curl -s -b /tmp/clawback-cookies.txt \
  http://localhost:3001/api/workspace/connections | \
  python3 -c "
import json, sys
for c in json.load(sys.stdin).get('connections', []):
    if c.get('provider') == 'smtp_relay':
        print(f\"Connection ID: {c['id']}  status: {c['status']}\")
"

# Check SMTP status (replace <CONNECTION_ID> with the ID above)
curl -s -b /tmp/clawback-cookies.txt \
  http://localhost:3001/api/workspace/connections/<CONNECTION_ID>/smtp-status
```

**Expected:** `env_configured` is `true`.

## 4. Run the SMTP Send Test

```bash
./scripts/test-smtp-send.sh
```

The script will:

1. Log in as Dave
2. Forward a test email to create a work item
3. Find the resulting review in the inbox
4. Approve the review (triggering the actual SMTP send)
5. Report the execution state

**Expected:** The review reaches `completed` status and execution status is
`completed`.

## 5. Check Mailpit for the Delivered Email

Open **http://localhost:8025** in your browser.

**What to look for:**

- An email appeared in the Mailpit inbox
- **From** matches `CLAWBACK_SMTP_FROM_ADDRESS` (`clawback@localhost`)
- **To** matches the test recipient address
- **Subject** matches the forwarded email subject
- The email body contains the original message text
- Headers include `x-clawback-review-id` (the review that authorized the send)
- Headers include `x-clawback-work-item-id` (the work item that triggered it)

If all of these are present, Run B delivery verification passes.

## 6. Stop Mailpit When Done

```bash
docker stop mailpit && docker rm mailpit
```

## Alternative: MailHog

[MailHog](https://github.com/mailhog/MailHog) is an older tool that serves the
same purpose. The setup is equivalent:

```bash
docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

The same SMTP env vars apply — MailHog also listens on port 1025 and serves its
web UI on port 8025. The verification steps are identical.

MailHog is no longer actively maintained; Mailpit is the recommended choice.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Mailpit inbox stays empty after test | Control plane not using the right SMTP vars | Restart the control plane after setting env vars |
| `env_configured` is `false` | Env vars not set or not exported | Ensure vars are exported, not just in a file the process does not read |
| Approval returns 503 | SMTP not recognized as configured | Check that `CLAWBACK_SMTP_HOST` and `CLAWBACK_SMTP_PORT` are set |
| Connection refused on port 1025 | Mailpit not running | Run `docker ps --filter name=mailpit` to verify |
| Email arrives but missing Clawback headers | Older control-plane version | Pull latest and restart |

## See Also

- [0.4 Signoff](../beta/0.4-signoff-2026-03-26.md)
- [Deployment Guide — SMTP section](./deployment.md#smtp)
- [Verification and Testing](./verification-and-testing.md)
