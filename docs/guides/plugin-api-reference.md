# Plugin API Reference

Field-level reference for every plugin manifest type in Clawback. Use this when you need to know exactly what a field does, what values it accepts, and how the system uses it.

For concepts and workflow, read [Plugin Development Guide](./plugin-development.md).
For the provider model overview, read [Plugins & Providers](./plugins-and-providers.md).

---

## Quick Start

Every plugin manifest is a typed object exported from `packages/plugin-manifests/src/`. There are four plugin classes:

| Class | Type | ID prefix convention | Example |
| --- | --- | --- | --- |
| Connection provider | `ConnectionProviderPluginManifest` | `provider.` | `provider.gmail.read-only` |
| Ingress adapter | `IngressAdapterPluginManifest` | `ingress.` | `ingress.postmark.forward-email` |
| Action executor | `ActionExecutorPluginManifest` | `action.` | `action.smtp-reviewed-send` |
| Worker pack | `WorkerPackPluginManifest` | `worker-pack.` | `worker-pack.follow-up` |

To add a plugin:

1. Create a manifest file in the appropriate subdirectory of `packages/plugin-manifests/src/`
2. Export it from `packages/plugin-manifests/src/index.ts`
3. Add runtime behavior in `services/control-plane/` if needed
4. Run tests

Manifest types are defined in `packages/plugin-sdk/src/manifests.ts`.
API response schemas are defined in `packages/contracts/src/registry.ts`.

---

## 1. Base Fields (All Plugin Types)

Every manifest extends `PluginManifestBase`. These fields appear on all four plugin classes.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | Stable unique identifier. See [ID conventions](#5-stable-id-conventions) below. |
| `kind` | `PluginKind` | yes | One of `"connection_provider"`, `"ingress_adapter"`, `"action_executor"`, `"worker_pack"`. |
| `version` | `string` | yes | Semver string. Currently `"1.0.0"` for all first-party plugins. |
| `displayName` | `string` | yes | Human-readable name shown in UI. Example: `"Gmail Read-Only"`. |
| `description` | `string` | yes | One-line summary of what the plugin does. Shown in registry listings and setup UI. |
| `owner` | `PluginOwner` | yes | `"core"` or `"first_party"`. All current plugins use `"first_party"`. |
| `stability` | `PluginStability` | yes | `"experimental"`, `"pilot"`, or `"stable"`. See [Stability](#7-category--priority--stability). |
| `category` | `PluginCategory` | no | `"email"`, `"knowledge"`, `"project"`, `"crm"`, or `"other"`. Used for grouping in the UI. |
| `priority` | `number` | no | Sort order within a category. Lower numbers appear first. Example: `10` before `20`. |
| `tags` | `string[]` | no | Free-form tags. Not currently used for rendering but available for filtering. |

**Example** (from `gmail-read-only.ts`):

```ts
{
  id: "provider.gmail.read-only",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "Gmail Read-Only",
  description: "Workspace-level Gmail read-only connection used for watched inbox and shadow mode.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 10,
  // ... class-specific fields follow
}
```

---

## 2. Connection Provider Manifest

**Type:** `ConnectionProviderPluginManifest`
**When to use:** You want Clawback to connect to an external system (read data, send data, or both).

Extends the base fields with:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `provider` | `ConnectionProvider` | yes | Internal provider key. Must match the value used in connections DB records. Examples: `"gmail"`, `"smtp_relay"`, `"drive"`, `"notion"`, `"calendar"`. |
| `accessModes` | `ConnectionAccessMode[]` | yes | What access levels this provider supports. Values: `"read_only"`, `"write_capable"`. A read-only Gmail connection uses `["read_only"]`. SMTP uses `["write_capable"]`. |
| `capabilities` | `string[]` | yes | Free-form list of what this connection can do. Used for documentation and compatibility checks. Examples: `["read_threads", "watch_inbox"]`, `["send_email"]`, `["read_documents"]`. |
| `compatibleInputRouteKinds` | `InputRouteKind[]` | yes | Which input route types this provider can feed. Gmail read-only uses `["watched_inbox"]`. Providers that are output-only (like SMTP) use `[]`. |
| `setupMode` | `string` | yes | How the operator configures this connection. One of: `"operator_driven"` (manual credential entry), `"browser_oauth"` (OAuth flow in the browser), `"external_runtime"` (configured outside Clawback). |
| `secretKeys` | `string[]` | yes | Environment variable or secret names this provider needs. Examples: `["google_client_id", "google_client_secret", "google_refresh_token"]`. |
| `setupSteps` | `SetupStepManifest[]` | yes | Ordered setup instructions shown in the Setup and Connections UI. See [Setup Steps](#6-setup-steps). |

### Real examples

**Read-only knowledge source** (no input routes, OAuth setup):

```ts
// drive.ts
{
  provider: "drive",
  accessModes: ["read_only"],
  capabilities: ["read_documents"],
  compatibleInputRouteKinds: [],
  setupMode: "browser_oauth",
  secretKeys: ["google_client_id", "google_client_secret"],
}
```

**Write-capable output destination** (no input routes, operator-driven setup):

```ts
// smtp-relay.ts
{
  provider: "smtp_relay",
  accessModes: ["write_capable"],
  capabilities: ["send_email"],
  compatibleInputRouteKinds: [],
  setupMode: "operator_driven",
  secretKeys: ["CLAWBACK_SMTP_HOST", "CLAWBACK_SMTP_PORT", ...],
}
```

**Input-feeding provider** (feeds watched inbox routes):

```ts
// gmail-read-only.ts
{
  provider: "gmail",
  accessModes: ["read_only"],
  capabilities: ["read_threads", "watch_inbox"],
  compatibleInputRouteKinds: ["watched_inbox"],
  setupMode: "operator_driven",
}
```

---

## 3. Ingress Adapter Manifest

**Type:** `IngressAdapterPluginManifest`
**When to use:** An external system sends events into Clawback (webhooks, watch notifications) and you need to normalize them into the internal route/event model.

Extends the base fields with:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `adapterKind` | `string` | yes | Classification of how events arrive. One of: `"provider_inbound"` (provider pushes events, e.g. Postmark webhook), `"watch_hook"` (Clawback polls/watches and receives notifications, e.g. Gmail watch), `"generic_webhook"` (untyped external webhook). |
| `normalizedInputRouteKinds` | `InputRouteKind[]` | yes | What route kinds this adapter produces after normalizing inbound events. Postmark produces `["forward_email"]`. Gmail watch produces `["watched_inbox"]`. |
| `authentication` | `string` | yes | How inbound requests are authenticated. One of: `"shared_token"` (pre-shared secret in header), `"provider_signature"` (provider signs the payload), `"oauth_callback"` (OAuth redirect flow). |
| `provider` | `string` | yes | Which external provider this adapter handles. Examples: `"postmark"`, `"gmail"`. |
| `setupSteps` | `SetupStepManifest[]` | yes | Setup instructions. See [Setup Steps](#6-setup-steps). |

### Real examples

**Webhook-based inbound** (Postmark pushes email payloads):

```ts
// postmark-inbound.ts
{
  adapterKind: "provider_inbound",
  normalizedInputRouteKinds: ["forward_email"],
  authentication: "shared_token",
  provider: "postmark",
}
```

**Watch notification** (Gmail sends change notifications):

```ts
// gmail-watch.ts
{
  adapterKind: "watch_hook",
  normalizedInputRouteKinds: ["watched_inbox"],
  authentication: "shared_token",
  provider: "gmail",
}
```

---

## 4. Action Executor Manifest

**Type:** `ActionExecutorPluginManifest`
**When to use:** Clawback needs to perform a governed external action after human review (e.g., send an email).

Extends the base fields with:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `actionKind` | `ActionCapabilityKind` | yes | What type of action this executor handles. Example: `"send_email"`, `"save_work"`. |
| `destinationProviders` | `ConnectionProvider[]` | yes | Which connection providers this executor can send through. Example: `["smtp_relay"]`. |
| `defaultBoundaryMode` | `BoundaryMode` | yes | Default governance level. `"ask_me"` means human must approve each action. Other values may exist for auto-approve scenarios. |
| `executionModel` | `string` | yes | How execution is managed. Currently always `"governed_async"` -- the action is queued, reviewed, then executed asynchronously. |
| `secretKeys` | `string[]` | yes | Secrets needed for execution. Usually the same as the destination provider's secrets. |
| `setupSteps` | `SetupStepManifest[]` | yes | Setup instructions. See [Setup Steps](#6-setup-steps). |

### Real example

```ts
// smtp-send.ts
{
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
}
```

---

## 5. Worker Pack Manifest

**Type:** `WorkerPackPluginManifest`
**When to use:** You want to add a new installable worker template (e.g., a "Client Follow-Up" worker or a "Proposal" worker).

Extends the base fields with:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `workerPackId` | `string` | yes | Links this manifest to its runtime pack. Must exactly match the `id` field in the runtime `WorkerPackDefinition`. Uses snake_case with version suffix. Examples: `"follow_up_v1"`, `"proposal_v1"`. |
| `workerKind` | `WorkerKind` | yes | The kind of worker this pack creates. Examples: `"follow_up"`, `"proposal"`. |
| `defaultScope` | `WorkerScope` | yes | Default visibility scope when installed. `"shared"` means visible to the whole workspace. |
| `supportedInputRouteKinds` | `InputRouteKind[]` | yes | What input methods this worker accepts. Examples: `["chat", "forward_email", "watched_inbox"]` for follow-up, `["chat", "upload"]` for proposal. |
| `outputKinds` | `WorkItemKind[]` | yes | What kinds of work items this worker produces. Examples: `["email_draft", "meeting_recap"]`, `["proposal_draft", "action_plan"]`. |
| `actionKinds` | `ActionCapabilityKind[]` | yes | What actions this worker can request. Examples: `["send_email", "save_work"]`, `["save_work"]`. |
| `requiredConnectionProviders` | `ConnectionProvider[]` | yes | Connections that must be configured for this worker to function. Example: `["smtp_relay"]` for a worker that sends email. Use `[]` if none required. |
| `optionalConnectionProviders` | `ConnectionProvider[]` | yes | Connections that enhance the worker but aren't required. Example: `["gmail", "calendar", "drive"]`. |
| `setupSteps` | `SetupStepManifest[]` | yes | Setup instructions. See [Setup Steps](#6-setup-steps). |

### Real examples

**Worker with required connections** (follow-up needs SMTP to send):

```ts
// follow-up.ts
{
  workerPackId: "follow_up_v1",
  workerKind: "follow_up",
  defaultScope: "shared",
  supportedInputRouteKinds: ["chat", "forward_email", "watched_inbox"],
  outputKinds: ["email_draft", "meeting_recap"],
  actionKinds: ["send_email", "save_work"],
  requiredConnectionProviders: ["smtp_relay"],
  optionalConnectionProviders: ["gmail", "calendar", "drive"],
}
```

**Worker with no required connections** (proposal works standalone):

```ts
// proposal.ts
{
  workerPackId: "proposal_v1",
  workerKind: "proposal",
  defaultScope: "shared",
  supportedInputRouteKinds: ["chat", "upload"],
  outputKinds: ["proposal_draft", "action_plan"],
  actionKinds: ["save_work"],
  requiredConnectionProviders: [],
  optionalConnectionProviders: ["drive"],
}
```

---

## 6. Stable ID Conventions

Plugin IDs follow a dot-separated convention. This makes them greppable and avoids collisions.

| Plugin class | Pattern | Examples |
| --- | --- | --- |
| Connection provider | `provider.<system>[.<qualifier>]` | `provider.gmail.read-only`, `provider.smtp-relay`, `provider.drive` |
| Ingress adapter | `ingress.<provider>.<function>` | `ingress.postmark.forward-email`, `ingress.gmail.watch-hook` |
| Action executor | `action.<transport>-<verb>` | `action.smtp-reviewed-send` |
| Worker pack | `worker-pack.<name>` | `worker-pack.follow-up`, `worker-pack.proposal` |

Rules:
- IDs are **permanent**. Once shipped, do not rename them. Other code keys off these strings (panel registrations, evaluator registrations, setup step matching).
- Use kebab-case within segments: `read-only`, not `readOnly`.
- Keep IDs descriptive but short.
- The `workerPackId` inside worker pack manifests uses a **different convention**: snake_case with a version suffix (e.g., `follow_up_v1`). This is the runtime pack ID, not the manifest ID.

---

## 7. Setup Steps

Setup steps tell operators what to do to get a plugin working. They appear in the Setup page and the Connections page.

### SetupStepManifest fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes | Stable step identifier. Used to match evaluator registrations. Convention: kebab-case, descriptive. Examples: `"gmail-credentials"`, `"smtp-configure"`, `"install-follow-up"`. |
| `title` | `string` | yes | Short action label. Example: `"Validate Gmail credentials"`. |
| `description` | `string` | yes | What this step does and why. Shown below the title in setup UI. |
| `ctaLabel` | `string` | yes | Button text. Example: `"Set up Gmail"`, `"Install worker"`. |
| `operatorOnly` | `boolean` | no | If `true`, only workspace operators see this step. Most setup steps are operator-only. |
| `docsHref` | `string` | no | Link to documentation. Example: `"/docs/admin-guide"`. |
| `target` | `SetupSurfaceTarget` | no | Where the CTA navigates. See below. |

### SetupSurfaceTarget fields

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `surface` | `string` | yes | Which page to navigate to. One of: `"setup"`, `"connections"`, `"workers"`, `"activity"`. |
| `focus` | `string` | no | Scroll/focus hint within the surface. Example: `"gmail"`, `"smtp"`. |
| `workerKind` | `WorkerKind` | no | Filter to a specific worker kind. Example: `"follow_up"`. |

### When to use what

- Steps that configure credentials: target `{ surface: "connections", focus: "<provider>" }`
- Steps that install workers: target `{ surface: "workers", workerKind: "<kind>" }`
- Steps that point to external docs: set `docsHref` and target `{ surface: "setup" }`

### Automatic evaluation

Setup steps can be automatically checked by registering an evaluator keyed by `${pluginId}:${stepId}`. Evaluator registrations live in `apps/console/app/workspace/_lib/evaluator-registrations.ts`. If no evaluator is registered, the step renders as a manual checkbox.

---

## 8. Category, Priority, and Stability

### Category

Controls how plugins are grouped in the UI.

| Value | Use when | Example plugins |
| --- | --- | --- |
| `"email"` | Email reading, sending, or routing | Gmail Read-Only, SMTP Relay, Postmark Inbound |
| `"knowledge"` | Read-only data sources for context | Google Drive, Google Calendar, Notion |
| `"project"` | Project management and deliverables | Proposal worker pack |
| `"crm"` | CRM integrations | (none yet) |
| `"other"` | Doesn't fit the above | (none yet) |

### Priority

A number that controls sort order **within** a category. Lower numbers appear first.

Current conventions:
- `10` = primary plugin in its category (e.g., Gmail Read-Only in email)
- `20` = secondary (e.g., SMTP Relay in email, Google Drive in knowledge)
- `30` = tertiary (e.g., Notion in knowledge)

### Stability

Controls visibility badges and whether the plugin is usable.

| Value | Meaning | UI effect |
| --- | --- | --- |
| `"experimental"` | Not ready for production use. May lack runtime behavior entirely. | Renders with "Coming soon" badge. Operators can see it but cannot configure it. |
| `"pilot"` | Functional but still evolving. The interface or behavior may change. | Fully usable. May show a "Pilot" badge. |
| `"stable"` | Production-ready and unlikely to change. | No special badge. |

**When to use each:**
- Adding a placeholder for a future integration (e.g., Notion, Calendar) -- use `"experimental"`.
- Shipping a working feature that may still iterate (e.g., Gmail read-only, SMTP send) -- use `"pilot"`.
- Feature is battle-tested and the API is locked -- use `"stable"`.

---

## 9. Manifest vs Runtime Pack Split

Worker packs are deliberately split into two layers. This is the most important structural decision in the plugin system.

### Why they are separate

| Concern | Manifest (packages/plugin-manifests) | Runtime pack (services/control-plane/src/worker-packs) |
| --- | --- | --- |
| Purpose | Discovery, metadata, compatibility, setup | Execution logic, prompts, install behavior |
| Consumed by | Console UI, registry API, setup page | Control-plane runtime only |
| Contains | Display names, route kinds, action kinds, categories | System prompts, install side effects, default configs |
| Changes when | A new pack is announced or its metadata changes | The pack's behavior, prompts, or defaults change |
| Safe to share | Yes -- no secrets, no execution details | No -- contains internal implementation |

The manifest tells the UI and the registry **what** a worker pack is.
The runtime pack tells the control plane **how** it behaves.

### How they link

They share a single key: the `workerPackId` in the manifest must exactly match the `id` in the runtime `WorkerPackDefinition`.

```
Manifest: workerPackId = "follow_up_v1"
                              |
                              v
Runtime:  id = "follow_up_v1"
```

### What belongs where

Put in the **manifest**:
- `displayName`, `description`
- `workerKind`, `defaultScope`
- `supportedInputRouteKinds`, `outputKinds`, `actionKinds`
- `requiredConnectionProviders`, `optionalConnectionProviders`
- `setupSteps`, `category`, `priority`, `stability`

Put in the **runtime pack**:
- System prompt text
- Install logic (what routes and capabilities to create)
- Runtime defaults (boundary modes, tool configurations)
- Summary text used in API responses

**Never** put execution logic (prompts, install side effects) in the manifest.
**Never** put React component names or UI-specific fields in the manifest.

---

## 10. Worker Pack ID Alignment Rules

The alignment test file (`services/control-plane/src/plugins/manifest-alignment.test.ts`) enforces that manifests and runtime packs stay in sync. Here is exactly what it checks:

### Every manifest must have a runtime pack

For each manifest in `workerPackPlugins`, there must be a runtime pack whose `id` matches the manifest's `workerPackId`.

### Every runtime pack must have a manifest

For each runtime pack, there must be a manifest whose `workerPackId` matches.

### Per-pack field alignment

For each manifest/runtime pair, the test verifies:

| Field | Manifest source | Runtime source | Must be |
| --- | --- | --- | --- |
| Worker kind | `manifest.workerKind` | `runtime.kind` | Equal |
| Default scope | `manifest.defaultScope` | `runtime.defaultScope` | Equal |
| Input route kinds | `manifest.supportedInputRouteKinds` | `runtime.supportedInputRoutes[].kind` | Same set (order-independent) |
| Action kinds | `manifest.actionKinds` | `runtime.actionCapabilities[].kind` | Same set (order-independent) |
| Output kinds | `manifest.outputKinds` | `runtime.outputKinds` | Same set (order-independent) |

### How to stay aligned

When you add a new worker pack:

1. Define the manifest with the correct `workerPackId`, kinds, and route/action lists
2. Define the runtime pack with matching `id`, `kind`, `defaultScope`, routes, actions, and output kinds
3. Add the runtime pack to the `runtimePacks` array in `manifest-alignment.test.ts`
4. Run `pnpm test` -- the alignment tests will catch any mismatches

When you change an existing pack (e.g., add a new route kind):

1. Update both the manifest and the runtime pack
2. The alignment tests will fail if you update only one side

---

## 11. Fallback-Only vs Custom Panel

When a connection provider manifest is loaded by the console, it renders through a two-tier system.

### The generic fallback (most plugins)

If the manifest ID has **no entry** in the provider panel registry (`apps/console/app/workspace/_lib/provider-panel-registry.ts`), the console renders a generic manifest-driven card. This card shows:

- Display name and description from the manifest
- Stability badge
- Setup steps
- Category grouping

**When generic is enough:**
- The provider is experimental / "Coming soon" (no runtime behavior yet)
- Setup is simple (just credentials or an OAuth button)
- No provider-specific UI interactions are needed

Current fallback-only providers: Google Drive, Google Calendar, Notion.

### Custom panels (complex providers)

If the manifest ID **has an entry** in the panel registry, the console mounts a custom React component for that provider's body content. The outer shell (card frame, category, badges) is still generic.

**When you need a custom panel:**
- The provider has multi-step operator flows (e.g., Gmail needs credential validation, worker attachment, and status display)
- The setup involves interactive state beyond simple form fields
- The provider shows runtime status (e.g., connection health, attached workers)

Current custom-panel providers: Gmail Read-Only (`provider.gmail.read-only`), SMTP Relay (`provider.smtp-relay`).

### How to register a custom panel

In `apps/console/app/workspace/connections/panel-registrations.ts`:

```ts
import { registerProviderPanel } from "../_lib/provider-panel-registry";
import { MyProviderCard } from "./my-provider-onboarding-card";

registerProviderPanel("provider.my-provider", MyProviderCard);
```

The panel component receives props resolved by a registered props resolver (also keyed by manifest ID). Register the resolver in the same file:

```ts
import { registerPanelPropsResolver } from "../_lib/provider-panel-resolver";

registerPanelPropsResolver("provider.my-provider", (ctx) => {
  // Extract what your component needs from workspace data
  return { connection: ctx.connections.find(c => c.provider === "my_provider") ?? null };
});
```

### Decision checklist

| Question | If yes | If no |
| --- | --- | --- |
| Is the provider experimental / coming soon? | Generic fallback | Keep reading |
| Does setup require only a single credential form? | Generic fallback | Keep reading |
| Does the UI need to show live connection status? | Custom panel | Generic fallback |
| Does the UI need multi-step interactive flows? | Custom panel | Generic fallback |

---

## File Location Summary

| What | Path |
| --- | --- |
| Manifest type definitions | `packages/plugin-sdk/src/manifests.ts` |
| First-party manifests | `packages/plugin-manifests/src/` |
| Manifest package index | `packages/plugin-manifests/src/index.ts` |
| API response schemas (Zod) | `packages/contracts/src/registry.ts` |
| Alignment tests | `services/control-plane/src/plugins/manifest-alignment.test.ts` |
| Runtime worker packs | `services/control-plane/src/worker-packs/` |
| Provider panel registry | `apps/console/app/workspace/_lib/provider-panel-registry.ts` |
| Panel registrations | `apps/console/app/workspace/connections/panel-registrations.ts` |
| Evaluator registrations | `apps/console/app/workspace/_lib/evaluator-registrations.ts` |

---

## Related Docs

- [Plugin Development Guide](./plugin-development.md) -- concepts and workflow
- [Plugins & Providers](./plugins-and-providers.md) -- provider model overview
- [API Reference](./api-reference.md) -- HTTP API endpoints
