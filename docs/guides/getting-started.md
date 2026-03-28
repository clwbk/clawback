# Getting Started with Clawback

How to run Clawback locally, understand the current product shape, and get to first value.

**Audience:** Admins, evaluators, and contributors setting up Clawback for the first time.

## What Clawback Is

Clawback is a self-hosted AI worker control plane. The core product is not a Gmail app or a chat wrapper. It is a governed workspace where:

- workers are installed and configured in-product
- source events become durable inbox and work items
- reviews gate consequential actions
- execution state and outcomes stay visible
- providers like Gmail, SMTP, Slack, and n8n plug into that shared truth

The main operator surfaces today are:

- `Today`
- `Workers`
- `Inbox`
- `Work`
- `Activity`
- `Connections`
- `Connectors`
- `Setup`

## Prerequisites

| Requirement | Minimum | Notes |
| --- | --- | --- |
| Node.js | `22.12` | Required for local development |
| pnpm | `10.29` | Workspace package manager |
| Docker | recent | Must be running |
| Model credentials | one provider key | Usually `OPENAI_API_KEY` |

Clawback can start without Gmail, SMTP, or Slack. Gmail is optional for first value.

## Local Start

### 1. Clone and install

```bash
git clone https://github.com/clwbk/clawback.git clawback
cd clawback
pnpm install
```

### 2. Export a model provider key

```bash
export OPENAI_API_KEY=sk-...
```

New workers can be installed without this, but runtime execution will fail once a worker needs model inference.

### 3. Start the stack

```bash
./scripts/start-local.sh
```

This starts Postgres, MinIO, OpenClaw, the control plane, the runtime worker, and the console.
If a sibling `../openclaw` checkout is present, Clawback uses it for the
gateway; otherwise the script falls back to the repo-contained Docker OpenClaw
service automatically.

### 4. Bootstrap the first admin

Open [http://localhost:3000/setup](http://localhost:3000/setup) and create the first workspace admin.

Suggested local values:

- Workspace name: `Local Dev`
- Workspace slug: `local`
- Email: `admin@example.com`
- Display name: `Admin`
- Password: `password1`

### 5. Load the demo workspace

If you want realistic sample data immediately:

```bash
pnpm db:seed
```

Demo login:

- Email: `dave@hartwell.com`
- Password: `demo1234`

## The Current Product Shape

Clawback is worker-first.

### Workers

Workers are installed from templates on `/workspace/workers`.

Each worker owns:

- people
- input routes
- attached connections
- action capabilities
- action boundary posture

The current install flow is:

1. Open `Workers`
2. Click `Add worker`
3. Choose a worker template
4. Name it
5. Open the worker page
6. Assign members, assignees, and reviewers
7. Attach any required connections
8. Confirm the action posture

### Inbox

`/workspace/inbox` is where operators and reviewers handle:

- pending reviews
- route handoff suggestions
- setup items
- execution failures that need attention

### Work

`/workspace/work` shows durable outputs:

- email drafts
- proposal drafts
- saved work
- route-created downstream work

It also shows execution state and final outcome truth.

### Activity

`/workspace/activity` is the audit trail for what workers observed, drafted, reviewed, routed, completed, or failed.

### Connections

`/workspace/connections` is where providers are configured.

Current first-party references:

- Gmail read-only
- SMTP relay
- Slack approval surface
- n8n outbound + callback
- Drive / GitHub / WhatsApp as narrower or evolving provider surfaces

### Connectors

`/workspace/connectors` is the low-trust retrieval path today. The most important current connector is a local directory sync for document retrieval.

## First Value Paths

Clawback should provide first value even without Gmail.

### Path A: Forwarded email

This is the simplest first-value path:

1. Keep the seeded `followup@...` route or configure a forward-email route
2. Send a forwarded email into the Postmark-style webhook
3. Observe the worker create work and a pending review
4. Approve or deny in `Inbox`

Use:

```bash
./scripts/test-forward-email.sh
./scripts/test-approve-review.sh
```

### Path B: Local retrieval

This is the simplest no-trust context path:

1. Open `/workspace/connectors` and inspect the seeded `Company Docs` connector
2. Confirm it already has a completed sync job after `pnpm db:seed`
3. Run the retrieval smokes against that seeded corpus
4. Add another local-directory connector only if you want to try a different document set

Useful smoke commands:

```bash
pnpm smoke:connector-sync
pnpm smoke:incident-copilot
pnpm smoke:incident-copilot-action
```

### Path C: Gmail read-only watch

Gmail is optional but supported as a provider:

1. Open `/workspace/connections`
2. Configure Gmail via `Connect with Google`, service account, or manual credentials
3. Attach the connection to a worker that has a `watched_inbox` route
4. Use `Check inbox now` to establish the first baseline and later poll for shadow suggestions

Gmail remains read-only. Reviewed sends still use SMTP.

## Reviewed Actions

The core reviewed-send flow is:

1. A worker drafts an action
2. Clawback creates a pending review
3. A human approves or denies it
4. If approved, Clawback checks whether the execution path is actually configured
5. If execution is configured, it runs and records outcome truth
6. If execution is not configured, the review stays pending and the operator sees the configuration gap

Important current behavior:

- `approved` is not the same thing as `completed`
- execution can fail after approval
- failed reviewed sends can be retried from the review/work surfaces

## A Good First Session

Use this sequence:

1. Start the stack with `./scripts/start-local.sh`
2. Seed demo data with `pnpm db:seed`
3. Log in as `dave@hartwell.com`
4. Open `Workers`, `Inbox`, `Work`, and `Activity`
5. Run `pnpm smoke:public-try`
6. Inspect the seeded `Company Docs` connector and run the retrieval smokes
7. Optionally connect Gmail or SMTP from `Connections`
8. Optionally add another local-directory connector if you want a different corpus

## Next Steps

- [Quickstart](./quickstart.md)
- [First-Run Guide](./first-run.md)
- [Admin Guide](./admin-guide.md)
- [User Guide](./user-guide.md)
- [Deployment Guide](./deployment.md)
- [Verification and Testing](./verification-and-testing.md)
- [Known Limitations](./known-limitations.md)
