# Deployment Guide

How to run Clawback as a public self-hosted single-node deployment.

**Audience:** Operators deploying Clawback on a VM or single host.

## Deployment Posture

The supported deployment shape today is:

- self-hosted
- single node
- Docker Compose first
- console exposed publicly
- control plane kept internal when possible

Clawback is not currently a multi-node or HA product.

## What Ships

The production packaging currently lives in:

- `docker-compose.prod.yml`
- `.env.prod.example`
- `services/control-plane/Dockerfile`
- `services/runtime-worker/Dockerfile`
- `apps/console/Dockerfile`
- `infra/caddy/Caddyfile`

The stack includes:

- `postgres`
- `minio`
- `openclaw`
- `migrate`
- `control-plane`
- `runtime-worker`
- `console`
- `caddy` (TLS reverse proxy)

## 1. Prepare Environment Variables

Copy the production example file:

```bash
cp .env.prod.example .env
```

Or generate a ready-to-edit production env file with strong random secrets:

```bash
pnpm generate:prod-env -- --domain demo.clawback.team --output .env
```

At minimum, set strong values for:

- `POSTGRES_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `OPENCLAW_GATEWAY_TOKEN`
- one model provider key, usually `OPENAI_API_KEY`
- `COOKIE_SECRET`
- `CLAWBACK_RUNTIME_API_TOKEN`
- `CLAWBACK_APPROVAL_SURFACE_SECRET`
- `CONSOLE_ORIGIN`
- `CLAWBACK_DOMAIN`

For the provided Compose file, keep:

```bash
CONTROL_PLANE_INTERNAL_URL=http://control-plane:3001
```

That is what allows the console container to proxy browser and webhook traffic to the control plane.

## 2. Optional Provider Secrets

Only set these if you are using the related provider:

- `CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN`
- `CLAWBACK_GMAIL_WATCH_HOOK_TOKEN`
- `CLAWBACK_SMTP_*`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `WHATSAPP_*`

Important product truth:

- Gmail is optional
- SMTP is optional until you want real reviewed email delivery
- forward-email and local retrieval remain valid first-value paths without Gmail

Operator note:

- `CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN` is optional for the product overall,
  but required if you want the deployed forward-email webhook path to work or
  if you want to run `./scripts/public-try-verify.sh` against the deployed stack

## 3. Build and Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

The `migrate` service runs database migrations before the control plane starts.

## 4. Verify Container Health

Check container status:

```bash
docker compose -f docker-compose.prod.yml ps
```

The following services define Dockerfile-level healthchecks and will report `healthy` or `unhealthy` in the status column:

- `postgres` — `pg_isready`
- `openclaw` — `node dist/index.js health`
- `control-plane` — HTTP probe against `/healthz` on port 3001
- `runtime-worker` — runs `services/runtime-worker/dist/healthcheck.js`

The `console` service depends on `control-plane` being healthy. The `control-plane` and `runtime-worker` services depend on `postgres` and `openclaw` being healthy, and on `migrate` completing successfully.

Check logs if anything looks wrong:

```bash
docker compose -f docker-compose.prod.yml logs -f control-plane console runtime-worker
```

If you are still deciding between the shared demo, local quickstart, and this
deployment path, read [Start Here](./start-here.md) first.

## Fresh VM Rehearsal

If you want to prove the current single-node deployment path on a fresh
Ubuntu/Debian VM before doing a real rollout, use the remote rehearsal script
from your local checkout:

```bash
./scripts/test-remote-stack.sh --host root@<vm-ip>
```

If you are using Hetzner Cloud specifically, you can also provision the
rehearsal VM from your local machine first:

```bash
HCLOUD_TOKEN=... ./scripts/provision-hetzner-rehearsal.sh
```

Before a real Hetzner + TLS rollout, you can also run a local preflight to see
exactly what is still missing:

```bash
pnpm check:hetzner-deploy
```

This bootstraps Docker on the remote host, syncs the current repo snapshot, and
runs the existing deployed-stack acceptance flow there.

What it proves:

- the host can be prepared for the supported Compose deployment
- the production stack builds and reaches health on a fresh VM
- seeding and the no-Google public-try path still pass remotely

What it does not prove:

- TLS / reverse proxy (Caddy is in the compose file but needs a real domain)
- SMTP-backed reviewed-send delivery
- Gmail-connected acceptance
- persistent deployment with a retained `.env`

## Updating An Existing Remote Host

If you already have a VM running the supported production Compose stack and
just want to push the current checkout onto it, use:

```bash
./scripts/deploy-remote-stack.sh --host user@host
```

Common options:

```bash
./scripts/deploy-remote-stack.sh \
  --host user@host \
  --identity ~/.ssh/id_ed25519 \
  --workspace ~/clawback-deploy \
  --env-file .env
```

This syncs the current repo snapshot, preserves the remote `.env`, and runs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Use `--skip-rsync` if the remote workspace is already current and you only want
to restart, or `--no-build` if you explicitly want to reuse the images already
present on the host.

## 5. Verify the Control Plane

From the host or a trusted internal network path:

```bash
curl -s http://127.0.0.1:3001/healthz
curl -s http://127.0.0.1:3001/readyz
```

Expected:

- `/healthz` returns `200`
- `/readyz` returns `200` once Postgres and PgBoss are ready

## 6. TLS and Reverse Proxy

The production compose file includes a Caddy reverse proxy that terminates TLS
automatically via Let's Encrypt. This is the recommended path for single-node
deployments.

### Why Caddy

Caddy was chosen over nginx for this deployment shape because:

- Automatic ACME certificate provisioning and renewal with zero extra config
- No certbot sidecar, no cron jobs, no manual cert-path plumbing
- Minimal config surface (~10 lines vs ~40 for nginx + certbot)
- HTTP-to-HTTPS redirect is automatic

The only requirement is that the host's DNS A record points to the VM and ports
80/443 are reachable from the internet.

### Architecture

```
Internet -> :443 (Caddy, TLS) -> console:3000 -> control-plane:3001
                                  (internal Docker network)
```

- Caddy is the only service bound to public ports (80 and 443)
- The console and control-plane ports are bound to `127.0.0.1` only
- The console already proxies `/api/*` to the control plane internally via
  `CONTROL_PLANE_INTERNAL_URL`, so Caddy only needs to reach the console
- SSE streams (`/api/runs/*/stream`) are handled with unbuffered flushing

### Setup

1. Set `CLAWBACK_DOMAIN` in your `.env` to the public hostname:

```bash
CLAWBACK_DOMAIN=clawback.example.com
CONSOLE_ORIGIN=https://clawback.example.com
```

2. Ensure DNS is pointing to the host:

```bash
dig +short clawback.example.com   # should return the VM's public IP
```

3. Ensure ports 80 and 443 are open in your firewall / security group.

4. Start the stack:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Caddy will automatically obtain a TLS certificate on first request. You can
watch the ACME handshake:

```bash
docker compose -f docker-compose.prod.yml logs -f caddy
```

### Verifying TLS

```bash
curl -I https://clawback.example.com
```

Expected: HTTP 200 with a valid TLS certificate.

### Certificate Persistence

Certificates are stored in the `caddy-data` Docker volume. As long as this
volume is retained across restarts, Caddy will not re-request certificates.

### Skipping Caddy

If you are placing Clawback behind an existing load balancer or CDN that already
terminates TLS, you can remove the `caddy` service from the compose file and
change the console port binding back to `"${CONSOLE_PORT:-3000}:3000"` (removing
the `127.0.0.1` prefix).

### Custom Caddyfile

The Caddyfile lives at `infra/caddy/Caddyfile` and is mounted read-only. To
customize (e.g. add rate limiting, custom headers, or additional domains), edit
that file and restart the caddy service:

```bash
docker compose -f docker-compose.prod.yml restart caddy
```

## 7. Bootstrap and Verify

On a fresh database:

1. open `https://clawback.example.com/setup`
2. create the first admin
3. log in
4. optionally seed demo data if this is an evaluation environment
5. run the public verification flow

For a real smoke verification:

```bash
pnpm smoke:public-try
```

If you are running from a built host rather than a dev shell, invoke the script directly against the deployed URL:

```bash
CONTROL_PLANE_URL=https://clawback.example.com ./scripts/public-try-verify.sh
```

For the full no-Google verification path, also export the inbound webhook token
used by your deployment:

```bash
CONTROL_PLANE_URL=https://clawback.example.com \
CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN=... \
./scripts/public-try-verify.sh
```

Current honest verifier behavior on a no-SMTP deployment:

- watched inbox is skipped if Gmail is not connected
- review approval is skipped if the pending review is `send_email` and SMTP is
  not connected
- denial still runs, so the review-resolution path is exercised even on the
  no-SMTP public-try story

## 8. Provider-Specific Notes

### Gmail

Gmail setup happens in-product from `/workspace/connections`.

What is required:

- an operator-supplied Google OAuth app or service account
- attaching the Gmail connection to the right worker
- running `Check inbox now` to establish or advance monitoring

### SMTP

SMTP requires server-side environment variables before the relay can be marked connected from the UI.

### Webhooks

Webhook-style integrations can target the public console origin under `/api/...`, because the console proxies those requests through to the control plane.

Examples:

- `/api/inbound/email/postmark`
- `/api/inbound/gmail-watch/...`
- `/api/webhooks/n8n/...`

## 9. Backups and Recovery

Minimum operational stance:

- back up Postgres
- persist MinIO data if artifacts matter for your deployment
- keep the `.env` file and secrets recoverable

Clawback does not provide automatic backup orchestration yet.

## 10. Known Limits of This Deployment Shape

This deployment guide is honest to the current product:

- single-node only
- no HA or clustering
- no built-in metrics stack
- no built-in managed secret store
- no published container registry images yet

Read [Known Limitations](./known-limitations.md) before making broader production promises.

## See Also

- [Getting Started](./getting-started.md)
- [Verification and Testing](./verification-and-testing.md)
- [Troubleshooting](./troubleshooting.md)
- [Known Limitations](./known-limitations.md)
