# Troubleshooting

Common problems when running Clawback locally or in a self-hosted deployment.

## Control Plane Is Down

### Symptom

- login fails
- workspace pages do not load
- verification scripts fail immediately

### Checks

The control-plane port depends on how the stack was started: `./scripts/start-local.sh` uses **3011**, while `pnpm dev` uses **3001**.

```bash
curl -s http://localhost:3011/healthz
curl -s http://localhost:3011/readyz
```

If `/healthz` fails, the service is down. If `/readyz` fails, a dependency like Postgres or PgBoss is not ready.

## Login Fails

### Demo credentials fail

Make sure demo data exists:

```bash
pnpm --filter @clawback/db seed
```

Demo users:

- `dave@hartwell.com` / `demo1234`
- `emma@hartwell.com` / `demo1234`

### Bootstrap credentials fail

If you used `/setup`, sign in with the exact credentials created there. The demo seed does not replace your bootstrap admin automatically.

## CSRF Errors

Mutating API calls require `x-csrf-token`.

If you are scripting against the API:

1. log in
2. capture the returned `csrf_token`
3. include it on subsequent `POST`, `PATCH`, `PUT`, or `DELETE` requests

## Forward Email Problems

### 404 on `/api/inbound/email/postmark`

The forwarding address does not match a configured route.

Check:

- seeded address `followup@hartwell.clawback.dev`
- or your own worker's forward-email route

### 401 or 403 on the webhook

Your `x-clawback-webhook-token` does not match `CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN`.

## Gmail Problems

### Gmail setup fails

Common causes:

- bad Google OAuth client ID or client secret
- wrong redirect URI in the Google app
- invalid refresh token
- bad service-account JSON
- Gmail API not enabled on the Google side

### Gmail shows connected but no suggestions appear

Check all of these:

1. the Gmail connection is attached to the worker
2. the worker has a `watched_inbox` route
3. the route is active
4. you ran `Check inbox now`
5. the new message was actually new relative to the saved baseline

Remember:

- Gmail is read-only
- watched inbox creates suggestions and shadow work, not automatic sends

## SMTP Problems

### Approval says reviewed send is not configured

This is the expected current behavior when SMTP is missing.

Clawback now preflights execution before mutating review truth. That means:

- the review stays pending
- no fake approval-success state is recorded
- you must fix SMTP configuration first

Required env vars:

- `CLAWBACK_SMTP_HOST`
- `CLAWBACK_SMTP_PORT`
- `CLAWBACK_SMTP_FROM_ADDRESS`
- `CLAWBACK_SMTP_USERNAME`
- `CLAWBACK_SMTP_PASSWORD`

Then reconnect SMTP from `/workspace/connections`.

### Approved send later fails

If SMTP was configured but delivery failed:

- inspect the work item on `/workspace/work`
- inspect the review item on `/workspace/inbox`
- look for `Retry send`
- check control-plane logs for SMTP transport errors

## Connector / Retrieval Problems

### Connector sync does not index documents

Check:

- the root path exists
- the process can read it
- file extensions match the connector config
- the sync job shows completed rather than failed

Useful smoke:

```bash
pnpm smoke:connector-sync
```

### Retrieval smoke fails

Run:

```bash
pnpm smoke:incident-copilot
pnpm smoke:incident-copilot-action
```

If these fail, inspect:

- connector sync history
- runtime logs
- model credentials

## Docker / Deployment Problems

### Console container cannot reach the control plane

In the production Compose path, make sure:

```bash
CONTROL_PLANE_INTERNAL_URL=http://control-plane:3001
```

Without that, the console proxy may try loopback addresses that are wrong inside the container.

### Containers are up but the app is still unusable

Check:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f control-plane console runtime-worker
```

### Cookie or CORS issues in deployment

Confirm:

- `CONSOLE_ORIGIN` matches the public console URL exactly
- TLS terminates correctly at your reverse proxy
- the browser is actually hitting the console origin you configured

## Fast Recovery Loop

When in doubt, use this order:

1. `curl /healthz`
2. `curl /readyz`
3. `./scripts/verify-seed.sh`
4. `./scripts/public-try-verify.sh`
5. inspect `Inbox`, `Work`, and `Activity`
6. inspect container or process logs

## See Also

- [Verification and Testing](./verification-and-testing.md)
- [Deployment Guide](./deployment.md)
- [Known Limitations](./known-limitations.md)
