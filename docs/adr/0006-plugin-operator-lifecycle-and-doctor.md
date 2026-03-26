# ADR 0006: Give Real Provider Plugins An Explicit Operator Lifecycle And Doctor Contract

## Status

Accepted

## Context

Clawback now has a hardened plugin-capable core:

- typed manifests
- shared registry contracts
- registry-aware console surfaces
- proof fallback providers

That is enough to scale listing and setup metadata, but it is not enough to
scale **real** plugins safely.

The next real adoption sprint introduces:

- WhatsApp as an approval surface
- Google Drive read-only
- GitHub read-only

Those plugins cannot be treated as simple manifest entries because operators
need more than discovery metadata. They need to know:

- what setup is required
- whether credentials/config are valid
- whether the provider is reachable and healthy
- what is degraded vs ready
- what to do next when something is wrong

OpenClaw handles this class of problem with richer onboarding, status, and
doctor surfaces. Clawback should learn from that operational rigor without
copying OpenClaw's broad runtime hook model.

The architectural question is:

- how should real Clawback plugins expose setup and health truth so multiple
  teams can add providers without inventing bespoke status logic each time?

## Decision

Clawback will add a small, explicit **operator lifecycle contract** for real
plugins that own setup or health semantics.

The first contract includes:

- `setupHelp`
- `validate`
- `probe`
- `status`
- `recoveryHints`

Clawback will also define a first **plugin doctor** output shape that surfaces
operator-facing diagnostics derived from those lifecycle functions.

## Scope

This contract is required first for:

- connection providers with real setup or health semantics
- approval surfaces with operator-facing setup or delivery health

For the next sprint, that means:

- Google Drive
- GitHub
- WhatsApp transport/setup where applicable

This contract is **not** the same thing as approval authority.

Clawback remains the approval authority for:

- review state
- work item execution truth
- inbox state
- activity and audit

## Explicit Non-Decisions

This ADR does **not** approve:

- dynamic third-party code loading in the control plane
- OpenClaw-style general lifecycle hooks for Clawback plugins
- plugins mutating review authority or audit truth
- replacing worker packs with runtime plugins

## Rationale

- keeps the product core fixed while making real integrations operationally
  legible
- prevents Drive/GitHub/WhatsApp from each inventing a different setup/status
  model
- makes future diagnostics and setup UX more consistent
- borrows OpenClaw's strongest operational lesson without adopting its whole
  runtime plugin model
- creates a safer parallel-development boundary for the next sprint

## Consequences

Positive:

- future real providers have one operator-facing contract to implement
- setup and health surfaces can become more truthful and less bespoke
- a first plugin doctor becomes possible without guessing across providers
- Drive and GitHub can share the same lifecycle shape from day one

Negative:

- introduces another contract that contributors must learn
- some existing first-party providers will need gradual retrofit
- a manifest alone is no longer enough for a "real" provider

## Follow-up

- define the detailed lifecycle and doctor shapes in architecture docs
- require the next real-adoption sprint to implement those shapes
- let WhatsApp approval semantics remain under tighter review separately from
  transport/operator lifecycle work
