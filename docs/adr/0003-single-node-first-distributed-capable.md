# ADR 0003: Build Appliance-First, Not Appliance-Only

## Status

Accepted

## Context

The early market for this product is likely SMBs, consultants, and small
internal teams. They need simple deployment. At the same time, we do not want
to repeat the trap of building a tightly coupled local stack that cannot evolve.

## Decision

Clawback will prioritize a single-node deployment experience first, while
keeping service boundaries, storage contracts, and event flows compatible with a
later distributed deployment.

## Rationale

- speeds up initial adoption
- fits the likely first buyers
- avoids over-engineering for day-one scale
- protects us from a dead-end architecture

## Consequences

Positive:

- practical first launch shape
- easier demos and pilots
- simpler support for agency-managed installs

Negative:

- requires discipline to avoid "just local" shortcuts
- may feel slightly heavier than a purely monolithic app in early code
