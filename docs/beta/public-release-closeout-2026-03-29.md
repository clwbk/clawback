# Public Release Closeout

Date opened: 2026-03-29

Status:

- bounded public-ship checklist for the `0.4.1` reliability patch
- public-facing release status summary for the current repo push
- retains the original Sunday March 29 framing so the closeout path is auditable

Ship windows:

- `today`: Sunday March 29, 2026
- `tomorrow`: Monday March 30, 2026
- `hard stop for this wave`: Friday April 3, 2026

## Purpose

Turn the signed-off `0.4` beta into a public release without reopening product
scope, milestone definition, or architecture planning.

This document exists to stop the "last steps" loop from growing.

After the repo chose to hold the public push until the bounded `0.4.1`
reliability patch was green, that patch became the effective release-closeout
wave. This document is the public-facing status summary for that wave.

The detailed lane-by-lane execution plan stays internal, but the checklist here
is the one public readers should follow.

It does that by:

- locking the release scope
- separating release blockers from follow-on work
- giving one bounded checklist for today, tomorrow, and this week

## Current `0.4.1` Ship Status

- [x] bounded `0.4.1` reliability work landed
- [x] targeted `0.4.1` proofs are green
- [x] full patch-release gate is green
- [x] refresh the public export with the latest docs and release notes
- [x] hosted Hetzner demo stack is up, healthy, and seeded
- [x] hosted `public-try-verify.sh` passed against the VM loopback control plane
- [ ] point `demo.clawback.team` at the current Hetzner VM
- [ ] add a model-provider key on the hosted stack if live AI-backed answers are required immediately
- [ ] push the public repo

## Historical Status Checklist

- [x] retains the initial Sunday March 29 framing
- [x] shows why the repo held the public push instead of shipping immediately
- [x] now serves as the public-facing status summary for the bounded `0.4.1` ship wave

Read this with:

- `docs/beta/0.4-signoff-2026-03-26.md`
- `docs/beta/0.4-current-limitations.md`
- `docs/guides/quickstart.md`
- `docs/guides/deployment.md`
- `docs/guides/verification-and-testing.md`
- `docs/guides/troubleshooting.md`
- `CHANGELOG.md`

## Scope Lock

This release is:

- the current public self-hosted OSS beta
- the already-signed-off `0.4` story
- one public repo push with a coherent doc surface

This release is **not**:

- a new milestone
- a new provider wave
- a launch-readiness pass
- a second deployment model
- a reopen of kernel, plugin, or worker-pack planning

If a task is not required for this public push, move it to post-release follow-on.

## Already Complete Before This Closeout Wave

- [x] `0.4` public beta signoff exists
- [x] public beta scope is frozen
- [x] quickstart, deployment, verification, and known-limitations guides exist
- [x] troubleshooting guide exists
- [x] public export workflow exists
- [x] graceful shutdown landed for the control plane
- [x] stale reviewed-execution guards landed

## Release Rule

Ship as soon as the earliest window passes all required checks.

Use this order:

1. If all `today` gates pass on Sunday March 29, 2026, release today.
2. If only narrow export or docs issues remain, fix them and release on Monday
   March 30, 2026.
3. If a real reliability gate fails, use the bounded repair window and either
   release by Friday April 3, 2026 or explicitly cut scope again.

Do **not** add new feature scope to justify delay.

## Today: Sunday March 29, 2026

Release today if all of these are complete:

### Public docs gate

- [x] `README.md` matches the current beta truth
- [x] `CHANGELOG.md` exists and describes the public beta release honestly
- [x] `docs/beta/README.md` points to the current public release docs
- [x] quickstart, deployment, verification, troubleshooting, and known
      limitations tell the same story
- [x] public docs do not imply launch readiness, HA, semantic retrieval, or
      broad provider maturity

### Public export gate

- [x] `./scripts/export-public-repo.sh ../clawback-public` completes cleanly
- [x] the exported tree contains the release docs and excludes internal planning
      docs
- [x] the exported tree contains no private-only file links or absolute-path
      references in the public guides

### Reliability gate

- [x] `pnpm smoke:public-try`
- [x] `pnpm test:console:first-run:e2e`
- [x] `pnpm test:migration-proof`
- [x] `pnpm test:deployed-stack`
- [x] no known critical regression remains in the supported no-Google public
      path

### Public repo readiness gate

- [x] exported repo boots with the documented quickstart path
- [x] exported repo can seed demo data and reach the setup/login surface
- [x] exported repo passes the main public verification flow
- [x] release commit set for the public repo is ready

## Historical Fallback Branch: Monday March 30, 2026

This branch is no longer the active checklist.

It was the original fallback if the blockers from Sunday March 29, 2026 were
narrow. The repo instead rolled the public push into the bounded `0.4.1`
reliability patch.

Allowed work:

- docs alignment
- export-script fixes
- public-repo boot-path fixes
- rerunning the release verification commands

Historical branch contents:

- fix the exact blocker from the Sunday March 29, 2026 attempt
- rerun the full public docs gate
- rerun the full public export gate
- rerun the full reliability gate
- push the public repo once those pass

## Historical Fallback Branch: By Friday April 3, 2026

This branch is no longer the active checklist.

It was the original fallback if a real release-blocking reliability issue
appeared. The repo instead turned that bounded repair lane into the active
`0.4.1` ship patch.

Allowed work:

- one bounded reliability repair
- one bounded deployment/export repair
- verification reruns

Not allowed:

- new feature work
- new provider scope
- broader launch-hardening backlog work

Historical branch contents:

- write down the single blocking defect in one sentence
- fix only that blocking defect
- rerun `pnpm smoke:public-try`
- rerun `pnpm test:console:first-run:e2e`
- rerun `pnpm test:migration-proof`
- rerun `pnpm test:deployed-stack`
- rerun the public export gate
- release by Friday April 3, 2026 or explicitly defer the push

## Explicit Non-Blockers For This Wave

These are real follow-on items, but they do not reopen this release by default:

- dedicated Gmail connected-path acceptance beyond current optional-path docs
- durable SMTP send receipts beyond the current guarded reviewed-send path
- SSE auto-reconnect improvement
- richer backups, monitoring, logging, or HA work
- broader provider/channel coverage
- semantic retrieval upgrades

If one of these becomes a release blocker, document the exact reason first.

## Public Docs That Must Ship In This Wave

- [x] `README.md`
- [x] `docs/guides/quickstart.md`
- [x] `docs/guides/deployment.md`
- [x] `docs/guides/verification-and-testing.md`
- [x] `docs/guides/troubleshooting.md`
- [x] `docs/guides/known-limitations.md`
- [x] `docs/beta/public-tryability-milestone.md`
- [x] `docs/beta/0.4-signoff-2026-03-26.md`
- [x] `docs/beta/0.4-current-limitations.md`
- [x] `CHANGELOG.md`
- [x] `docs/beta/public-release-closeout-2026-03-29.md`

## Additional Public Docs To Remember After This Push

These should be remembered, but they are not blockers for this bounded wave:

- [ ] `SUPPORT.md` or equivalent public support-routing guidance once issue
      volume is real
- [ ] public upgrade notes once the first post-`0.4` schema-changing release
      ships
- [ ] a tighter public architecture overview after the plugin/provider surface
      settles further

## Current Interpretation

- the Sunday March 29, 2026 gate passed
- the repo then chose to hold the public push until the bounded `0.4.1`
  reliability patch was green
- treat `0.4.1` as the effective release-closeout wave from that point onward

## Verification Evidence

Recorded on Sunday March 29, 2026:

- `pnpm smoke:public-try` passed
- `pnpm test:console:first-run:e2e` passed
- `pnpm test:migration-proof` passed
- `pnpm test:deployed-stack` passed
- `pnpm test:deployed-stack` also passed from `../clawback-public`
- `./scripts/export-public-repo.sh ../clawback-public` passed
- exported repo quickstart path passed:
  `pnpm install` -> `./scripts/start-local.sh` -> `pnpm db:seed` -> `pnpm smoke:public-try`
- public docs surface scan found no leaked absolute local links
- deployed-stack acceptance now uses isolated temp ports for Postgres, MinIO,
  and OpenClaw during the test harness run

Release-prep commits in this closeout wave:

- `2c7baf0` `docs: add bounded public release closeout tracker`
- `f0e268e` `docs: add public release execution strategy`
- `d7c76bc` `fix: harden public release verification lanes`
