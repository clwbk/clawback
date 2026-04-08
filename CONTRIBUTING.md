# Contributing to Clawback

Thanks for contributing.

## Before You Start

If you are fixing a bug, improving docs, or trying the product locally, start
with:

1. `README.md`
2. `docs/guides/getting-started.md`
3. `docs/guides/verification-and-testing.md`

If you are changing product contracts, deployment assumptions, or worker/plugin
boundaries, also read:

- `docs/beta/public-tryability-milestone.md`
- `docs/beta/0.4-signoff-2026-03-26.md`
- `docs/guides/plugins-and-providers.md`
- `docs/guides/plugin-development.md`

## Development Setup

Install and start the local stack:

```bash
pnpm install
./scripts/start-local.sh
```

Then open `http://localhost:3000/setup`.

If you prefer to run the stack in smaller pieces while developing:

```bash
pnpm compose:up
pnpm db:migrate
pnpm dev
```

If you want seeded demo data:

```bash
pnpm db:migrate
pnpm db:seed
```

## Useful Checks

Run the relevant checks before opening a PR:

```bash
pnpm typecheck
pnpm test
pnpm test:console
pnpm test:env
```

Higher-signal acceptance checks:

```bash
pnpm test:console:first-run:e2e
pnpm test:migration-proof
pnpm test:deployed-stack
```

You do not need to run every command for every change. For docs-only changes,
the smallest relevant check is enough. For code, packaging, or deployment
changes, prefer the higher-signal acceptance checks.

The public repo keeps one lightweight CI gate for code changes:

```bash
pnpm test:deployed-stack
```

That keeps contribution rules simple while still checking the real public beta
path.

## Contribution Rules

- Keep docs practical and implementation-oriented.
- Prefer updating the relevant public guide alongside any code changes.
- Add an ADR when an architectural decision becomes locked.
- Keep the single-node SMB deployment as a first-class constraint.
- Avoid drifting into a generic workflow-builder product unless the docs move there explicitly.
- Keep changes selective and scoped. Do not bundle unrelated edits.

## Pull Requests

Please include:

- what changed
- why it changed
- how you verified it
- any remaining risks or known limitations

Small, reviewable PRs are preferred over large mixed ones.

## Secrets and Local Files

Do not commit:

- `.env` files
- service account keys
- local runtime state
- generated screenshots or reports unless they are explicitly requested

The repo already ignores common local-secret patterns like `*-sa-key.json`. Keep
real credentials out of docs, tests, and issue reports.

## Security Issues

For security-sensitive issues, do not open a detailed public issue first. Follow
the instructions in `SECURITY.md`.
