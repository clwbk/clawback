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

The stack includes:

- `postgres`
- `minio`
- `openclaw`
- `migrate`
- `control-plane`
- `runtime-worker`
- `console`

## 1. Prepare Environment Variables

Copy the production example file:

```bash
cp .env.prod.example .env
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

## 5. Verify the Control Plane

From the host or a trusted internal network path:

```bash
curl -s http://127.0.0.1:3001/healthz
curl -s http://127.0.0.1:3001/readyz
```

Expected:

- `/healthz` returns `200`
- `/readyz` returns `200` once Postgres and PgBoss are ready

## 6. Expose the Console

The recommended public entrypoint is the console on port `3000`, placed behind a reverse proxy or load balancer.

Recommended public pattern:

- expose the console publicly
- keep the control plane internal
- route webhook and browser `/api/*` traffic through the console's built-in proxy

This works because the console forwards `/api/...` requests to the control plane using `CONTROL_PLANE_INTERNAL_URL`.

## 7. Reverse Proxy Example

Minimal nginx example:

```nginx
server {
    listen 443 ssl http2;
    server_name clawback.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Set:

```bash
CONSOLE_ORIGIN=https://clawback.example.com
```

## 8. Bootstrap and Verify

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

## 9. Provider-Specific Notes

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

## 10. Backups and Recovery

Minimum operational stance:

- back up Postgres
- persist MinIO data if artifacts matter for your deployment
- keep the `.env` file and secrets recoverable

Clawback does not provide automatic backup orchestration yet.

## 11. Known Limits of This Deployment Shape

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
