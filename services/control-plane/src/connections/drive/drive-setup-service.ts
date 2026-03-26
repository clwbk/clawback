/**
 * Google Drive read-only connection setup service.
 *
 * Implements the frozen provider lifecycle contract:
 * - setupHelp: static manifest metadata (handled by manifest)
 * - validate: check that credentials are present and structurally correct
 * - probe: live reachability check against the Drive API
 * - status: synthesize operational state from validate + probe
 * - recoveryHints: actionable guidance when something is wrong
 */

import type { ConnectionService } from "../service.js";
import type { DriveCredentialsValidator } from "./drive-credentials-validator.js";
import { DriveSetupError } from "./drive-credentials-validator.js";
import type {
  DriveConfig,
  DriveSetupSummary,
  PluginOperationalStatus,
  PluginProbeResult,
  PluginRecoveryHint,
  PluginValidationResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

type DriveSetupServiceOptions = {
  connectionService: ConnectionService;
  validator: DriveCredentialsValidator;
  now?: () => Date;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DriveSetupService {
  private readonly now: () => Date;

  constructor(private readonly options: DriveSetupServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  // -----------------------------------------------------------------------
  // OAuth app credentials management
  // -----------------------------------------------------------------------

  async getOAuthAppCredentials(
    workspaceId: string,
    connectionId: string,
  ): Promise<{ configured: boolean; client_id: string | null }> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    const config = normalizeConfig(connection.configJson);
    return {
      configured: Boolean(config.oauthAppClientId && config.oauthAppClientSecret),
      client_id: config.oauthAppClientId || null,
    };
  }

  async saveOAuthAppCredentials(
    workspaceId: string,
    connectionId: string,
    input: { clientId: string; clientSecret: string },
  ): Promise<{ configured: boolean; client_id: string | null }> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    if (connection.provider !== "drive" || connection.accessMode !== "read_only") {
      throw new DriveSetupError("invalid_connection", "Drive setup is only supported for Drive read-only connections.", 400);
    }

    const existingConfig = normalizeConfig(connection.configJson);
    const updatedConfig: DriveConfig = {
      ...existingConfig,
      oauthAppClientId: input.clientId,
      oauthAppClientSecret: input.clientSecret,
    };

    await this.options.connectionService.update(workspaceId, connectionId, {
      configJson: updatedConfig,
    });

    return {
      configured: true,
      client_id: input.clientId,
    };
  }

  async getStoredOAuthAppSecrets(
    workspaceId: string,
    connectionId: string,
  ): Promise<{ clientId: string; clientSecret: string } | null> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    const config = normalizeConfig(connection.configJson);
    if (!config.oauthAppClientId || !config.oauthAppClientSecret) {
      return null;
    }
    return {
      clientId: config.oauthAppClientId,
      clientSecret: config.oauthAppClientSecret,
    };
  }

  // -----------------------------------------------------------------------
  // OAuth callback flow
  // -----------------------------------------------------------------------

  async completeOAuthFlow(
    workspaceId: string,
    connectionId: string,
    input: {
      clientId: string;
      clientSecret: string;
      authCode: string;
      redirectUri: string;
    },
  ): Promise<DriveSetupSummary> {
    // Exchange auth code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.authCode,
        grant_type: "authorization_code",
        redirect_uri: input.redirectUri,
      }),
    });

    const tokenJson = (await tokenResponse.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new DriveSetupError(
        "oauth_token_exchange_failed",
        tokenJson.error_description ?? tokenJson.error ?? "Failed to exchange authorization code for tokens.",
        502,
      );
    }

    if (!tokenJson.refresh_token) {
      throw new DriveSetupError(
        "oauth_no_refresh_token",
        "Google did not return a refresh token. Try revoking access at https://myaccount.google.com/permissions and connecting again.",
        400,
      );
    }

    return this.setup(workspaceId, connectionId, {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      refreshToken: tokenJson.refresh_token,
    });
  }

  // -----------------------------------------------------------------------
  // Setup (validate + store)
  // -----------------------------------------------------------------------

  async setup(
    workspaceId: string,
    connectionId: string,
    input: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    },
  ): Promise<DriveSetupSummary> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    if (connection.provider !== "drive" || connection.accessMode !== "read_only") {
      throw new DriveSetupError("invalid_connection", "Drive setup is only supported for Drive read-only connections.", 400);
    }

    try {
      const validation = await this.options.validator.validateReadOnly({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        refreshToken: input.refreshToken,
      });

      const validatedEmail = validation.emailAddress.trim().toLowerCase();
      const existingConfig = normalizeConfig(connection.configJson);

      const config: DriveConfig = {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        refreshToken: input.refreshToken,
        oauthAppClientId: existingConfig.oauthAppClientId,
        oauthAppClientSecret: existingConfig.oauthAppClientSecret,
        validatedEmail,
        lastValidatedAt: this.now().toISOString(),
        lastProbeAt: this.now().toISOString(),
        lastError: null,
      };

      const updated = await this.options.connectionService.update(workspaceId, connectionId, {
        status: "connected",
        configJson: config,
      });

      return this.buildSummary(updated.id, updated.status, updated.provider, updated.access_mode, config);
    } catch (error) {
      const message =
        error instanceof DriveSetupError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Failed to validate Drive credentials.";

      const existingConfig = normalizeConfig(connection.configJson);

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "error",
        configJson: {
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          refreshToken: input.refreshToken,
          oauthAppClientId: existingConfig.oauthAppClientId,
          oauthAppClientSecret: existingConfig.oauthAppClientSecret,
          validatedEmail: existingConfig.validatedEmail,
          lastValidatedAt: existingConfig.lastValidatedAt,
          lastProbeAt: existingConfig.lastProbeAt,
          lastError: message,
        },
      });

      if (error instanceof DriveSetupError) throw error;
      throw new DriveSetupError("validation_failed", message, 502);
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle: validate
  // -----------------------------------------------------------------------

  async validate(workspaceId: string, connectionId: string): Promise<PluginValidationResult> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    const config = normalizeConfig(connection.configJson);

    const issues: PluginValidationResult["issues"] = [];

    if (!config.clientId) {
      issues.push({ severity: "error", code: "missing_client_id", summary: "Google OAuth client ID is missing." });
    }
    if (!config.clientSecret) {
      issues.push({ severity: "error", code: "missing_client_secret", summary: "Google OAuth client secret is missing." });
    }
    if (!config.refreshToken) {
      issues.push({ severity: "error", code: "missing_refresh_token", summary: "Google OAuth refresh token is missing." });
    }

    return {
      ok: issues.length === 0,
      issues,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle: probe
  // -----------------------------------------------------------------------

  async probe(workspaceId: string, connectionId: string): Promise<PluginProbeResult> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    const config = normalizeConfig(connection.configJson);
    const checkedAt = this.now().toISOString();

    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      return {
        ok: false,
        checkedAt,
        summary: "Credentials are missing. Cannot probe Drive API.",
        issues: [{ severity: "error", code: "missing_credentials", summary: "One or more required credentials are not configured." }],
      };
    }

    try {
      await this.options.validator.validateReadOnly({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: config.refreshToken,
      });

      // Update last probe time
      await this.options.connectionService.update(workspaceId, connectionId, {
        configJson: {
          ...config,
          lastProbeAt: checkedAt,
          lastError: null,
        },
      });

      return {
        ok: true,
        checkedAt,
        summary: "Drive API is reachable and credentials are valid.",
        issues: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Drive probe failed.";

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "error",
        configJson: {
          ...config,
          lastProbeAt: checkedAt,
          lastError: message,
        },
      });

      return {
        ok: false,
        checkedAt,
        summary: message,
        issues: [{ severity: "error", code: "probe_failed", summary: message }],
      };
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle: status
  // -----------------------------------------------------------------------

  async status(workspaceId: string, connectionId: string): Promise<PluginOperationalStatus> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    const config = normalizeConfig(connection.configJson);

    const validation = await this.validate(workspaceId, connectionId);

    if (!validation.ok) {
      return {
        state: "setup_required",
        summary: "Drive credentials are not configured.",
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: validation.issues.map((i) => i.code),
      };
    }

    if (connection.status === "connected" && !config.lastError) {
      return {
        state: "ready",
        summary: `Connected as ${config.validatedEmail ?? "unknown"}.`,
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: [],
      };
    }

    if (connection.status === "error" || config.lastError) {
      return {
        state: "error",
        summary: config.lastError ?? "Drive connection is in an error state.",
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: ["connection_error"],
      };
    }

    return {
      state: "configured",
      summary: "Drive credentials are configured but not yet validated live.",
      lastProbeAt: config.lastProbeAt,
      blockingIssueCodes: [],
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle: recoveryHints
  // -----------------------------------------------------------------------

  recoveryHints(issueCodes: string[]): PluginRecoveryHint[] {
    const hints: PluginRecoveryHint[] = [];
    const codeSet = new Set(issueCodes);

    if (codeSet.has("missing_client_id") || codeSet.has("missing_client_secret")) {
      hints.push({
        code: "configure_oauth_app",
        label: "Configure Google OAuth credentials",
        description:
          "Create a Google Cloud project with the Drive API enabled and add OAuth 2.0 credentials. " +
          "You need the client ID and client secret.",
        docsHref: "https://console.cloud.google.com/apis/credentials",
        target: { surface: "connections", focus: "drive" },
      });
    }

    if (codeSet.has("missing_refresh_token")) {
      hints.push({
        code: "reconnect_drive",
        label: "Reconnect Google Drive",
        description:
          "Complete the OAuth flow to obtain a refresh token. " +
          "If you previously connected, try revoking access at https://myaccount.google.com/permissions first.",
        target: { surface: "connections", focus: "drive" },
      });
    }

    if (codeSet.has("token_exchange_failed") || codeSet.has("probe_failed")) {
      hints.push({
        code: "reauthorize_drive",
        label: "Re-authorize Drive access",
        description:
          "The current credentials may have expired or been revoked. " +
          "Disconnect and reconnect the Drive integration.",
        target: { surface: "connections", focus: "drive" },
      });
    }

    if (codeSet.has("connection_error")) {
      hints.push({
        code: "check_drive_permissions",
        label: "Check Drive permissions",
        description:
          "Verify the connected Google account has access to the expected shared drives and folders. " +
          "The Drive API scope must include https://www.googleapis.com/auth/drive.readonly.",
        target: { surface: "connections", focus: "drive" },
      });
    }

    return hints;
  }

  // -----------------------------------------------------------------------
  // Summary (for API responses)
  // -----------------------------------------------------------------------

  async getSummary(workspaceId: string, connectionId: string): Promise<DriveSetupSummary> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    return this.buildSummary(
      connection.id,
      connection.status,
      connection.provider,
      connection.accessMode,
      connection.configJson,
    );
  }

  private buildSummary(
    connectionId: string,
    status: "not_connected" | "suggested" | "connected" | "error",
    provider: string,
    accessMode: string,
    rawConfig: unknown,
  ): DriveSetupSummary {
    if (provider !== "drive" || accessMode !== "read_only") {
      throw new DriveSetupError("invalid_connection", "Drive setup is only available for Drive read-only connections.", 400);
    }

    const config = normalizeConfig(rawConfig);
    const credentialsConfigured = Boolean(config.clientId && config.clientSecret && config.refreshToken);
    const oauthAppConfigured = Boolean(config.oauthAppClientId && config.oauthAppClientSecret);

    const operationalStatus = this.deriveOperationalStatus(status, config, credentialsConfigured);

    return {
      connection_id: connectionId,
      status,
      configured: credentialsConfigured,
      validated_email: config.validatedEmail,
      last_validated_at: config.lastValidatedAt,
      last_probe_at: config.lastProbeAt,
      last_error: config.lastError,
      client_id_present: Boolean(config.clientId),
      client_secret_present: Boolean(config.clientSecret),
      refresh_token_present: Boolean(config.refreshToken),
      oauth_app_configured: oauthAppConfigured,
      operational_status: operationalStatus,
    };
  }

  private deriveOperationalStatus(
    connectionStatus: string,
    config: DriveConfig,
    credentialsConfigured: boolean,
  ): PluginOperationalStatus {
    if (!credentialsConfigured) {
      return {
        state: "setup_required",
        summary: "Drive credentials are not configured.",
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: ["missing_credentials"],
      };
    }

    if (connectionStatus === "connected" && !config.lastError) {
      return {
        state: "ready",
        summary: `Connected as ${config.validatedEmail ?? "unknown"}.`,
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: [],
      };
    }

    if (connectionStatus === "error" || config.lastError) {
      return {
        state: "error",
        summary: config.lastError ?? "Drive connection is in an error state.",
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: ["connection_error"],
      };
    }

    return {
      state: "configured",
      summary: "Credentials configured, not yet validated.",
      lastProbeAt: config.lastProbeAt,
      blockingIssueCodes: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Config normalization
// ---------------------------------------------------------------------------

function normalizeConfig(rawConfig: unknown): DriveConfig {
  const config = (rawConfig && typeof rawConfig === "object" ? rawConfig : {}) as Partial<DriveConfig>;
  return {
    clientId: typeof config.clientId === "string" ? config.clientId : "",
    clientSecret: typeof config.clientSecret === "string" ? config.clientSecret : "",
    refreshToken: typeof config.refreshToken === "string" ? config.refreshToken : "",
    oauthAppClientId: typeof config.oauthAppClientId === "string" ? config.oauthAppClientId : "",
    oauthAppClientSecret: typeof config.oauthAppClientSecret === "string" ? config.oauthAppClientSecret : "",
    validatedEmail: typeof config.validatedEmail === "string" ? config.validatedEmail : null,
    lastValidatedAt: typeof config.lastValidatedAt === "string" ? config.lastValidatedAt : null,
    lastProbeAt: typeof config.lastProbeAt === "string" ? config.lastProbeAt : null,
    lastError: typeof config.lastError === "string" ? config.lastError : null,
  };
}

export { normalizeConfig as normalizeDriveConfig };
