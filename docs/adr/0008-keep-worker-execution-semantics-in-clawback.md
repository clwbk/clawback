# ADR 0008: Keep Worker Execution Semantics In Clawback

## Status

Accepted

## Context

Clawback now has a much clearer product shape than it did at the start of the
project:

- workers are the product units
- inbox, work, review, and activity are durable operating objects
- approval truth belongs in Clawback
- provider and action edges are becoming plugin-capable
- OpenClaw is the first runtime substrate

At the same time, two pressures are becoming more obvious:

1. many useful worker behaviors are **workflow-shaped**
2. external systems like **n8n** can already handle a large amount of
   deterministic orchestration, integration plumbing, and long-tail automation

That creates a strategic risk.

If Clawback is not explicit about where worker behavior lives, it can drift in
either bad direction:

- toward hidden runtime-specific logic inside OpenClaw integration
- toward business behavior being expressed in external workflow systems

Either would weaken the product.

The architectural question is:

- should Clawback own a native worker execution model, or should it let runtime
  engines and workflow engines define worker behavior?

## Decision

Clawback will keep **worker execution semantics** in the Clawback product
layer.

Specifically:

- Clawback owns the business-semantic step model for workers
- OpenClaw remains a runtime substrate that executes reasoning or tool-using
  execution segments
- external automation systems such as n8n may execute deterministic workflow
  segments
- neither OpenClaw nor n8n becomes the owner of worker behavior, approval
  truth, routing semantics, or durable business records

## Core Rule

Workers may be **workflow-shaped** internally.

But Clawback will not become a generic workflow-builder product.

The operator-facing center of gravity remains:

- workers
- inbox
- work
- review
- activity

Not:

- node graphs
- trigger canvases
- generic branch editors

## What Clawback Owns

Clawback owns:

- worker responsibility and identity
- worker-step semantics
- worker decisions and routing
- work items, inbox items, reviews, and activity
- approval boundaries and audit meaning
- relationship memory and business context
- operator-facing explanation of what happened

## What OpenClaw Owns

OpenClaw owns:

- execution runtime for model/tool segments
- session/runtime transport
- streaming and operational execution plumbing

OpenClaw does **not** own:

- worker-step semantics
- relationship or routing semantics
- approval truth
- durable business work state

## What External Automation Backends Own

External automation backends such as n8n may own:

- deterministic API choreography
- long-tail integration flows
- fanout, retries, and utility automation

They do **not** own:

- why a business action should happen
- whether an action was approved
- the durable system-of-record for work coordination

## Consequences

Positive:

- preserves a real product core distinct from workflow automation tools
- clarifies the roles of OpenClaw and n8n
- supports richer worker behavior without forcing a full workflow-builder UI
- makes worker packs a stronger product-semantic abstraction

Negative:

- Clawback must define and maintain a native worker-step model
- there is one more architectural layer for contributors to learn
- some existing docs that compare Clawback to automation tools need nuance

## Explicit Non-Decisions

This ADR does **not** decide:

- the exact step schema for V1
- whether a dedicated execution-session record is required immediately
- whether a public user-facing flow editor ever exists
- whether external automation backends should later get a broader product role

Those require separate follow-up design and implementation docs.

## Follow-up

- define the native worker execution model in architecture docs
- define a foundation sprint for the first worker-step model
- update runtime and external-automation docs to place OpenClaw and n8n below
  that model
- update product-positioning docs so Clawback no longer overstates the
  difference from tools like n8n in simplistic terms
