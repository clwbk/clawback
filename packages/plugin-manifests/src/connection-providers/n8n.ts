import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const n8nProvider: ConnectionProviderPluginManifest = {
  id: "provider.n8n",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "n8n",
  description: "Outbound automation backend for reviewed deterministic workflow handoffs.",
  owner: "first_party",
  stability: "pilot",
  category: "project",
  priority: 25,
  provider: "n8n",
  accessModes: ["write_capable"],
  capabilities: ["run_n8n_workflow"],
  compatibleInputRouteKinds: [],
  setupMode: "operator_driven",
  secretKeys: ["n8n_base_url", "n8n_auth_token"],
  setupHelp:
    "Configure the n8n instance URL and authentication token. Required: n8n_base_url (e.g. https://n8n.example.com), n8n_auth_token. " +
    "The token can be a header auth token or API key configured in n8n's settings.",
  validate:
    "Checks that n8n_base_url is a valid URL and n8n_auth_token is present.",
  probe:
    "Calls the n8n /api/v1/workflows endpoint to verify connectivity and authentication.",
  status:
    "Reports n8n instance URL, authentication status, number of accessible workflows, and last handoff timestamp.",
  recoveryHints: [
    { symptom: "Connection refused", fix: "Verify n8n_base_url is correct and the n8n instance is running. Check firewall rules." },
    { symptom: "401 Unauthorized", fix: "The auth token is invalid. Generate a new API key in n8n Settings > API." },
    { symptom: "Workflow not found", fix: "The target workflow may have been deleted or renamed. Verify workflow IDs in the n8n editor." },
  ],
  setupSteps: [
    {
      id: "n8n-connect",
      title: "Configure n8n backend",
      description: "Add the n8n base URL and auth token used for reviewed outbound workflow handoffs.",
      ctaLabel: "Configure n8n",
      operatorOnly: true,
      target: { surface: "connections", focus: "n8n" },
    },
  ],
};
