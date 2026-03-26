# Security Overview

Clawback is a self-hosted control plane for enterprise AI agents. This document covers its security architecture, authentication model, data handling, and known gaps.

**Audience:** CISOs, security reviewers, and enterprise procurement teams evaluating Clawback for production deployment.

---

## Self-Hosted by Design

Clawback runs entirely within your infrastructure. There is no SaaS component, no telemetry phone-home, and no vendor-hosted data plane.

| Concern | How Clawback addresses it |
| --- | --- |
| Data residency | All data stays in your network. You choose the region, cloud, or on-prem host. |
| Network exposure | The control plane and workers communicate over your internal network. Only the console UI needs browser access. |
| Vendor access | Anthropic has no access to your deployment, data, or credentials. |
| Update model | You pull container images and apply upgrades on your own schedule. |

This means you control the entire trust perimeter: TLS termination, network policies, database credentials, and backup strategy are all yours.

---

## Authentication

### Password Hashing

Passwords are hashed with **argon2id** via the `argon2` Node.js library. argon2id is the recommended variant of Argon2 (RFC 9106), combining resistance to both side-channel and GPU-based attacks.

The implementation lives in `packages/auth/src/password.ts`:

```typescript
import argon2 from "argon2";

export async function hashPassword(password: string) {
  return await argon2.hash(password, {
    type: argon2.argon2id,
  });
}
```

The library's default parameters (memory cost, time cost, parallelism) are used. Raw passwords are never stored or logged.

### Session Management

Sessions use signed, opaque tokens stored in an `httpOnly` cookie.

| Property | Value |
| --- | --- |
| Cookie name | `clawback_session` |
| Signed | Yes (HMAC via `@fastify/cookie`) |
| `httpOnly` | `true` |
| `sameSite` | `lax` |
| `secure` | `true` in production, `false` in local dev |
| Max age | 7 days |
| Token format | 32 bytes from `crypto.randomBytes`, base64url-encoded |
| Server-side storage | SHA-256 hash of the token is stored in Postgres; the raw token is never persisted |

Sessions are touched on each authenticated request (`lastSeenAt` updated). Sessions can be explicitly revoked via the logout endpoint.

### CSRF Protection

All state-mutating endpoints (POST, PATCH) require a valid CSRF token.

- The CSRF token is returned in the authentication response after login or bootstrap.
- Clients send it back via the `x-csrf-token` HTTP header on every mutating request.
- CSRF protection is implemented with `@fastify/csrf-protection` using a signed cookie as the secret source.
- The CSRF cookie uses `sameSite: "lax"` and `httpOnly: false` (so the client can read the token).

### Email Normalization

Email addresses are lowercased and trimmed before storage and lookup, preventing duplicate accounts from case variation.

### No Default Credentials

Clawback ships with no built-in admin account. The first administrator is created through the `/setup` bootstrap flow, which is disabled once the first workspace exists. This prevents forgotten default-password vulnerabilities.

See the [Getting Started](./getting-started.md) guide for bootstrap instructions.

---

## Authorization

### Roles

Clawback uses two workspace-level roles:

| Role | Description |
| --- | --- |
| `admin` | Full workspace operator. Can manage settings, users, workers, connectors, secrets, approvals, and audit logs. |
| `user` | Standard end user. Can use published workers, manage their own personal workers, and view their own conversations and run outputs. |

### Permission Matrix

| Resource / Action | Admin | User |
| --- | --- | --- |
| View workspace settings | Yes | Limited profile only |
| Edit workspace settings | Yes | No |
| Invite or remove users | Yes | No |
| Create personal worker | Yes | Yes |
| Edit own personal worker | Yes | Yes |
| Edit another user's personal worker | Yes | No |
| Create shared worker | Yes | No |
| Publish shared worker | Yes | No |
| Use visible shared worker | Yes | Yes |
| Manage connectors and secrets | Yes | No |
| Start run on allowed worker | Yes | Yes |
| View own conversations | Yes | Yes |
| View any conversation in workspace | Yes | No |
| View detailed run traces for any run | Yes | No |
| View own run status and outputs | Yes | Yes |
| View workspace audit history | Yes | No |
| Approve gated actions | Yes | No |

### Workspace Isolation

Every resource in Clawback is scoped to a `workspace_id`. There is no cross-workspace data access path. Database queries enforce workspace boundaries at the data layer, not just the API layer.

### Invitation Flow

User onboarding is invite-only:

1. An admin creates an invitation, specifying the email and role (`admin` or `user`).
2. The system generates a 32-byte opaque token (stored as a SHA-256 hash).
3. Invitations expire after 7 days by default.
4. The invited user claims the invitation with the token, sets a display name and password, and receives a session.
5. Both invitation creation and claim are recorded as audit events.

---

## Data Architecture

### All State in Customer-Owned Postgres

Clawback stores all operational state in a single Postgres database that you provision and control. There is no external data store, no embedded database, and no vendor-managed persistence layer.

This includes: user accounts, sessions, workspace configuration, worker definitions, conversation history, run records, event streams, and audit logs.

### Immutable Run Snapshots

When a run is created, Clawback freezes the effective configuration into an immutable snapshot. This snapshot captures:

- The initiating actor
- The worker configuration and model settings at the time of the run
- Resolved connector scope
- Resolved tool policy
- Approval policy summary

Snapshots serve two purposes:

1. **Auditability** — You can inspect exactly what configuration was active for any historical run, regardless of later changes to the worker.
2. **Runtime consistency** — In-flight runs are not affected by live configuration edits.

### Event Trail

Every significant system action produces a typed event record. Events are append-only and include:

- Event type (e.g., `run.created`, `run.claimed`, `run.output.delta`, `run.completed`, `run.failed`)
- Run ID and sequence number
- Structured payload
- Timestamp

Audit events are stored separately and cover administrative actions:

- `workspace.bootstrap_admin` — Initial workspace creation
- `invitation.created` — New user invitation
- `invitation.claimed` — Invitation accepted

Each audit event records the actor ID, actor type, target resource, and a human-readable summary.

### Object Storage

Artifacts and document content are stored in S3-compatible object storage (AWS S3 or MinIO for on-prem deployments). Object storage credentials and bucket configuration are managed by the operator.

---

## Runtime Isolation

### Worker Execution

Worker runs are dispatched to separate runtime workers via a job queue (PgBoss, backed by Postgres). Runtime workers:

- Read the immutable run snapshot before execution
- Cannot broaden permissions beyond what the snapshot allows
- Pause execution when an approval-gated action is encountered
- Communicate results back through the event stream

The control plane and runtime workers are separate processes. In production deployments, they can run on separate hosts or in separate containers.

### Tool Execution Boundaries

Tools are classified into risk categories:

| Risk class | Examples | Approval required |
| --- | --- | --- |
| Safe | Retrieval, search, formatting | No |
| Guarded | Draft email, create note, generate export | Policy-dependent |
| Approval-gated | Send email, create ticket, write to external system | Yes, unless policy explicitly exempts |
| Restricted | Shell commands, arbitrary HTTP, filesystem writes | Disabled by default |

Tool execution isolation (sandboxed runtimes, filesystem/network restrictions) is part of the architecture design but is not yet fully implemented in V1. See [What's Not Yet Implemented](#whats-not-yet-implemented) below.

---

## Trust Boundaries

Clawback defines four trust boundaries:

| Boundary | What it protects |
| --- | --- |
| Browser to control plane | Sessions, CSRF/XSS surface, admin routes |
| Control plane to database | Desired state, audit integrity, secret references |
| Worker to tool runner | Secret scope, action authorization, tool sandboxing |
| Connector workers to external systems | Upstream credentials, ACL metadata, raw document storage |

Each boundary has distinct authentication and authorization mechanisms. The control plane is the central policy decision point; workers and tool runners are policy enforcement points that operate within the constraints set by the control plane.

---

## Deployment Hardening Checklist

For production deployments:

- [ ] Terminate TLS at a reverse proxy or load balancer in front of the control plane
- [ ] Set the `COOKIE_SECRET` environment variable to a strong random value (the default is for local development only)
- [ ] Set `NODE_ENV=production` to enable `secure` cookie flags
- [ ] Keep Postgres on a private network segment, not publicly accessible
- [ ] Do not expose worker-only services to the public internet
- [ ] Configure database backups and test restores regularly
- [ ] Set `CONSOLE_ORIGIN` to the exact origin of your console deployment (CORS allowlist)
- [ ] Rotate secrets and credentials on a regular schedule

---

## What's Not Yet Implemented

Transparency about current limitations:

| Capability | Status | Notes |
| --- | --- | --- |
| SSO / SAML / OIDC | Not yet implemented | The identity model supports an `provider` field on identities, making OIDC a natural extension. Planned. |
| Field-level encryption | Not yet implemented | Postgres column-level encryption for sensitive fields (e.g., secret material) is planned. Currently relies on database-level access controls. |
| SOC 2 certification | Not yet achieved | Planned. The audit trail and self-hosted model provide a strong foundation. |
| Tool execution sandboxing | Architecture defined, not enforced | Tool runner sandbox profiles (filesystem/network restrictions) are designed but not yet implemented at runtime. |
| Hash-chained audit logs | Not yet implemented | Audit events are append-only but do not yet use cryptographic hash chaining for tamper evidence. |
| MFA / passkey support | Not yet implemented | The auth foundation is passkey-capable but V1 ships with password-only authentication. |
| Signed export bundles | Not yet implemented | Audit export with cryptographic signatures for integrity verification is planned. |

These gaps are documented so you can make an informed deployment decision and plan compensating controls where needed.

---

## Summary

Clawback's security model is built on a few core principles:

1. **Self-hosted** — Your data never leaves your infrastructure.
2. **Explicit authorization** — Two clear roles, workspace isolation, no implicit access.
3. **Auditable** — Every significant action is recorded with actor attribution.
4. **Immutable snapshots** — Run-time behavior is frozen at dispatch and cannot be retroactively altered.
5. **Honest about gaps** — V1 ships without SSO, field-level encryption, and SOC 2. These are planned, not hidden.

For architecture details, see:

- [Getting Started](./getting-started.md) — Installation and bootstrap
- `docs/architecture/security-model.md` — Internal security design principles
- `docs/architecture/identity-and-authorization.md` — Full authorization model and enforcement pipeline
