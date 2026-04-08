# Changelog

All notable changes to Clawback's public releases should be documented here.

The format is intentionally simple while the product is still in beta.

## 0.4.1-beta - Unreleased

Bounded reliability patch for the first public beta.

### What Changed

- queue recovery now expires `run.execute` jobs within `5 minutes`
- connector sync recovery now expires queued sync jobs within `10 minutes`
- reviewed-send recovery now reconciles from a persisted provider receipt
  without re-sending after restart
- the console run stream now retries transient disconnects with bounded
  exponential backoff before falling back to persisted state

### Verification

The current `0.4.1` patch gate is green:

```bash
./scripts/start-local.sh
pnpm db:seed
pnpm smoke:public-try
pnpm test:console:first-run:e2e
pnpm test:migration-proof
pnpm test:deployed-stack
```

### Scope Boundary

- no new providers or channels
- no retrieval expansion
- no broader launch-hardening backlog
- run-level watchdog / reaper remains outside the required patch scope

## 0.4.0-beta - 2026-03-29

First public self-hosted OSS beta release.

### What This Release Includes

- worker-first console with `Workers`, `Inbox`, `Work`, `Connections`,
  `Connectors`, and `Activity`
- single-node Docker Compose deployment with Caddy TLS termination
- no-Google first-value path through local-directory retrieval and forward email
- optional Gmail read-only watched inbox path
- reviewed outbound send through SMTP relay
- n8n workflow handoff path
- plugin/provider-capable product edges with a narrower real-provider set

### Public Beta Highlights

- the product can be tried honestly as a self-hosted beta
- the main governed worker loop is real: ingest, decide, review, execute,
  activity
- retrieval is real enough for the current beta claim, with keyword search and
  citations
- the public docs now describe one bounded self-hosted beta story instead of a
  mix of pilot and launch language

### Verification Baseline

The strongest current verification commands are:

```bash
pnpm smoke:public-try
pnpm test:console:first-run:e2e
pnpm test:migration-proof
pnpm test:deployed-stack
```

### Known Boundaries

- single-node only
- self-hosted only
- keyword retrieval with citations, not semantic retrieval
- provider breadth is intentionally narrow
- Gmail connected setup is optional and heavier than the no-Google path
- some launch-grade operational work remains outside this beta

### Read This Release With

- `README.md`
- `docs/guides/quickstart.md`
- `docs/guides/deployment.md`
- `docs/guides/verification-and-testing.md`
- `docs/guides/troubleshooting.md`
- `docs/guides/known-limitations.md`
- `docs/beta/0.4-signoff-2026-03-26.md`
