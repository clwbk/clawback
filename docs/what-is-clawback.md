# What Is Clawback?

Clawback is AI workers for small teams — with a human in the loop where it
matters.

Think of it this way: you probably already use ChatGPT or Claude to draft
emails, summarize documents, or brainstorm. But those tools can't access your
team's email, can't send messages on your behalf, and can't remember your
clients from one conversation to the next.

Clawback changes that. It gives your team AI workers that connect to real
business systems and do real work — but with guardrails that keep a human in
control.

## A Simple Example

Say you run a consulting firm. You get 40 client emails a day, and half of
them need a follow-up: a scheduling link, a status update, a "thanks, we'll
get back to you by Friday." You know you should respond quickly, but it keeps
slipping.

With Clawback, you set up a **Client Follow-Up worker**. It connects to your
email (read-only at first), watches for messages that need a reply, and drafts
follow-ups. Those drafts show up in your Clawback inbox — not your email inbox.
You review each one, and with one click, approve it to send.

The worker doesn't send anything without your say-so. But it also doesn't make
you write every email from scratch. It does the first 80% of the work, and you
do the last 20%: the judgment call.

## How It Actually Works

### Workers

Workers are the core concept. Each worker has a specific job:

- **Client Follow-Up** — drafts reply emails based on incoming messages
- **Proposal Assistant** — turns RFPs and project descriptions into first-draft
  proposals
- **Incident Copilot** — triages technical issues using your internal docs

Workers aren't chatbots. They're closer to a junior team member who does
research and prep work, then brings you a draft for review.

### The Trust Ladder

Clawback doesn't ask you to trust AI on day one. Instead, each worker has a
trust level that you control:

1. **Shadow mode** — the worker watches your email and shows you what it
   *would* draft, but sends nothing. You're just observing.
2. **Ask me** — the worker drafts responses and puts them in your inbox for
   review. Nothing sends until you approve.
3. **Auto** — for actions you've come to trust (like saving a summary to your
   CRM), the worker can act without asking.

Most teams start in shadow mode, move to "ask me" after a week, and only use
"auto" for low-risk tasks. There's no pressure to escalate.

### Shared Workspace

Clawback is built for teams, not individuals. Your whole team shares a
workspace where you can see:

- **Today** — what needs your attention right now (items assigned to you vs.
  team activity)
- **Inbox** — items waiting for human review or decision
- **Work** — everything workers have produced (drafts, sent emails, proposals)
- **Workers** — which workers are active, what they're connected to, how
  they're configured
- **Activity** — a timeline of everything that's happened

Everyone sees the same workspace. No one has to wonder "did the AI send that
email?" — it's all visible.

### Reviews and Approvals

When a worker wants to do something consequential — send an email, create a
ticket, post a message — it pauses and creates a **review**. The review shows
you:

- What the worker wants to do
- The exact content (e.g., the email draft)
- Who it's going to
- Which worker produced it and why

You approve, edit, or reject. That's it. One decision, one outcome.

This isn't a bureaucratic approval chain. It's one person glancing at a draft
and saying "yes, send it" or "no, fix this part." Think of it like a manager
reviewing a junior employee's work — quick, lightweight, but present.

## What Clawback Is Not

- **Not a chatbot.** You can chat with workers, but the real value is the work
  they produce, not the conversation.
- **Not an automation builder.** You don't draw flowcharts or configure
  if/then rules as the primary UX. Workers are pre-built for specific jobs and
  you configure their boundaries, not a generic canvas. Some worker behavior
  may be step-based internally, but that should stay backstage.
- **Not enterprise software.** No procurement process, no SSO requirement, no
  minimum seats. Designed for a team of 5, works fine for 50.
- **Not cloud-only.** Self-hosted by default. Your data stays on your
  infrastructure.

## Who Is Clawback For?

Clawback is built for small teams — whether that's a whole company or a team
inside a larger one:

- **Service teams with high-volume client communication.** Agencies,
  consultancies, law firms, accounting practices — if you spend hours a day on
  client emails, follow-ups, and status updates.
- **Ops teams** inside mid-market companies who need AI help without waiting
  for an enterprise-wide rollout or IT department buy-in.
- **Teams where mistakes are expensive.** One wrong email to a client can
  damage a relationship. You want AI help, but you need to see what goes out.
- **Teams of 3-50 people** with no dedicated AI/ML team, no compliance
  department. The team lead or ops person is also the one configuring the tool.
- **Anyone where trust needs to be earned.** You're not ready to let AI send
  emails on its own. But you'd love to have every reply drafted and waiting
  for your "yes."

## How Is This Different From...

### ChatGPT / Claude

Those are great for one-off tasks in a browser. But they can't connect to your
email, can't act on your behalf, and don't produce durable work output. Every
conversation starts from zero. Clawback workers persist, connect to your
systems, and produce real artifacts (drafts, proposals) that live in your
workspace.

### Zapier / Make / n8n

Those are workflow and automation tools. They are good at triggers, branching,
and integrating many systems, and some now include AI and human-in-the-loop
features. But they are still flow-first products. Clawback is worker-first:
the durable center of gravity is the worker, inbox, review, work, and activity
model, not a graph of nodes.

### Enterprise AI Platforms

Tools like Microsoft Copilot, Salesforce Einstein, or custom LangChain
deployments are built for large organizations with IT departments. Clawback
is for the small team that wants similar capability without the overhead —
whether that team is the whole company or a unit inside one.

## The Technical Bit (Brief)

Under the hood, Clawback is:

- A **TypeScript monorepo** with a Next.js frontend and Fastify API
- Built on **OpenClaw**, an open-source agent runtime
- Self-hosted with **Postgres** for state and **Docker** for deployment
- Designed as an **open-core** product (core platform is open source, premium
  worker packs and integrations planned)

The unique technical capability is **runtime mediation** — Clawback can
intercept agent actions mid-execution, pause the run, present the action for
human review, and resume or cancel based on the human's decision. This is
architecturally different from tools that can only log what already happened.

Clawback is also moving toward a native worker execution model above its
runtime and automation substrates. That means OpenClaw can execute reasoning
segments, and tools like n8n can handle deterministic downstream automation,
without either of them becoming the product's source of business truth.

## Getting Started

If you want to try Clawback locally:

```bash
git clone https://github.com/clwbk/clawback.git
cd clawback
pnpm install
./scripts/start-local.sh
```

Then open `http://localhost:3000/setup` to create your workspace.

See the [README](../README.md) for full setup instructions.
