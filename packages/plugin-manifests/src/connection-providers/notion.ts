import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const notionProvider: ConnectionProviderPluginManifest = {
  id: "provider.notion",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "Notion",
  description: "Knowledge source for team wikis, project notes, and meeting docs.",
  owner: "first_party",
  stability: "experimental",
  category: "knowledge",
  priority: 30,
  provider: "notion",
  accessModes: ["read_only"],
  capabilities: ["read_pages", "search"],
  compatibleInputRouteKinds: [],
  setupMode: "browser_oauth",
  secretKeys: ["notion_api_key"],
  setupHelp:
    "Create a Notion internal integration at notion.so/my-integrations. Required: notion_api_key (the integration token). " +
    "Share the pages or databases you want indexed with the integration.",
  validate:
    "Checks that the notion_api_key is present and has a valid format (starts with 'ntn_' or 'secret_').",
  probe:
    "Calls the Notion API users.me endpoint to verify the integration token is valid and active.",
  status:
    "Reports the integration name, connected workspace, and number of accessible pages.",
  recoveryHints: [
    { symptom: "401 Unauthorized", fix: "The integration token is invalid or was revoked. Generate a new one at notion.so/my-integrations." },
    { symptom: "No pages found", fix: "Pages must be explicitly shared with the integration. Open each page and use 'Share' to add the integration." },
  ],
  setupSteps: [
    {
      id: "notion-connect",
      title: "Connect Notion workspace",
      description: "Authorize read-only access to Notion pages for context-aware workflows.",
      ctaLabel: "Connect Notion",
      operatorOnly: true,
      target: { surface: "connections" },
    },
  ],
};
