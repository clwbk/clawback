# ADR 0005: Keep A Stable Core Model While Adding Typed First-Party Plugin Registries

## Status

Accepted

## Context

Clawback has reached the point where the main product model is much clearer
than the delivery pace.

The core system shape is now established:

- workspace
- workers
- input routes
- connections
- work items
- inbox items
- reviews
- activity

The current bottleneck is increasingly one of scale:

- new integrations are costly to add
- new worker types are costly to add
- setup UX risks becoming hardcoded per provider
- parallel work by multiple agents easily drifts without stronger contracts

At the same time, there is a real risk in overreacting:

- if everything becomes a plugin, the product model becomes incoherent
- if runtime code loading becomes dynamic too early, the security and
  self-hosting story get worse
- if every provider invents its own lifecycle model, the shell stops being
  legible

The architectural question is not whether plugins are good in the abstract.
The real question is:

- where should Clawback become pluggable, and where must it remain core?

## Decision

Clawback will adopt a **plugin-capable architecture with a stable core model**.

Specifically:

- the product/state backbone remains first-class and non-pluggable
- extension seams become pluggable through typed first-party registries
- the first implementation stage is **monorepo typed registries**, not dynamic
  third-party runtime loading

## Core Model That Remains Non-Pluggable

These remain product-native platform objects:

- workspace
- user and membership
- worker
- input route
- connection record
- action capability
- work item
- inbox item
- review
- activity event
- approval / execution truth model
- audit truth model

These objects define the product’s legibility and must not vary by plugin.

## Plugin Classes

The first supported plugin classes are:

### 1. Connection provider plugins

Examples:

- Gmail read-only
- SMTP relay
- Drive
- Calendar
- GitHub
- ticketing providers

### 2. Ingress adapter plugins

Examples:

- Postmark inbound
- Gmail watch hook
- generic webhook trigger
- future schedule or provider-specific inbound adapters

### 3. Action executor plugins

Examples:

- SMTP send
- future Gmail send
- create ticket
- open PR

### 4. Worker pack plugins

Examples:

- Follow-Up
- Proposal
- future Incident / Bugfix / Recruiting / Billing worker packs

## First Implementation Stage

The first implementation stage is:

- **first-party typed registries in the monorepo**

This means:

- plugin manifests are defined in code and versioned in the repo
- the control plane owns registries for plugin classes
- the UI can consume setup/install metadata from manifests
- there is no arbitrary external plugin loading in this stage

## Rationale

- gives parallel teams and agents a stable contract to build against
- keeps core lifecycle semantics coherent
- improves setup UX scalability by moving provider metadata into manifests
- avoids early security and operational complexity from dynamic plugin loading
- creates a clean path toward future SDKs and externalized packages if the
  product truly needs them later

## Consequences

Positive:

- more parallel development with less contract drift
- faster addition of providers, ingress paths, executors, and worker packs
- setup and health surfaces can become manifest-driven rather than page-specific
- clearer boundary between core lifecycle and capability edges

Negative:

- introduces a second architectural layer that must stay disciplined
- manifests can become decorative unless the product actually consumes them
- some existing provider/worker definitions will need gradual conversion

## Explicit Non-Decision

This ADR does **not** approve:

- arbitrary third-party runtime plugin loading
- marketplace-style plugin installation
- untrusted external code execution inside the control plane

Those are future possibilities and require separate decisions.

## Follow-up

- add a `plugin-sdk` package with typed manifest contracts
- add first-party registries in the control plane
- convert the first provider, ingress adapter, action executor, and worker pack
  to the registry model
- eventually move setup UX to consume manifest metadata instead of hardcoded
  provider knowledge
