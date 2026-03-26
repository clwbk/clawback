# Security Policy

## Supported Scope

Clawback is currently a public self-hosted beta. Security reports are still
important, but the product should be treated as beta software rather than a
finished production platform.

Current known limitations are documented in:

- `docs/beta/0.4-current-limitations.md`
- `docs/guides/known-limitations.md`

## Reporting a Vulnerability

Please avoid posting full exploit details in a public issue first.

Preferred order:

1. Use GitHub private vulnerability reporting, if it is enabled for the repo.
2. If private reporting is not available, open a minimal public issue that says
   you have a security concern and need a private contact channel.

Please include:

- affected component
- impact
- reproduction steps
- any suggested mitigation

Do not include live credentials, private keys, or customer data in the report.

## What to Expect

For valid reports, maintainers should aim to:

- acknowledge the report
- assess severity and scope
- prepare a fix or mitigation
- document any user action required

Because this is an early-stage self-hosted beta, response times may vary, but
security issues should still be treated as high priority.

## Secure Contribution Notes

If you contribute code:

- do not commit service-account JSON keys, OAuth secrets, or `.env` files
- prefer test fixtures and redacted examples over real credentials
- avoid pasting secrets into screenshots, docs, or logs
