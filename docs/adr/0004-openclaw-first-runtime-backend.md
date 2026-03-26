# ADR 0004: Use OpenClaw as the First Runtime Backend While Keeping Clawback as the System of Record

## Status

Accepted

## Context

Clawback is intentionally inspired by Pinchy's product model, but it does not
want to inherit Pinchy's tight coupling around generated runtime config, shared
workspace files, and runtime-owned transcript history.

At the same time, OpenClaw already provides a sophisticated execution
environment:

- a mature agent loop
- typed gateway events
- session handling and queueing
- tool execution and approvals support
- multi-channel and node capabilities

The core decision is not whether OpenClaw is valuable. It clearly is. The core
decision is where the business system boundary belongs.

Clawback needs to own product concerns that are not native OpenClaw concerns:

- workspace membership and user roles
- agent publication and versioning
- platform-owned conversations and messages
- approval policy and audit records
- connector governance
- typed policy decisions over tools and access

## Decision

For V1, Clawback will:

- use OpenClaw as the required first execution backend
- keep Clawback as the source of truth for desired state
- keep conversations, messages, approvals, audit, and policy as Clawback-owned
  records
- route all end-user traffic through Clawback rather than allowing direct user
  access to OpenClaw
- map one OpenClaw gateway to one customer deployment or trust boundary
- preserve an internal `RunEngine` interface so a native runtime or additional
  runtime backends remain possible later

## Rationale

- reuses a strong runtime instead of rebuilding one too early
- preserves much of Pinchy's mental model and deployment shape
- keeps business RBAC in Clawback rather than forcing it into OpenClaw's
  operator-scoped trust model
- lets Clawback own durable transcript history and other business records
- avoids making generated config, shared files, or runtime-private history the
  product contract
- keeps an exit path if the OpenClaw integration proves too constraining

## Consequences

Positive:

- faster path to a serious V1 runtime
- clearer boundary between business control plane and execution engine
- lower risk of rebuilding runtime features badly
- cleaner long-term path to transcript search, approvals, and auditability

Negative:

- Clawback must build and maintain an integration layer into OpenClaw
- event mapping and transcript ingestion become explicit implementation work
- some OpenClaw capabilities will need to be hidden, constrained, or deferred
- the first release still depends on an external runtime with its own operational
  model

## Follow-up

- validate the decision with the OpenClaw runtime spike before broad scaffolding
- define the first `RunEngine` contract around OpenClaw event mapping
- define the first publication contract from Clawback agent versions into
  OpenClaw runtime material
