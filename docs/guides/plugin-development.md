# Plugin Development Guide

How to build custom connection providers, ingress adapters, action executors,
and worker packs in Clawback.

**Audience:** Developers adding new integrations or worker templates.

**Prerequisites:** Familiarity with TypeScript, the Clawback monorepo layout,
and the concepts in [Plugins & Providers](./plugins-and-providers.md).

---

## Plugin Taxonomy

Clawback has four plugin kinds. Each serves a distinct role in the data and
action flow.

| Kind | Purpose | Example |
| --- | --- | --- |
| **Connection provider** | Declares an external system Clawback can connect to (credentials, capabilities, access modes) | Gmail Read-Only, SMTP Relay, Slack |
| **Ingress adapter** | Normalizes inbound events from an external system into Clawback's internal route/event model | Postmark Inbound Email, Gmail Watch Hook |
| **Action executor** | Carries out an approved outbound action through a connected provider | SMTP Reviewed Send, n8n Workflow Handoff |
| **Worker pack** | An installable worker template with input routes, action capabilities, and optional runtime execution logic | Client Follow-Up, Proposal |

Data flows through these layers in order:

```
External system --> Ingress adapter --> Worker (from a pack) --> Action executor --> External system
                                              ^                        |
                                              |                        v
                                     Connection provider        Connection provider
                                       (read side)               (write side)
```

All four kinds share a common manifest base (`PluginManifestBase`) defined in
`packages/plugin-sdk/src/manifests.ts`, which provides `id`, `kind`, `version`,
`displayName`, `description`, `owner`, `stability`, `category`, `priority`,
`setupHelp`, `validate`, `probe`, `status`, `recoveryHints`, and `tags`.

---

## 1. Connection Provider

A connection provider declares that Clawback can connect to an external system.
It does not contain runtime logic -- it is pure metadata that drives setup flows,
capability discovery, and console rendering.

### Manifest structure

Create a file in `packages/plugin-manifests/src/connection-providers/`.

```ts
// packages/plugin-manifests/src/connection-providers/example-crm.ts
import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const exampleCrmProvider: ConnectionProviderPluginManifest = {
  // --- Base fields ---
  id: "provider.example-crm",          // Stable, unique manifest ID
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "Example CRM",
  description: "Read-only access to Example CRM contacts and deals.",
  owner: "first_party",
  stability: "experimental",            // "experimental" | "pilot" | "stable"
  category: "crm",                      // Groups the provider on product surfaces
  priority: 20,                         // Lower = earlier in its category group

  // --- Connection provider fields ---
  provider: "example_crm",             // Internal provider key (used in connection records)
  accessModes: ["read_only"],           // "read_only" | "write_capable"
  capabilities: ["read_contacts", "read_deals"],
  compatibleInputRouteKinds: [],        // Route kinds this provider can feed
  setupMode: "operator_driven",         // "operator_driven" | "external_runtime" | "browser_oauth"
  secretKeys: ["EXAMPLE_CRM_API_KEY"],  // Credentials the operator must configure

  // --- Operational metadata (optional but recommended) ---
  setupHelp:
    "Provide an API key from the Example CRM admin panel. " +
    "The key must have read-only scope for contacts and deals.",
  validate: "Checks that EXAMPLE_CRM_API_KEY is present and non-empty.",
  probe: "Calls the Example CRM /me endpoint to verify the key is valid.",
  status: "Reports connected account name and last sync timestamp.",
  recoveryHints: [
    { symptom: "401 Unauthorized", fix: "The API key is invalid or expired. Generate a new one in Example CRM settings." },
  ],

  // --- Setup steps ---
  setupSteps: [
    {
      id: "example-crm-credentials",
      title: "Configure Example CRM credentials",
      description: "Store and validate the API key for the Example CRM account.",
      ctaLabel: "Set up Example CRM",
      operatorOnly: true,
      target: { surface: "connections", focus: "example-crm" },
    },
  ],
};
```

### Required fields

| Field | Type | Purpose |
| --- | --- | --- |
| `provider` | `ConnectionProvider` | Internal key (matches connection records) |
| `accessModes` | `ConnectionAccessMode[]` | What kind of access this connection provides |
| `capabilities` | `string[]` | Specific things the connection can do |
| `compatibleInputRouteKinds` | `InputRouteKind[]` | Route kinds this provider feeds (empty if write-only) |
| `setupMode` | `"operator_driven" \| "external_runtime" \| "browser_oauth"` | How credentials are configured |
| `secretKeys` | `string[]` | Environment variables or secrets the operator must set |
| `setupSteps` | `SetupStepManifest[]` | Ordered setup instructions for the operator |

### Real example: Gmail Read-Only

From `packages/plugin-manifests/src/connection-providers/gmail-read-only.ts`:

```ts
export const gmailReadOnlyProvider: ConnectionProviderPluginManifest = {
  id: "provider.gmail.read-only",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "Gmail Read-Only",
  description: "Workspace-level Gmail read-only connection used for watched inbox and shadow mode.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 10,
  provider: "gmail",
  accessModes: ["read_only"],
  capabilities: ["read_threads", "watch_inbox"],
  compatibleInputRouteKinds: ["watched_inbox"],
  setupMode: "operator_driven",
  secretKeys: ["google_client_id", "google_client_secret", "google_refresh_token"],
  setupHelp:
    "Configure Google OAuth credentials for the shared workspace mailbox. ...",
  recoveryHints: [
    { symptom: "Token refresh fails with invalid_grant",
      fix: "The refresh token was revoked or expired. Re-authorize the mailbox through the Google OAuth flow." },
  ],
  setupSteps: [
    {
      id: "gmail-credentials",
      title: "Validate Gmail credentials",
      description: "Store and validate the Google client credentials and refresh token.",
      ctaLabel: "Set up Gmail",
      operatorOnly: true,
      target: { surface: "connections", focus: "gmail" },
    },
    {
      id: "gmail-attach-worker",
      title: "Attach Gmail to eligible workers",
      description: "Attach the Gmail connection to workers that have a watched inbox route.",
      ctaLabel: "Attach Gmail to worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "follow_up", focus: "connections" },
    },
  ],
};
```

---

## 2. Ingress Adapter

An ingress adapter normalizes inbound data from an external system into
Clawback's internal event model. It handles webhook reception, authentication,
and payload translation.

### Manifest structure

Create a file in `packages/plugin-manifests/src/ingress-adapters/`.

```ts
// packages/plugin-manifests/src/ingress-adapters/example-webhook.ts
import type { IngressAdapterPluginManifest } from "@clawback/plugin-sdk";

export const exampleWebhookAdapter: IngressAdapterPluginManifest = {
  id: "ingress.example.webhook",
  kind: "ingress_adapter",
  version: "1.0.0",
  displayName: "Example Webhook",
  description: "Accepts webhooks from Example Service and normalizes them into chat events.",
  owner: "first_party",
  stability: "experimental",
  category: "messaging",
  priority: 20,

  // --- Ingress adapter fields ---
  adapterKind: "generic_webhook",         // "provider_inbound" | "watch_hook" | "generic_webhook"
  normalizedInputRouteKinds: ["chat"],    // What Clawback route kinds this adapter produces
  authentication: "shared_token",          // "shared_token" | "provider_signature" | "oauth_callback"
  provider: "example_service",             // Which external provider sends the data

  setupHelp:
    "Configure Example Service to post webhooks to /api/ingress/example. " +
    "Set CLAWBACK_EXAMPLE_WEBHOOK_TOKEN in environment.",
  setupSteps: [
    {
      id: "example-webhook-setup",
      title: "Point Example Service at Clawback",
      description: "Configure the webhook URL and shared authentication token.",
      ctaLabel: "Review operator guide",
      operatorOnly: true,
      docsHref: "/docs/admin-guide",
      target: { surface: "setup" },
    },
  ],
};
```

### Required fields

| Field | Type | Purpose |
| --- | --- | --- |
| `adapterKind` | `"provider_inbound" \| "watch_hook" \| "generic_webhook"` | The style of inbound integration |
| `normalizedInputRouteKinds` | `InputRouteKind[]` | What internal route kinds this adapter feeds |
| `authentication` | `"shared_token" \| "provider_signature" \| "oauth_callback"` | How inbound requests are authenticated |
| `provider` | `string` | Which external provider sends the events |
| `setupSteps` | `SetupStepManifest[]` | Operator instructions |

### Adapter kind guide

- **`provider_inbound`**: The external provider pushes data directly (e.g., Postmark forwards emails to a Clawback endpoint).
- **`watch_hook`**: An intermediate watcher pushes notifications (e.g., Gmail watch via OpenClaw posts to Clawback).
- **`generic_webhook`**: A general-purpose webhook endpoint for arbitrary external systems.

### Real example: Gmail Watch Hook

From `packages/plugin-manifests/src/ingress-adapters/gmail-watch.ts`:

```ts
export const gmailWatchHookAdapter: IngressAdapterPluginManifest = {
  id: "ingress.gmail.watch-hook",
  kind: "ingress_adapter",
  version: "1.0.0",
  displayName: "Gmail Watch Hook",
  description: "Accepts Gmail watch notifications from gog/OpenClaw and normalizes them into watched inbox events.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 10,
  adapterKind: "watch_hook",
  normalizedInputRouteKinds: ["watched_inbox"],
  authentication: "shared_token",
  provider: "gmail",
  setupSteps: [
    {
      id: "gmail-watch-hook",
      title: "Point Gmail watcher at Clawback",
      description: "Configure gog/OpenClaw to post Gmail watch notifications into Clawback.",
      ctaLabel: "Review operator guide",
      operatorOnly: true,
      docsHref: "/docs/admin-guide",
      target: { surface: "setup" },
    },
  ],
};
```

### Runtime implementation

The manifest declares metadata. The actual webhook handler lives in
`services/control-plane/src/integrations/`. Your ingress handler must:

1. Authenticate the inbound request (check shared token, verify provider signature, etc.).
2. Parse the provider-specific payload.
3. Normalize it into Clawback's internal event shape.
4. Route it to the appropriate worker via the existing input route system.

Do **not** invent new inbox item or work item lifecycle states inside the adapter.
The adapter translates and normalizes; core product semantics are Clawback-owned.

---

## 3. Action Executor

An action executor carries out an approved outbound action through a connected
provider. All executors use the `governed_async` execution model -- the worker
proposes, a human reviews, and only approved actions are dispatched.

### Manifest structure

Create a file in `packages/plugin-manifests/src/action-executors/`.

```ts
// packages/plugin-manifests/src/action-executors/example-notify.ts
import type { ActionExecutorPluginManifest } from "@clawback/plugin-sdk";

export const exampleNotifyExecutor: ActionExecutorPluginManifest = {
  id: "action.example-notify",
  kind: "action_executor",
  version: "1.0.0",
  displayName: "Example Notification Send",
  description: "Sends governed notifications through the Example Service API.",
  owner: "first_party",
  stability: "experimental",
  category: "messaging",
  priority: 20,

  // --- Action executor fields ---
  actionKind: "send_notification",          // The kind of action this executor handles
  destinationProviders: ["example_service"],// Which connection providers it targets
  defaultBoundaryMode: "ask_me",           // "ask_me" (requires review) | "auto"
  executionModel: "governed_async",         // Currently the only supported model
  secretKeys: ["EXAMPLE_API_KEY", "EXAMPLE_API_SECRET"],

  setupHelp:
    "Requires a configured Example Service connection. All sends are governed.",
  recoveryHints: [
    { symptom: "Example Service connection not configured",
      fix: "Set up the Example Service connection provider first." },
  ],
  setupSteps: [
    {
      id: "example-notify-setup",
      title: "Verify notification send path",
      description: "Confirm Example Service configuration before approving outbound notifications.",
      ctaLabel: "Configure Example Service",
      operatorOnly: true,
      target: { surface: "connections", focus: "example" },
    },
  ],
};
```

### Required fields

| Field | Type | Purpose |
| --- | --- | --- |
| `actionKind` | `ActionCapabilityKind` | What kind of action this executor handles |
| `destinationProviders` | `ConnectionProvider[]` | Which connection providers this executor sends through |
| `defaultBoundaryMode` | `BoundaryMode` | Whether actions require human review by default |
| `executionModel` | `"governed_async"` | The execution model (only `governed_async` is supported) |
| `secretKeys` | `string[]` | Required credentials |
| `setupSteps` | `SetupStepManifest[]` | Operator instructions |

### Boundary modes

- **`ask_me`**: Every action requires human review before execution. This is the safe default.
- **`auto`**: Actions execute without review. Use only for low-risk operations like saving work.

### Real example: SMTP Reviewed Send

From `packages/plugin-manifests/src/action-executors/smtp-send.ts`:

```ts
export const smtpReviewedSendExecutor: ActionExecutorPluginManifest = {
  id: "action.smtp-reviewed-send",
  kind: "action_executor",
  version: "1.0.0",
  displayName: "SMTP Reviewed Send",
  description: "Executes governed reviewed email sends through the configured SMTP relay.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 10,
  actionKind: "send_email",
  destinationProviders: ["smtp_relay"],
  defaultBoundaryMode: "ask_me",
  executionModel: "governed_async",
  secretKeys: [
    "CLAWBACK_SMTP_HOST",
    "CLAWBACK_SMTP_PORT",
    "CLAWBACK_SMTP_USERNAME",
    "CLAWBACK_SMTP_PASSWORD",
    "CLAWBACK_SMTP_FROM_ADDRESS",
  ],
  setupSteps: [
    {
      id: "smtp-reviewed-send",
      title: "Verify reviewed send path",
      description: "Confirm SMTP relay configuration before approving outbound email.",
      ctaLabel: "Configure SMTP relay",
      operatorOnly: true,
      target: { surface: "connections", focus: "smtp" },
    },
  ],
};
```

### Execution truth rule

Your action executor must maintain strict separation between these states:

1. **Review approved** -- the human said yes.
2. **Execution requested** -- the send/call was attempted.
3. **Execution completed** -- the external provider confirmed success.
4. **Execution failed** -- the external provider reported failure.

Never mark work as "sent" before the external provider confirms success.

---

## 4. Worker Pack

A worker pack is the most common extension type. It bundles a manifest
(metadata) with an install spec (control-plane defaults) and optional runtime
hooks (execution logic).

### Two-layer rule

Worker packs always have two layers:

1. **Manifest** in `packages/plugin-manifests/src/worker-packs/` -- metadata for discovery, compatibility, and setup.
2. **Runtime pack** in `services/control-plane/src/worker-packs/` -- install spec and optional execution hooks, assembled via `defineWorkerPackContract()`.

### Manifest structure

```ts
// packages/plugin-manifests/src/worker-packs/my-worker.ts
import type { WorkerPackPluginManifest } from "@clawback/plugin-sdk";

export const myWorkerPackManifest: WorkerPackPluginManifest = {
  id: "worker-pack.my-worker",
  kind: "worker_pack",
  version: "1.0.0",
  displayName: "My Worker",
  description: "Does something useful for the team.",
  owner: "first_party",
  stability: "experimental",
  category: "project",
  priority: 20,

  // --- Worker pack fields ---
  workerPackId: "my_worker_v1",                  // Must match runtime contract ID
  workerKind: "my_worker",                        // The worker kind enum value
  defaultScope: "shared",                         // "shared" | "personal"
  supportedInputRouteKinds: ["chat", "upload"],   // Input routes this worker accepts
  outputKinds: ["proposal_draft"],                // What the worker produces
  actionKinds: ["save_work"],                     // What actions the worker can take
  requiredConnectionProviders: [],                // Must be connected for the worker to function
  optionalConnectionProviders: ["drive"],          // Enhances the worker if connected

  setupSteps: [
    {
      id: "install-my-worker",
      title: "Install My Worker",
      description: "Install the worker and assign team members.",
      ctaLabel: "Install worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "my_worker" },
    },
  ],
};
```

### Runtime pack with `defineWorkerPackContract()`

The runtime pack lives in the control plane and calls `defineWorkerPackContract()`
to assemble the full contract. This function validates alignment between the
manifest and install spec at construction time.

```ts
// services/control-plane/src/worker-packs/my-worker-pack.ts
import { myWorkerPackManifest } from "@clawback/plugin-manifests";
import { defineWorkerPackContract } from "./types.js";

export const myWorkerPack = defineWorkerPackContract({
  manifest: myWorkerPackManifest,
  install: {
    summary: "Helps the team do something useful.",
    systemPrompt: `You are the My Worker assistant for a small team.

## What you do
- Accept chat messages and uploaded documents
- Produce useful output based on the input

## Rules
- Always present output for review before taking action.
- If unsure about something, flag it for the reviewer.`,
    supportedInputRoutes: [
      {
        kind: "chat",
        label: "Chat",
        description: "Direct conversation with the worker.",
      },
      {
        kind: "upload",
        label: "Upload",
        description: "Process uploaded documents.",
      },
    ],
    actionCapabilities: [
      {
        kind: "save_work",
        defaultBoundaryMode: "auto",
      },
    ],
  },
  // runtime is omitted -- this is an install-only pack
});
```

### Manifest/install alignment

`defineWorkerPackContract()` enforces that:

- Input route kinds in `install.supportedInputRoutes` match `manifest.supportedInputRouteKinds`.
- Action kinds in `install.actionCapabilities` match `manifest.actionKinds`.

If they diverge, the function throws at construction time with a descriptive
error message. This is intentional -- manifests and install specs must stay
in sync.

### Optional runtime declaration

Most packs are install-only. If your worker needs governed execution behavior
(pausing for review, resuming after approval), add a `runtime` block:

```ts
export const myWorkerPack = defineWorkerPackContract({
  manifest: myWorkerPackManifest,
  install: { /* ... */ },
  runtime: {
    continuityFamily: "governed_action",
    persistedStateSchema: "execution_continuity",
    resumesAfterReview: true,
    resumesAfterRouteConfirmation: false,
    hooks: {
      parseExecutionState: myParseExecutionState,
      buildPausedExecutionState: myBuildPausedState,
      resumeAfterReviewDecision: myResumeAfterReview,
      markActionRunning: myMarkActionRunning,
      markCompleted: myMarkCompleted,
      markFailed: myMarkFailed,
      resumeAfterRouteConfirmation: myResumeAfterRoute,
      async runWatchedInboxExecution(input) {
        // Optional: implement watched inbox execution
        const result = await runMyExecution(input);
        return { triage: result.triage, artifact: result.artifact, executionState: result.state };
      },
    },
  },
});
```

Only the Client Follow-Up pack uses a runtime declaration today. Other packs
remain install-only until they need real governed execution behavior.

### Real example: Client Follow-Up (install-only manifest)

From `packages/plugin-manifests/src/worker-packs/follow-up.ts`:

```ts
export const followUpWorkerPackManifest: WorkerPackPluginManifest = {
  id: "worker-pack.follow-up",
  kind: "worker_pack",
  version: "1.0.0",
  displayName: "Client Follow-Up",
  description: "Drafts follow-up emails from forwarded threads and watched inbox activity.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 10,
  workerPackId: "follow_up_v1",
  workerKind: "follow_up",
  defaultScope: "shared",
  supportedInputRouteKinds: ["chat", "forward_email", "watched_inbox"],
  outputKinds: ["email_draft", "meeting_recap"],
  actionKinds: ["send_email", "save_work"],
  requiredConnectionProviders: ["smtp_relay"],
  optionalConnectionProviders: ["gmail", "calendar", "drive"],
  setupSteps: [
    {
      id: "install-follow-up",
      title: "Install Client Follow-Up",
      description: "Install the Follow-Up worker and assign members, assignees, and reviewers.",
      ctaLabel: "Install worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "follow_up" },
    },
  ],
};
```

### Real example: Synthetic Validation (minimal install-only runtime pack)

The simplest possible runtime pack, useful as a starting point:

```ts
// services/control-plane/src/worker-packs/synthetic-validation-pack.ts
import { syntheticValidationWorkerPackManifest } from "@clawback/plugin-manifests";
import { defineWorkerPackContract } from "./types.js";

export const syntheticValidationWorkerPack = defineWorkerPackContract({
  manifest: syntheticValidationWorkerPackManifest,
  install: {
    summary: "Contract-testing worker used to validate manifest/runtime alignment.",
    systemPrompt: "You are a synthetic validation worker used only for contract testing.",
    supportedInputRoutes: [
      {
        kind: "chat",
        label: "Chat",
        description: "Chat input for contract testing.",
      },
    ],
    actionCapabilities: [
      {
        kind: "save_work",
        defaultBoundaryMode: "auto",
      },
    ],
  },
});
```

---

## 5. Registration

After creating a manifest, register it in `packages/plugin-manifests/src/index.ts`.

### Step 1: Export the manifest

Add a named export at the top of the file, in the correct section:

```ts
// Connection providers
export { exampleCrmProvider } from "./connection-providers/example-crm.js";

// Ingress adapters
export { exampleWebhookAdapter } from "./ingress-adapters/example-webhook.js";

// Action executors
export { exampleNotifyExecutor } from "./action-executors/example-notify.js";

// Worker packs
export { myWorkerPackManifest } from "./worker-packs/my-worker.js";
```

### Step 2: Add to the typed aggregate array

Import the manifest and add it to the appropriate `readonly` array:

```ts
import { exampleCrmProvider } from "./connection-providers/example-crm.js";

export const connectionProviderPlugins: readonly ConnectionProviderPluginManifest[] = [
  gmailReadOnlyProvider,
  // ... existing providers ...
  exampleCrmProvider,          // <-- add here
];
```

### Step 3: Verify unique IDs

The registry runs `assertUniqueIds()` on each array at module load time. If your
manifest ID collides with an existing one, you get an immediate error.

### Worker pack runtime registration

For worker packs, you also need to:

1. Export the runtime pack from `services/control-plane/src/worker-packs/index.ts`.
2. Add it to the `firstPartyWorkerPacks` array in the same file.
3. Wire it into `services/control-plane/src/app.ts` if needed.

---

## 6. Console Integration

Plugins appear on the Connections page automatically once registered in the
manifest registry. Custom panels are optional.

### Automatic rendering (generic fallback)

Every registered connection provider manifest appears on the Connections page
through the generic `ProviderSetupCard`. No console code changes are needed.
The card uses manifest metadata (`displayName`, `description`, `category`,
`setupSteps`, `setupHelp`, `recoveryHints`) to render.

### Custom panel (optional)

If a provider needs a richer setup experience, register a custom panel in
`apps/console/app/workspace/connections/panel-registrations.ts`:

```ts
import { registerProviderPanel } from "../_lib/provider-panel-registry";
import { registerPanelPropsResolver, type ResolverContext } from "../_lib/provider-panel-resolver";
import { ExampleCrmOnboardingCard } from "./example-crm-onboarding-card";

// Register the custom panel component (keyed by manifest ID)
registerProviderPanel("provider.example-crm", ExampleCrmOnboardingCard);

// Register a props resolver that extracts component props from workspace data
registerPanelPropsResolver("provider.example-crm", (ctx: ResolverContext) => {
  const connection = ctx.connections.find(
    (c) => c.provider === "example_crm" && c.access_mode === "read_only",
  ) ?? null;

  return {
    connection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});
```

### Key rules

- Panel registrations are keyed by manifest `id`, not by a UI-specific field.
- Do **not** add UI-specific fields to the manifest. The manifest stays UI-agnostic.
- Registered panels render body content only; `ProviderSetupCard` owns the outer shell.
- If a manifest ID has no registered panel, the generic fallback renders automatically.
- Panel registrations happen as side-effect imports, loaded before the connections page renders.

### Setup step evaluators

If a setup step should be automatically checkable (e.g., "are credentials
configured?"), register an evaluator in
`apps/console/app/workspace/_lib/evaluator-registrations.ts`. Evaluators are
keyed by `${pluginId}:${stepId}`.

---

## 7. Testing

### Manifest-alignment tests

The contract conformance test suite in
`services/control-plane/src/worker-packs/contract-conformance.test.ts` validates
that all worker packs satisfy structural invariants:

- Every pack has a non-empty `systemPrompt` and `summary`.
- Every pack has at least one input route and one action capability.
- Manifest `workerPackId` matches the runtime contract `id`.
- Manifest `workerKind` and `defaultScope` match the contract.
- Input route kinds, action kinds, and output kinds match between manifest and install.
- All IDs are unique across packs.
- Every runtime pack has exactly one manifest, and vice versa.

When you add a new worker pack, add it to the `allPacks` array in this test file.

### Example: adding your pack to conformance tests

```ts
import { myWorkerPack } from "./my-worker-pack.js";

const allPacks: WorkerPackDefinition[] = [
  followUpWorkerPack,
  proposalWorkerPack,
  incidentWorkerPack,
  bugfixWorkerPack,
  myWorkerPack,        // <-- add here
];
```

### Construction-time alignment

`defineWorkerPackContract()` itself enforces manifest/install alignment. If your
install declares input route kinds or action kinds that do not match the
manifest, you get an error at construction time -- before any test runs.

### Focused unit tests

For packs with runtime execution hooks, write focused tests for:

- Triage logic (e.g., `follow-up-triage.test.ts`)
- Execution logic (e.g., `follow-up-execution.test.ts`)
- State machine transitions (parse, pause, resume, complete, fail)

### Console-native contract tests

`services/control-plane/src/plugins/console-native-contract.test.ts` verifies
that manifests flow correctly through the registry API response and that
category/priority metadata is preserved.

### Running tests

```bash
# Run all worker pack tests
pnpm --filter control-plane test -- --run src/worker-packs/

# Run conformance tests only
pnpm --filter control-plane test -- --run src/worker-packs/contract-conformance.test.ts

# Run plugin contract tests
pnpm --filter control-plane test -- --run src/plugins/
```

---

## 8. Constraints

### What plugins can do

- Declare metadata for discovery, compatibility, and setup.
- Own auth token exchange details and credential validation mechanics.
- Own provider-specific watch or webhook plumbing.
- Normalize payloads into Clawback contracts.
- Own transport retries underneath Clawback's idempotency contract.
- Provide provider-specific diagnostics and status details.

### What plugins cannot do

- **No direct DB access.** Plugins interact with the platform through defined service interfaces, not by querying the database.
- **No bypassing review gates.** All governed actions must go through Clawback's review/approval flow. A plugin cannot skip human review for `ask_me` boundary mode actions.
- **No modifying shared contracts.** Plugin work must not silently redefine work item states, review states, inbox rules, or activity meaning. Those are Clawback-owned product semantics.
- **No inventing new user-facing primary nouns.** The product leads with workers, connections, work, inbox, and activity -- not plugins, runtime adapters, or provider plumbing.
- **No reporting product success prematurely.** A plugin must not report completion before Clawback-owned completion truth is satisfied.
- **No silently broadening the supported public claim.** Adding a provider should not change what the product publicly claims to support without explicit review.

These constraints come from the frozen provider/plugin boundary documented in
`docs/beta/b0-public-tryability-contract-freeze.md`.

---

## Quick Reference: Files to Touch

| What you are building | Manifest file | Registry update | Runtime file | Console files |
| --- | --- | --- | --- | --- |
| Connection provider | `packages/plugin-manifests/src/connection-providers/<name>.ts` | `packages/plugin-manifests/src/index.ts` | None | Optional: panel + resolver in `apps/console/` |
| Ingress adapter | `packages/plugin-manifests/src/ingress-adapters/<name>.ts` | `packages/plugin-manifests/src/index.ts` | `services/control-plane/src/integrations/` | None |
| Action executor | `packages/plugin-manifests/src/action-executors/<name>.ts` | `packages/plugin-manifests/src/index.ts` | Executor logic in `services/control-plane/` | None |
| Worker pack | `packages/plugin-manifests/src/worker-packs/<name>.ts` | `packages/plugin-manifests/src/index.ts` | `services/control-plane/src/worker-packs/<name>-pack.ts` + `index.ts` | None |

---

## Starter Templates

Copy-paste starter files are available in
[`docs/guides/plugin-templates/`](./plugin-templates/). Each is a minimal,
commented TypeScript file ready to rename and customize:

| Template | What it gives you |
| --- | --- |
| `connection-provider.ts.example` | Connection provider manifest with all required fields |
| `ingress-adapter.ts.example` | Ingress adapter manifest with auth and route kind setup |
| `action-executor.ts.example` | Action executor manifest with governance defaults |
| `worker-pack-manifest.ts.example` | Worker pack manifest (metadata side) |
| `worker-pack-runtime.ts.example` | Worker pack runtime definition (execution side) |
| `alignment-test.ts.example` | Vitest alignment test ensuring manifest/runtime stay in sync |

---

## Related Docs

- [Plugins & Providers](./plugins-and-providers.md) -- architecture overview
- [Plugin API Reference](./plugin-api-reference.md) -- manifest and schema details
- [Public Tryability Milestone](../beta/public-tryability-milestone.md) -- current public beta scope
