# ADR 0007: Split WhatsApp Approval Core From Transport Adapters

## Status

Accepted

## Context

Clawback now has a real WhatsApp approval core:

- signed approve/deny actions
- explicit identity mapping
- allowlist enforcement
- idempotent resolution behavior
- audit truth owned by Clawback

That core is the right long-term shape.

But the first transport implementation drifted from the intended operator path.
The product plan and founder expectation were:

- OpenClaw-backed WhatsApp pairing via QR code for the first operator path

The first implementation instead landed:

- a Meta Cloud API-backed transport path

That Meta path is not useless, but it is not the best first operator experience
for the current team. It is more operationally involved and does not match the
original "pair and go" setup expectation.

The architectural question is:

- should Clawback replace the current approval core, or should it keep the core
  fixed and add multiple WhatsApp transport adapters underneath it?

## Decision

Clawback will keep the current WhatsApp approval core and treat WhatsApp
delivery as an adapter layer beneath it.

The first two transport adapters are:

- `openclaw_pairing`
- `meta_cloud_api`

The recommended default for operator/founder use is:

- `openclaw_pairing`

The Meta path remains supported as an alternate adapter, not the default
product story.

## Core Rule

Clawback owns:

- review authority
- signed approval tokens
- identity mapping
- allowlist checks
- replay safety
- audit truth

Transport adapters own:

- setup flow
- outbound delivery
- inbound callback or interaction plumbing
- transport-specific status/probe behavior

Transport adapters must not redefine:

- review resolution semantics
- approver identity rules
- approval idempotency behavior
- audit record structure

## Transport Contract

The shared WhatsApp approval surface should remain one logical surface in the
product, but it may be backed by different adapters.

The workspace-level provider remains:

- `whatsapp`

The transport mode beneath that provider must be explicit:

- `openclaw_pairing`
- `meta_cloud_api`

The chosen transport mode should drive:

- setup instructions
- validation/probe/status behavior
- recovery guidance
- runtime delivery plumbing

It must not change:

- how Clawback builds signed approval actions
- how a review is resolved
- how actor identity is verified

## Adapter Expectations

### `openclaw_pairing`

Intended for:

- founder/operator use
- fast internal adoption
- QR-based pairing with a dedicated work identity

Expected setup shape:

- pair a dedicated WhatsApp identity through OpenClaw
- expose pairing status in Clawback
- keep allowlist and workspace identity mapping in Clawback

Expected operator lifecycle shape:

- pairing instructions
- paired/unpaired status
- delivery reachability or session health
- recovery steps when the paired session is disconnected

### `meta_cloud_api`

Intended for:

- later broader business deployment
- explicit Meta-admin setup
- webhook-managed delivery flow

Expected setup shape:

- store or reference Meta credentials
- configure webhook verification
- expose delivery and callback health in Clawback

Expected operator lifecycle shape:

- credential setup instructions
- config validation
- live probe
- callback/delivery recovery hints

## Consequences

Positive:

- preserves the good `W1` approval core
- restores the intended low-friction operator path
- keeps Meta support without forcing it as the default
- gives future WhatsApp work a clean seam for delegation

Negative:

- adds one more architectural concept for contributors to learn
- requires the setup UI to present transport choice or a recommended default
- requires transport-specific doctor/status logic

## Non-Decisions

This ADR does not decide:

- whether both adapters should be visible in the first UI pass or only the
  recommended one
- whether a workspace may have more than one WhatsApp transport configured
- whether WhatsApp group approvals should ever exist
- whether Meta app secrets should eventually move into per-connection secret
  storage

## Follow-up

- define the concrete adapter seam in architecture docs
- update the sprint plan so the next implementation step is
  `openclaw_pairing`, not more Meta work
- keep any code touching approval truth under tighter review
