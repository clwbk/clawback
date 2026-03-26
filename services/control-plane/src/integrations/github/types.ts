/**
 * GitHub integration types following the frozen provider lifecycle contract.
 *
 * See: docs/architecture/plugin-operator-lifecycle-and-doctor.md
 */

// ---------------------------------------------------------------------------
// Config stored in connection.configJson
// ---------------------------------------------------------------------------

export type GitHubConnectionConfig = {
  personalAccessToken: string;
  /** GitHub username associated with the validated token. */
  validatedLogin: string | null;
  /** GitHub user display name. */
  validatedName: string | null;
  /** Scopes reported by the token. */
  tokenScopes: string[];
  /** Optional org filter. Empty means all accessible repos. */
  org: string | null;
  /** Optional repo filter (owner/repo format). Empty means all accessible. */
  repos: string[];
  lastProbeAt: string | null;
  lastProbeError: string | null;
};

// ---------------------------------------------------------------------------
// Lifecycle types (operator contract)
// ---------------------------------------------------------------------------

export type GitHubOperationalState =
  | "setup_required"
  | "configured"
  | "ready"
  | "degraded"
  | "error";

export type GitHubDiagnosticIssue = {
  severity: "info" | "warn" | "error";
  code: string;
  summary: string;
  detail?: string;
};

export type GitHubValidationResult = {
  ok: boolean;
  issues: GitHubDiagnosticIssue[];
};

export type GitHubProbeResult = {
  ok: boolean;
  checkedAt: string;
  summary: string;
  issues: GitHubDiagnosticIssue[];
  user?: {
    login: string;
    name: string | null;
  };
  scopes?: string[];
};

export type GitHubOperationalStatus = {
  state: GitHubOperationalState;
  summary: string;
  lastProbeAt: string | null;
  blockingIssueCodes: string[];
};

export type GitHubRecoveryHint = {
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
// Setup input
// ---------------------------------------------------------------------------

export type GitHubSetupInput = {
  personal_access_token: string;
  org?: string;
  repos?: string[];
};

// ---------------------------------------------------------------------------
// Status response (returned by the status endpoint)
// ---------------------------------------------------------------------------

export type GitHubStatusResponse = {
  connection_id: string;
  connection_status: string;
  operational: GitHubOperationalStatus;
  probe: GitHubProbeResult | null;
  recovery_hints: GitHubRecoveryHint[];
};

// ---------------------------------------------------------------------------
// Context retrieval types
// ---------------------------------------------------------------------------

export type GitHubRepo = {
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  private: boolean;
  language: string | null;
  updated_at: string;
};

export type GitHubIssue = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  user_login: string;
  labels: string[];
  created_at: string;
  updated_at: string;
  is_pull_request: boolean;
};

export type GitHubFileContent = {
  path: string;
  content: string;
  encoding: string;
  size: number;
  html_url: string;
};
