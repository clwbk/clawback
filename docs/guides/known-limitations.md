# Known Limitations

An honest list of what Clawback does not yet do, what is intentionally narrow, and what still requires operator workarounds.

## Identity and Account Management

| Limitation | Current state |
| --- | --- |
| No SSO / SAML / OIDC | Password auth only |
| No MFA / passkeys | Not implemented yet |
| No self-service password reset | Admin or database intervention required |
| Invitation and people management UX is still narrow | Core worker/setup UX is much stronger than user-management UX |

## Gmail and Email

| Limitation | Current state |
| --- | --- |
| Gmail setup is not zero-config | There is an in-product browser OAuth start flow, but operators still have to bring their own Google OAuth app credentials or use a service account/manual setup |
| Gmail is not the send path | Gmail remains read-only in the current product; outbound reviewed email uses SMTP relay |
| Gmail "configured" is not the same as "actively monitoring" | You still need to attach Gmail to a worker and use `Check inbox now` to establish or advance monitoring |
| SMTP needs real server credentials | Reviewed email delivery is only real once SMTP env vars are present and the relay is connected |
| Missing SMTP blocks reviewed send | Approval does not silently succeed when SMTP is unavailable; the review stays pending until configuration is fixed |
| Provider breadth is still narrow | Forward-email ingress is Postmark-style, Gmail watch is the main proactive inbox path, and broader inbound provider coverage is still limited |

## Product Scope and Provider Breadth

Current first-party reference surfaces are intentionally narrow:

- Gmail read-only
- SMTP relay
- Slack approval
- n8n automation handoff
- local-directory connectors for retrieval

That means:

- Gmail is important but optional
- provider choice is not broad yet
- Clawback is still strongest on the worker/review/governance loop, not on integration breadth

## Deployment and Operations

| Limitation | Current state |
| --- | --- |
| Single-node only | No HA or clustering contract |
| Self-hosted only | No managed/SaaS offering |
| No built-in secret manager | Operators manage env vars and deployment secrets |
| Basic readiness only | `/healthz` and `/readyz` exist, but there is no full metrics or alerting stack |
| No automatic backups | Operators must back up Postgres and any persisted object storage themselves |
| No published container registry images yet | Production packaging exists, but images are built from source today |

## Security Gaps

Important things still not finished:

- no field-level encryption layer
- no cryptographically chained audit log
- no full sandbox enforcement for every tool execution path
- no mature production observability stack

Read [Security Overview](./security.md) for the broader picture.

## Retrieval and Product Proof

Clawback has real retrieval-backed smoke coverage, but the public evidence is still smoke-level proof, not a benchmark suite.

Current evidence:

- local-directory connector sync
- retrieval-backed incident copilot smoke
- governed action smoke on top of that retrieval flow

What is still missing:

- broader benchmark coverage
- larger public eval sets
- more diverse provider-backed retrieval paths

## Legacy / Transitional Areas

Some legacy surfaces still exist while the worker-first product shell becomes dominant.

Examples:

- chat still exists, but it is not the whole product story
- some older docs or labels may still appear in lower-priority areas
- boundary controls are partly promoted into worker settings rather than one finished shell-level control center

## Operational Edge Cases

These are real but currently acceptable for the single-node contract:

- some route-confirmation flows are not wrapped in one global transaction
- some structured actor attribution still relies on summary text
- legacy work items may still rely on execution-state fallback bridges
- SMTP idempotency is not a multi-node HA story

## See Also

- [Deployment Guide](./deployment.md)
- [Verification and Testing](./verification-and-testing.md)
- [Troubleshooting](./troubleshooting.md)
