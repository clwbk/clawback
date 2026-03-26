import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

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
    "Configure Google OAuth credentials for the shared workspace mailbox. Required: google_client_id, google_client_secret, google_refresh_token. " +
    "Create a Google Cloud project, enable the Gmail API, and generate OAuth credentials with the gmail.readonly scope.",
  validate:
    "Checks that all three secret keys are present and that the refresh token can obtain a valid access token from Google.",
  probe:
    "Attempts a lightweight Gmail API call (users.getProfile) to verify read access to the configured mailbox.",
  status:
    "Reports connected mailbox address, token expiry, and whether the Gmail watch push subscription is active.",
  recoveryHints: [
    { symptom: "Token refresh fails with invalid_grant", fix: "The refresh token was revoked or expired. Re-authorize the mailbox through the Google OAuth flow." },
    { symptom: "403 Insufficient Permission", fix: "The OAuth app is missing the gmail.readonly scope. Recreate credentials with the correct scope." },
    { symptom: "Watch notifications stop arriving", fix: "The Gmail push subscription expired. Re-register the watch via the Gmail API or restart the runtime." },
  ],
  setupSteps: [
    {
      id: "gmail-credentials",
      title: "Validate Gmail credentials",
      description: "Store and validate the Google client credentials and refresh token for the shared mailbox.",
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
