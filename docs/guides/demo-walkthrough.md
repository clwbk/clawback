# Demo Walkthrough

If you are opening Clawback for the first time and wondering "what am I
supposed to do here?", follow this exact path.

**Audience:** Friends, evaluators, and first-time users inside a seeded local
workspace or any workspace where access has already been provided.

## What This Demo Is

The current demo is focused.

It is not trying to cover every possible business workflow at once.

It is meant to show one answer-to-action path:

- grounded context from internal docs
- a useful assistant response
- a draft of a real next step
- a human review boundary before a consequential action
- durable work and audit state after the run

There are two starting points:

- worker-first admin path through `Setup` and the worker proof rail
- retrieval-first evaluator path through `Knowledge` and `Incident Copilot`

## Before You Start

Keep these expectations in mind:

- this is a shared disposable demo workspace
- some data may already exist from earlier runs
- not every provider path is configured in the demo
- admin users should start from `Setup`
- evaluator users should start from `Knowledge` or `Chat`

## Choose Your Path

### Path A: Worker-first admin path

Go to:

- `/workspace/setup`

Click:

- `Run sample activity`

That should land you on the follow-up worker at `focus=proof`.

If the proof rail already shows recent inbox or work state, open it directly.

If not, use:

- `Run sample activity`

What to notice:

- a worker can be installed and configured as a durable role
- a real input can create inbox, work, and activity state
- the product is more than a chat thread

Then open:

- `/workspace/work`
- `/workspace/inbox`
- `/workspace/activity`

What to look for:

- a durable work item created by the sample intake
- a reviewable inbox item when the worker needs sign-off
- audit truth that remains visible after the action path starts

### Path B: Retrieval-first evaluator path

Go to:

- `/workspace/connectors`

Inspect:

- the seeded `Incident Copilot Demo` connector
- the completed sync job

What to notice:

- answers can be grounded in a known corpus
- the no-Google retrieval path is real before live systems are connected

Then go to:

- `/workspace/chat`

Use:

- `Incident Copilot`

Ask these prompts in order:

1. `Why did checkout fail last night?`
2. `What should we do next?`
3. `Draft a follow-up ticket for the team.`
4. `Go ahead and create the ticket.`

What to notice:

- the assistant can answer using the seeded knowledge source
- the response can move toward a concrete operational next step
- the system can prepare a reviewable action, not just generate text

Then inspect:

Go to:

- `/workspace/inbox`
- `/workspace/work`
- `/workspace/activity`

What to notice:

- retrieval-backed chat can still produce durable work and review state
- outcome truth remains visible after the conversation ends

## If You Want To Automate XYZ For Your Business

The right way to think about Clawback is not:

- "Where is the magic automation button?"

The right way is:

1. what starts the work?
2. what context should the worker use?
3. what draft or action should it produce?
4. what must require review?
5. where should the outcome remain visible afterward?

In product terms, that usually maps to:

| Your business question | Clawback primitive |
| --- | --- |
| What starts the job? | route, connection, or chat prompt |
| What knowledge should it use? | knowledge source / connector |
| What behavior should it follow? | worker or assistant |
| What needs sign-off? | review boundary |
| What should happen next? | governed action |
| Where do I see the result later? | inbox, work, activity |

Examples:

| Business goal | Likely Clawback path |
| --- | --- |
| Draft a customer follow-up | inbound email or chat -> follow-up worker -> review -> approved send |
| Investigate an incident and create a ticket | knowledge source -> incident copilot -> ticket draft -> review -> create ticket |
| Turn notes into a proposal draft | uploaded notes or brief -> proposal worker -> draft artifact -> review or revise |

## Good Questions To Ask After The Demo

If a friend says "Could this automate my workflow?", the next useful questions are:

- what event should trigger the work?
- what internal docs or records should it see?
- what should it draft versus execute?
- what absolutely needs human approval?
- who should own review?
- what should show up in `Work` when it is done?

If you can answer those, you can usually sketch a real Clawback flow.

## What The Demo Does Not Cover Yet

This demo does **not** cover:

- every integration is plug-and-play
- the product already automates every business workflow
- the current assistant list is the final product taxonomy

What it does show:

- grounded assistant
- reviewable output
- governed action
- durable visibility after execution

## Next Stops

- [Getting Started](./getting-started.md)
- [Quickstart](./quickstart.md)
- [First-Run Guide](./first-run.md)
- [Known Limitations](./known-limitations.md)
