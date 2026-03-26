# Contributing to Clawback

Thanks for contributing.

## Before You Start

Clawback is planning-first and contract-sensitive. Read these first:

1. `docs/what-is-clawback.md`
2. `docs/beta/public-tryability-milestone.md`
3. `docs/beta/0.4-signoff-2026-03-26.md`
4. `docs/guides/getting-started.md`

For architectural work, also read:

- `README.md`
- `docs/guides/plugins-and-providers.md`
- `docs/guides/plugin-development.md`

## Development Setup

Install and start the local stack:

```bash
pnpm install
pnpm compose:up:core
pnpm openclaw:dev
pnpm dev
```

Then open `http://localhost:3000/setup`.

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
