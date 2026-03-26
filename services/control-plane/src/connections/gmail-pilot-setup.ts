import crypto from "node:crypto";

import type {
  GmailPilotAuthMethod,
  GmailPilotScopeKind,
  GmailPilotSetupSummary,
  GmailPilotWatchStatus,
} from "@clawback/contracts";

import type { ConnectionService } from "./service.js";

export type GmailPilotConfig = {
  authMethod?: GmailPilotAuthMethod;
  scopeKind: GmailPilotScopeKind | null;
  mailboxAddresses: string[];
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  // Service account fields
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  targetMailbox: string;
  // OAuth app credentials (for "Connect with Google" flow)
  oauthAppClientId: string;
  oauthAppClientSecret: string;
  // Common fields
  validatedEmail: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  watchStatus: GmailPilotWatchStatus | null;
  watchLastCheckedAt: string | null;
  watchLastSuccessAt: string | null;
  watchLastMessageAt: string | null;
  watchLastError: string | null;
  watchCheckpointHistoryId: string | null;
};

type GmailCredentialValidationResult = {
  emailAddress: string;
};

export interface GmailCredentialsValidator {
  validateReadOnly(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<GmailCredentialValidationResult>;
}

export interface GmailServiceAccountValidator {
  validateServiceAccount(input: {
    serviceAccountEmail: string;
    privateKey: string;
    targetMailbox: string;
  }): Promise<GmailCredentialValidationResult>;
}

type GmailPilotSetupServiceOptions = {
  connectionService: ConnectionService;
  validator: GmailCredentialsValidator;
  serviceAccountValidator?: GmailServiceAccountValidator;
  now?: () => Date;
};

export class GmailPilotSetupService {
  private readonly now: () => Date;

  constructor(private readonly options: GmailPilotSetupServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async getOAuthAppCredentials(workspaceId: string, connectionId: string): Promise<{
    configured: boolean;
    client_id: string | null;
  }> {
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
    if (connection.provider !== "gmail" || connection.accessMode !== "read_only") {
      throw new GmailPilotSetupError("invalid_connection", "Gmail pilot setup is only supported for Gmail read-only connections.", 400);
    }

    const existingConfig = normalizeConfig(connection.configJson);
    const updatedConfig: GmailPilotConfig = {
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

  async getStoredOAuthAppSecrets(workspaceId: string, connectionId: string): Promise<{
    clientId: string;
    clientSecret: string;
  } | null> {
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

  async completeOAuthFlow(
    workspaceId: string,
    connectionId: string,
    input: {
      clientId: string;
      clientSecret: string;
      authCode: string;
      redirectUri: string;
    },
  ): Promise<GmailPilotSetupSummary> {
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

    const tokenJson = await tokenResponse.json().catch(() => ({})) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new GmailPilotSetupError(
        "oauth_token_exchange_failed",
        tokenJson.error_description ?? tokenJson.error ?? "Failed to exchange authorization code for tokens.",
        502,
      );
    }

    if (!tokenJson.refresh_token) {
      throw new GmailPilotSetupError(
        "oauth_no_refresh_token",
        "Google did not return a refresh token. Try revoking access at https://myaccount.google.com/permissions and connecting again.",
        400,
      );
    }

    // Now use the setup flow with these credentials
    return this.setup(workspaceId, connectionId, {
      scopeKind: "shared_mailbox",
      mailboxAddresses: [],
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      refreshToken: tokenJson.refresh_token,
    });
  }

  async getSummary(workspaceId: string, connectionId: string): Promise<GmailPilotSetupSummary> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    return summarizeConfig(connection.id, connection.status, connection.provider, connection.accessMode, connection.configJson);
  }

  async setup(
    workspaceId: string,
    connectionId: string,
    input: {
      scopeKind: GmailPilotScopeKind;
      mailboxAddresses: string[];
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    },
  ): Promise<GmailPilotSetupSummary> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    if (connection.provider !== "gmail" || connection.accessMode !== "read_only") {
      throw new GmailPilotSetupError("invalid_connection", "Gmail pilot setup is only supported for Gmail read-only connections.", 400);
    }

    const normalizedMailboxAddresses = input.mailboxAddresses
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    try {
      const validation = await this.options.validator.validateReadOnly({
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        refreshToken: input.refreshToken,
      });

      const validatedEmail = validation.emailAddress.trim().toLowerCase();
      if (
        normalizedMailboxAddresses.length > 0
        && input.scopeKind !== "broad_read_only"
        && !normalizedMailboxAddresses.includes(validatedEmail)
      ) {
        throw new GmailPilotSetupError(
          "mailbox_mismatch",
          `Validated Gmail account ${validatedEmail} is not included in the configured mailbox list.`,
          400,
        );
      }

      // Preserve existing OAuth app credentials if present
      const existingConfig = normalizeConfig(connection.configJson);

      const config: GmailPilotConfig = {
        authMethod: "oauth",
        scopeKind: input.scopeKind,
        mailboxAddresses: normalizedMailboxAddresses.length > 0
          ? normalizedMailboxAddresses
          : [validatedEmail],
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        refreshToken: input.refreshToken,
        serviceAccountEmail: "",
        serviceAccountPrivateKey: "",
        targetMailbox: "",
        oauthAppClientId: existingConfig.oauthAppClientId,
        oauthAppClientSecret: existingConfig.oauthAppClientSecret,
        validatedEmail,
        lastValidatedAt: this.now().toISOString(),
        lastError: null,
        watchStatus: "idle",
        watchLastCheckedAt: null,
        watchLastSuccessAt: null,
        watchLastMessageAt: null,
        watchLastError: null,
        watchCheckpointHistoryId: null,
      };

      const updated = await this.options.connectionService.update(workspaceId, connectionId, {
        status: "connected",
        label: `Gmail — ${validatedEmail}`,
        configJson: config,
      });

      return summarizeConfig(updated.id, updated.status, updated.provider, updated.access_mode, config);
    } catch (error) {
      const message = error instanceof GmailPilotSetupError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to validate Gmail credentials.";

      const existingSummary = summarizeConfig(
        connection.id,
        "error",
        connection.provider,
        connection.accessMode,
        connection.configJson,
      );

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "error",
        configJson: {
          authMethod: "oauth",
          scopeKind: input.scopeKind,
          mailboxAddresses: normalizedMailboxAddresses,
          clientId: input.clientId,
          clientSecret: input.clientSecret,
          refreshToken: input.refreshToken,
          serviceAccountEmail: "",
          serviceAccountPrivateKey: "",
          targetMailbox: "",
          oauthAppClientId: normalizeConfig(connection.configJson).oauthAppClientId,
          oauthAppClientSecret: normalizeConfig(connection.configJson).oauthAppClientSecret,
          validatedEmail: existingSummary.validated_email,
          lastValidatedAt: existingSummary.last_validated_at,
          lastError: message,
          watchStatus: existingSummary.watch_status,
          watchLastCheckedAt: existingSummary.watch_last_checked_at,
          watchLastSuccessAt: existingSummary.watch_last_success_at,
          watchLastMessageAt: existingSummary.watch_last_message_at,
          watchLastError: existingSummary.watch_last_error,
          watchCheckpointHistoryId: existingSummary.watch_checkpoint_present ? normalizeConfig(connection.configJson).watchCheckpointHistoryId : null,
        },
      });

      if (error instanceof GmailPilotSetupError) {
        throw error;
      }

      throw new GmailPilotSetupError("validation_failed", message, 502);
    }
  }

  async setupServiceAccount(
    workspaceId: string,
    connectionId: string,
    input: {
      serviceAccountJson: string;
      targetMailbox: string;
    },
  ): Promise<GmailPilotSetupSummary> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    if (connection.provider !== "gmail" || connection.accessMode !== "read_only") {
      throw new GmailPilotSetupError("invalid_connection", "Gmail pilot setup is only supported for Gmail read-only connections.", 400);
    }

    const validator = this.options.serviceAccountValidator;
    if (!validator) {
      throw new GmailPilotSetupError("feature_not_configured", "Service account validation is not configured.", 501);
    }

    // Parse the service account JSON key
    let serviceAccountKey: {
      client_email?: string;
      private_key?: string;
      type?: string;
    };
    try {
      serviceAccountKey = JSON.parse(input.serviceAccountJson);
    } catch {
      throw new GmailPilotSetupError(
        "invalid_service_account_json",
        "The service account JSON key is not valid JSON. Paste the entire contents of the downloaded key file.",
        400,
      );
    }

    if (serviceAccountKey.type !== "service_account") {
      throw new GmailPilotSetupError(
        "invalid_service_account_json",
        "The JSON key must be a service account key (type: \"service_account\"). Download the key from Google Cloud Console > IAM & Admin > Service Accounts.",
        400,
      );
    }

    if (!serviceAccountKey.client_email || !serviceAccountKey.private_key) {
      throw new GmailPilotSetupError(
        "invalid_service_account_json",
        "The service account key is missing required fields (client_email or private_key).",
        400,
      );
    }

    const targetMailbox = input.targetMailbox.trim().toLowerCase();
    if (!targetMailbox || !targetMailbox.includes("@")) {
      throw new GmailPilotSetupError(
        "invalid_target_mailbox",
        "A valid target mailbox email address is required.",
        400,
      );
    }

    try {
      const validation = await validator.validateServiceAccount({
        serviceAccountEmail: serviceAccountKey.client_email,
        privateKey: serviceAccountKey.private_key,
        targetMailbox,
      });

      const validatedEmail = validation.emailAddress.trim().toLowerCase();

      const config: GmailPilotConfig = {
        authMethod: "service_account",
        scopeKind: "shared_mailbox",
        mailboxAddresses: [validatedEmail],
        clientId: "",
        clientSecret: "",
        refreshToken: "",
        serviceAccountEmail: serviceAccountKey.client_email,
        serviceAccountPrivateKey: serviceAccountKey.private_key,
        targetMailbox,
        oauthAppClientId: "",
        oauthAppClientSecret: "",
        validatedEmail,
        lastValidatedAt: this.now().toISOString(),
        lastError: null,
        watchStatus: "idle",
        watchLastCheckedAt: null,
        watchLastSuccessAt: null,
        watchLastMessageAt: null,
        watchLastError: null,
        watchCheckpointHistoryId: null,
      };

      const updated = await this.options.connectionService.update(workspaceId, connectionId, {
        status: "connected",
        label: `Gmail — ${validatedEmail}`,
        configJson: config,
      });

      return summarizeConfig(updated.id, updated.status, updated.provider, updated.access_mode, config);
    } catch (error) {
      if (error instanceof GmailPilotSetupError) {
        // Store error state
        const existingSummary = summarizeConfig(
          connection.id,
          "error",
          connection.provider,
          connection.accessMode,
          connection.configJson,
        );

        await this.options.connectionService.update(workspaceId, connectionId, {
          status: "error",
          configJson: {
            authMethod: "service_account",
            scopeKind: "shared_mailbox",
            mailboxAddresses: [],
            clientId: "",
            clientSecret: "",
            refreshToken: "",
            serviceAccountEmail: serviceAccountKey.client_email,
            serviceAccountPrivateKey: "",
            targetMailbox,
            validatedEmail: existingSummary.validated_email,
            lastValidatedAt: existingSummary.last_validated_at,
            lastError: error.message,
            watchStatus: existingSummary.watch_status,
            watchLastCheckedAt: existingSummary.watch_last_checked_at,
            watchLastSuccessAt: existingSummary.watch_last_success_at,
            watchLastMessageAt: existingSummary.watch_last_message_at,
            watchLastError: existingSummary.watch_last_error,
            watchCheckpointHistoryId: existingSummary.watch_checkpoint_present ? normalizeConfig(connection.configJson).watchCheckpointHistoryId : null,
          },
        });

        throw error;
      }

      const message = error instanceof Error ? error.message : "Failed to validate service account credentials.";

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "error",
        configJson: {
          authMethod: "service_account",
          scopeKind: "shared_mailbox",
          mailboxAddresses: [],
          clientId: "",
          clientSecret: "",
          refreshToken: "",
          serviceAccountEmail: serviceAccountKey.client_email,
          serviceAccountPrivateKey: "",
          targetMailbox,
          validatedEmail: null,
          lastValidatedAt: null,
          lastError: message,
          watchStatus: normalizeConfig(connection.configJson).watchStatus,
          watchLastCheckedAt: normalizeConfig(connection.configJson).watchLastCheckedAt,
          watchLastSuccessAt: normalizeConfig(connection.configJson).watchLastSuccessAt,
          watchLastMessageAt: normalizeConfig(connection.configJson).watchLastMessageAt,
          watchLastError: normalizeConfig(connection.configJson).watchLastError,
          watchCheckpointHistoryId: normalizeConfig(connection.configJson).watchCheckpointHistoryId,
        },
      });

      throw new GmailPilotSetupError("validation_failed", message, 502);
    }
  }
}

export class GoogleGmailCredentialsValidator implements GmailCredentialsValidator {
  async validateReadOnly(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }): Promise<GmailCredentialValidationResult> {
    const accessToken = await getOAuthAccessToken(input);
    const profile = await fetchGmailProfile(accessToken);

    return {
      emailAddress: profile.emailAddress,
    };
  }
}

/**
 * Validates Gmail access using a Google Cloud service account with
 * domain-wide delegation. Creates a JWT signed with RS256, exchanges it
 * for an access token impersonating the target mailbox, and verifies
 * Gmail API access.
 */
export class GoogleServiceAccountValidator implements GmailServiceAccountValidator {
  async validateServiceAccount(input: {
    serviceAccountEmail: string;
    privateKey: string;
    targetMailbox: string;
  }): Promise<GmailCredentialValidationResult> {
    const accessToken = await getServiceAccountAccessToken(input);
    const profile = await fetchGmailProfile(accessToken);

    return {
      emailAddress: profile.emailAddress,
    };
  }
}

export class GmailPilotSetupError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export function summarizeGmailPilotConfig(
  connectionId: string,
  status: "not_connected" | "suggested" | "connected" | "error",
  provider: string,
  accessMode: string,
  rawConfig: unknown,
): GmailPilotSetupSummary {
  if (provider !== "gmail" || accessMode !== "read_only") {
    throw new GmailPilotSetupError("invalid_connection", "Gmail pilot setup is only available for Gmail read-only connections.", 400);
  }

  const config = normalizeConfig(rawConfig);
  const oauthConfigured = Boolean(config.clientId && config.clientSecret && config.refreshToken);
  const serviceAccountConfigured = Boolean(config.serviceAccountEmail && config.serviceAccountPrivateKey && config.targetMailbox);
  const oauthAppConfigured = Boolean(config.oauthAppClientId && config.oauthAppClientSecret);

  return {
    connection_id: connectionId,
    status,
    configured: oauthConfigured || serviceAccountConfigured,
    auth_method: config.authMethod ?? null,
    scope_kind: config.scopeKind,
    mailbox_addresses: config.mailboxAddresses,
    validated_email: config.validatedEmail,
    last_validated_at: config.lastValidatedAt,
    last_error: config.lastError,
    client_id_present: Boolean(config.clientId),
    client_secret_present: Boolean(config.clientSecret),
    refresh_token_present: Boolean(config.refreshToken),
    service_account_present: serviceAccountConfigured,
    oauth_app_configured: oauthAppConfigured,
    watch_status: config.watchStatus ?? (status === "connected" ? "idle" : null),
    watch_last_checked_at: config.watchLastCheckedAt,
    watch_last_success_at: config.watchLastSuccessAt,
    watch_last_message_at: config.watchLastMessageAt,
    watch_last_error: config.watchLastError,
    watch_checkpoint_present: Boolean(config.watchCheckpointHistoryId),
  };
}

export function normalizeGmailPilotConfig(rawConfig: unknown): GmailPilotConfig {
  const config = (rawConfig && typeof rawConfig === "object" ? rawConfig : {}) as Partial<GmailPilotConfig>;
  const authMethod = config.authMethod === "oauth" || config.authMethod === "service_account" ? config.authMethod : undefined;
  const watchStatus = config.watchStatus === "idle"
    || config.watchStatus === "bootstrapping"
    || config.watchStatus === "polling"
    || config.watchStatus === "error"
    ? config.watchStatus
    : null;

  return {
    ...(authMethod !== undefined ? { authMethod } : {}),
    scopeKind: config.scopeKind ?? null,
    mailboxAddresses: Array.isArray(config.mailboxAddresses)
      ? config.mailboxAddresses.filter((value): value is string => typeof value === "string")
      : [],
    clientId: typeof config.clientId === "string" ? config.clientId : "",
    clientSecret: typeof config.clientSecret === "string" ? config.clientSecret : "",
    refreshToken: typeof config.refreshToken === "string" ? config.refreshToken : "",
    serviceAccountEmail: typeof config.serviceAccountEmail === "string" ? config.serviceAccountEmail : "",
    serviceAccountPrivateKey: typeof config.serviceAccountPrivateKey === "string" ? config.serviceAccountPrivateKey : "",
    targetMailbox: typeof config.targetMailbox === "string" ? config.targetMailbox : "",
    oauthAppClientId: typeof config.oauthAppClientId === "string" ? config.oauthAppClientId : "",
    oauthAppClientSecret: typeof config.oauthAppClientSecret === "string" ? config.oauthAppClientSecret : "",
    validatedEmail: typeof config.validatedEmail === "string" ? config.validatedEmail : null,
    lastValidatedAt: typeof config.lastValidatedAt === "string" ? config.lastValidatedAt : null,
    lastError: typeof config.lastError === "string" ? config.lastError : null,
    watchStatus,
    watchLastCheckedAt: typeof config.watchLastCheckedAt === "string" ? config.watchLastCheckedAt : null,
    watchLastSuccessAt: typeof config.watchLastSuccessAt === "string" ? config.watchLastSuccessAt : null,
    watchLastMessageAt: typeof config.watchLastMessageAt === "string" ? config.watchLastMessageAt : null,
    watchLastError: typeof config.watchLastError === "string" ? config.watchLastError : null,
    watchCheckpointHistoryId: typeof config.watchCheckpointHistoryId === "string" ? config.watchCheckpointHistoryId : null,
  };
}

async function getOAuthAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}, fetchImpl: typeof fetch = fetch): Promise<string> {
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const tokenJson = await tokenResponse.json().catch(() => ({})) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResponse.ok || !tokenJson.access_token) {
    throw new GmailPilotSetupError(
      "token_exchange_failed",
      tokenJson.error_description ?? tokenJson.error ?? "Google token exchange failed.",
      502,
    );
  }

  return tokenJson.access_token;
}

async function getServiceAccountAccessToken(input: {
  serviceAccountEmail: string;
  privateKey: string;
  targetMailbox: string;
}, fetchImpl: typeof fetch = fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: input.serviceAccountEmail,
    sub: input.targetMailbox,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  let signature: string;
  try {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signingInput);
    const signatureBuffer = sign.sign(input.privateKey);
    signature = base64UrlEncodeBuffer(signatureBuffer);
  } catch (err) {
    throw new GmailPilotSetupError(
      "service_account_signing_failed",
      `Failed to sign JWT with the service account private key: ${err instanceof Error ? err.message : "unknown error"}`,
      400,
    );
  }

  const jwt = `${signingInput}.${signature}`;

  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenJson = await tokenResponse.json().catch(() => ({})) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResponse.ok || !tokenJson.access_token) {
    const errorDetail = tokenJson.error_description ?? tokenJson.error ?? "Google token exchange failed.";
    throw new GmailPilotSetupError(
      "service_account_token_exchange_failed",
      `Service account token exchange failed: ${errorDetail}. Ensure domain-wide delegation is enabled in Google Workspace Admin Console and the scope https://www.googleapis.com/auth/gmail.readonly is authorized.`,
      502,
    );
  }

  return tokenJson.access_token;
}

export async function getGmailReadOnlyAccessToken(
  config: GmailPilotConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (config.authMethod === "service_account") {
    if (!config.serviceAccountEmail || !config.serviceAccountPrivateKey || !config.targetMailbox) {
      throw new GmailPilotSetupError(
        "service_account_not_configured",
        "Service account credentials are incomplete for this Gmail connection.",
        400,
      );
    }

    return await getServiceAccountAccessToken({
      serviceAccountEmail: config.serviceAccountEmail,
      privateKey: config.serviceAccountPrivateKey,
      targetMailbox: config.targetMailbox,
    }, fetchImpl);
  }

  if (!config.clientId || !config.clientSecret || !config.refreshToken) {
    throw new GmailPilotSetupError(
      "oauth_not_configured",
      "OAuth credentials are incomplete for this Gmail connection.",
      400,
    );
  }

  return await getOAuthAccessToken({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    refreshToken: config.refreshToken,
  }, fetchImpl);
}

export async function fetchGmailProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  emailAddress: string;
  historyId: string | null;
}> {
  const profileResponse = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  const profileJson = await profileResponse.json().catch(() => ({})) as {
    emailAddress?: string;
    historyId?: string;
    error?: { message?: string };
  };

  if (!profileResponse.ok || !profileJson.emailAddress) {
    throw new GmailPilotSetupError(
      "gmail_profile_failed",
      profileJson.error?.message ?? "Google accepted the token, but Gmail profile validation failed.",
      502,
    );
  }

  return {
    emailAddress: profileJson.emailAddress,
    historyId: typeof profileJson.historyId === "string" ? profileJson.historyId : null,
  };
}

function summarizeConfig(
  connectionId: string,
  status: "not_connected" | "suggested" | "connected" | "error",
  provider: string,
  accessMode: string,
  rawConfig: unknown,
): GmailPilotSetupSummary {
  return summarizeGmailPilotConfig(connectionId, status, provider, accessMode, rawConfig);
}

function normalizeConfig(rawConfig: unknown): GmailPilotConfig {
  return normalizeGmailPilotConfig(rawConfig);
}

// ---------------------------------------------------------------------------
// Base64url helpers (no external dependency needed)
// ---------------------------------------------------------------------------

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeBuffer(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
