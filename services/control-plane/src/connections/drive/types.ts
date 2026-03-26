/**
 * Types for Google Drive read-only connection plugin.
 *
 * Implements the frozen provider lifecycle contract:
 * setupHelp, validate, probe, status, recoveryHints.
 */

// ---------------------------------------------------------------------------
// Config stored in connection.configJson
// ---------------------------------------------------------------------------

export type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  // OAuth app credentials (for "Connect with Google" flow)
  oauthAppClientId: string;
  oauthAppClientSecret: string;
  // Validation state
  validatedEmail: string | null;
  lastValidatedAt: string | null;
  lastProbeAt: string | null;
  lastError: string | null;
};

// ---------------------------------------------------------------------------
// Lifecycle types (frozen provider contract)
// ---------------------------------------------------------------------------

export type PluginDiagnosticIssue = {
  severity: "info" | "warn" | "error";
  code: string;
  summary: string;
  detail?: string;
};

export type PluginValidationResult = {
  ok: boolean;
  issues: PluginDiagnosticIssue[];
};

export type PluginProbeResult = {
  ok: boolean;
  checkedAt: string;
  summary: string;
  issues: PluginDiagnosticIssue[];
};

export type PluginOperationalState =
  | "setup_required"
  | "configured"
  | "ready"
  | "degraded"
  | "error";

export type PluginOperationalStatus = {
  state: PluginOperationalState;
  summary: string;
  lastProbeAt: string | null;
  blockingIssueCodes: string[];
};

export type PluginRecoveryHint = {
  code: string;
  label: string;
  description: string;
  docsHref?: string;
  target?: {
    surface: "setup" | "connections" | "workers" | "docs";
    focus?: string;
  };
};

// ---------------------------------------------------------------------------
// Drive setup summary (returned to API callers)
// ---------------------------------------------------------------------------

export type DriveSetupSummary = {
  connection_id: string;
  status: "not_connected" | "suggested" | "connected" | "error";
  configured: boolean;
  validated_email: string | null;
  last_validated_at: string | null;
  last_probe_at: string | null;
  last_error: string | null;
  client_id_present: boolean;
  client_secret_present: boolean;
  refresh_token_present: boolean;
  oauth_app_configured: boolean;
  operational_status: PluginOperationalStatus;
};

// ---------------------------------------------------------------------------
// Drive context types (read-only file access)
// ---------------------------------------------------------------------------

export type DriveFileEntry = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string | undefined;
  webViewLink?: string | undefined;
};

export type DriveFileContent = {
  id: string;
  name: string;
  mimeType: string;
  content: string;
};

export type DriveSearchResult = {
  files: DriveFileEntry[];
  nextPageToken?: string | undefined;
};
