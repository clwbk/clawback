# Getting Started with Clawback

How to understand the current product, choose the right entry path, and get to
an honest first impression quickly.

**Audience:** First-time evaluators, operators, and contributors.

If you want the shortest decision page before diving deeper, start with
[Start Here](./start-here.md).

## Start Here

Most people want one of three things:

1. **Try the hosted demo**
   - go straight to [Demo Walkthrough](./demo-walkthrough.md)
2. **Run Clawback locally**
   - use [Quickstart](./quickstart.md)
3. **Deploy it for real**
   - use [Deployment](./deployment.md)

If you are not sure which to choose, start with the demo walkthrough first.
If you are running a local or self-hosted admin workspace, start with
[Quickstart](./quickstart.md) instead so you land on the worker-first setup
path.

## What Clawback Is Actually Promising

Clawback is a self-hosted AI worker control plane.

The promise is not:

- "connect everything and the AI will magically run your business"

The promise is:

- workers can use internal context
- workers can draft or propose actions
- reviews gate the actions that matter
- durable work and activity remain visible after the run

That means the product is strongest when you want:

- grounded answers from internal docs
- draft generation with human review
- controlled automation instead of hidden automation
- visible operational truth after the assistant finishes

## If You Want To Automate XYZ For Your Business

A good Clawback workflow usually has five parts:

1. **Trigger**
   - what starts the work?
   - chat, forwarded email, watched inbox, or another connection
2. **Context**
   - what docs, notes, or records should the worker see?
3. **Behavior**
   - what worker or assistant should interpret that input?
4. **Boundary**
   - what is allowed automatically, and what needs human review?
5. **Outcome**
   - what should show up afterward in `Inbox`, `Work`, and `Activity`?

Map your use case like this:

| Business goal | Likely Clawback shape |
| --- | --- |
| Draft a customer reply | inbound message -> follow-up worker -> review -> approved send |
| Investigate an incident and create a ticket | knowledge source -> incident assistant -> ticket draft -> review -> create ticket |
| Turn scattered notes into a proposal | uploaded context -> proposal worker -> draft output -> revise or review |

If you cannot answer those five questions yet, the right next step is not more
configuration. It is clarifying the workflow.

## The Fastest Way To Understand The Product

There are now two honest first paths:

1. **Hosted/public evaluator path**
   - open [Demo Walkthrough](./demo-walkthrough.md)
   - use the retrieval-first `Incident Copilot` path
2. **Local or self-hosted admin path**
   - use [Quickstart](./quickstart.md)
   - sign in as the demo admin
   - open `/workspace/setup`
   - use `Run sample activity` to reach the worker proof rail

Together, those give the shortest honest answer to:

- what the product is about
- what it feels like in use
- what is already real

## Local Start

If you want a local stack quickly:

```bash
git clone https://github.com/clwbk/clawback.git clawback
cd clawback
pnpm install
export OPENAI_API_KEY=sk-...
./scripts/start-local.sh
```

Then bootstrap the first admin at:

- `http://localhost:3000/setup`

Suggested local values:

- Workspace name: `Local Dev`
- Workspace slug: `local`
- Email: `admin@example.com`
- Display name: `Admin`
- Password: `password1`

If you want seeded demo data immediately:

```bash
pnpm db:seed
```

Demo login:

- `dave@hartwell.com`
- `demo1234`

For the shortest local setup path, use [Quickstart](./quickstart.md).

## What To Open First After Login

These are the most useful pages for first understanding:

- `Setup` for the worker-first activation and proof path
- `Today` for the current workspace state
- `Inbox` for reviews and items needing attention
- `Work` for durable outputs
- `Chat` for the guided assistant path
- `Knowledge` for grounded retrieval sources
- `Activity` for audit truth

Those pages now tell two complementary stories: the worker-first setup proof
and the retrieval-first guided assistant path.

## Current First-Value Paths

### 1. Worker-first setup proof

This is the clearest admin/local first impression:

- open `Setup`
- use `Run sample activity`
- follow the worker proof rail into `Inbox`, `Work`, or `Activity`

### 2. Guided assistant demo

This is the strongest public evaluator impression:

- open `Chat`
- use `Incident Copilot`
- ask the guided prompts from [Demo Walkthrough](./demo-walkthrough.md)

### 3. Reviewed email path

This proves the governed-action lane:

- forwarded email creates work
- a review gates the send
- outcome remains visible after approval or failure

Useful scripts:

```bash
./scripts/test-forward-email.sh
./scripts/test-approve-review.sh
./scripts/test-smtp-send.sh
```

### 4. Retrieval path without Gmail

This proves low-trust first value without requiring Google setup:

1. open `Knowledge`
2. inspect the seeded `Incident Copilot Demo` connector
3. confirm the sync completed
4. run the retrieval smokes if you are local

```bash
pnpm smoke:connector-sync
pnpm smoke:incident-copilot
pnpm smoke:incident-copilot-action
```

## What A Strong First Evaluation Should Prove

By the end of a good first run, you should be able to say:

- the product can use known internal context
- it can draft a useful next step
- it does not skip the human checkpoint
- work and activity stay visible after the run
- the demo story maps to a real business workflow shape

If you cannot say those yet, the next task is usually better guidance or
clearer workflow mapping, not another integration.

## See Also

- [Start Here](./start-here.md)
- [Demo Walkthrough](./demo-walkthrough.md)
- [Quickstart](./quickstart.md)
- [First-Run Guide](./first-run.md)
- [Deployment](./deployment.md)
- [Verification and Testing](./verification-and-testing.md)
- [Known Limitations](./known-limitations.md)
