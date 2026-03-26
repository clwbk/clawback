/**
 * WhatsApp connection setup service implementing the frozen provider lifecycle contract.
 *
 * Lifecycle surface:
 *   1. setupHelp   — static, lives in the manifest
 *   2. validate    — cheap local config checks
 *   3. probe       — live reachability check against WhatsApp Cloud API
 *   4. status      — synthesize operator-facing state
 *   5. recoveryHints — actionable guidance when something is wrong
 *
 * WhatsApp is an APPROVAL SURFACE. It does not create connections in the
 * traditional provider sense — it sends approval prompts and receives
 * decisions via the frozen W1 resolve path.
 */

import type { ConnectionService } from "../../connections/index.js";
import type {
  WhatsAppConnectionConfig,
  WhatsAppTransportMode,
  WhatsAppValidationResult,
  WhatsAppProbeResult,
  WhatsAppOperationalStatus,
  WhatsAppRecoveryHint,
  WhatsAppStatusResponse,
  WhatsAppSetupInput,
  WhatsAppDiagnosticIssue,
  WhatsAppPairingStartResponse,
  WhatsAppPairingWaitResponse,
} from "./types.js";
import { WhatsAppTransportService } from "./whatsapp-transport-service.js";
import { OpenClawPairingAdapter } from "./openclaw-pairing-adapter.js";
import { normalizeWhatsAppConfig } from "./whatsapp-config.js";
import { WhatsAppSetupError } from "./whatsapp-errors.js";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type WhatsAppSetupServiceOptions = {
  connectionService: ConnectionService;
  pairingAdapter?: OpenClawPairingAdapter;
  appSecretConfigured?: boolean;
  now?: () => Date;
};

export class WhatsAppSetupService {
  private readonly now: () => Date;

  constructor(private readonly options: WhatsAppSetupServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Setup: validate credentials, probe, store config, return status
  // -------------------------------------------------------------------------

  async setup(
    workspaceId: string,
    connectionId: string,
    input: WhatsAppSetupInput,
  ): Promise<WhatsAppStatusResponse> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "whatsapp") {
      throw new WhatsAppSetupError(
        "invalid_connection",
        "WhatsApp setup is only supported for WhatsApp connections.",
        400,
      );
    }

    // Step 1: Probe the WhatsApp Cloud API
    const transport = new WhatsAppTransportService({
      phoneNumberId: input.phone_number_id,
      accessToken: input.access_token,
    });

    const testResult = await transport.testConnection();

    if (!testResult.ok) {
      const config: WhatsAppConnectionConfig = {
        transportMode: "meta_cloud_api",
        phoneNumberId: input.phone_number_id,
        accessToken: input.access_token,
        verifyToken: input.verify_token,
        validatedDisplayName: null,
        pairingStatus: null,
        pairedIdentityRef: null,
        lastProbeAt: this.now().toISOString(),
        lastProbeError: testResult.error ?? "WhatsApp API connection failed.",
      };

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "error",
        configJson: config as unknown as Record<string, unknown>,
      });

      return this.buildStatusResponse(connectionId, "error", config);
    }

    // Step 2: Store validated config
    const config: WhatsAppConnectionConfig = {
      transportMode: "meta_cloud_api",
      phoneNumberId: input.phone_number_id,
      accessToken: input.access_token,
      verifyToken: input.verify_token,
      validatedDisplayName: testResult.displayName ?? null,
      pairingStatus: null,
      pairedIdentityRef: null,
      lastProbeAt: this.now().toISOString(),
      lastProbeError: null,
    };

    await this.options.connectionService.update(workspaceId, connectionId, {
      status: "connected",
      capabilities: ["send_approval_prompts", "receive_approval_decisions"],
      configJson: config as unknown as Record<string, unknown>,
    });

    return this.buildStatusResponse(connectionId, "connected", config);
  }

  // -------------------------------------------------------------------------
  // Transport mode selection
  // -------------------------------------------------------------------------

  async setTransportMode(
    workspaceId: string,
    connectionId: string,
    mode: WhatsAppTransportMode,
  ): Promise<WhatsAppStatusResponse> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "whatsapp") {
      throw new WhatsAppSetupError(
        "invalid_connection",
        "Transport mode selection is only supported for WhatsApp connections.",
        400,
      );
    }

    const existingConfig = normalizeConfig(connection.configJson);
    const updatedConfig: WhatsAppConnectionConfig = {
      ...existingConfig,
      transportMode: mode,
      // Reset pairing status when switching to openclaw_pairing
      ...(mode === "openclaw_pairing" && existingConfig.transportMode !== "openclaw_pairing"
        ? { pairingStatus: "unpaired" as const, pairedIdentityRef: null }
        : {}),
    };

    await this.options.connectionService.update(workspaceId, connectionId, {
      configJson: updatedConfig as unknown as Record<string, unknown>,
    });

    return this.buildStatusResponse(connectionId, connection.status, updatedConfig);
  }

  // -------------------------------------------------------------------------
  // Lifecycle: validate (cheap local check)
  // -------------------------------------------------------------------------

  validate(config: WhatsAppConnectionConfig): WhatsAppValidationResult {
    if (!config.transportMode) {
      return {
        ok: false,
        issues: [
          {
            severity: "error",
            code: "no_transport_mode",
            summary: "No WhatsApp transport mode selected.",
          },
        ],
      };
    }

    if (config.transportMode === "openclaw_pairing") {
      return this.requirePairingAdapter().validate(config);
    }

    const issues: WhatsAppDiagnosticIssue[] = [];
    if (!config.phoneNumberId) {
      issues.push({
        severity: "error",
        code: "missing_phone_number_id",
        summary: "WhatsApp Phone Number ID is not configured.",
      });
    }

    if (!config.accessToken) {
      issues.push({
        severity: "error",
        code: "missing_access_token",
        summary: "WhatsApp access token is not configured.",
      });
    }

    if (!config.verifyToken) {
      issues.push({
        severity: "error",
        code: "missing_verify_token",
        summary: "WhatsApp webhook verify token is not configured.",
      });
    }

    if (!this.options.appSecretConfigured) {
      issues.push({
        severity: "error",
        code: "missing_app_secret",
        summary: "WhatsApp app secret is not configured.",
        detail:
          "Meta Cloud API webhook callbacks must be signed. Set WHATSAPP_APP_SECRET " +
          "before exposing the public WhatsApp webhook.",
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
  ): Promise<WhatsAppProbeResult> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "whatsapp") {
      throw new WhatsAppSetupError(
        "invalid_connection",
        "WhatsApp probe is only supported for WhatsApp connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    if (config.transportMode === "openclaw_pairing") {
      return await this.requirePairingAdapter().probe(workspaceId, connectionId);
    }

    const validation = this.validate(config);

    if (!validation.ok) {
      const result: WhatsAppProbeResult = {
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

    const transport = new WhatsAppTransportService({
      phoneNumberId: config.phoneNumberId,
      accessToken: config.accessToken,
    });

    const testResult = await transport.testConnection();
    const checkedAt = this.now().toISOString();

    const probeResult: WhatsAppProbeResult = testResult.ok
      ? {
          ok: true,
          checkedAt,
          summary: `Connected as ${testResult.displayName ?? config.phoneNumberId}.`,
          issues: [],
          displayName: testResult.displayName,
        }
      : {
          ok: false,
          checkedAt,
          summary: testResult.error ?? "WhatsApp API connection failed.",
          issues: [
            {
              severity: "error",
              code: "probe_failed",
              summary: testResult.error ?? "WhatsApp API connection failed.",
            },
          ],
        };

    // Update stored probe state
    await this.options.connectionService.update(workspaceId, connectionId, {
      status: probeResult.ok ? "connected" : "error",
      configJson: {
        ...config,
        validatedDisplayName: testResult.displayName ?? config.validatedDisplayName,
        lastProbeAt: probeResult.checkedAt,
        lastProbeError: probeResult.ok ? null : probeResult.summary,
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
  ): Promise<WhatsAppStatusResponse> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "whatsapp") {
      throw new WhatsAppSetupError(
        "invalid_connection",
        "WhatsApp status is only supported for WhatsApp connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    return this.buildStatusResponse(connectionId, connection.status, config);
  }

  async startPairing(
    workspaceId: string,
    connectionId: string,
    input?: {
      force?: boolean;
      timeoutMs?: number;
    },
  ): Promise<WhatsAppPairingStartResponse> {
    const result = await this.requirePairingAdapter().startPairing(workspaceId, connectionId, input);
    const status = await this.getStatus(workspaceId, connectionId);
    return {
      pairing: {
        qr_data_url: result.qrDataUrl,
        message: result.message,
        account_id: result.accountId,
      },
      status,
    };
  }

  async waitForPairing(
    workspaceId: string,
    connectionId: string,
    input?: {
      timeoutMs?: number;
    },
  ): Promise<WhatsAppPairingWaitResponse> {
    const result = await this.requirePairingAdapter().waitForPairing(workspaceId, connectionId, input);
    const status = await this.getStatus(workspaceId, connectionId);
    return {
      pairing: {
        connected: result.connected,
        message: result.message,
        account_id: result.accountId,
      },
      status,
    };
  }

  /**
   * Get the stored config for a validated WhatsApp connection.
   * Used by the webhook handler to look up the verify token.
   */
  async getValidatedConfig(
    workspaceId: string,
    connectionId: string,
  ): Promise<WhatsAppConnectionConfig> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "whatsapp") {
      throw new WhatsAppSetupError(
        "invalid_connection",
        "This operation is only supported for WhatsApp connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    const validation = this.validate(config);

    if (!validation.ok) {
      throw new WhatsAppSetupError(
        "not_configured",
        "WhatsApp connection is not configured. Complete setup first.",
        400,
      );
    }

    return config;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private buildStatusResponse(
    connectionId: string,
    connectionStatus: string,
    config: WhatsAppConnectionConfig,
  ): WhatsAppStatusResponse {
    const validation = this.validate(config);
    const operational = this.deriveOperationalStatus(config, validation);
    const recoveryHints = this.getRecoveryHints(operational, validation, config);

    const probe: WhatsAppProbeResult | null = config.lastProbeAt
      ? {
          ok: !config.lastProbeError,
          checkedAt: config.lastProbeAt,
          summary: config.lastProbeError
            ? config.lastProbeError
            : config.transportMode === "openclaw_pairing"
              ? `OpenClaw pairing active${config.validatedDisplayName ? ` (${config.validatedDisplayName})` : ""}.`
              : `Connected as ${config.validatedDisplayName ?? config.phoneNumberId}.`,
          issues: config.lastProbeError
            ? [
                {
                  severity: "error" as const,
                  code: "last_probe_failed",
                  summary: config.lastProbeError,
                },
              ]
            : [],
          displayName: config.validatedDisplayName,
        }
      : null;

    return {
      connection_id: connectionId,
      connection_status: connectionStatus,
      transport_mode: config.transportMode,
      pairing_status: config.pairingStatus,
      paired_identity_ref: config.pairedIdentityRef,
      operational,
      probe,
      recovery_hints: recoveryHints,
    };
  }

  private deriveOperationalStatus(
    config: WhatsAppConnectionConfig,
    validation: WhatsAppValidationResult,
  ): WhatsAppOperationalStatus {
    if (config.transportMode === "openclaw_pairing") {
      const pairingAdapter = this.requirePairingAdapter();
      const adapterStatus = pairingAdapter.status(config);

      if (adapterStatus === "setup_required") {
        return {
          state: "setup_required",
          summary: "OpenClaw pairing requires setup.",
          lastProbeAt: config.lastProbeAt,
          blockingIssueCodes: validation.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.code),
        };
      }

      if (adapterStatus === "configured") {
        return {
          state: "configured",
          summary: "Pairing session created. Scan the QR code, then confirm pairing.",
          lastProbeAt: config.lastProbeAt,
          blockingIssueCodes: [],
        };
      }

      if (adapterStatus === "degraded") {
        return {
          state: "degraded",
          summary: config.lastProbeError ?? "OpenClaw pairing session is degraded.",
          lastProbeAt: config.lastProbeAt,
          blockingIssueCodes: ["last_probe_failed"],
        };
      }

      if (adapterStatus === "error") {
        return {
          state: "error",
          summary: config.lastProbeError ?? "OpenClaw pairing session is in an error state.",
          lastProbeAt: config.lastProbeAt,
          blockingIssueCodes: validation.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.code),
        };
      }

      return {
        state: "ready",
        summary: `OpenClaw pairing active${config.pairedIdentityRef ? ` (${config.pairedIdentityRef})` : ""}.`,
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: [],
      };
    }

    if (!validation.ok) {
      return {
        state: "setup_required",
        summary: "WhatsApp connection requires setup.",
        lastProbeAt: config.lastProbeAt,
        blockingIssueCodes: validation.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.code),
      };
    }

    if (!config.lastProbeAt) {
      return {
        state: "configured",
        summary: "Credentials are configured but not yet verified.",
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
      summary: `Connected as ${config.validatedDisplayName ?? config.phoneNumberId}.`,
      lastProbeAt: config.lastProbeAt,
      blockingIssueCodes: [],
    };
  }

  private getRecoveryHints(
    operational: WhatsAppOperationalStatus,
    validation: WhatsAppValidationResult,
    config?: WhatsAppConnectionConfig,
  ): WhatsAppRecoveryHint[] {
    const isOpenClaw = config?.transportMode === "openclaw_pairing";

    if (operational.blockingIssueCodes.includes("no_transport_mode")) {
      return [{
        code: "select_transport_mode",
        label: "Select a WhatsApp transport mode",
        description:
          "Choose between OpenClaw Pairing (recommended for operators) or Meta Cloud API.",
        target: { surface: "connections", focus: "whatsapp" },
      }];
    }

    if (isOpenClaw) {
      return this.requirePairingAdapter().recoveryHints({
        ...config,
        lastProbeError:
          config?.lastProbeError ?? (validation.ok ? null : operational.summary),
      });
    }

    const hints: WhatsAppRecoveryHint[] = [];
    if (
      operational.blockingIssueCodes.includes("missing_phone_number_id") ||
      operational.blockingIssueCodes.includes("missing_access_token")
    ) {
      hints.push({
        code: "configure_business_api",
        label: "Configure WhatsApp Business API credentials",
        description:
          "Go to the Meta Developer Dashboard and set up the WhatsApp product. " +
          "Obtain the Phone Number ID and a permanent access token.",
        docsHref:
          "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    if (operational.blockingIssueCodes.includes("missing_verify_token")) {
      hints.push({
        code: "set_verify_token",
        label: "Set the webhook verify token",
        description:
          "The verify token is used to validate webhook registrations from Meta. " +
          "Enter it in the Clawback WhatsApp setup form and use the same value when configuring the webhook in the Meta Developer Dashboard.",
        docsHref:
          "https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    if (operational.blockingIssueCodes.includes("missing_app_secret")) {
      hints.push({
        code: "set_app_secret",
        label: "Set the WhatsApp app secret",
        description:
          "Configure WHATSAPP_APP_SECRET from the Meta Developer Dashboard so Clawback can verify signed webhook callbacks before accepting them.",
        docsHref:
          "https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    if (
      operational.blockingIssueCodes.includes("last_probe_failed") ||
      operational.blockingIssueCodes.includes("probe_failed")
    ) {
      hints.push({
        code: "check_credentials",
        label: "Check WhatsApp API credentials",
        description:
          "The WhatsApp API could not be reached. Verify the Phone Number ID and access token " +
          "are correct and that the token has not expired. You may need to regenerate the token " +
          "in the Meta Developer Dashboard.",
        docsHref:
          "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    return hints;
  }

  private requirePairingAdapter() {
    if (!this.options.pairingAdapter) {
      throw new WhatsAppSetupError(
        "pairing_not_configured",
        "OpenClaw pairing is not configured for this deployment.",
        501,
      );
    }
    return this.options.pairingAdapter;
  }
}

function normalizeConfig(rawConfig: unknown) {
  return normalizeWhatsAppConfig(rawConfig);
}
