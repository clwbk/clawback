# ADR 0009: Sequence Kernel Generalization After Semantic Freeze

## Status

Accepted

## Context

Two valid implementation strategies emerged once the stabilization plan moved
from docs into code:

1. generalize immediately into a dedicated `packages/execution-kernel`
   package with strongly generic worker-pack interfaces
2. extract the proven shared mechanics first into pure domain helpers, freeze
   the semantics, and only then decide how much generic structure is actually
   warranted

The repo intentionally chose the second path.

That choice was not accidental drift. It was conservative sequencing:

- prove persisted continuity, review continuation, route continuation, and
  outcome/activity normalization in code first
- avoid freezing speculative package and type boundaries too early
- avoid designing the platform around today's reference packs or around
  over-generalized worker abstractions we do not yet trust

That proof work has now materially landed:

- `O1` ingress boundary
- `O2` source-event and triage authority
- `O3` execution-kernel extraction into pure helpers
- `O4` review continuation tightening
- `O5` route continuation alignment
- `O6` outcome and activity normalization
- `O7` work-item vs inbox-item execution authority
- `O8` retrieval-lane visibility and honesty improvements

At the same time, a real gap remains.

The current shared helpers in `packages/domain/src/follow-up-execution.ts` are
still Follow-Up-shaped by API surface. That is acceptable as a proving step,
but it is not the end-state worker-pack contract.

So the architectural question is no longer:

- should the repo have generalized immediately?

The question is now:

- what explicit trigger moves the repo from proven semantics into code-level
  worker-pack formalization and potential package extraction?

## Decision

Clawback will keep the current **domain-first kernel extraction** as the
accepted Phase 2 implementation path.

That means:

- pure shared transition helpers live in `packages/domain` first
- the current state is treated as **stabilized shared continuity for the first
  proving path**
- the current state is **not** described as the final worker-neutral kernel

The next generalization step is also now explicit.

Clawback will **finish the current bounded O9 route-decomposition wave, then
pivot to Phase 3 in code**.

This is a planned transition, not an undefined "eventually" and not a
customer-signal-only deferral.

## Trigger For Generalization

Phase 3 code formalization begins when all of the following are true:

1. the current O9 wave has extracted the remaining provider-family route seams
   from `services/control-plane/src/workspace-routes.ts`
2. the existing workspace-route coverage still proves unchanged behavior
3. no new review/execution/activity truth changes are in flight
4. broad `app.ts` decomposition has not yet started

In other words:

- finish the bounded cleanup inside `workspace-routes.ts`
- then stop expanding O9
- then formalize the worker-pack contract in code

## What Phase 3 Must Deliver

Phase 3 in code must produce:

- a typed code-level worker-pack contract
- unified manifest/install/runtime expectations
- a worker-neutral continuity vocabulary that a second pack can use without
  copy-pasting Follow-Up-shaped helpers
- a synthetic validation pack that proves the contract is not secretly
  Follow-Up-specific
- a deliberate package-boundary decision:
  - remain in `packages/domain` if that is still the clearest proven home
  - or extract to `packages/execution-kernel` if the neutral contract is now
    real enough to justify the split

## Rationale

This sequencing preserves both of the important truths:

1. the package-first kernel proposal was a valid architectural direction
2. the repo was right to prove the shared semantics first before freezing a
   generic package and type hierarchy

The repo should therefore adjust its messaging, not reverse direction:

- current code is not "final plugin architecture complete"
- current code is not "just random Follow-Up helpers" either
- current code is the successful semantic freeze that enables the next
  generalization step

## Consequences

Positive:

- preserves the conservative sequencing that already reduced drift
- prevents future sessions from treating Phase 3 code as a vague future idea
- keeps O9 bounded instead of letting route decomposition expand indefinitely
- makes the package-boundary question contingent on a real neutral contract

Negative:

- the helper API surface remains Follow-Up-shaped for one more bounded wave
- the dedicated `packages/execution-kernel` boundary remains provisional
- contributors still need to read the sequencing note to understand why the
  current helper location is intentional

## Explicit Non-Decisions

This ADR does **not** decide:

- the exact final generic type shape for execution continuity
- whether the final package name should be `execution-kernel` or something else
- whether worker-pack registries should eventually become externally loadable
- the final set of first-party reference packs

Those belong to the Phase 3 implementation work.

## Follow-up

- update the stabilization plan with this sequencing note and trigger
- finish the bounded O9 wave
- start Phase 3 code formalization immediately after that stop point
