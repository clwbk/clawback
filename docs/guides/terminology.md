# Terminology

Definitions of core terms used throughout Clawback. Read this if you are new to the product and encounter unfamiliar concepts in the docs or UI.

---

## Worker

An AI teammate that does a specific job for your team. Workers are the primary unit of automation in Clawback. Each worker has a defined purpose (e.g., "Client Follow-Up," "Proposal," "Incident"), team members, input routes, connections, and action capabilities.

Workers are not generic chatbots. They have a narrow scope, a configured identity, and explicit boundaries on what they can do.

**Not the same as:** "agent" in the generic AI sense. Clawback uses "worker" to emphasize that these are purpose-built, governed units — not open-ended assistants.

> **Terminology note:** "Worker" is the primary product noun used throughout the UI. "Agent" still appears in some contexts: Clawback is an *agent control plane*, and workers *are* agents under the hood — but the user-facing term is always "worker." The API endpoints still use `/api/agents` for backwards compatibility.

---

## Connection

A link between Clawback and an external system. Connections define how Clawback reads from or writes to services like Gmail, SMTP servers, or Slack.

Each connection has:

- A **provider** (e.g., `gmail`, `smtp_relay`, `slack`)
- An **access mode** (`read_only` or `write_capable`)
- A **status** (`not_connected`, `configured`, `connected`)
- **Attached workers** — which workers use this connection

Connections are workspace-level resources managed by admins, not per-user settings.

**Not the same as:** "connector" or "integration" (too broad). A **connection** is a specific, configured link to one external service (Gmail, SMTP, Slack) with explicit permissions. By contrast, a **connector** is a RAG/knowledge data source — a local directory or other corpus that feeds retrieval context into worker conversations. Connections are for *doing things* in external systems; connectors are for *knowing things* from indexed content.

---

## Input Route

How work arrives at a worker. Each worker can have multiple input routes. The supported kinds are:

| Kind | Description |
| --- | --- |
| **Chat** | Direct conversation with the worker through the console UI |
| **Forward email** | Email forwarded to a dedicated address (e.g., `followup@hartwell.clawback.dev`) that the worker processes |
| **Watched inbox** | A Gmail mailbox that Clawback monitors read-only, creating shadow suggestions when new messages arrive |
| **Webhook** | An HTTP endpoint that external systems can call to send work to the worker |

Each route has a status (`active` or `suggested`) and may have an associated address.

---

## Work Item

A unit of work produced by a worker. When a worker processes input (an email, a chat message, a webhook payload), it creates a work item that represents the output.

Work items have:

- A **kind** (e.g., `email_draft`, `sent_update`, `proposal_draft`)
- A **status** (`draft`, `pending_review`, `approved`, `sent`, `denied`)
- An **execution status** (`not_requested`, `queued`, `executing`, `completed`, `failed`)
- Draft content (for email-type items: `draft_to`, `draft_subject`, `draft_body`)

---

## Inbox Item

A notification in a team member's inbox that requires attention. Inbox items are how Clawback surfaces work that needs human input.

Inbox item kinds:

| Kind | What it means |
| --- | --- |
| **Review** | A worker produced output that needs approval before an action is taken (e.g., sending an email) |
| **Shadow** | A worker ran in shadow mode — it observed and drafted but took no action. Informational only. |
| **Setup** | A prompt to complete configuration (e.g., connect Gmail to enable proactive follow-ups) |

Inbox items are assigned to specific users. An admin sees all items; a regular user sees only items assigned to them.

---

## Review

An approval checkpoint. When a worker wants to take a consequential action (like sending an email), it creates a review and pauses. A designated reviewer must approve or deny the action before it proceeds.

Reviews have:

- A **status** (`pending`, `approved`, `denied`)
- An **action kind** (e.g., `send_email`, `create_ticket`)
- **Reviewer IDs** — who can resolve this review
- An **action destination** (e.g., the email recipient)

The review flow is the core of Clawback's governance model: nothing consequential happens without explicit human approval (unless the boundary mode is set to `auto`).

---

## Activity Event

An entry in the audit trail. Every significant action in the workspace produces an activity event: review requests, work item creation, email sends, route handoffs, and administrative actions.

Activity events are append-only and include the worker, route kind, result kind, timestamp, and a human-readable summary. They form the historical record of everything the workspace's workers have done.

---

## Boundary Mode (Action Posture)

The trust level assigned to each action capability on a worker. This controls how much autonomy the worker has for that specific action.

| Mode | Behavior |
| --- | --- |
| **Shadow** | The worker observes and drafts but takes no action. Output is visible as a shadow inbox item. |
| **Ask me** | The worker drafts the action, then pauses and creates a review. A human must approve before the action executes. |
| **Auto** | The worker executes the action without waiting for approval. Use only for low-risk actions you trust. |

Boundary modes are set per action capability, not per worker. A single worker might have `ask_me` for sending email but `auto` for saving internal work.

---

## Worker Pack

A predefined template for a worker kind. Worker packs define the default configuration for a type of worker: its purpose, suggested input routes, recommended connections, action capabilities, and identity prompt.

When you install a worker from a pack, it creates a new worker pre-configured with sensible defaults that you can then customize.

Current packs include: Client Follow-Up, Proposal, Incident, Bugfix.

---

## Action Capability

A specific action that a worker is allowed to perform, along with its governance configuration. Each action capability defines:

- The **kind** of action (e.g., `send_email`, `save_work`, `create_ticket`)
- The **boundary mode** (shadow, ask me, auto)
- The **reviewer IDs** — who approves this action when in `ask_me` mode
- The **destination connection** — which connection the action uses (e.g., the SMTP relay for `send_email`)

Action capabilities are the enforcement mechanism for Clawback's trust boundaries. They determine what a worker can do and under what conditions.

---

## Execution State

The lifecycle state of a work item's action execution. After a review is approved, the work item progresses through execution states:

| State | Meaning |
| --- | --- |
| `not_requested` | No execution has been requested |
| `ready` | Execution can begin |
| `queued` | Execution is queued for processing |
| `running` | Execution steps are in progress |
| `waiting_review` | Paused, waiting for human review or route confirmation |
| `executing` | The approved action is being executed (e.g., sending email) |
| `completed` | Execution finished successfully |
| `failed` | Execution encountered an error |

---

## Route Confirmation

The process of approving a worker handoff. When the Follow-Up worker classifies an incoming email as better suited for a different worker (e.g., a proposal request should go to the Proposal worker), it creates a route suggestion. An operator reviews the suggestion and confirms the handoff, which creates a new work item assigned to the target worker.

Route confirmation is always reviewed — no silent auto-transfers occur.

---

## Workspace

The top-level organizational container in Clawback. A workspace has its own users, workers, connections, work items, and audit trail. All resources are scoped to a workspace, and there is no cross-workspace data access.

In V1, Clawback supports one workspace per deployment.

---

## See Also

- [Getting Started](./getting-started.md) — Setup walkthrough
- [Admin Guide](./admin-guide.md) — Full reference for workspace configuration
- [Plugins & Providers](./plugins-and-providers.md) — How the plugin system works under the hood
