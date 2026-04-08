# Quickstart

Zero to a working local Clawback stack in a few minutes.

## Prerequisites

- Node.js `22.12+`
- pnpm `10.29+`
- Docker with Compose v2
- One model provider API key in your shell, usually `OPENAI_API_KEY`

## Start the stack

```bash
git clone https://github.com/clwbk/clawback.git clawback
cd clawback
pnpm install
./scripts/start-local.sh
```

This starts:

- Postgres on `5433`
- MinIO on `9000` / `9001`
- OpenClaw on `18889`
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
pnpm db:seed
```

Then sign in as:

- `dave@hartwell.com`
- `demo1234`

## Choose a first-run proof

For the new worker-first admin path:

- open `/workspace/setup`
- click `Run sample activity`
- land on the follow-up worker proof rail
- run the sample intake if fresh inbox/work state is not already present

For the retrieval-first no-Google path:

- open `/workspace/connectors`
- confirm the seeded `Incident Copilot Demo` sync is complete
- open `/workspace/chat`
- use `Incident Copilot`

## What to open first

- `/workspace/setup` for the worker-first activation and proof path
- `/workspace/workers` to install or inspect workers
- `/workspace/inbox` to review gated actions and suggestions
- `/workspace/work` to inspect durable outputs and execution state
- `/workspace/activity` to read the audit trail
- `/workspace/connections` to manage the seeded Gmail, SMTP, Calendar, and Drive connections
- `/workspace/connectors` to inspect the seeded `Incident Copilot Demo` connector or add another local-directory connector for retrieval

## Run the main verification flow

```bash
pnpm smoke:public-try
```

This exercises the real ingress and reviewed-send paths. It is the fastest honest check that the local stack is healthy.

Notes:

- `./scripts/start-local.sh` automatically builds the shared packages before entering watch mode.
- If a sibling `../openclaw` checkout is present, the script prefers host-run OpenClaw. Otherwise it uses the repo-contained Docker OpenClaw path automatically.

## Next steps

- [Start Here](./start-here.md)
- [Demo Walkthrough](./demo-walkthrough.md)
- [Getting Started](./getting-started.md)
- [First-Run Guide](./first-run.md)
- [Admin Guide](./admin-guide.md)
- [Verification and Testing](./verification-and-testing.md)
- [Known Limitations](./known-limitations.md)
