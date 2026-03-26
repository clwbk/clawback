# API Reference

Complete HTTP API for the Clawback control-plane service. All endpoints live on the control-plane server (default `http://localhost:3001`).

**Audience:** Developers integrating with Clawback programmatically.

**Related guides:** [Getting Started](./getting-started.md) | [Admin Guide](./admin-guide.md) | [Security Overview](./security.md)

---

## Authentication

Clawback uses session cookies for authentication. The flow is:

1. **Login** (`POST /api/auth/login`) with email and password.
2. The response sets a signed `clawback_session` cookie and returns a CSRF token.
3. Include the cookie on all subsequent requests (browsers do this automatically; with `curl`, use `-b` / `-c` to manage a cookie jar).

The session cookie is:

| Property   | Value                                              |
| ---------- | -------------------------------------------------- |
| Name       | `clawback_session`                                 |
| `httpOnly` | `true`                                             |
| `signed`   | `true`                                             |
| `sameSite` | `lax`                                              |
| `secure`   | `true` in production, `false` in development       |
| `maxAge`   | 7 days (604800 seconds)                            |

### Login example

```bash
# Login and save cookies to a jar file
curl -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'
```

Response:

```json
{
  "user": {
    "id": "usr_abc123",
    "email": "admin@example.com",
    "display_name": "Admin"
  },
  "workspace": {
    "id": "ws_xyz789",
    "slug": "acme",
    "name": "Acme Corp"
  },
  "membership": {
    "role": "admin"
  },
  "csrf_token": "a1b2c3d4e5f6"
}
```

Save the `csrf_token` from the response -- you need it for all mutating requests.

---

## CSRF Protection

All mutating requests (`POST`, `PATCH`) require a CSRF token sent via the `x-csrf-token` header. The token is returned in every authenticated session response (login, bootstrap, session refresh).

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"name": "My Agent", "scope": "shared"}'
```

If the CSRF token is missing or invalid, the server returns `403 Forbidden`.

---

## Error Format

All errors follow this shape:

```json
{
  "code": "unauthorized",
  "error": "Authentication is required."
}
```

Zod validation failures return:

```json
{
  "error": "Invalid request payload."
}
```

Common error codes:

| HTTP Status | `code`           | Meaning                                  |
| ----------- | ---------------- | ---------------------------------------- |
| 400         | *(none)*         | Validation error (malformed body/params) |
| 401         | `unauthorized`   | Missing or invalid session               |
| 403         | `forbidden`      | Insufficient permissions (e.g. not admin)|
| 403         | *(none)*         | Missing or invalid CSRF token            |
| 404         | `not_found`      | Resource does not exist                  |
| 409         | `conflict`       | Conflict (e.g. workspace already exists) |
| 500         | *(none)*         | Internal server error                    |

---

## Endpoints

### Health Check

#### `GET /healthz`

Returns service health status. No authentication required.

**Response:**

```json
{
  "ok": true,
  "service": "control-plane"
}
```

---

### Setup

#### `GET /api/setup/status`

Check whether the workspace has been bootstrapped (first admin created). No authentication required.

**Response:**

```json
{
  "bootstrapped": false
}
```

---

#### `POST /api/setup/bootstrap-admin`

Create the first admin user and workspace. Only works when `bootstrapped` is `false`.

**Request body:**

```json
{
  "workspace_name": "Acme Corp",
  "workspace_slug": "acme",
  "email": "admin@example.com",
  "display_name": "Admin",
  "password": "password"
}
```

| Field            | Type     | Required | Notes                |
| ---------------- | -------- | -------- | -------------------- |
| `workspace_name` | `string` | yes      | Human-readable name  |
| `workspace_slug` | `string` | yes      | URL-safe identifier  |
| `email`          | `string` | yes      | Valid email address   |
| `display_name`   | `string` | yes      | User's display name  |
| `password`       | `string` | yes      | Minimum 8 characters |

**Response (201):** Same shape as the [login response](#login-example) -- sets a session cookie and returns `csrf_token`.

**curl:**

```bash
curl -c cookies.txt -X POST http://localhost:3001/api/setup/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_name": "Acme Corp",
    "workspace_slug": "acme",
    "email": "admin@example.com",
    "display_name": "Admin",
    "password": "password"
  }'
```

**Errors:**

| Status | Code       | When                              |
| ------ | ---------- | --------------------------------- |
| 409    | `conflict` | Workspace is already bootstrapped |

---

### Auth

#### `POST /api/auth/login`

Authenticate with email and password.

**Request body:**

```json
{
  "email": "admin@example.com",
  "password": "password"
}
```

| Field      | Type     | Required | Notes                |
| ---------- | -------- | -------- | -------------------- |
| `email`    | `string` | yes      | Valid email address   |
| `password` | `string` | yes      | Minimum 8 characters |

**Response (200):**

```json
{
  "user": {
    "id": "usr_abc123",
    "email": "admin@example.com",
    "display_name": "Admin"
  },
  "workspace": {
    "id": "ws_xyz789",
    "slug": "acme",
    "name": "Acme Corp"
  },
  "membership": {
    "role": "admin"
  },
  "csrf_token": "a1b2c3d4e5f6"
}
```

**Errors:**

| Status | Code             | When                        |
| ------ | ---------------- | --------------------------- |
| 401    | `unauthorized`   | Invalid email or password   |

---

#### `GET /api/auth/session`

Get the current authenticated session. Requires a valid session cookie.

**Response (200):** Same shape as the login response (includes a fresh `csrf_token`).

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/auth/session
```

**Errors:**

| Status | Code           | When                   |
| ------ | -------------- | ---------------------- |
| 401    | `unauthorized` | No valid session found |

---

#### `POST /api/auth/logout`

End the current session. Requires CSRF token.

**Request headers:**

| Header         | Value             |
| -------------- | ----------------- |
| `x-csrf-token` | Current CSRF token |

**Response:** `204 No Content` (empty body).

**curl:**

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/auth/logout \
  -H "x-csrf-token: a1b2c3d4e5f6"
```

---

### Invitations

#### `POST /api/invitations`

Create an invitation to join the workspace. **Admin only.** Requires CSRF token.

**Request body:**

```json
{
  "email": "teammate@example.com",
  "role": "user",
  "expires_at": "2026-04-01T00:00:00.000Z"
}
```

| Field        | Type     | Required | Notes                            |
| ------------ | -------- | -------- | -------------------------------- |
| `email`      | `string` | yes      | Invitee's email address          |
| `role`       | `string` | yes      | `"admin"` or `"user"`            |
| `expires_at` | `string` | no       | ISO 8601 timestamp; default 7 days from creation |

**Response (201):**

```json
{
  "invitation": {
    "id": "inv_abc123",
    "email": "teammate@example.com",
    "role": "user",
    "expires_at": "2026-04-01T00:00:00.000Z",
    "accepted_at": null,
    "created_at": "2026-03-11T12:00:00.000Z"
  },
  "token": "invite_token_string"
}
```

**Errors:**

| Status | Code        | When                      |
| ------ | ----------- | ------------------------- |
| 401    | `unauthorized` | Not authenticated      |
| 403    | `forbidden`    | Caller is not an admin |

---

#### `POST /api/invitations/claim`

Claim an invitation and create a user account. No session required (the invitation token authenticates the request).

**Request body:**

```json
{
  "token": "invite_token_string",
  "display_name": "New User",
  "password": "securepass"
}
```

| Field          | Type     | Required | Notes                |
| -------------- | -------- | -------- | -------------------- |
| `token`        | `string` | yes      | Invitation token     |
| `display_name` | `string` | yes      | User's display name  |
| `password`     | `string` | yes      | Minimum 8 characters |

**Response (201):** Same shape as the login response -- sets a session cookie and returns `csrf_token`.

**Errors:**

| Status | Code           | When                                  |
| ------ | -------------- | ------------------------------------- |
| 404    | `not_found`    | Invalid or expired invitation token   |
| 409    | `conflict`     | Invitation already claimed            |

---

### Agents

All agent endpoints require an authenticated session.

#### `GET /api/agents`

List all agents visible to the current user.

**Response (200):**

```json
{
  "agents": [
    {
      "id": "agt_abc123",
      "workspace_id": "ws_xyz789",
      "name": "Support Bot",
      "slug": "support-bot",
      "scope": "shared",
      "status": "active",
      "owner_user_id": null,
      "created_at": "2026-03-01T10:00:00.000Z",
      "updated_at": "2026-03-10T15:30:00.000Z",
      "draft_version": {
        "id": "ver_draft1",
        "agent_id": "agt_abc123",
        "version_number": 2,
        "status": "draft",
        "published_at": null,
        "created_at": "2026-03-10T15:30:00.000Z"
      },
      "published_version": {
        "id": "ver_pub1",
        "agent_id": "agt_abc123",
        "version_number": 1,
        "status": "published",
        "published_at": "2026-03-05T12:00:00.000Z",
        "created_at": "2026-03-01T10:00:00.000Z"
      }
    }
  ]
}
```

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/agents
```

---

#### `POST /api/agents`

Create a new agent. Requires CSRF token.

**Request body:**

```json
{
  "name": "Support Bot",
  "scope": "shared"
}
```

| Field   | Type     | Required | Notes                            |
| ------- | -------- | -------- | -------------------------------- |
| `name`  | `string` | yes      | Agent display name               |
| `scope` | `string` | yes      | `"personal"` or `"shared"`       |

**Response (201):** An agent record (same shape as items in the list response).

**curl:**

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"name": "Support Bot", "scope": "shared"}'
```

---

#### `GET /api/agents/:agentId`

Get a single agent by ID.

**Path parameters:**

| Param     | Type     | Notes          |
| --------- | -------- | -------------- |
| `agentId` | `string` | Agent ID       |

**Response (200):** An agent record (same shape as items in the list response).

---

#### `PATCH /api/agents/:agentId`

Update an agent's name or status. Requires CSRF token.

**Request body (all fields optional):**

```json
{
  "name": "Renamed Bot",
  "status": "archived"
}
```

| Field    | Type     | Required | Notes                         |
| -------- | -------- | -------- | ----------------------------- |
| `name`   | `string` | no       | New display name              |
| `status` | `string` | no       | `"active"` or `"archived"`    |

**Response (200):** The updated agent record.

---

#### `GET /api/agents/:agentId/draft`

Get the current draft version of an agent, including its full configuration.

**Response (200):**

```json
{
  "agent": {
    "id": "agt_abc123",
    "workspace_id": "ws_xyz789",
    "name": "Support Bot",
    "slug": "support-bot",
    "scope": "shared",
    "status": "active",
    "owner_user_id": null,
    "created_at": "2026-03-01T10:00:00.000Z",
    "updated_at": "2026-03-10T15:30:00.000Z"
  },
  "draft": {
    "id": "ver_draft1",
    "agent_id": "agt_abc123",
    "version_number": 2,
    "status": "draft",
    "published_at": null,
    "created_at": "2026-03-10T15:30:00.000Z",
    "persona": {},
    "instructions_markdown": "You are a helpful support assistant.",
    "model_routing": {
      "provider": "openai",
      "model": "gpt-4o"
    },
    "tool_policy": {
      "mode": "allow_list",
      "allowed_tools": []
    },
    "connector_policy": {
      "enabled": false,
      "connector_ids": []
    }
  },
  "published_version": null
}
```

---

#### `PATCH /api/agents/:agentId/draft`

Update the draft version of an agent. Requires CSRF token. All fields are optional -- only provided fields are changed.

**Request body:**

```json
{
  "instructions_markdown": "You are a support assistant for Acme Corp.",
  "model_routing": {
    "provider": "openai",
    "model": "gpt-4o"
  },
  "tool_policy": {
    "mode": "allow_list",
    "allowed_tools": ["search", "calculator"]
  },
  "connector_policy": {
    "enabled": true,
    "connector_ids": ["conn_abc"]
  }
}
```

| Field                   | Type     | Required | Notes                                           |
| ----------------------- | -------- | -------- | ----------------------------------------------- |
| `persona`               | `object` | no       | Key-value persona metadata                      |
| `instructions_markdown` | `string` | no       | System instructions in Markdown                 |
| `model_routing`         | `object` | no       | `{ provider: string, model: string }`           |
| `tool_policy`           | `object` | no       | `{ mode: "allow_list", allowed_tools: string[] }` |
| `connector_policy`      | `object` | no       | `{ enabled: boolean, connector_ids: string[] }` |

**Response (200):** The full draft detail (same shape as `GET /api/agents/:agentId/draft`).

**curl:**

```bash
curl -b cookies.txt -X PATCH http://localhost:3001/api/agents/agt_abc123/draft \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"instructions_markdown": "You are a support assistant for Acme Corp."}'
```

---

#### `POST /api/agents/:agentId/publish`

Publish the current draft as a new version. Requires CSRF token. The `expected_draft_version_id` prevents accidental overwrites when multiple users edit concurrently.

**Request body:**

```json
{
  "expected_draft_version_id": "ver_draft1"
}
```

| Field                       | Type     | Required | Notes                                  |
| --------------------------- | -------- | -------- | -------------------------------------- |
| `expected_draft_version_id` | `string` | yes      | Must match the current draft version ID |

**Response (200):**

```json
{
  "agent": { "...agent summary..." },
  "published_version": {
    "id": "ver_pub2",
    "agent_id": "agt_abc123",
    "version_number": 2,
    "status": "published",
    "published_at": "2026-03-11T09:00:00.000Z",
    "created_at": "2026-03-10T15:30:00.000Z"
  },
  "draft_version": { "...new draft record..." },
  "runtime_publication": {
    "status": "materialized",
    "runtime_agent_id": "rt_agent_abc",
    "detail": null
  }
}
```

The `runtime_publication` field indicates whether the published version has been materialized in the runtime. Possible statuses: `"pending"`, `"materialized"`, `"restart_required"`, `"failed"`.

**Errors:**

| Status | Code       | When                                        |
| ------ | ---------- | ------------------------------------------- |
| 409    | `conflict` | Draft version ID does not match current draft |

---

### Conversations

All conversation endpoints require an authenticated session.

#### `GET /api/conversations`

List conversations, optionally filtered by agent.

**Query parameters:**

| Param      | Type     | Required | Notes                        |
| ---------- | -------- | -------- | ---------------------------- |
| `agent_id` | `string` | no       | Filter to a specific agent   |

**Response (200):**

```json
{
  "conversations": [
    {
      "id": "conv_abc123",
      "workspace_id": "ws_xyz789",
      "agent_id": "agt_abc123",
      "agent_version_id": "ver_pub1",
      "channel": "web",
      "started_by": "usr_abc123",
      "status": "active",
      "title": null,
      "last_message_at": "2026-03-11T10:00:00.000Z",
      "created_at": "2026-03-11T09:55:00.000Z",
      "updated_at": "2026-03-11T10:00:00.000Z"
    }
  ]
}
```

**curl:**

```bash
# All conversations
curl -b cookies.txt http://localhost:3001/api/conversations

# Filtered by agent
curl -b cookies.txt "http://localhost:3001/api/conversations?agent_id=agt_abc123"
```

---

#### `POST /api/conversations`

Start a new conversation with an agent. Requires CSRF token.

**Request body:**

```json
{
  "agent_id": "agt_abc123"
}
```

| Field      | Type     | Required | Notes                       |
| ---------- | -------- | -------- | --------------------------- |
| `agent_id` | `string` | yes      | ID of the agent to talk to  |

**Response (201):** A conversation record (same shape as items in the list response).

---

#### `GET /api/conversations/:conversationId`

Get a conversation with its full message transcript.

**Path parameters:**

| Param            | Type     | Notes           |
| ---------------- | -------- | --------------- |
| `conversationId` | `string` | Conversation ID |

**Response (200):**

```json
{
  "conversation": {
    "id": "conv_abc123",
    "workspace_id": "ws_xyz789",
    "agent_id": "agt_abc123",
    "agent_version_id": "ver_pub1",
    "channel": "web",
    "started_by": "usr_abc123",
    "status": "active",
    "title": null,
    "last_message_at": "2026-03-11T10:05:00.000Z",
    "created_at": "2026-03-11T09:55:00.000Z",
    "updated_at": "2026-03-11T10:05:00.000Z"
  },
  "messages": [
    {
      "id": "msg_001",
      "workspace_id": "ws_xyz789",
      "conversation_id": "conv_abc123",
      "run_id": null,
      "sequence": 0,
      "role": "user",
      "author_user_id": "usr_abc123",
      "content": [{ "type": "text", "text": "Hello, I need help." }],
      "citations": null,
      "token_usage": null,
      "created_at": "2026-03-11T10:00:00.000Z"
    },
    {
      "id": "msg_002",
      "workspace_id": "ws_xyz789",
      "conversation_id": "conv_abc123",
      "run_id": "run_abc123",
      "sequence": 1,
      "role": "assistant",
      "author_user_id": null,
      "content": [{ "type": "text", "text": "Hi! How can I help you today?" }],
      "citations": null,
      "token_usage": { "prompt_tokens": 42, "completion_tokens": 12 },
      "created_at": "2026-03-11T10:00:05.000Z"
    }
  ]
}
```

---

### Runs

All run endpoints require an authenticated session.

#### `POST /api/runs`

Create a new run (send a message to an agent in a conversation). Requires CSRF token.

**Request body:**

```json
{
  "conversation_id": "conv_abc123",
  "input": {
    "type": "text",
    "text": "What is the refund policy?"
  }
}
```

| Field             | Type     | Required | Notes                                        |
| ----------------- | -------- | -------- | -------------------------------------------- |
| `conversation_id` | `string` | yes      | Conversation to add the message to           |
| `input.type`      | `string` | yes      | Always `"text"`                              |
| `input.text`      | `string` | yes      | The user's message text (minimum 1 character)|

**Response (201):**

```json
{
  "run_id": "run_abc123",
  "conversation_id": "conv_abc123",
  "input_message_id": "msg_003",
  "stream_url": "/api/runs/run_abc123/stream"
}
```

**curl:**

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/runs \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{
    "conversation_id": "conv_abc123",
    "input": { "type": "text", "text": "What is the refund policy?" }
  }'
```

---

#### `GET /api/runs/:runId`

Get the status and metadata of a run.

**Path parameters:**

| Param   | Type     | Notes  |
| ------- | -------- | ------ |
| `runId` | `string` | Run ID |

**Response (200):**

```json
{
  "id": "run_abc123",
  "workspace_id": "ws_xyz789",
  "agent_id": "agt_abc123",
  "agent_version_id": "ver_pub1",
  "conversation_id": "conv_abc123",
  "input_message_id": "msg_003",
  "initiated_by": "usr_abc123",
  "channel": "web",
  "status": "completed",
  "started_at": "2026-03-11T10:05:01.000Z",
  "completed_at": "2026-03-11T10:05:08.000Z",
  "current_step": null,
  "summary": "The refund policy allows returns within 30 days.",
  "created_at": "2026-03-11T10:05:00.000Z",
  "updated_at": "2026-03-11T10:05:08.000Z"
}
```

Run statuses: `"queued"`, `"running"`, `"waiting_for_approval"`, `"completed"`, `"failed"`, `"canceled"`.

---

#### `GET /api/runs/:runId/events`

Get all domain events for a run. Useful for debugging or replaying the run lifecycle.

**Response (200):**

```json
{
  "events": [
    {
      "event_id": "evt_001",
      "event_type": "run.created",
      "workspace_id": "ws_xyz789",
      "run_id": "run_abc123",
      "sequence": 1,
      "occurred_at": "2026-03-11T10:05:00.000Z",
      "actor": { "type": "user", "id": "usr_abc123" },
      "payload": {}
    },
    {
      "event_id": "evt_002",
      "event_type": "run.claimed",
      "workspace_id": "ws_xyz789",
      "run_id": "run_abc123",
      "sequence": 2,
      "occurred_at": "2026-03-11T10:05:01.000Z",
      "actor": { "type": "service", "id": "worker-1" },
      "payload": {}
    },
    {
      "event_id": "evt_003",
      "event_type": "run.output.delta",
      "workspace_id": "ws_xyz789",
      "run_id": "run_abc123",
      "sequence": 5,
      "occurred_at": "2026-03-11T10:05:03.000Z",
      "actor": { "type": "service", "id": "worker-1" },
      "payload": { "delta": "The refund policy " }
    }
  ]
}
```

Event types (in lifecycle order):

| Event Type              | Description                           |
| ----------------------- | ------------------------------------- |
| `run.created`           | Run was queued                        |
| `run.snapshot.created`  | Immutable run snapshot was persisted  |
| `run.claimed`           | Worker claimed the queue job          |
| `run.dispatch.accepted` | Runtime accepted the run dispatch     |
| `run.model.started`     | Model execution started              |
| `run.output.delta`      | Streamed output chunk from the model  |
| `run.tool.requested`    | Tool invocation requested             |
| `run.tool.completed`    | Tool invocation completed             |
| `run.waiting_for_approval` | Run paused pending human approval  |
| `run.approval.resolved` | Approval decision recorded            |
| `run.completed`         | Run finished successfully             |
| `run.failed`            | Run failed with an error              |

---

### Approvals

All approval endpoints require an authenticated session.

#### `GET /api/approvals`

List all approval requests visible to the current user. Typically used by admins to review pending tool invocations that require human sign-off.

**Response (200):**

```json
{
  "approvals": [
    {
      "id": "apr_abc123",
      "workspace_id": "ws_xyz789",
      "run_id": "run_abc123",
      "tool_invocation_id": "tinv_abc123",
      "tool_name": "create_ticket",
      "action_type": "ticket.create",
      "risk_class": "approval_gated",
      "status": "pending",
      "requested_by": "usr_abc123",
      "approver_scope": {
        "mode": "workspace_admin",
        "allowed_roles": ["admin"]
      },
      "request_payload": {},
      "decision_due_at": null,
      "resolved_at": null,
      "created_at": "2026-03-11T10:00:00.000Z",
      "updated_at": "2026-03-11T10:00:00.000Z"
    }
  ]
}
```

Key fields:

| Field               | Type       | Notes                                                          |
| ------------------- | ---------- | -------------------------------------------------------------- |
| `id`                | `string`   | Approval request ID                                            |
| `run_id`            | `string`   | The run that triggered the approval                            |
| `tool_invocation_id`| `string`   | The specific tool call awaiting approval                       |
| `tool_name`         | `string`   | Name of the tool being invoked                                 |
| `action_type`       | `string`   | Categorized action type                                        |
| `risk_class`        | `string`   | `"safe"`, `"guarded"`, `"approval_gated"`, or `"restricted"`  |
| `status`            | `string`   | `"pending"`, `"approved"`, `"denied"`, `"expired"`, or `"canceled"` |
| `approver_scope`    | `object`   | Who is allowed to resolve; currently always `workspace_admin`  |
| `request_payload`   | `object`   | Tool-specific context for the reviewer                         |

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/approvals
```

---

#### `GET /api/approvals/:approvalId`

Get a single approval request along with its decision history.

**Path parameters:**

| Param        | Type     | Notes              |
| ------------ | -------- | ------------------ |
| `approvalId` | `string` | Approval request ID |

**Response (200):**

```json
{
  "approval": {
    "id": "apr_abc123",
    "workspace_id": "ws_xyz789",
    "run_id": "run_abc123",
    "tool_invocation_id": "tinv_abc123",
    "tool_name": "create_ticket",
    "action_type": "ticket.create",
    "risk_class": "approval_gated",
    "status": "approved",
    "requested_by": "usr_abc123",
    "approver_scope": {
      "mode": "workspace_admin",
      "allowed_roles": ["admin"]
    },
    "request_payload": {},
    "decision_due_at": null,
    "resolved_at": "2026-03-11T10:05:00.000Z",
    "created_at": "2026-03-11T10:00:00.000Z",
    "updated_at": "2026-03-11T10:05:00.000Z"
  },
  "decisions": [
    {
      "id": "adec_abc123",
      "workspace_id": "ws_xyz789",
      "approval_request_id": "apr_abc123",
      "run_id": "run_abc123",
      "decision": "approved",
      "decided_by": "usr_abc123",
      "rationale": "Looks correct, proceed.",
      "payload": {},
      "occurred_at": "2026-03-11T10:05:00.000Z",
      "created_at": "2026-03-11T10:05:00.000Z"
    }
  ]
}
```

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/approvals/apr_abc123
```

---

#### `POST /api/approvals/:approvalId/resolve`

Approve or deny a pending approval request. **Admin only.** Requires CSRF token.

**Path parameters:**

| Param        | Type     | Notes              |
| ------------ | -------- | ------------------ |
| `approvalId` | `string` | Approval request ID |

**Request body:**

```json
{
  "decision": "approved",
  "rationale": "Looks correct, proceed."
}
```

| Field       | Type     | Required | Notes                                     |
| ----------- | -------- | -------- | ----------------------------------------- |
| `decision`  | `string` | yes      | `"approved"` or `"denied"`                |
| `rationale` | `string` | no       | Free-text explanation (max 2000 chars), nullable |

**Response (200):** Same shape as `GET /api/approvals/:approvalId` -- returns the updated approval and its decisions.

**curl:**

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/approvals/apr_abc123/resolve \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"decision": "approved", "rationale": "Looks correct, proceed."}'
```

**Errors:**

| Status | Code           | When                                  |
| ------ | -------------- | ------------------------------------- |
| 401    | `unauthorized` | Not authenticated                     |
| 403    | `forbidden`    | Caller is not an admin                |
| 404    | `not_found`    | Approval request does not exist       |

---

### Approval Surfaces

Approval-surface endpoints manage external approver identities and allow
runtime channels such as WhatsApp to resolve the same review records used by
the web UI.

#### `GET /api/workspace/approval-surfaces/identities`

List configured approval-surface identities for the current workspace.

**Response (200):**

```json
{
  "identities": [
    {
      "id": "asid_abc123",
      "workspace_id": "ws_xyz789",
      "channel": "whatsapp",
      "user_id": "usr_abc123",
      "external_identity": "+15551234567",
      "label": "Dave mobile",
      "status": "allowed",
      "created_at": "2026-03-22T10:00:00.000Z",
      "updated_at": "2026-03-22T10:00:00.000Z"
    }
  ]
}
```

| Field               | Type     | Notes                                                  |
| ------------------- | -------- | ------------------------------------------------------ |
| `channel`           | `string` | Currently only `"whatsapp"`                            |
| `user_id`           | `string` | Workspace user/person who may act through this surface |
| `external_identity` | `string` | Normalized external identity, e.g. phone number        |
| `label`             | `string` | Operator-friendly display label                        |
| `status`            | `string` | `"allowed"` or `"disabled"`                            |

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/workspace/approval-surfaces/identities
```

---

#### `POST /api/workspace/approval-surfaces/identities`

Create or upsert an approval-surface identity. **Admin only.** Requires CSRF token.

**Request body:**

```json
{
  "channel": "whatsapp",
  "user_id": "usr_abc123",
  "external_identity": "+15551234567",
  "label": "Dave mobile"
}
```

| Field               | Type     | Required | Notes                                    |
| ------------------- | -------- | -------- | ---------------------------------------- |
| `channel`           | `string` | yes      | Currently only `"whatsapp"`              |
| `user_id`           | `string` | yes      | Must match a real workspace person       |
| `external_identity` | `string` | yes      | External actor identifier, max 256 chars |
| `label`             | `string` | no       | Friendly label, max 256 chars            |

**Response (201):**

```json
{
  "id": "asid_abc123",
  "workspace_id": "ws_xyz789",
  "channel": "whatsapp",
  "user_id": "usr_abc123",
  "external_identity": "+15551234567",
  "label": "Dave mobile",
  "status": "allowed",
  "created_at": "2026-03-22T10:00:00.000Z",
  "updated_at": "2026-03-22T10:00:00.000Z"
}
```

**curl:**

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/workspace/approval-surfaces/identities \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{
    "channel": "whatsapp",
    "user_id": "usr_abc123",
    "external_identity": "+15551234567",
    "label": "Dave mobile"
  }'
```

**Errors:**

| Status | Code                | When                                        |
| ------ | ------------------- | ------------------------------------------- |
| 400    | `invalid_person_id` | `user_id` does not map to a workspace person |
| 401    | `unauthorized`      | Not authenticated                           |
| 403    | `forbidden`         | Caller is not an admin                      |

---

#### `PATCH /api/workspace/approval-surfaces/identities/:id`

Update an approval-surface identity. **Admin only.** Requires CSRF token.

**Path parameters:**

| Param | Type     | Notes                        |
| ----- | -------- | ---------------------------- |
| `id`  | `string` | Approval-surface identity ID |

**Request body:**

```json
{
  "label": "Dave phone",
  "status": "disabled"
}
```

All fields are optional:

| Field               | Type     | Notes                                    |
| ------------------- | -------- | ---------------------------------------- |
| `external_identity` | `string` | Replace the normalized external identity |
| `label`             | `string` | Replace the friendly label               |
| `status`            | `string` | `"allowed"` or `"disabled"`              |

**Response (200):** Same shape as the identity record returned from `POST`.

**curl:**

```bash
curl -b cookies.txt -X PATCH http://localhost:3001/api/workspace/approval-surfaces/identities/asid_abc123 \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"status": "disabled"}'
```

---

#### `POST /api/runtime/reviews/:id/approval-surfaces/whatsapp/resolve`

Resolve a pending review through the WhatsApp approval surface. This is a
**runtime-authenticated** endpoint for channel or webhook infrastructure, not a
browser session endpoint.

**Path parameters:**

| Param | Type     | Notes     |
| ----- | -------- | --------- |
| `id`  | `string` | Review ID |

**Request body:**

```json
{
  "approval_token": "cb_wa_approval_abc123",
  "actor_identity": "+15551234567",
  "rationale": "Ship it",
  "interaction_id": "wamid.HBgN..."
}
```

| Field             | Type     | Required | Notes                                              |
| ----------------- | -------- | -------- | -------------------------------------------------- |
| `approval_token`  | `string` | yes      | Signed token for a specific review, actor, and decision |
| `actor_identity`  | `string` | yes      | Must match the normalized identity encoded in the token |
| `rationale`       | `string` | no       | Optional explanation, max 2000 chars, nullable     |
| `interaction_id`  | `string` | no       | Optional channel interaction/message ID            |

**Response (200):**

```json
{
  "review": {
    "id": "rev_abc123",
    "workspace_id": "ws_xyz789",
    "action_kind": "send_email",
    "worker_id": "wrk_abc123",
    "work_item_id": "wi_abc123",
    "source_route_kind": "forward_email",
    "action_destination": "smtp_relay",
    "status": "approved",
    "reviewer_ids": ["usr_abc123"],
    "assignee_ids": [],
    "requested_at": "2026-03-22T10:00:00.000Z",
    "resolved_at": "2026-03-22T10:05:00.000Z",
    "created_at": "2026-03-22T10:00:00.000Z",
    "updated_at": "2026-03-22T10:05:00.000Z"
  },
  "decision": {
    "id": "rdec_abc123",
    "workspace_id": "ws_xyz789",
    "review_id": "rev_abc123",
    "surface": "whatsapp",
    "decision": "approved",
    "decided_by_user_id": "usr_abc123",
    "actor_external_id": "+15551234567",
    "rationale": "Ship it",
    "payload": {
      "approval_surface_identity_id": "asid_abc123",
      "interaction_id": "wamid.HBgN..."
    },
    "occurred_at": "2026-03-22T10:05:00.000Z",
    "created_at": "2026-03-22T10:05:00.000Z"
  },
  "already_resolved": false
}
```

**curl:**

```bash
curl -X POST http://localhost:3001/api/runtime/reviews/rev_abc123/approval-surfaces/whatsapp/resolve \
  -H "Content-Type: application/json" \
  -H "x-clawback-runtime-api-token: clawback-local-runtime-api-token" \
  -d '{
    "approval_token": "cb_wa_approval_abc123",
    "actor_identity": "+15551234567",
    "rationale": "Ship it",
    "interaction_id": "wamid.HBgN..."
  }'
```

**Notes:**

- The same review-resolution service is used by both the web UI and WhatsApp.
- Repeated callbacks are harmless. If the review is already resolved, the route
  returns the current review plus `already_resolved: true`.
- A mismatched token and route review ID returns `400` with code
  `review_id_mismatch`.
- Actor identity must both match the signed token and belong to an allowed,
  eligible approval-surface identity.

---

### Tickets

Ticket endpoints provide visibility into tickets created by agent tool invocations. These are **admin-only** endpoints under the `/api/admin` prefix.

#### `GET /api/admin/mock-tickets`

List all tickets in the workspace.

**Response (200):**

```json
{
  "tickets": [
    {
      "id": "tkt_abc123",
      "workspace_id": "ws_xyz789",
      "run_id": "run_abc123",
      "approval_request_id": "apr_abc123",
      "provider": "mock",
      "status": "created",
      "external_ref": null,
      "title": "Billing discrepancy for customer #4821",
      "summary": "Customer was double-charged on 2026-03-10.",
      "body": {},
      "created_by": null,
      "created_at": "2026-03-11T10:10:00.000Z",
      "updated_at": "2026-03-11T10:10:00.000Z"
    }
  ]
}
```

Key fields:

| Field                 | Type     | Notes                                             |
| --------------------- | -------- | ------------------------------------------------- |
| `id`                  | `string` | Ticket ID                                         |
| `run_id`              | `string` | The run that created the ticket (nullable)         |
| `approval_request_id` | `string` | Linked approval request (nullable)                |
| `provider`            | `string` | Ticket provider; currently always `"mock"`        |
| `status`              | `string` | `"draft"`, `"created"`, or `"failed"`             |
| `external_ref`        | `string` | External system reference (nullable)              |
| `title`               | `string` | Ticket title                                      |
| `summary`             | `string` | Short description                                 |
| `body`                | `object` | Provider-specific ticket payload                  |

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/admin/mock-tickets
```

---

#### `GET /api/admin/mock-tickets/:ticketId`

Get a single ticket by ID.

**Path parameters:**

| Param      | Type     | Notes     |
| ---------- | -------- | --------- |
| `ticketId` | `string` | Ticket ID |

**Response (200):** A single ticket record (same shape as items in the list response, without the `tickets` wrapper).

```json
{
  "id": "tkt_abc123",
  "workspace_id": "ws_xyz789",
  "run_id": "run_abc123",
  "approval_request_id": "apr_abc123",
  "provider": "mock",
  "status": "created",
  "external_ref": null,
  "title": "Billing discrepancy for customer #4821",
  "summary": "Customer was double-charged on 2026-03-10.",
  "body": {},
  "created_by": null,
  "created_at": "2026-03-11T10:10:00.000Z",
  "updated_at": "2026-03-11T10:10:00.000Z"
}
```

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/admin/mock-tickets/tkt_abc123
```

---

### Connectors

Connector endpoints manage knowledge-base connectors that index local files for retrieval-augmented generation. All endpoints require an authenticated session.

#### `GET /api/connectors`

List all connectors in the workspace.

**Response (200):**

```json
{
  "connectors": [
    {
      "id": "conn_abc123",
      "workspace_id": "ws_xyz789",
      "type": "local_directory",
      "name": "Product Docs",
      "status": "active",
      "config": {
        "root_path": "/data/docs",
        "recursive": true,
        "include_extensions": [".md", ".mdx", ".txt"]
      },
      "created_by": "usr_abc123",
      "created_at": "2026-03-01T10:00:00.000Z",
      "updated_at": "2026-03-10T15:30:00.000Z"
    }
  ]
}
```

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/connectors
```

---

#### `POST /api/connectors`

Create a new connector. Requires CSRF token.

**Request body:**

```json
{
  "name": "Product Docs",
  "type": "local_directory",
  "config": {
    "root_path": "/data/docs",
    "recursive": true,
    "include_extensions": [".md", ".txt"]
  }
}
```

| Field                        | Type       | Required | Notes                                                                                     |
| ---------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------- |
| `name`                       | `string`   | yes      | Human-readable connector name                                                             |
| `type`                       | `string`   | yes      | Currently only `"local_directory"`                                                        |
| `config.root_path`           | `string`   | yes      | Absolute path to the directory to index                                                   |
| `config.recursive`           | `boolean`  | no       | Index subdirectories (default `true`)                                                     |
| `config.include_extensions`  | `string[]` | no       | File extensions to include (default: `.md`, `.mdx`, `.txt`, `.json`, `.yaml`, `.yml`, etc.) |

**Response (201):** A connector record (same shape as items in the list response).

**curl:**

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/connectors \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{
    "name": "Product Docs",
    "type": "local_directory",
    "config": {"root_path": "/data/docs", "recursive": true}
  }'
```

---

#### `GET /api/connectors/:connectorId`

Get a single connector by ID.

**Path parameters:**

| Param         | Type     | Notes        |
| ------------- | -------- | ------------ |
| `connectorId` | `string` | Connector ID |

**Response (200):** A connector record.

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/connectors/conn_abc123
```

---

#### `PATCH /api/connectors/:connectorId`

Update a connector's name, status, or configuration. Requires CSRF token.

**Request body (all fields optional):**

```json
{
  "name": "Updated Docs",
  "status": "disabled",
  "config": {
    "root_path": "/data/new-docs",
    "recursive": false
  }
}
```

| Field    | Type     | Required | Notes                            |
| -------- | -------- | -------- | -------------------------------- |
| `name`   | `string` | no       | New display name                 |
| `status` | `string` | no       | `"active"` or `"disabled"`       |
| `config` | `object` | no       | Updated `local_directory` config |

**Response (200):** The updated connector record.

**curl:**

```bash
curl -b cookies.txt -X PATCH http://localhost:3001/api/connectors/conn_abc123 \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"status": "disabled"}'
```

---

#### `GET /api/connectors/:connectorId/sync-jobs`

List sync jobs for a connector, ordered by most recent first.

**Path parameters:**

| Param         | Type     | Notes        |
| ------------- | -------- | ------------ |
| `connectorId` | `string` | Connector ID |

**Response (200):**

```json
{
  "sync_jobs": [
    {
      "id": "sync_abc123",
      "workspace_id": "ws_xyz789",
      "connector_id": "conn_abc123",
      "status": "completed",
      "requested_by": "usr_abc123",
      "started_at": "2026-03-11T10:00:01.000Z",
      "completed_at": "2026-03-11T10:00:15.000Z",
      "error_summary": null,
      "stats": {
        "scanned_file_count": 42,
        "indexed_document_count": 38,
        "updated_document_count": 5,
        "deleted_document_count": 0,
        "skipped_file_count": 4,
        "error_count": 0
      },
      "created_at": "2026-03-11T10:00:00.000Z",
      "updated_at": "2026-03-11T10:00:15.000Z"
    }
  ]
}
```

Sync job statuses: `"queued"`, `"running"`, `"completed"`, `"failed"`.

**curl:**

```bash
curl -b cookies.txt http://localhost:3001/api/connectors/conn_abc123/sync-jobs
```

---

#### `POST /api/connectors/:connectorId/sync`

Request a new sync job for a connector. Requires CSRF token. The sync runs asynchronously in the background.

**Path parameters:**

| Param         | Type     | Notes        |
| ------------- | -------- | ------------ |
| `connectorId` | `string` | Connector ID |

**Response (202):**

```json
{
  "sync_job": {
    "id": "sync_def456",
    "workspace_id": "ws_xyz789",
    "connector_id": "conn_abc123",
    "status": "queued",
    "requested_by": "usr_abc123",
    "started_at": null,
    "completed_at": null,
    "error_summary": null,
    "stats": null,
    "created_at": "2026-03-11T10:15:00.000Z",
    "updated_at": "2026-03-11T10:15:00.000Z"
  }
}
```

**curl:**

```bash
curl -b cookies.txt -X POST http://localhost:3001/api/connectors/conn_abc123/sync \
  -H "x-csrf-token: a1b2c3d4e5f6"
```

---

## Streaming (SSE)

### `GET /api/runs/:runId/stream`

Opens a Server-Sent Events (SSE) connection that streams run events in real time. Requires an authenticated session cookie.

**Response headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

### Envelope format

Every SSE message is a single `data:` line containing a JSON envelope:

```
data: {"type":"assistant.delta","run_id":"run_abc123","conversation_id":"conv_abc123","sequence":5,"data":{"delta":"Hello "}}

data: {"type":"assistant.delta","run_id":"run_abc123","conversation_id":"conv_abc123","sequence":6,"data":{"delta":"world!"}}

data: {"type":"assistant.completed","run_id":"run_abc123","conversation_id":"conv_abc123","sequence":7,"data":{"assistant_text":"Hello world!"}}
```

The envelope schema:

```typescript
{
  type: "run.status" | "assistant.delta" | "assistant.completed" | "run.failed" | "run.approval.required" | "run.approval.resolved" | "keepalive";
  run_id: string;
  conversation_id: string;
  sequence: number;  // monotonically increasing, 0-based
  data: Record<string, unknown>;
}
```

### Event types

| Envelope `type`       | Mapped from              | `data` contents                                                    |
| --------------------- | ------------------------ | ------------------------------------------------------------------ |
| `assistant.delta`     | `run.output.delta`       | `{ delta: string }` -- an incremental text chunk                   |
| `assistant.completed` | `run.completed`          | `{ assistant_text: string }` -- the full completed response        |
| `run.failed`          | `run.failed`             | `{ error: string }` -- error description                           |
| `run.approval.required` | `run.waiting_for_approval` | Approval payload -- a tool invocation is awaiting human approval |
| `run.approval.resolved` | `run.approval.resolved`  | Resolution payload -- an approval was approved or denied           |
| `run.status`          | All other event types    | `{ event_type: string, ...payload }` -- lifecycle status updates   |
| `keepalive`           | *(synthetic)*            | `{}` -- empty; sent every 15 seconds to keep the connection alive  |

### Keepalive

The server sends a `keepalive` envelope every 15 seconds if no other events have been emitted. This prevents proxies and load balancers from closing idle connections.

### Stream termination

The stream closes automatically when the run reaches a terminal state (`completed` or `failed`) and all events have been flushed. The server polls for new events every 250ms internally.

### Client-side usage

Using the browser `EventSource` API:

```javascript
const source = new EventSource(
  "http://localhost:3001/api/runs/run_abc123/stream",
  { withCredentials: true }
);

source.onmessage = (event) => {
  const envelope = JSON.parse(event.data);

  switch (envelope.type) {
    case "assistant.delta":
      // Append envelope.data.delta to the UI
      process.stdout.write(envelope.data.delta);
      break;
    case "assistant.completed":
      // Run finished -- envelope.data.assistant_text has the full response
      console.log("\nDone:", envelope.data.assistant_text);
      source.close();
      break;
    case "run.failed":
      console.error("Run failed:", envelope.data.error);
      source.close();
      break;
    case "keepalive":
      // Ignore
      break;
    case "run.status":
      // Lifecycle update (e.g. run.claimed, run.model.started)
      console.log("Status:", envelope.data.event_type);
      break;
  }
};

source.onerror = () => {
  source.close();
  // Reconnect or fall back to GET /api/runs/:runId/events for the full event log
};
```

Using `curl`:

```bash
curl -b cookies.txt -N http://localhost:3001/api/runs/run_abc123/stream
```

### Reconnection

If the connection drops, the client can reconnect by opening a new `EventSource` to the same URL. The server replays all events from `sequence: 0` on each new connection. Deduplicate on the client side using the `sequence` field.

---

## Full Workflow Example

A complete session from login to streaming a run response:

```bash
# 1. Login
curl -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'
# Save the csrf_token from the response, e.g. "a1b2c3d4e5f6"

# 2. Create an agent
curl -b cookies.txt -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"name": "Demo Agent", "scope": "shared"}'
# Save the agent id, e.g. "agt_abc123"

# 3. Configure the draft
curl -b cookies.txt -X PATCH http://localhost:3001/api/agents/agt_abc123/draft \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"instructions_markdown": "You are a helpful assistant.", "model_routing": {"provider": "openai", "model": "gpt-4o"}}'

# 4. Publish the agent (use the draft version id from step 3)
curl -b cookies.txt -X POST http://localhost:3001/api/agents/agt_abc123/publish \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"expected_draft_version_id": "ver_draft1"}'

# 5. Start a conversation
curl -b cookies.txt -X POST http://localhost:3001/api/conversations \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"agent_id": "agt_abc123"}'
# Save the conversation id, e.g. "conv_abc123"

# 6. Send a message (create a run)
curl -b cookies.txt -X POST http://localhost:3001/api/runs \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3d4e5f6" \
  -d '{"conversation_id": "conv_abc123", "input": {"type": "text", "text": "Hello!"}}'
# Save the run_id from the response

# 7. Stream the response
curl -b cookies.txt -N http://localhost:3001/api/runs/run_abc123/stream
```
