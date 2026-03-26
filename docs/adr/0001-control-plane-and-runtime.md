# ADR 0001: Separate Control Plane and Execution Plane

## Status

Accepted

## Context

We want the product to preserve the simple operator model of a governed agent
platform, while being more portable and flexible than Pinchy's current runtime
packaging.

If the same service owns UI, auth, policy, and agent execution, we simplify
local development but increase coupling between:

- operator-facing features
- runtime stability
- security boundaries
- scaling concerns

## Decision

Clawback will separate:

- a control plane for auth, config, policy, approvals, and audit
- an execution plane for model runs and tool invocation

The first release may package these together for single-node deployment, but
they will remain separate architectural roles with explicit contracts.

## Rationale

- allows runtime workers to fail or restart without taking down the control plane
- keeps high-risk tool execution away from auth and admin surfaces
- supports later horizontal scaling without a redesign
- preserves the mental model while reducing implementation coupling

## Consequences

Positive:

- better long-term portability
- better fault isolation
- cleaner security story
- easier observability by component

Negative:

- more moving parts
- need explicit contracts and event models
- slightly more work in early implementation
