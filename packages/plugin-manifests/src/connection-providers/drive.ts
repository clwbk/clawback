import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const driveProvider: ConnectionProviderPluginManifest = {
  id: "provider.drive",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "Google Drive",
  description: "Read-only knowledge source for shared documents, proposals, and business context.",
  owner: "first_party",
  stability: "pilot",
  category: "knowledge",
  priority: 20,
  provider: "drive",
  accessModes: ["read_only"],
  capabilities: ["read_documents", "search_files"],
  compatibleInputRouteKinds: [],
  setupMode: "browser_oauth",
  secretKeys: ["google_client_id", "google_client_secret"],
  setupHelp:
    "Create a Google Cloud project with the Drive API enabled. Required: google_client_id, google_client_secret. " +
    "Configure OAuth consent screen and add the drive.readonly scope. Use the browser OAuth flow to authorize.",
  validate:
    "Checks that OAuth client credentials are set and the refresh token can obtain a valid access token.",
  probe:
    "Calls the Drive API about.get to verify read access to the authorized account's files.",
  status:
    "Reports connected Google account email, storage quota usage, and number of shared drives visible.",
  recoveryHints: [
    { symptom: "Token refresh fails with invalid_grant", fix: "The refresh token was revoked. Re-authorize through the browser OAuth flow." },
    { symptom: "File not found errors", fix: "The file may not be shared with the authorized account. Check sharing permissions in Drive." },
    { symptom: "Quota exceeded", fix: "Drive API has per-user rate limits. Reduce sync frequency or batch requests." },
  ],
  setupSteps: [
    {
      id: "drive-oauth-app",
      title: "Configure Google OAuth app",
      description:
        "Create a Google Cloud project with the Drive API enabled and configure OAuth 2.0 credentials. " +
        "The app needs the https://www.googleapis.com/auth/drive.readonly scope.",
      ctaLabel: "Configure OAuth",
      operatorOnly: true,
      docsHref: "https://console.cloud.google.com/apis/credentials",
      target: { surface: "connections", focus: "drive" },
    },
    {
      id: "drive-connect",
      title: "Connect Google Drive",
      description:
        "Authorize read-only access to shared drive documents. " +
        "Clawback will only read files — no modifications are made.",
      ctaLabel: "Connect Drive",
      operatorOnly: true,
      target: { surface: "connections", focus: "drive" },
    },
    {
      id: "drive-attach-worker",
      title: "Attach Drive to eligible workers",
      description:
        "Attach the Drive connection to workers that use document context (e.g. proposal workers).",
      ctaLabel: "Attach to worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "proposal", focus: "connections" },
    },
  ],
};
