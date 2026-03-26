# User Guide

How non-admin users and reviewers work inside Clawback.

**Audience:** Team members using installed workers, reviewing actions, or following workspace activity.

## Logging In

Use the credentials your workspace admin provided on `/login`.

If you received an invite link, open it, set your display name and password, and then sign in.

## The Main Pages

### Today

`/workspace` gives you the shortest summary of:

- what is waiting on you
- what the team is working on
- which workers are active
- which setup steps still matter

### Inbox

`/workspace/inbox` is the most important day-to-day page.

You may see:

- pending reviews
- route suggestions
- setup or boundary items
- failed sends that need retry

If you are a reviewer, this is where you approve or deny gated actions.

### Work

`/workspace/work` shows durable outputs created by workers.

Examples:

- email drafts
- proposal drafts
- saved work
- routed downstream work

Each work item can show:

- the draft itself
- current execution state
- final execution outcome
- any execution error

### Activity

`/workspace/activity` shows the audit trail for what workers noticed, prepared, reviewed, routed, or completed.

## Reviewing Actions

The typical review loop is:

1. open a review item in `Inbox`
2. inspect the draft and summary
3. click `Approve` or `Deny`

Important meaning:

- `Approve` authorizes the action; it does not guarantee the action has already completed
- `Deny` stops the action and records durable denial truth

If execution later fails, the UI will show that failure honestly.

## Route Suggestions

Some inbox items ask a human to confirm a suggested handoff to another worker.

When you confirm a route:

- the original inbox item resolves
- downstream work is created for the destination worker
- the audit trail records the handoff

## Understanding Statuses

### Review statuses

- `pending`
- `approved`
- `denied`
- `completed`

### Execution statuses

- `not_requested`
- `queued`
- `executing`
- `completed`
- `failed`

The product keeps review truth and execution truth separate on purpose.

## Retrying Failed Sends

If a reviewed send fails after approval, the inbox and work surfaces show the failure clearly, including the failure type (transient or permanent) and guidance text.

When retry is allowed, the UI exposes `Retry send`. Retry is safe — the attempt counter increments and the system does not double-send.

## Chat

Some workers still have chat routes, but chat is not the whole product story. The core operational value is in workers, inbox, work, reviews, and auditability.

## When To Ask An Admin

Ask an admin if you need:

- a new worker installed
- a provider connection configured
- Gmail or SMTP setup changed
- a connector added or re-synced
- account or invitation help

## See Also

- [Getting Started](./getting-started.md)
- [Admin Guide](./admin-guide.md)
- [Known Limitations](./known-limitations.md)
