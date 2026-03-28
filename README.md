# Clawback

**AI workers for small teams — with a human in the loop where it matters.**

Clawback gives your team AI-powered workers that handle repetitive work —
following up with clients, drafting proposals, triaging issues — while keeping
a human checkpoint on anything consequential. It's the missing layer between
"AI can do this" and "I trust AI to do this for my team."

## The Problem

Small teams are stuck between two bad options:

1. **Generic AI chat** (ChatGPT, etc.) — useful but disconnected from your
   work. Can't access your email, can't send on your behalf, can't remember
   your clients.
2. **Enterprise AI platforms** — powerful but built for 500-person companies
   with compliance teams and six-figure budgets.

Whether you're a 10-person consulting firm or an ops team inside a larger
company, the problem is the same: you want AI to actually do work — not just
answer questions — without losing control.

## How It Works

**Workers** are AI teammates that do specific jobs for your team:

- **Client Follow-Up** — watches your inbox, drafts follow-up emails, surfaces
  them for your review before sending
- **Proposal Assistant** — takes an RFP or project description and produces a
  first-draft proposal
- More workers coming: incident triage, meeting recaps, ticket management

**The trust ladder** — you decide how much autonomy each worker gets:

1. **Shadow mode** — the worker watches and suggests, but never acts
2. **Ask me** — the worker drafts, then waits for your approval before sending
3. **Auto** — for low-risk actions you've learned to trust

**Your team sees everything** — a shared workspace where everyone can see what
workers are doing, what's waiting for review, and what's been sent. No black
boxes.

## What Makes Clawback Different

Most AI tools either give you a chatbot or a dashboard that shows you what
already happened. Clawback does something different: it **stops the AI
mid-action and asks permission** before doing anything that matters.

- Draft an email? The worker pauses and puts it in your inbox for review.
- Approve it? One click — the worker sends it.
- Don't like it? Edit or reject. Nothing leaves your team without a human
  decision.

This is runtime mediation — and no other tool in this space does it.

## Who It's For

- **Small teams** (3-50 people) who want AI automation but can't afford
  mistakes — whether that's a whole company or a team inside a larger one
- **Service businesses** — agencies, consultancies, law firms, accounting
  practices — where client communication is high-volume and high-stakes
- **Ops teams** inside mid-market companies who need AI help without waiting
  for enterprise-wide rollouts
- **Team leads** who want visibility into what AI is doing on behalf of
  their team

## Quick Start (Local Development)

> **Want the TL;DR?** See the [Quickstart Guide](docs/guides/quickstart.md) — zero to running in under 5 minutes.

```bash
git clone https://github.com/clwbk/clawback.git clawback
cd clawback
pnpm install                # install dependencies
./scripts/start-local.sh    # start everything (infra + services)
pnpm smoke:public-try       # run the main public verification flow
```

Or step by step:

```bash
pnpm compose:up             # Docker: Postgres, MinIO, OpenClaw
pnpm db:migrate             # run database migrations
pnpm dev                    # start console (3000) + control-plane (3001) + runtime worker
```

Then open `http://localhost:3000/setup` to create the first admin account.

### Test Credentials

No hardcoded defaults. Visit `/setup` on first launch to bootstrap.

| Field          | Suggested value   |
| -------------- | ----------------- |
| Workspace name | `Local Dev`       |
| Workspace slug | `local`           |
| Email          | `admin@example.com` |
| Display name   | `Admin`             |
| Password       | `password1`         |

> **Note:** The email field uses standard email validation (`z.email()`), so bare hostnames like `admin@localhost` will be rejected. Use a full domain. The password must be at least 8 characters. Alternatively, load the demo seed (`pnpm --filter @clawback/db seed`) and log in as `dave@hartwell.com` / `demo1234`.

### Commands

```bash
pnpm install          # install dependencies
pnpm build            # build all packages
pnpm typecheck        # type-check everything
pnpm test             # run tests
pnpm test:console:e2e # browser-level smoke tests (needs running console)
```

See the [full development guide](#development-details) below for smoke tests,
Docker configuration, and runtime setup.

## Documentation

- [`docs/what-is-clawback.md`](docs/what-is-clawback.md) — Product overview
  (non-technical, shareable)
- [`docs/beta/public-tryability-milestone.md`](docs/beta/public-tryability-milestone.md) — Current
  public beta scope
- [`docs/beta/0.4-signoff-2026-03-26.md`](docs/beta/0.4-signoff-2026-03-26.md) — Current beta
  signoff
- [`docs/guides/getting-started.md`](docs/guides/getting-started.md) — First
  walkthrough
- [`docs/guides/admin-guide.md`](docs/guides/admin-guide.md) — Workspace admin
  guide
- [`docs/guides/verification-and-testing.md`](docs/guides/verification-and-testing.md) — Smoke tests and verification
- [`docs/guides/known-limitations.md`](docs/guides/known-limitations.md) — Honest current limits
- [`docs/guides/deployment.md`](docs/guides/deployment.md) — Production
  deployment
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contribution guide
- [`SECURITY.md`](./SECURITY.md) — Security reporting guidance
- [`LICENSE`](./LICENSE) — MIT license

## Architecture

Clawback is a TypeScript monorepo:

- `apps/console` — Next.js frontend (the workspace UI)
- `services/control-plane` — Fastify API (workers, reviews, actions)
- `packages/contracts` — shared types between frontend and backend
- `packages/db` — Drizzle ORM schema and queries (Postgres)

Workers run on [OpenClaw](https://github.com/openclaw/openclaw), an open-source
agent runtime. Clawback adds the governance, review, and workspace layers on
top.

## Current Status

The core worker-first platform is functional: auth, workspace setup, workers,
inbox, work, reviews, execution truth, activity, connectors, and provider-backed
surfaces like Gmail read-only, SMTP reviewed send, Slack approval, and n8n
handoff. The strongest current story is the governed worker loop, not broad
provider breadth.

See [`docs/beta/public-tryability-milestone.md`](docs/beta/public-tryability-milestone.md)
for the current public beta contract and
[`docs/beta/0.4-signoff-2026-03-26.md`](docs/beta/0.4-signoff-2026-03-26.md)
for current acceptance status.

## Design Principles

- Safe by default, powerful by choice
- One human decision, one real outcome
- Small-team deployment without custom infrastructure
- Every important action is attributable
- Operators should understand what the system is doing without
  reverse-engineering it

---

## Development Details

<details>
<summary>Smoke tests, Docker config, OpenClaw setup, and runtime details</summary>

### Smoke Tests

`pnpm test:console:e2e` runs browser-level smoke tests against a running
console. Targets `http://127.0.0.1:3000` by default with
`admin@example.com` / `demo1234`. Override with `CONSOLE_E2E_BASE_URL`,
`CONSOLE_E2E_EMAIL`, `CONSOLE_E2E_PASSWORD`.

`pnpm smoke:connector-sync` creates a local-directory connector pointed at
`testdata/connectors/smoke-knowledge-base`, requests a sync, and waits for
completion.

`pnpm smoke:incident-copilot` does the same for the Incident Copilot demo
fixture and verifies the stored connector root path.

`pnpm smoke:incident-copilot-action` runs the full governed Incident Copilot
path: question, retrieval-backed answer, `draft_ticket`, approval, and
`create_ticket` confirmation.

### Database

Default Postgres port is `5433` (not `5432`) to avoid conflicts with host
Postgres. `pnpm compose:up` waits for container health before returning.

```bash
pnpm compose:up         # start all containers
pnpm compose:up:core    # just Postgres + MinIO
pnpm compose:down       # stop containers
pnpm db:migrate         # run migrations
pnpm db:seed            # seed admin user
```

`pnpm db:seed` ensures a local-password identity for the seeded admin. Override
with `SEED_ADMIN_PASSWORD`.

### OpenClaw Runtime

The recommended public local dev path:

- Docker for `postgres`, `minio`, and `openclaw`
- Host-run control-plane/runtime-worker via `pnpm dev`

If you also keep a sibling `../openclaw` checkout, `./scripts/start-local.sh`
will automatically prefer the host-run OpenClaw gateway for faster iteration.

Compose scripts auto-prepare `.runtime/openclaw/config` and
`.runtime/openclaw/workspace` for bind mounting. They also seed a minimal
`openclaw.json` and sync plugins from `openclaw-plugins/` into
`.runtime/openclaw/config/extensions`.

Model credentials: Clawback materializes per-worker OpenClaw
`auth-profiles.json` files pointing at provider env vars like
`OPENAI_API_KEY`.

`CLAWBACK_RUNTIME_API_TOKEN` defaults to
`clawback-local-runtime-api-token`. Override in `infra/compose/.env`.

`OPENCLAW_IMAGE` defaults to `ghcr.io/openclaw/openclaw:latest`. Override
in `infra/compose/.env` for other tags.

### Local Runtime Controls

When logged in as workspace admin, `/workspace` includes:

- **Restart OpenClaw** — restarts the host gateway (disabled in recommended
  host-gateway dev path)
- **Restart Runtime Worker** — touches the watched entrypoint and waits for
  heartbeat refresh

</details>
