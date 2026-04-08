# Verification and Testing

How to prove a local or self-hosted Clawback deployment is actually working.

**Audience:** Operators, evaluators, and contributors validating the current product.

## Fastest Honest Verification

Run:

```bash
pnpm smoke:public-try
```

That is the public entrypoint for the main verification flow. It runs the core ingress and review path checks in sequence.

For the browser-level worker-first proof that now exists in the console UI, run:

```bash
pnpm --filter @clawback/console exec playwright test \
  e2e/worker-demo-proof.e2e.ts
```

To target a hosted demo or deployed site instead of local dev, set
`CONSOLE_E2E_BASE_URL` and the relevant credentials:

```bash
CONSOLE_E2E_BASE_URL=https://demo.clawback.team \
CONSOLE_E2E_EMAIL=evaluator@hartwell.com \
CONSOLE_E2E_PASSWORD=publicdemo1 \
pnpm test:console:demo-evaluator:e2e

CONSOLE_E2E_BASE_URL=https://demo.clawback.team \
CONSOLE_E2E_ADMIN_EMAIL=... \
CONSOLE_E2E_ADMIN_PASSWORD=... \
pnpm test:console:demo-admin:e2e
```

If the hosted admin login unexpectedly fails while the evaluator login still
works, reapply the demo seed on the host before treating it as a product
regression. The seeded Hartwell admin is `dave@hartwell.com`, and the normal
seed path restores that account's expected password hash.

There is also a manual GitHub Actions workflow for the same hosted-browser
checks:

- workflow: `Hosted Demo Browser Smoke`
- required secrets: `DEMO_EVALUATOR_EMAIL`, `DEMO_EVALUATOR_PASSWORD`
- optional admin secrets: `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`

## 5-Minute Smoke Test

### 1. Check process health

The control-plane port depends on how the stack was started: `./scripts/start-local.sh` uses **3011**, while `pnpm dev` uses **3001**.

```bash
# start-local.sh (default):
curl -s http://localhost:3011/healthz
curl -s http://localhost:3011/readyz

# pnpm dev:
curl -s http://localhost:3001/healthz
curl -s http://localhost:3001/readyz
```

Expected:

- `/healthz` returns `200`
- `/readyz` returns `200` once Postgres and PgBoss are available
- admin setup reports runtime readiness, including gateway reachability and the
  expected model-provider key state

### 2. Seed demo data if you want a realistic workspace

```bash
pnpm db:seed
```

### 3. Log in as the demo admin

Adjust the port to match your stack (`3011` for `start-local.sh`, `3001` for `pnpm dev`).

```bash
curl -s -c /tmp/clawback-cookies.txt \
  -X POST http://localhost:3011/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dave@hartwell.com","password":"demo1234"}'
```

### 4. Confirm the main workspace APIs respond

```bash
curl -s -b /tmp/clawback-cookies.txt http://localhost:3011/api/workspace/workers
curl -s -b /tmp/clawback-cookies.txt http://localhost:3011/api/workspace/inbox
curl -s -b /tmp/clawback-cookies.txt http://localhost:3011/api/workspace/work
curl -s -b /tmp/clawback-cookies.txt http://localhost:3011/api/workspace/activity
```

### 5. Run the full scripted verification

```bash
./scripts/public-try-verify.sh
```

The verifier treats Gmail watched inbox as optional: if the seeded Gmail
read-only connection is absent or not connected, that portion is skipped rather
than counted as a public-try failure.

For a deployed stack rather than local dev mode, run:

```bash
CONTROL_PLANE_URL=https://clawback.example.com \
CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN=... \
./scripts/public-try-verify.sh
```

The inbound webhook token is required for the forward-email portion of the
public-try path. On a no-SMTP deployment, the verifier also skips approval if
the pending review is `send_email`; denial still runs so review resolution is
still proven.

## Main Flow Scripts

### Seed verification

```bash
./scripts/verify-seed.sh
```

Checks that the main workspace resources are present.

### Forward email

```bash
./scripts/test-forward-email.sh
```

Verifies:

- inbound Postmark-style webhook handling
- work item creation
- review creation
- idempotency on duplicate delivery

### Watched inbox

```bash
./scripts/test-watched-inbox.sh
```

Verifies the Gmail watch-hook path and its idempotency behavior.

### Review resolution

```bash
./scripts/test-approve-review.sh
./scripts/test-approve-review.sh deny
```

Verifies approved and denied review flows.

### Reviewed send

```bash
./scripts/test-smtp-send.sh
```

This tests the full reviewed-send loop:

1. check SMTP relay configuration status via `/smtp-status` endpoint
2. activate the seeded SMTP connection automatically when env vars are present
3. create a review from forwarded email
4. approve the specific review tied to that work item
5. inspect exact post-approval execution truth for that work item
6. assert scoped activity events (`work_item_sent`, `send_failed`, `review_approved`)

The script provides early feedback on SMTP readiness before attempting the send,
and after resolution it checks the activity stream for specific outcome events so
the operator knows whether delivery was confirmed, failed, or not yet recorded.

Current honest behavior:

- approval authorizes the action; delivery depends on the configured transport
- if SMTP is configured and reachable, execution should progress to `completed` and a `work_item_sent` activity event appears
- if SMTP is absent or unreachable, execution progresses to `failed` with an error classification (transient or permanent), a `send_failed` event is recorded, and the failure is visible in the UI
- failure after approval is recoverable — the UI exposes retry, and retry is safe (attempt counter increments, no double-send)

## Retrieval and Connector Verification

These commands cover the public retrieval proof that exists today:

```bash
pnpm smoke:connector-sync
pnpm smoke:incident-copilot
pnpm smoke:incident-copilot-action
```

What they prove:

- local-directory connectors can be created and synced
- retrieval-backed answers can be grounded in synced content
- a governed action can still run on top of that retrieval-backed worker flow

Read [Known Limitations](./known-limitations.md) and
[Demo Walkthrough](./demo-walkthrough.md) for the current public retrieval
story and its limits.

## Browser Proof Paths

### Worker-first admin proof

1. Sign in as `dave@hartwell.com` / `demo1234`
2. Open `/workspace/setup`
3. Click `Run sample activity`
4. On the worker proof rail, either open the latest inbox/work item or run the sample activity button
5. Confirm you land in real `/workspace/inbox`, `/workspace/work/:id`, or `/workspace/activity` state

That path proves the current worker-first setup flow is alive in the UI and not
just in backend scripts.

### Retrieval-first evaluator proof

1. Open `/workspace/connectors`
2. Confirm the seeded `Incident Copilot Demo` connector has a completed sync
3. Open `/workspace/chat`
4. Use `Incident Copilot`
5. Inspect the resulting review/work state in `/workspace/inbox` and `/workspace/work`

That path proves the no-Google retrieval story still works alongside the
worker-first admin path.

## Script Reference

| Script | Purpose |
| --- | --- |
| `scripts/public-try-verify.sh` | Main public verification entrypoint |
| `scripts/pilot-verify.sh` | Compatibility alias for the same verification flow |
| `scripts/verify-seed.sh` | Checks seeded demo data and workspace APIs |
| `scripts/test-forward-email.sh` | Tests the forward-email webhook path |
| `scripts/test-watched-inbox.sh` | Tests the Gmail watch path |
| `scripts/test-approve-review.sh` | Resolves a pending review |
| `scripts/test-smtp-send.sh` | Tests reviewed send and execution truth |
| `scripts/test-deployed-stack.sh` | Boots the supported prod Compose stack from scratch, seeds it, runs the public-try verifier, then tears it down |
| `scripts/test-migration-proof.sh` | Proves the Drizzle migration chain works on a fresh Postgres instance |

## Post-Deployment Checklist

After deploying with `docker-compose.prod.yml`, verify:

### Platform

- [ ] `docker compose ps` shows healthy containers
- [ ] `/healthz` returns `200`
- [ ] `/readyz` returns `200`
- [ ] admin setup shows runtime readiness as `ready`, or any degraded/blocked
  state is understood and intentional
- [ ] the console loads in a browser
- [ ] login succeeds

### Workspace

- [ ] workers are visible on `/workspace/workers`
- [ ] inbox items render on `/workspace/inbox`
- [ ] work items render on `/workspace/work`
- [ ] activity events render on `/workspace/activity`

### Providers

- [ ] forward-email webhook works if configured
- [ ] Gmail setup card works if configured
- [ ] SMTP relay status is truthful if configured

### Hosted browser proof

- [ ] `pnpm test:console:demo-evaluator:e2e` passes against the public demo URL
- [ ] `pnpm test:console:demo-admin:e2e` passes against the admin demo URL when admin creds are available

### Security / config

- [ ] `COOKIE_SECRET` is not the default
- [ ] `CONSOLE_ORIGIN` matches the public console URL
- [ ] `CONTROL_PLANE_INTERNAL_URL` points at the control-plane service from the console container
- [ ] Postgres is not exposed more broadly than intended

## Useful Test Commands

For current backend acceptance coverage:

```bash
pnpm --filter @clawback/control-plane exec vitest run \
  src/e2e/http-acceptance.test.ts \
  src/e2e/full-flows.test.ts \
  src/hardening/api-boundaries.test.ts \
  src/workspace-routes.test.ts
```

For build verification:

```bash
pnpm --filter @clawback/control-plane build
pnpm --filter @clawback/console build
```

For higher-signal whole-system checks that go beyond backend Vitest:

```bash
pnpm test:console
pnpm test:env
pnpm test:console:first-run:e2e
pnpm --filter @clawback/console exec playwright test e2e/worker-demo-proof.e2e.ts
pnpm --filter @clawback/db test
pnpm test:migration-proof
pnpm test:deployed-stack
```

What these add:

- `pnpm test:console` covers console rendering and route-adjacent client logic
- `pnpm test:env` covers environment parsing that the default root `pnpm test`
  currently skips
- `pnpm test:console:first-run:e2e` proves the seeded no-Google knowledge path
  is discoverable in the actual browser UI
- `pnpm --filter @clawback/console exec playwright test e2e/worker-demo-proof.e2e.ts`
  proves the setup page can reach the worker proof rail and open real product
  state from there
- `pnpm --filter @clawback/db test` statically checks the migration journal and
  catches duplicate-column and journal-integrity issues
- `pnpm test:migration-proof` proves the migration chain works against a fresh
  throwaway Postgres instance
- `pnpm test:deployed-stack` proves the supported prod Compose path can boot,
  seed, and pass the public-try verifier end to end

## See Also

- [Deployment Guide](./deployment.md)
- [Troubleshooting](./troubleshooting.md)
- [Known Limitations](./known-limitations.md)
- [Demo Walkthrough](./demo-walkthrough.md)
