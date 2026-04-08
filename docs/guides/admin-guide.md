# Admin Guide

How to operate a Clawback workspace today.

**Audience:** Workspace admins and technical operators.

## What Admins Own

Admins currently own five things:

1. installing and configuring workers
2. connecting providers like Gmail and SMTP
3. keeping reviews and execution outcomes truthful
4. verifying retrieval and ingress paths
5. deploying and troubleshooting the stack

The main admin pages are:

- `/workspace/setup`
- `/workspace/workers`
- `/workspace/connections`
- `/workspace/connectors`
- `/workspace/inbox`
- `/workspace/work`
- `/workspace/activity`

## Worker Management

### Install a worker

Open `/workspace/workers` and click `Add worker`.

Today, worker install is template-based. You choose a worker pack, name the worker, and then finish configuration on the worker detail page.

### Configure a worker

The worker detail page is the main admin surface for a live worker. It is organized around:

- `Identity`
- `Status`
- `People`
- `Inputs`
- `Connections`
- `Actions`

#### People

Each worker distinguishes:

- `members`
- `assignees`
- `reviewers`

These roles drive who sees work and who can resolve reviewed actions.

#### Inputs

Common input routes today:

- `forward_email`
- `watched_inbox`
- `chat`

Important distinction:

- `forward_email` is the simplest explicit intake path
- `watched_inbox` is proactive Gmail monitoring and remains read-only

#### Connections

Connections are attached to workers from the worker page. Attaching a connection is separate from merely configuring the provider globally.

Examples:

- attach Gmail read-only to a worker that has `watched_inbox`
- attach SMTP-backed send posture to a worker that can `send_email`

#### Actions

Every action capability has a boundary posture. The important ones are:

- `auto`
- `ask_me`
- `never`

For consequential work, `ask_me` remains the safe default.

## Connections

Open `/workspace/connections` to configure provider-backed behavior.

### Gmail

Gmail is a provider, not the backbone of the product.

Current setup options:

- in-product `Connect with Google`
- service-account setup
- manual credential entry

Current behavior:

- Gmail is read-only
- it powers watched inbox and shadow suggestions
- it does not replace SMTP for outbound send

### SMTP relay

SMTP is the current reviewed-send destination for email.

Setup happens in two layers:

1. set environment variables on the control-plane host
2. confirm and connect the SMTP relay from `/workspace/connections`

Approval authorizes the action. Delivery depends on the configured transport. If SMTP is not configured or unreachable, execution progresses to `failed` with an error classification (transient or permanent). The failure is visible in the UI and the operator can fix configuration and retry.

### Slack

Slack is an approval surface. It must stay subordinate to the same review truth the web UI uses.

### n8n

n8n is an optional automation backend. Clawback remains the system of record for review and execution truth; n8n is an attached executor/integration surface, not the product backbone.

## Connectors and Retrieval

Open `/workspace/connectors` to add low-trust context sources.

The main current connector is a local-directory sync. It gives you a retrieval-backed first-value path without requiring Gmail.

Operator loop:

1. add connector
2. sync connector
3. verify sync jobs complete
4. run retrieval smoke flows

Useful commands:

```bash
pnpm smoke:connector-sync
pnpm smoke:incident-copilot
pnpm smoke:incident-copilot-action
```

## Reviews, Work, and Recovery

### Inbox

Use `/workspace/inbox` for:

- approving or denying reviewed actions
- confirming route suggestions
- seeing send failures and retry opportunities

### Work

Use `/workspace/work` to inspect:

- the durable work item
- execution state
- execution outcome
- draft content
- execution errors

### Activity

Use `/workspace/activity` to confirm the audit trail matches what happened in the workspace.

### Retry behavior

If a reviewed send fails after approval:

- the review truth remains durable (approval is recorded regardless of delivery outcome)
- the work item shows `failed` execution state with error classification (transient or permanent)
- the UI exposes `Retry send` with attempt count and guidance text
- retry is safe — the attempt counter increments and the system does not double-send

If the execution path is not configured at approval time:

- approval still records the review decision
- execution progresses to `failed` with a permanent error classification
- the operator must fix configuration and then retry from the UI

## Users and Access

Current access model:

- bootstrap the first admin via `/setup`
- additional users are invitation-based

Important caveat:

- the product does not yet have a polished people-management UI for invitations and admin changes
- invitation and account-management flows are still narrower than worker and connection management

Read [Known Limitations](./known-limitations.md) before making broader identity promises.

## Verification Routine

For a local or self-hosted deployment, the fastest admin verification loop is:

```bash
pnpm smoke:public-try
./scripts/test-smtp-send.sh
```

If you are validating retrieval too:

```bash
pnpm smoke:connector-sync
pnpm smoke:incident-copilot
pnpm smoke:incident-copilot-action
```

## See Also

- [Getting Started](./getting-started.md)
- [First-Run Guide](./first-run.md)
- [Verification and Testing](./verification-and-testing.md)
- [Deployment Guide](./deployment.md)
- [Known Limitations](./known-limitations.md)
