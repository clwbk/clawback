# First-Run Guide

What to do immediately after the stack is up.

**Audience:** New evaluators and operators who want to prove the current product stories quickly.

## 1. Load the Demo Workspace

```bash
pnpm --filter @clawback/db seed
```

The seed creates a realistic small-team workspace with:

- shared workers
- input routes
- connections
- a `Company Docs` local-directory connector
- work items
- inbox items
- reviews
- activity events
- contacts and accounts

Demo login:

- `dave@hartwell.com`
- `demo1234`

## 2. Verify the Seed

```bash
./scripts/verify-seed.sh
```

This checks that the main workspace APIs return the expected categories of data,
including the seeded `Company Docs` connector and its initial sync job.

## 3. Open the Main Product Surfaces

After logging in as Dave, open:

- `/workspace/workers`
- `/workspace/inbox`
- `/workspace/work`
- `/workspace/activity`
- `/workspace/connections`
- `/workspace/connectors`

You should be able to understand the demo without touching code or hidden routes.

## 4. Rehearse the Core Ingress and Review Loop

### Forwarded email

```bash
./scripts/test-forward-email.sh
```

Then confirm:

- a new inbox item appears
- a new work item appears
- activity records the event

### Approve or deny a review

```bash
./scripts/test-approve-review.sh
./scripts/test-approve-review.sh deny
```

Use this to confirm the core review loop without involving external delivery.

## 5. Rehearse Reviewed Send

```bash
./scripts/test-smtp-send.sh
```

Interpret the result honestly:

- if SMTP is configured, the send should execute and record outcome truth
- if SMTP is not configured, the script now reports that the review stays pending until configuration is fixed

## 6. Rehearse the Full Public-Try Flow

```bash
pnpm smoke:public-try
```

This is the fastest consolidated check of the main ingress and reviewed-send seams.

## 7. Optional: Rehearse Retrieval

Inspect the seeded `Company Docs` connector first, then run:

```bash
pnpm smoke:connector-sync
pnpm smoke:incident-copilot
pnpm smoke:incident-copilot-action
```

If you want to try a different corpus, add another local-directory connector after
you have confirmed the seeded path works.

This proves the retrieval-backed path independently of Gmail.

## 8. Optional: Configure Gmail

Gmail is optional for first value, but if you want to test watched inbox:

1. open `/workspace/connections`
2. configure Gmail using one of the supported methods
3. attach it to a worker with a watched inbox route
4. use `Check inbox now`

Remember:

- Gmail is read-only
- watched inbox creates shadow suggestions
- outbound email still uses SMTP

## What A Good First Run Should Prove

By the end of a strong first run you should have proved:

- workers are installable and legible
- ingress creates durable inbox/work truth
- reviews gate consequential actions
- execution outcome is visible and auditable
- retrieval can work without Gmail

## See Also

- [Getting Started](./getting-started.md)
- [Verification and Testing](./verification-and-testing.md)
- [Known Limitations](./known-limitations.md)
