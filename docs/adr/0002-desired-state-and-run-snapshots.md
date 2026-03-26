# ADR 0002: Use Desired State in the Database and Snapshot Runs

## Status

Accepted

## Context

Pinchy's current model relies on generated config files, shared workspace files,
and runtime restarts when key state changes. That is workable for a small stack,
but it couples runtime behavior to shared mutable files and makes some
deployment targets awkward.

## Decision

Clawback will:

- store agent, policy, connector, and channel configuration as versioned records
  in the database
- generate immutable run snapshots at execution time
- avoid shared files as the primary control contract

Files may still exist for export, caching, or interoperability, but not as the
source of truth.

## Rationale

- removes shared-volume coupling
- allows new config versions without hard runtime restarts
- supports both single-node and distributed modes
- makes audit and rollback more explicit

## Consequences

Positive:

- easier hosting flexibility
- cleaner version history
- simpler reasoning about what config a run used

Negative:

- requires explicit snapshot models
- adds up-front schema design work
- forces us to define config lifecycle early
