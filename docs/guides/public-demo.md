# Public Demo Guide

Use this page if you want to try the shared Clawback demo right now.

The hosted demo is intentionally narrow. It is a seeded shared workspace built
to show one honest path:

- grounded answers over a known corpus
- a concrete next action
- review before anything consequential
- visible state in the workspace after the run

## Try It Now

Open:

- `https://demo.clawback.team`

Use the public evaluator login:

- email: `evaluator@hartwell.com`
- password: `publicdemo1`

If you only do one thing, do this:

1. Sign in.
2. Open `Chat`.
3. Select `Incident Copilot`.
4. Ask: `Why did checkout fail last night?`

That gets you into the main public demo path immediately.

## What You Are Looking At

This is not a blank chatbot.

It is a shared seeded workspace, which means:

- `Workers` already has installed worker shapes
- `Inbox` already has review and route-driven operational work
- `Work` already has durable outputs and execution state
- `Activity` already has audit history
- `Knowledge` already has a synced `Incident Copilot Demo` source

The point is to make the control plane visible around the chat, not just the
chat itself.

## Recommended First Pass

After you sign in, use this prompt sequence:

1. `Why did checkout fail last night?`
2. `What should we do next?`
3. `Draft a follow-up ticket for the team.`
4. `Use create_ticket to create the ticket now and start the approval flow if needed.`

What you should see:

- a grounded explanation instead of generic model memory
- a concrete recommendation
- a structured draft
- a pending review instead of silent execution

The evaluator path is supposed to stop at the pending review. You should be
able to inspect the approval state, but not approve it with the public
evaluator account.

## After Chat, Look At These Pages

Once you have run the main chat flow, open:

- `Workers`
- `Inbox`
- `Work`
- `Activity`
- `Knowledge`

That makes the larger product shape legible:

- the assistant is part of a shared workspace
- consequential actions create review state
- outputs and history remain visible after the run

## What This Demo Proves

- retrieval grounded in a known corpus
- one governed path from answer to action
- visible review state
- durable workspace state after the run

## What This Demo Does Not Prove

- your own deployment
- your own connectors or users
- broad workflow coverage
- a no-code automation builder

If you want to inspect the product more honestly, use one of these instead:

- [Quickstart](./quickstart.md) for a local clone
- [Deployment](./deployment.md) for a dedicated single-node workspace
- [Start Here](./start-here.md) if you want to choose the right path first

## Trusted Admin Walkthrough

There is also a stronger admin path built around `Setup` and the worker proof
flow.

That path is not public. Use it only when someone is doing a guided admin
walkthrough and you want them to see the worker-first setup flow end to end.

Do not post the admin credential in public site copy or public docs.

## If You Are Operating The Hosted Demo

Before sharing the hosted demo publicly:

- make sure one model provider key is present on the host
- make sure the runtime's active provider is aligned with that key
- sign in as an admin and confirm `/workspace/setup` reports runtime readiness
- remember that you do not need Gmail, SMTP, Slack, or WhatsApp keys for the
  public evaluator path

If you edit `.env`, recreate the runtime gateway so it picks up the new key:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d openclaw
```

To verify the public evaluator path from a local checkout against the hosted
demo:

```bash
CONSOLE_E2E_BASE_URL=https://demo.clawback.team \
CONSOLE_E2E_EMAIL=evaluator@hartwell.com \
CONSOLE_E2E_PASSWORD=publicdemo1 \
pnpm test:console:demo-evaluator:e2e
```

To verify the trusted admin worker-proof path:

```bash
CONSOLE_E2E_BASE_URL=https://demo.clawback.team \
CONSOLE_E2E_ADMIN_EMAIL=... \
CONSOLE_E2E_ADMIN_PASSWORD=... \
pnpm test:console:demo-admin:e2e
```

For the current release:

- keep the existing 30 second runtime-worker timeout as-is
- both hosted demo paths pass with that setting
- if the trusted admin login drifts on the host, reapply the normal demo seed
  before assuming the worker-proof flow regressed
