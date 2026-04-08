# Public Demo Guide

How to present Clawback as a compelling public demo without relying on a full
marketing or business-development motion.

**Audience:** Founders, operators, evaluators, and prospects trying the hosted
demo or using it in live conversations.

## The Right Framing

Do not frame the demo as "connect all your systems and hope the AI does
something interesting."

Frame it as:

- a seeded small-team workspace
- grounded AI over internal business context
- one governed path from answer to action
- visible review, work, and audit state

The strongest first impression is not Gmail setup or SMTP plumbing. It is:

1. the workspace already looks alive
2. either a worker or a retrieval-backed assistant can do something concrete
3. the system can prepare a real next action
4. a human still controls the consequential step

## What To Tell People

Use a short invitation like:

> Log into the Hartwell demo workspace. If you are an evaluator, open Incident
> Copilot and ask why checkout failed last night. If you are in the admin demo,
> open Setup and run sample activity on the follow-up worker.

That gives people a narrow path with a real outcome instead of a vague "click
around and explore."

## Access Options

For the hosted demo, use two paths:

- public evaluator access for the retrieval-first Incident Copilot path
- private admin access for the worker-first setup and proof path

Public evaluator login:

- email: `evaluator@hartwell.com`
- password: `publicdemo1`

Private admin access:

- share directly when you want someone to complete approvals end to end
- do not post the admin credential in public site copy or public docs

## Operator Prep

Before sharing the hosted demo publicly:

- set one model provider key on the host and align it with the runtime's active
  provider, for example `OPENAI_API_KEY` or `OPENROUTER_API_KEY`
- you do not need Gmail, SMTP, Slack, or WhatsApp keys for the Incident Copilot evaluator path
- sign in as an admin and confirm `/workspace/setup` reports runtime readiness
  before relying on model-backed evaluator chat
- after editing `.env`, recreate the runtime gateway so it picks up the new key:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d openclaw
```

To run the public evaluator smoke test from your local checkout against the hosted demo:

```bash
CONSOLE_E2E_BASE_URL=https://demo.clawback.team \
CONSOLE_E2E_EMAIL=evaluator@hartwell.com \
CONSOLE_E2E_PASSWORD=publicdemo1 \
pnpm test:console:demo-evaluator:e2e
```

That smoke test proves the public path can:

- log in as the evaluator
- run the Incident Copilot prompt sequence
- reach the pending review state
- stop without exposing evaluator approval controls

For the trusted admin worker-proof path on a hosted demo, use:

```bash
CONSOLE_E2E_BASE_URL=https://demo.clawback.team \
CONSOLE_E2E_ADMIN_EMAIL=... \
CONSOLE_E2E_ADMIN_PASSWORD=... \
pnpm test:console:demo-admin:e2e
```

That admin browser proof checks the worker-first setup flow rather than the
public evaluator chat flow.

Operational note:

- for the current release, keep the existing 30 second runtime-worker timeout
  as-is
- both hosted demo paths pass with that setting
- if the trusted admin login drifts on the host, reapply the normal demo seed
  before assuming the worker-proof path itself regressed

## What A Person Can Do After Login

The hosted demo should make these actions legible immediately:

- open `Workers` to see the installed worker shapes
- open `Inbox` to see pending reviews and route-driven operational work
- open `Work` to see durable outputs and execution state
- open `Activity` to see audit truth
- open `Knowledge` to inspect the seeded `Incident Copilot Demo` knowledge source
- open `Chat` and use `Incident Copilot`

This matters because the product value is not just "chat." The user should be
able to see the whole control plane around the chat.

## Recommended Public Demo Flow

Use one primary story per audience. The public evaluator path is still
`Incident Copilot`. The trusted admin walkthrough should now use the worker
proof flow from `Setup`.

That does not mean Clawback is only an incident product. It means the hosted
demo is intentionally bounded around two honest entry points:

- evaluator: retrieval-first, no-Google, bounded chat path
- admin: worker-first, route-driven, proof-of-state path

### Public evaluator path

#### 1. Show the workspace is already alive

Open:

- `/workspace/workers`
- `/workspace/inbox`
- `/workspace/work`
- `/workspace/activity`

What the user should understand:

- Clawback is a shared workspace, not a single-user chatbot
- workers, pending reviews, outputs, and audit events already have durable
  product surfaces

#### 2. Show the knowledge source

Open:

- the `Knowledge` page at `/workspace/connectors`

What to point out:

- the seeded `Incident Copilot Demo` connector
- the completed sync job
- the idea that answers are grounded in a known corpus, not generic web text

#### 3. Run the copilot path

Open:

- `/workspace/chat`

Select:

- `Incident Copilot`

Ask these prompts in order:

1. `Why did checkout fail last night?`
2. `What should we do next?`
3. `Draft a follow-up ticket for the team.`
4. `Use create_ticket to create the ticket now and start the approval flow if needed.`

What this should show:

- grounded explanation
- operational recommendation
- structured draft artifact
- approval-aware real action request

#### 4. Show governance, not just generation

If the action path raises a review:

- open `Approvals` or follow the in-chat review link
- public evaluator path: inspect the pending review and stop there
- trusted admin path: approve the action, then return to `Work` or `Activity`

What to emphasize:

- the assistant can move toward action
- the system does not skip the human checkpoint
- outcomes stay visible after the approval step

### Trusted admin path

#### 1. Start from Setup

Open:

- `/workspace/setup`

Use:

- the `Run sample activity` step

That should open the follow-up worker at the proof rail.

#### 2. Use the worker proof rail

If recent worker state already exists:

- open the latest inbox item or work item from the proof step

If not:

- run `Run sample activity`

What this should show:

- the worker is a durable installed role, not a blank chatbot
- a real input route can create inbox, work, and activity state
- the product stays legible on one page while the worker is being brought live

#### 3. Show the resulting state

Open:

- `/workspace/inbox`
- `/workspace/work`
- `/workspace/activity`

What to emphasize:

- the worker did work over time rather than just answering once
- the same workspace surfaces carry the result after the trigger fired
- review still gates consequential action

## Why This Demo Can Be Powerful

This flow compresses the product thesis into one short experience:

- knowledge grounding
- useful reasoning
- workflow artifact creation
- governed execution
- auditability after the fact

That is much stronger than a generic "ask anything" demo.

## What Not To Lead With

Do not make these the primary public-demo path:

- Gmail connection setup
- SMTP configuration
- broad provider tours
- "build your own workflow" positioning

Those are real parts of the product, but they are not the fastest path to a
clear first impression.

## Minimum Requirements Before Sharing The Demo

Before giving the hosted demo link to prospects, make sure all of this is true:

- `demo.clawback.team` is reachable over HTTPS
- the Hartwell seed is loaded
- `Incident Copilot` is visible in chat
- the seeded connector sync is complete
- a model provider key is configured on the hosted stack
- the approval path is working for the demo action
- the site clearly signals that this is a shared disposable demo workspace

Without the model key, the site is browseable but not compelling.

## Good Public Positioning

What to say:

- "This is a self-hosted AI worker control plane for small teams."
- "It uses your internal context, not just generic model output."
- "It can prepare or take useful actions, but still pauses for approval when it matters."

What not to say:

- "It already automates everything."
- "Just connect all your systems and it works by magic."
- "This is mainly an email plugin."

## Suggested Invite Copy

Use copy like:

> Try Clawback in a seeded demo workspace. Public evaluators should open
> Incident Copilot and ask why checkout failed last night. Trusted admin
> walkthroughs should open Setup and run sample activity on the follow-up
> worker.

## Fallback If The Live Copilot Path Is Down

If the model-backed demo path is unavailable, still direct people to:

- `Workers`
- `Inbox`
- `Work`
- `Activity`
- `Knowledge`

Be explicit that they are seeing the control-plane surfaces and seeded truth,
but do not imply that the live AI path is currently working if it is not.

## See Also

- [Demo Walkthrough](./demo-walkthrough.md)
- [Quickstart](./quickstart.md)
- [Getting Started](./getting-started.md)
- [First-Run Guide](./first-run.md)
- [Known Limitations](./known-limitations.md)
