# Public Tryability Milestone

## Goal

Turn the current internal alpha into a publicly tryable self-hosted OSS beta
without reintroducing product drift.

This milestone is about:

- whether strangers can install and run the product
- whether the first product story works without founder-only context
- whether the contract layer is stable enough for fast parallel hardening

Read this with:

- `docs/beta/0.4-signoff-2026-03-26.md`
- `docs/beta/0.4-current-limitations.md`
- `docs/guides/quickstart.md`
- `docs/guides/deployment.md`
- `docs/guides/verification-and-testing.md`
- `docs/guides/known-limitations.md`

## Execution Note

This doc defines the milestone and quality bar.

Status, 2026-03-26:

- the milestone is now signed off for public tryable OSS beta
- final signoff is recorded in `docs/beta/0.4-signoff-2026-03-26.md`

## Milestone Definition

This milestone is complete when Clawback can be put in front of real outside
users and honestly claim:

- one person can deploy the supported self-hosted stack without developer-only tribal knowledge
- the product has a no-trust path for trying it before Google setup
- one connected Gmail path exists and is honest about self-hosted constraints
- one reviewed outbound action can perform a real external side effect
- workers can be installed/configured in-product well enough for public try users
- operators and evaluators have a clear setup, verification, and recovery path

It is **not** complete when:

- the product is still only easy to run from a developer checkout
- public users must set up Google before they can experience value
- docs overclaim what Gmail, send, or deployment can do
- approval still only advances Clawback state with no real external effect
- packaging, security, or recovery are still founder-only knowledge

## Frozen Product Choices

These are locked for this milestone.

### 1. The target is public tryable OSS beta, not broad launch

The supported posture is:

- self-hosted
- single-node first
- openly documented
- honest about limitations

This milestone is stronger than a guided private rollout, but narrower than a
polished general-availability launch.

### 2. Public try must not depend on Google

The public try path must include low-trust entry points such as:

- demo workspace
- local-directory retrieval-backed value
- forward one email into the governed loop

Gmail should be important, but not mandatory for first product value.

The current `0.4` activation ladder is:

1. demo workspace
2. local-directory retrieval path
3. forward-one-email governed path
4. optional Gmail read-only connected path
5. reviewed outbound side effect through the supported send path

### 3. Gmail remains an optional connected path

For this milestone, Gmail should be:

- an admin/operator-managed connected path
- read-only first
- clearly labeled with its self-hosted setup costs

It should not be:

- the only activation path
- a silent prerequisite for trying the product

### 4. Send remains separate from read-only watch

Do not collapse:

- Gmail read-only watch

and:

- reviewed outbound send

into one vague "Google connected" abstraction.

### 5. Workers remain the product unit

Users install and configure:

- workers

not:

- raw plugins
- runtime adapters
- OpenClaw mechanics

### 6. Plugins stay behind the contract layer

Provider and plugin work may change:

- auth handshakes
- normalization
- transport plumbing
- provider metadata

They must not silently redefine:

- product nouns
- review/execution semantics
- supported public claims

## In Scope

### A. Public try activation path

Must include:

- demo workspace
- local-directory retrieval as the primary no-Google first-value path
- forward one email as the secondary no-Google real-input path
- public-facing setup and known-limitation docs

### B. Connected Gmail path

Must include:

- one honest self-hosted Gmail read-only flow
- clear scope and setup labeling
- reconnect/error states

### C. One true governed outbound action

Must include:

- real external delivery for one reviewed email path
- idempotency
- failure visibility
- recovery guidance

### D. Self-hosted packaging and deployment

Must include:

- buildable service images
- one supported deployment shape
- documented configuration and startup path
- basic readiness and recovery story

### E. Security baseline for public try

Must include:

- rate limiting
- server-side auth protection
- security headers
- strong secret enforcement

### F. Product and operator docs

Must include:

- getting started
- deployment docs
- verification steps
- troubleshooting notes
- known limitations

## Out Of Scope

Do not let this milestone expand into:

- enterprise SSO or fine-grained org features
- broad provider/channel parity
- browser-perfect OAuth for every integration
- fully managed hosted deployment
- generalized workflow-builder product scope
- full GA/launch hardening beyond the documented beta bar

## Required Serial Freeze Before Parallel Work

Before broad parallel implementation, one owner must freeze:

- the public beta claim
- the product contract layer
- the provider/plugin boundary
- the deployment/support contract
- the acceptance checklist

The internal freeze and execution-map documents were used to reach this state.
For the public repo, treat this milestone plus the final signoff and verification
guides as the authoritative `0.4` path.
