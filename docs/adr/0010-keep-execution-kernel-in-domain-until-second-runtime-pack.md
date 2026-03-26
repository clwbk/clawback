# ADR 0010: Keep The Execution Kernel In Domain Until A Second Runtime Pack Forces A Split

## Status

Accepted

## Context

Phase 3 set out to prove three things before making a package-boundary call:

1. worker packs could share one code-level contract
2. persisted execution continuity could become worker-neutral at the platform
   layer
3. a synthetic validation pack could prove the contract was not secretly
   Follow-Up-shaped

That proof work has now landed.

The repo currently has:

- a unified `WorkerPackContract` in control-plane
- worker-neutral persisted continuity contracts in `@clawback/contracts`
- pure continuity helpers in `@clawback/domain`
- an explicit runtime continuation boundary for runtime-capable packs
- conformance tests and a synthetic validation pack proof

The remaining Phase 3 question was whether to extract a dedicated
`packages/execution-kernel` package immediately.

There are good reasons to consider that split:

- stronger compilation boundary around kernel code
- a more obvious conceptual home for continuity helpers
- a clearer signal that worker execution semantics are product-owned

There are also good reasons not to do it yet:

- the shared kernel surface is still small and continuity-specific
- only one real runtime-capable pack currently uses the runtime hooks
- `@clawback/domain` is still thin and already cleanly depends only on
  `@clawback/contracts`
- extracting now would mostly create import/build churn without retiring a
  concrete ambiguity in the current code

## Decision

Clawback will **keep the current execution kernel helpers in
`packages/domain` for now**.

Phase 3 is therefore considered complete without creating a new
`packages/execution-kernel` package.

This is not a retreat from the idea of a dedicated kernel package.
It is a deliberate judgment that the package split is not yet buying enough to
justify the churn.

## Why

The deciding factors are:

1. the shared kernel is now real, but still narrow
   - it mainly owns persisted continuity transitions
   - it is not yet a broad standalone execution subsystem
2. a second real runtime-capable pack has not yet forced package separation
   - the synthetic validation pack proves contract neutrality
   - it does not prove that multiple runtime packs need an independent kernel
     package today
3. `@clawback/domain` is currently an acceptable home
   - it is still small
   - it contains pure product semantics
   - it does not pull service or transport concerns into the kernel helpers

## Revisit Triggers

Re-open this decision when any of the following becomes true:

1. a second runtime-capable worker pack needs to reuse the continuity helpers
   directly
2. the shared execution layer grows beyond persisted continuity into a broader
   standalone subsystem
3. `@clawback/domain` starts accumulating unrelated product semantics such that
   the execution layer is no longer easy to locate or reason about
4. the repo needs a stronger compile-time or ownership boundary around the
   kernel than `@clawback/domain` currently provides

## Consequences

Positive:

- closes Phase 3 without premature package churn
- keeps the current proven semantics in the smallest working home
- preserves a clear future trigger for extraction rather than leaving it vague

Negative:

- the phrase "execution kernel" still maps to code inside `@clawback/domain`
  rather than a package with the same name
- contributors still need the ADR trail to understand why the package split was
  deferred

## Follow-up

- mark Phase 3 complete in the Phase 3 execution plan
- record a status snapshot of the stabilization program
- begin the next phase from a clean baseline rather than continuing to widen
  Phase 3
