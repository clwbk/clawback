/**
 * GitHub connection service implementing the frozen provider lifecycle contract.
 *
 * Lifecycle surface:
 *   1. setupHelp   — static, lives in the manifest
 *   2. validate    — cheap local config checks
 *   3. probe       — live reachability check against GitHub API
 *   4. status      — synthesize operator-facing state
 *   5. recoveryHints — actionable guidance when something is wrong
 *
 * All operations are READ-ONLY. No PR creation, issue creation, or write actions.
 */

import type { ConnectionService } from "../../connections/index.js";
import type {
  GitHubConnectionConfig,
  GitHubValidationResult,
  GitHubProbeResult,
  GitHubOperationalStatus,
  GitHubRecoveryHint,
  GitHubStatusResponse,
  GitHubSetupInput,
  GitHubDiagnosticIssue,
} from "./types.js";

// ---------------------------------------------------------------------------
// GitHub API client (read-only)
// ---------------------------------------------------------------------------

async function githubApiFetch(
  path: string,
  token: string,
  options?: { accept?: string },
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: options?.accept ?? "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "Clawback/1.0",
    },
  });
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type GitHubConnectionServiceOptions = {
  connectionService: ConnectionService;
  now?: () => Date;
};

export class GitHubConnectionService {
  private readonly now: () => Date;

  constructor(private readonly options: GitHubConnectionServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Setup: validate token, store config, probe, return status
  // -------------------------------------------------------------------------

  async setup(
    workspaceId: string,
    connectionId: string,
    input: GitHubSetupInput,
  ): Promise<GitHubStatusResponse> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "github") {
      throw new GitHubSetupError(
        "invalid_connection",
        "GitHub setup is only supported for GitHub connections.",
        400,
      );
    }

    // Step 1: Validate the PAT against GitHub API (GET /user)
    const probeResult = await this.probeToken(input.personal_access_token);

    if (!probeResult.ok) {
      // Store partial config with error
      const config: GitHubConnectionConfig = {
        personalAccessToken: input.personal_access_token,
        validatedLogin: null,
        validatedName: null,
        tokenScopes: [],
        org: input.org ?? null,
        repos: input.repos ?? [],
        lastProbeAt: probeResult.checkedAt,
        lastProbeError: probeResult.issues.map((i) => i.summary).join("; "),
      };

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "error",
        configJson: config as unknown as Record<string, unknown>,
      });

      return this.buildStatusResponse(connectionId, "error", config);
    }

    // Step 2: Store validated config
    const config: GitHubConnectionConfig = {
      personalAccessToken: input.personal_access_token,
      validatedLogin: probeResult.user?.login ?? null,
      validatedName: probeResult.user?.name ?? null,
      tokenScopes: probeResult.scopes ?? [],
      org: input.org ?? null,
      repos: input.repos ?? [],
      lastProbeAt: probeResult.checkedAt,
      lastProbeError: null,
    };

    await this.options.connectionService.update(workspaceId, connectionId, {
      status: "connected",
      capabilities: ["read_repos", "read_issues", "read_prs", "search_code"],
      configJson: config as unknown as Record<string, unknown>,
    });

    return this.buildStatusResponse(connectionId, "connected", config);
  }

  // -------------------------------------------------------------------------
  // Lifecycle: validate (cheap local check)
  // -------------------------------------------------------------------------

  validate(config: GitHubConnectionConfig): GitHubValidationResult {
    const issues: GitHubDiagnosticIssue[] = [];

    if (!config.personalAccessToken) {
      issues.push({
        severity: "error",
        code: "missing_pat",
        summary: "Personal access token is not configured.",
      });
    }

    if (
      config.personalAccessToken &&
      config.personalAccessToken.length < 10
    ) {
      issues.push({
        severity: "error",
        code: "invalid_pat_format",
        summary: "Personal access token appears too short.",
      });
    }

    return {
      ok: issues.length === 0,
      issues,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle: probe (live reachability check)
  // -------------------------------------------------------------------------

  async probe(
    workspaceId: string,
    connectionId: string,
  ): Promise<GitHubProbeResult> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "github") {
      throw new GitHubSetupError(
        "invalid_connection",
        "GitHub probe is only supported for GitHub connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    const validation = this.validate(config);

    if (!validation.ok) {
      const result: GitHubProbeResult = {
        ok: false,
        checkedAt: this.now().toISOString(),
        summary: "Configuration is incomplete.",
        issues: validation.issues,
      };

      await this.options.connectionService.update(workspaceId, connectionId, {
        configJson: {
          ...config,
          lastProbeAt: result.checkedAt,
          lastProbeError: result.summary,
        } as unknown as Record<string, unknown>,
      });

      return result;
    }

    const probeResult = await this.probeToken(config.personalAccessToken);

    // Update stored probe state
    await this.options.connectionService.update(workspaceId, connectionId, {
      status: probeResult.ok ? "connected" : "error",
      configJson: {
        ...config,
        validatedLogin: probeResult.user?.login ?? config.validatedLogin,
        validatedName: probeResult.user?.name ?? config.validatedName,
        tokenScopes: probeResult.scopes ?? config.tokenScopes,
        lastProbeAt: probeResult.checkedAt,
        lastProbeError: probeResult.ok
          ? null
          : probeResult.issues.map((i) => i.summary).join("; "),
      } as unknown as Record<string, unknown>,
    });

    return probeResult;
  }

  // -------------------------------------------------------------------------
  // Lifecycle: status (synthesize operator-facing truth)
  // -------------------------------------------------------------------------

  async getStatus(
    workspaceId: string,
    connectionId: string,
  ): Promise<GitHubStatusResponse> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "github") {
      throw new GitHubSetupError(
        "invalid_connection",
        "GitHub status is only supported for GitHub connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    return this.buildStatusResponse(connectionId, connection.status, config);
  }

  // -------------------------------------------------------------------------
  // Context retrieval: list repos
  // -------------------------------------------------------------------------

  async listRepos(
    workspaceId: string,
    connectionId: string,
    options?: { per_page?: number; page?: number },
  ): Promise<{ repos: Array<{ full_name: string; description: string | null; html_url: string; default_branch: string; private: boolean; language: string | null; updated_at: string }> }> {
    const config = await this.getValidatedConfig(workspaceId, connectionId);

    let path = "/user/repos?sort=updated&direction=desc";
    if (options?.per_page) path += `&per_page=${options.per_page}`;
    if (options?.page) path += `&page=${options.page}`;

    const response = await githubApiFetch(path, config.personalAccessToken);
    if (!response.ok) {
      throw new GitHubSetupError(
        "api_error",
        `GitHub API error: ${response.status} ${response.statusText}`,
        502,
      );
    }

    const data = (await response.json()) as Array<{
      full_name: string;
      description: string | null;
      html_url: string;
      default_branch: string;
      private: boolean;
      language: string | null;
      updated_at: string;
    }>;

    let repos = data.map((r) => ({
      full_name: r.full_name,
      description: r.description,
      html_url: r.html_url,
      default_branch: r.default_branch,
      private: r.private,
      language: r.language,
      updated_at: r.updated_at,
    }));

    // Filter by org/repos if configured
    if (config.org) {
      repos = repos.filter((r) =>
        r.full_name.toLowerCase().startsWith(`${config.org!.toLowerCase()}/`),
      );
    }
    if (config.repos.length > 0) {
      const allowed = new Set(config.repos.map((r) => r.toLowerCase()));
      repos = repos.filter((r) => allowed.has(r.full_name.toLowerCase()));
    }

    return { repos };
  }

  // -------------------------------------------------------------------------
  // Context retrieval: search issues
  // -------------------------------------------------------------------------

  async searchIssues(
    workspaceId: string,
    connectionId: string,
    query: string,
    options?: { per_page?: number },
  ): Promise<{ issues: Array<{ number: number; title: string; state: string; html_url: string; body: string | null; user_login: string; labels: string[]; created_at: string; updated_at: string; is_pull_request: boolean; repo: string }> }> {
    const config = await this.getValidatedConfig(workspaceId, connectionId);

    const perPage = options?.per_page ?? 20;
    const searchQuery = encodeURIComponent(query);
    const response = await githubApiFetch(
      `/search/issues?q=${searchQuery}&per_page=${perPage}&sort=updated`,
      config.personalAccessToken,
    );

    if (!response.ok) {
      throw new GitHubSetupError(
        "api_error",
        `GitHub search API error: ${response.status} ${response.statusText}`,
        502,
      );
    }

    const data = (await response.json()) as {
      items: Array<{
        number: number;
        title: string;
        state: string;
        html_url: string;
        body: string | null;
        user: { login: string };
        labels: Array<{ name: string }>;
        created_at: string;
        updated_at: string;
        pull_request?: unknown;
        repository_url: string;
      }>;
    };

    return {
      issues: data.items.map((item) => ({
        number: item.number,
        title: item.title,
        state: item.state,
        html_url: item.html_url,
        body: item.body,
        user_login: item.user.login,
        labels: item.labels.map((l) => l.name),
        created_at: item.created_at,
        updated_at: item.updated_at,
        is_pull_request: Boolean(item.pull_request),
        repo: item.repository_url.replace("https://api.github.com/repos/", ""),
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Context retrieval: get issue/PR details
  // -------------------------------------------------------------------------

  async getIssueDetail(
    workspaceId: string,
    connectionId: string,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<{ number: number; title: string; state: string; html_url: string; body: string | null; user_login: string; labels: string[]; created_at: string; updated_at: string; is_pull_request: boolean; comments_url: string }> {
    const config = await this.getValidatedConfig(workspaceId, connectionId);

    const response = await githubApiFetch(
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
      config.personalAccessToken,
    );

    if (!response.ok) {
      throw new GitHubSetupError(
        "api_error",
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status === 404 ? 404 : 502,
      );
    }

    const item = (await response.json()) as {
      number: number;
      title: string;
      state: string;
      html_url: string;
      body: string | null;
      user: { login: string };
      labels: Array<{ name: string }>;
      created_at: string;
      updated_at: string;
      pull_request?: unknown;
      comments_url: string;
    };

    return {
      number: item.number,
      title: item.title,
      state: item.state,
      html_url: item.html_url,
      body: item.body,
      user_login: item.user.login,
      labels: item.labels.map((l) => l.name),
      created_at: item.created_at,
      updated_at: item.updated_at,
      is_pull_request: Boolean(item.pull_request),
      comments_url: item.comments_url,
    };
  }

  // -------------------------------------------------------------------------
  // Context retrieval: get file content
  // -------------------------------------------------------------------------

  async getFileContent(
    workspaceId: string,
    connectionId: string,
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<{ path: string; content: string; encoding: string; size: number; html_url: string }> {
    const config = await this.getValidatedConfig(workspaceId, connectionId);

    let apiPath = `/repos/${owner}/${repo}/contents/${path}`;
    if (ref) apiPath += `?ref=${encodeURIComponent(ref)}`;

    const response = await githubApiFetch(apiPath, config.personalAccessToken);

    if (!response.ok) {
      throw new GitHubSetupError(
        "api_error",
        `GitHub API error: ${response.status} ${response.statusText}`,
        response.status === 404 ? 404 : 502,
      );
    }

    const data = (await response.json()) as {
      path: string;
      content: string;
      encoding: string;
      size: number;
      html_url: string;
    };

    // Decode base64 content from GitHub
    let decodedContent = data.content;
    if (data.encoding === "base64") {
      decodedContent = Buffer.from(
        data.content.replace(/\n/g, ""),
        "base64",
      ).toString("utf-8");
    }

    return {
      path: data.path,
      content: decodedContent,
      encoding: "utf-8",
      size: data.size,
      html_url: data.html_url,
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async probeToken(token: string): Promise<GitHubProbeResult> {
    const checkedAt = this.now().toISOString();
    const issues: GitHubDiagnosticIssue[] = [];

    try {
      const response = await githubApiFetch("/user", token);

      if (!response.ok) {
        if (response.status === 401) {
          issues.push({
            severity: "error",
            code: "token_invalid",
            summary: "GitHub rejected the personal access token. It may be expired or revoked.",
          });
        } else if (response.status === 403) {
          issues.push({
            severity: "error",
            code: "token_forbidden",
            summary: "GitHub returned 403 Forbidden. The token may lack required scopes.",
          });
        } else {
          issues.push({
            severity: "error",
            code: "api_error",
            summary: `GitHub API returned ${response.status} ${response.statusText}.`,
          });
        }

        return { ok: false, checkedAt, summary: issues[0]!.summary, issues };
      }

      // Parse scopes from response headers
      const scopeHeader = response.headers.get("x-oauth-scopes") ?? "";
      const scopes = scopeHeader
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const userData = (await response.json()) as {
        login: string;
        name: string | null;
      };

      return {
        ok: true,
        checkedAt,
        summary: `Authenticated as ${userData.login}.`,
        issues: [],
        user: {
          login: userData.login,
          name: userData.name,
        },
        scopes,
      };
    } catch (error) {
      issues.push({
        severity: "error",
        code: "network_error",
        summary: `Failed to reach GitHub API: ${error instanceof Error ? error.message : "unknown error"}.`,
      });

      return {
        ok: false,
        checkedAt,
        summary: issues[0]!.summary,
        issues,
      };
    }
  }

  private buildStatusResponse(
    connectionId: string,
    connectionStatus: string,
    config: GitHubConnectionConfig,
  ): GitHubStatusResponse {
    const validation = this.validate(config);
    const operational = this.deriveOperationalStatus(config, validation);
    const recoveryHints = this.getRecoveryHints(operational, validation);

    const probe: GitHubProbeResult | null = config.lastProbeAt
      ? {
          ok: !config.lastProbeError,
          checkedAt: config.lastProbeAt,
          summary: config.lastProbeError
            ? config.lastProbeError
            : `Authenticated as ${config.validatedLogin ?? "unknown"}.`,
          issues: config.lastProbeError
            ? [
                {
                  severity: "error" as const,
                  code: "last_probe_failed",
                  summary: config.lastProbeError,
                },
              ]
            : [],
          ...(config.validatedLogin
            ? {
                user: { login: config.validatedLogin, name: config.validatedName },
              }
            : {}),
          scopes: config.tokenScopes,
        }
      : null;

    return {
      connection_id: connectionId,
      connection_status: connectionStatus,
      operational,
      probe,
      recovery_hints: recoveryHints,
    };
  }

  private deriveOperationalStatus(
    config: GitHubConnectionConfig,
    validation: GitHubValidationResult,
  ): GitHubOperationalStatus {
    if (!validation.ok) {
      return {
        state: "setup_required",
        summary: "GitHub connection requires setup.",
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: validation.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.code),
      };
    }

    if (!config.lastProbeAt) {
      return {
        state: "configured",
        summary: "Token is configured but not yet verified.",
        lastProbeAt: null,
        blockingIssueCodes: [],
      };
    }

    if (config.lastProbeError) {
      return {
        state: "error",
        summary: config.lastProbeError,
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: ["last_probe_failed"],
      };
    }

    return {
      state: "ready",
      summary: `Connected as ${config.validatedLogin ?? "unknown"}.`,
      lastProbeAt: config.lastProbeAt,
      blockingIssueCodes: [],
    };
  }

  private getRecoveryHints(
    operational: GitHubOperationalStatus,
    validation: GitHubValidationResult,
  ): GitHubRecoveryHint[] {
    const hints: GitHubRecoveryHint[] = [];

    if (operational.blockingIssueCodes.includes("missing_pat")) {
      hints.push({
        code: "create_pat",
        label: "Create a GitHub Personal Access Token",
        description:
          "Go to GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens. Create a token with read-only repository access.",
        docsHref:
          "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
        target: { surface: "connections", focus: "github-section" },
      });
    }

    if (
      operational.blockingIssueCodes.includes("token_invalid") ||
      operational.blockingIssueCodes.includes("last_probe_failed")
    ) {
      hints.push({
        code: "regenerate_pat",
        label: "Regenerate or replace the personal access token",
        description:
          "The current token is invalid or expired. Create a new fine-grained personal access token with Contents (read), Issues (read), Pull requests (read), and Metadata (read) permissions.",
        docsHref:
          "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
        target: { surface: "connections", focus: "github-section" },
      });
    }

    if (operational.blockingIssueCodes.includes("token_forbidden")) {
      hints.push({
        code: "check_scopes",
        label: "Check token permissions",
        description:
          "The token does not have sufficient scopes. For fine-grained tokens, enable: Contents (read), Issues (read), Pull requests (read), Metadata (read). For classic tokens, enable the repo (read) scope.",
        docsHref:
          "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
        target: { surface: "connections", focus: "github-section" },
      });
    }

    return hints;
  }

  private async getValidatedConfig(
    workspaceId: string,
    connectionId: string,
  ): Promise<GitHubConnectionConfig> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "github") {
      throw new GitHubSetupError(
        "invalid_connection",
        "This operation is only supported for GitHub connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    const validation = this.validate(config);

    if (!validation.ok) {
      throw new GitHubSetupError(
        "not_configured",
        "GitHub connection is not configured. Complete setup first.",
        400,
      );
    }

    return config;
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GitHubSetupError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Config normalizer
// ---------------------------------------------------------------------------

function normalizeConfig(rawConfig: unknown): GitHubConnectionConfig {
  const config = (rawConfig && typeof rawConfig === "object"
    ? rawConfig
    : {}) as Partial<GitHubConnectionConfig>;

  return {
    personalAccessToken:
      typeof config.personalAccessToken === "string"
        ? config.personalAccessToken
        : "",
    validatedLogin:
      typeof config.validatedLogin === "string"
        ? config.validatedLogin
        : null,
    validatedName:
      typeof config.validatedName === "string" ? config.validatedName : null,
    tokenScopes: Array.isArray(config.tokenScopes)
      ? config.tokenScopes.filter(
          (s): s is string => typeof s === "string",
        )
      : [],
    org: typeof config.org === "string" ? config.org : null,
    repos: Array.isArray(config.repos)
      ? config.repos.filter((r): r is string => typeof r === "string")
      : [],
    lastProbeAt:
      typeof config.lastProbeAt === "string" ? config.lastProbeAt : null,
    lastProbeError:
      typeof config.lastProbeError === "string"
        ? config.lastProbeError
        : null,
  };
}

export { normalizeConfig as normalizeGitHubConfig };
