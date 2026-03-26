# Quickstart

Zero to a working local Clawback stack in a few minutes.

## Prerequisites

- Node.js `22.12+`
- pnpm `10.29+`
- Docker with Compose v2
- One model provider API key in your shell, usually `OPENAI_API_KEY`

## Start the stack

```bash
git clone <repo-url> clawback
cd clawback
pnpm install
./scripts/start-local.sh
```

This starts:

- Postgres on `5433`
- MinIO on `9000` / `9001`
- OpenClaw on `18889` (`start-local.sh` remaps from the default `18789` to avoid port conflicts)
- Console on `3000`
- Control plane on `3011` (`start-local.sh` remaps from the default `3001` to avoid port conflicts; `pnpm dev` uses `3001`)

## Create an admin account

Open [http://localhost:3000/setup](http://localhost:3000/setup) and bootstrap the first workspace admin.

Suggested local values:

- Workspace name: `Local Dev`
- Workspace slug: `local`
- Email: `admin@example.com`
- Display name: `Admin`
- Password: `password1`

## Load the demo workspace

If you want realistic sample data right away:

```bash
pnpm --filter @clawback/db seed
```

Then sign in as:

- `dave@hartwell.com`
- `demo1234`

## What to open first

- `/workspace/workers` to install or inspect workers
- `/workspace/inbox` to review gated actions and suggestions
- `/workspace/work` to inspect durable outputs and execution state
- `/workspace/activity` to read the audit trail
- `/workspace/connections` to manage the seeded Gmail, SMTP, Calendar, and Drive connections
- `/workspace/connectors` to inspect the seeded `Company Docs` connector or add another local-directory connector for retrieval

## Run the main verification flow

```bash
pnpm smoke:public-try
```

This exercises the real ingress and reviewed-send paths. It is the fastest honest check that the local stack is healthy.

## Next steps

- [Getting Started](./getting-started.md)
- [First-Run Guide](./first-run.md)
- [Admin Guide](./admin-guide.md)
- [Verification and Testing](./verification-and-testing.md)
- [Known Limitations](./known-limitations.md)
