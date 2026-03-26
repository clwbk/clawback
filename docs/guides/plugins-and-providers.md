# Plugins & Providers

How Clawback uses plugins in the product, what admins need to set up, and what "coming soon" means in the UI.

**Audience:** Workspace admins, operators, and technical evaluators using Clawback in the product.

---

## The Short Version

In Clawback, people do **not** install "plugins" directly.

They use:

- **workers** — the business-facing units inside a workspace
- **connections** — systems Clawback can read from or send through
- **input routes** — how work arrives
- **actions** — what a worker is allowed to do

Under the hood, Clawback is **plugin-capable**. That means new providers,
ingress paths, action executors, and worker templates can be added in a
structured way without changing the whole product.

For most admins, the important thing is simpler:

- set up the connections you need
- install the workers you want
- attach the right connections to the right workers
- keep reviewed actions governed

---

## What Counts As A Plugin

Clawback currently has four plugin classes.

| Plugin class | What it represents | Example |
| --- | --- | --- |
| **Connection provider** | A system Clawback can connect to | Gmail read-only, SMTP relay, Drive |
| **Ingress adapter** | A way external events enter Clawback | Postmark inbound, Gmail watch hook |
| **Action executor** | A way approved actions are carried out | SMTP reviewed send |
| **Worker pack** | A reusable worker template | Client Follow-Up, Proposal |

This is mostly an implementation detail. In the UI you mainly see:

- `Workers`
- `Connections`
- `Setup`

---

## What You See In The Product

### Workers

A **worker** is the installed business-facing unit in a workspace.

Examples:

- `Client Follow-Up`
- `Proposal`

A worker owns:

- members
- assignees
- reviewers
- input routes
- attached connections
- action boundary posture

Workers are what users actually work with day to day.

### Connections

A **connection** is a configured system Clawback can use.

Examples:

- Gmail read-only
- SMTP relay
- Google Drive

Connections can be:

- `not_connected`
- `connected`
- `error`
- other setup-specific intermediate states

### Input routes

An **input route** tells Clawback how work arrives.

Examples:

- `forward_email`
- `watched_inbox`
- `chat`
- `upload`

Routes are attached to workers and become active only when the worker and its
required connections are configured correctly.

### Actions

An **action** is something the worker can do after review or according to the
configured boundary mode.

Examples:

- `send_email`
- `save_work`
- `create_ticket`

---

## Current First-Party Providers

These are the main provider types currently represented in the product.

| Provider | Role | Typical access mode |
| --- | --- | --- |
| Gmail | Read-only context and watched inbox | `read_only` |
| SMTP relay | Reviewed outbound email send | `write_capable` |
| Drive | Knowledge/context source | `read_only` |
| Calendar | Scheduling/context source | `read_only` |

Important trust rule:

- Gmail read-only watch is **separate** from outbound send
- reviewed send uses a separate executor and destination

That separation is intentional.

---

## How Setup Works

The main setup surface is:

- `/workspace/setup`

From there, the product links into:

- `/workspace/connections`
- `/workspace/workers`

The setup flow usually looks like this:

1. Connect Gmail read-only
2. Configure SMTP relay
3. Install the worker pack you need
4. Attach the right connection to the worker
5. Confirm the worker's action posture
6. Rehearse one real flow

The setup page does not try to explain every integration from scratch. It uses
the registry metadata from the plugin system to show:

- step titles
- step descriptions
- action labels
- where each step sends you next

---

## What "Coming Soon" Means

Some providers appear in the UI even when they are not ready to install or use.

This is intentional.

If a provider shows `Coming soon`, it means:

- it is known to the product registry
- its metadata is available
- it is **not** yet ready for normal installation or operator use

This helps the product stay legible without pretending unfinished integrations
are live.

---

## What Happens When You Install A Worker

When you install a worker from a worker pack, Clawback creates the workspace
objects owned by that pack.

That usually includes:

- the worker record itself
- default input routes
- default action capabilities
- default boundary modes

Examples:

- the `Client Follow-Up` worker provisions `forward_email` and `watched_inbox`
  routes plus send/save actions
- the `Proposal` worker provisions `chat` and `upload` routes plus save-work

After install, you still need to configure:

- people
- attached connections
- action posture

---

## Why A Worker Might Still Look Incomplete

A worker can be installed but still not fully usable.

Common reasons:

- the required connection is not connected yet
- the connection exists but is not attached to the worker
- the input route is still `suggested` instead of `active`
- the send/action path is disabled or set to `never`

This is why the product separates:

- install
- connect
- attach
- activate

---

## Read-Only Vs Write-Capable

Clawback treats read and write differently on purpose.

| Type | Example | Why it matters |
| --- | --- | --- |
| **Read-only** | Gmail watch, Drive, Calendar | Lets workers observe and prepare work without taking external action |
| **Write-capable** | SMTP relay | Lets approved work actually leave Clawback |

This is the basis for:

- shadow mode
- reviewed sends
- safer early rollout

---

## Shadow Mode In Plugin Terms

Shadow mode means:

- a read-only connection notices something
- an ingress path creates a normalized event
- a worker prepares suggested work
- no external action is taken

In product terms, that usually means:

- the item appears in `Inbox` or `Work`
- it is visible as a suggestion
- nothing is sent automatically

This is why Gmail read-only is so important early on: it proves value before
granting external write power.

---

## When You Need Custom Setup

Not every provider can be configured from one generic form.

Today:

- Gmail uses a custom operator flow
- SMTP relay uses a custom operator flow

That is normal.

The plugin system does **not** mean "every provider has identical setup UI."
It means:

- providers are discovered and listed consistently
- the setup flow can be driven by registry metadata
- custom setup panels can still exist where they are needed

---

## What Admins Should Expect Next

As the plugin system grows, admins should expect:

- more providers to appear automatically in `Connections`
- more worker templates to appear automatically in `Workers`
- clearer grouping like `Email`, `Knowledge`, and `Project`
- more setup guidance generated from provider metadata

What should stay stable:

- workers remain the main product unit
- reviewed actions stay governed
- core product records do not become arbitrary plugin state

---

## Common Questions

### Are workers plugins?

No, not primarily.

Workers are product units. They may be created from worker packs and backed by
plugin-capable building blocks, but users should think in terms of workers, not
plugins.

### Do I need to know code to use plugins in Clawback?

No.

As an operator, you mainly use:

- Setup
- Connections
- Workers

### Why do some providers show up before they work?

Because the registry can describe a provider before the full operator flow is
finished. The UI marks these as `Coming soon` instead of pretending they are
ready.

### Can a plugin change how reviews or work items behave?

No.

The plugin layer extends the capability edges. The core product model stays the
same.

---

## Related Docs

- [Getting Started](./getting-started.md)
- [Admin Guide](./admin-guide.md)
- [User Guide](./user-guide.md)
- [API Reference](./api-reference.md)
- [Deployment Guide](./deployment.md)
