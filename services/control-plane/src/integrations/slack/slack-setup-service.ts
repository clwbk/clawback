/**
 * Slack connection setup service implementing the frozen provider lifecycle contract.
 *
 * Lifecycle surface:
 *   1. setupHelp   — static, lives in the manifest
 *   2. validate    — cheap local config checks
 *   3. probe       — live reachability check against Slack API (auth.test)
 *   4. status      — synthesize operator-facing state
 *   5. recoveryHints — actionable guidance when something is wrong
 *
 * Slack is an APPROVAL SURFACE. It does not create connections in the
 * traditional provider sense — it sends approval prompts and receives
 * decisions via interactive message buttons.
 */

import type { ConnectionService } from "../../connections/index.js";
import type {
  SlackConnectionConfig,
  SlackValidationResult,
  SlackProbeResult,
  SlackOperationalStatus,
  SlackRecoveryHint,
  SlackStatusResponse,
  SlackSetupInput,
  SlackDiagnosticIssue,
} from "./types.js";
import { SlackTransportService } from "./slack-transport-service.js";
import { SlackSetupError } from "./slack-errors.js";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type SlackSetupServiceOptions = {
  connectionService: ConnectionService;
  now?: () => Date;
};

export class SlackSetupService {
  private readonly now: () => Date;

  constructor(private readonly options: SlackSetupServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // Setup: validate credentials, probe, store config, return status
  // -------------------------------------------------------------------------

  async setup(
    workspaceId: string,
    connectionId: string,
    input: SlackSetupInput,
  ): Promise<SlackStatusResponse> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "slack") {
      throw new SlackSetupError(
        "invalid_connection",
        "Slack setup is only supported for Slack connections.",
        400,
      );
    }

    // Step 1: Probe the Slack API
    const transport = new SlackTransportService({
      botToken: input.bot_token,
      defaultChannel: input.default_channel,
    });

    const testResult = await transport.testConnection();

    if (!testResult.ok) {
      const config: SlackConnectionConfig = {
        botToken: input.bot_token,
        signingSecret: input.signing_secret,
        defaultChannel: input.default_channel,
        validatedBotName: null,
        validatedTeamName: null,
        lastProbeAt: this.now().toISOString(),
        lastProbeError: testResult.error ?? "Slack API connection failed.",
      };

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "error",
        configJson: config as unknown as Record<string, unknown>,
      });

      return this.buildStatusResponse(connectionId, "error", config);
    }

    // Step 2: Store validated config
    const config: SlackConnectionConfig = {
      botToken: input.bot_token,
      signingSecret: input.signing_secret,
      defaultChannel: input.default_channel,
      validatedBotName: testResult.botName ?? null,
      validatedTeamName: testResult.teamName ?? null,
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
  // Lifecycle: validate (cheap local check)
  // -------------------------------------------------------------------------

  validate(config: SlackConnectionConfig): SlackValidationResult {
    const issues: SlackDiagnosticIssue[] = [];

    if (!config.botToken) {
      issues.push({
        severity: "error",
        code: "missing_bot_token",
        summary: "Slack Bot Token is not configured.",
      });
    } else if (!config.botToken.startsWith("xoxb-")) {
      issues.push({
        severity: "error",
        code: "invalid_bot_token_format",
        summary: "Slack Bot Token should start with 'xoxb-'.",
      });
    }

    if (!config.signingSecret) {
      issues.push({
        severity: "error",
        code: "missing_signing_secret",
        summary: "Slack Signing Secret is not configured.",
      });
    }

    if (!config.defaultChannel) {
      issues.push({
        severity: "error",
        code: "missing_default_channel",
        summary: "Default Slack channel is not configured.",
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
  ): Promise<SlackProbeResult> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "slack") {
      throw new SlackSetupError(
        "invalid_connection",
        "Slack probe is only supported for Slack connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    const validation = this.validate(config);

    if (!validation.ok) {
      const result: SlackProbeResult = {
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

    const transport = new SlackTransportService({
      botToken: config.botToken,
      defaultChannel: config.defaultChannel,
    });

    const testResult = await transport.testConnection();
    const checkedAt = this.now().toISOString();

    const probeResult: SlackProbeResult = testResult.ok
      ? {
          ok: true,
          checkedAt,
          summary: `Connected as ${testResult.botName ?? "bot"} in ${testResult.teamName ?? "workspace"}.`,
          issues: [],
          botName: testResult.botName,
          teamName: testResult.teamName,
        }
      : {
          ok: false,
          checkedAt,
          summary: testResult.error ?? "Slack API connection failed.",
          issues: [
            {
              severity: "error",
              code: "probe_failed",
              summary: testResult.error ?? "Slack API connection failed.",
            },
          ],
        };

    // Update stored probe state
    await this.options.connectionService.update(workspaceId, connectionId, {
      status: probeResult.ok ? "connected" : "error",
      configJson: {
        ...config,
        validatedBotName: testResult.botName ?? config.validatedBotName,
        validatedTeamName: testResult.teamName ?? config.validatedTeamName,
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
  ): Promise<SlackStatusResponse> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "slack") {
      throw new SlackSetupError(
        "invalid_connection",
        "Slack status is only supported for Slack connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    return this.buildStatusResponse(connectionId, connection.status, config);
  }

  /**
   * Get the stored config for a validated Slack connection.
   */
  async getValidatedConfig(
    workspaceId: string,
    connectionId: string,
  ): Promise<SlackConnectionConfig> {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "slack") {
      throw new SlackSetupError(
        "invalid_connection",
        "This operation is only supported for Slack connections.",
        400,
      );
    }

    const config = normalizeConfig(connection.configJson);
    const validation = this.validate(config);

    if (!validation.ok) {
      throw new SlackSetupError(
        "not_configured",
        "Slack connection is not configured. Complete setup first.",
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
    config: SlackConnectionConfig,
  ): SlackStatusResponse {
    const validation = this.validate(config);
    const operational = this.deriveOperationalStatus(config, validation);
    const recoveryHints = this.getRecoveryHints(operational, validation);

    const probe: SlackProbeResult | null = config.lastProbeAt
      ? {
          ok: !config.lastProbeError,
          checkedAt: config.lastProbeAt,
          summary: config.lastProbeError
            ? config.lastProbeError
            : `Connected as ${config.validatedBotName ?? "bot"} in ${config.validatedTeamName ?? "workspace"}.`,
          issues: config.lastProbeError
            ? [
                {
                  severity: "error" as const,
                  code: "last_probe_failed",
                  summary: config.lastProbeError,
                },
              ]
            : [],
          botName: config.validatedBotName,
          teamName: config.validatedTeamName,
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
    config: SlackConnectionConfig,
    validation: SlackValidationResult,
  ): SlackOperationalStatus {
    if (!validation.ok) {
      return {
        state: "setup_required",
        summary: "Slack connection requires setup.",
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
      summary: `Connected as ${config.validatedBotName ?? "bot"} in ${config.validatedTeamName ?? "workspace"}.`,
      lastProbeAt: config.lastProbeAt,
      blockingIssueCodes: [],
    };
  }

  private getRecoveryHints(
    operational: SlackOperationalStatus,
    validation: SlackValidationResult,
  ): SlackRecoveryHint[] {
    const hints: SlackRecoveryHint[] = [];

    if (
      operational.blockingIssueCodes.includes("missing_bot_token") ||
      operational.blockingIssueCodes.includes("invalid_bot_token_format")
    ) {
      hints.push({
        code: "configure_bot_token",
        label: "Configure Slack Bot Token",
        description:
          "Go to your Slack app settings, navigate to OAuth & Permissions, " +
          "and copy the Bot User OAuth Token (starts with xoxb-).",
        docsHref: "https://api.slack.com/authentication/token-types#bot",
        target: { surface: "connections", focus: "slack" },
      });
    }

    if (operational.blockingIssueCodes.includes("missing_signing_secret")) {
      hints.push({
        code: "configure_signing_secret",
        label: "Configure Slack Signing Secret",
        description:
          "Go to your Slack app settings under Basic Information " +
          "and copy the Signing Secret. This is used to verify webhook requests.",
        docsHref: "https://api.slack.com/authentication/verifying-requests-from-slack",
        target: { surface: "connections", focus: "slack" },
      });
    }

    if (operational.blockingIssueCodes.includes("missing_default_channel")) {
      hints.push({
        code: "configure_default_channel",
        label: "Set default Slack channel",
        description:
          "Enter the channel ID where approval prompts should be posted. " +
          "You can find channel IDs in Slack by right-clicking a channel and selecting 'View channel details'.",
        target: { surface: "connections", focus: "slack" },
      });
    }

    if (
      operational.blockingIssueCodes.includes("last_probe_failed") ||
      operational.blockingIssueCodes.includes("probe_failed")
    ) {
      hints.push({
        code: "check_credentials",
        label: "Check Slack API credentials",
        description:
          "The Slack API could not be reached. Verify the Bot Token is correct and has not been revoked. " +
          "Ensure the bot has been installed to the workspace.",
        docsHref: "https://api.slack.com/apps",
        target: { surface: "connections", focus: "slack" },
      });
    }

    return hints;
  }
}

function normalizeConfig(rawConfig: unknown): SlackConnectionConfig {
  const config = (rawConfig ?? {}) as Record<string, unknown>;
  return {
    botToken: (config.botToken as string) ?? "",
    signingSecret: (config.signingSecret as string) ?? "",
    defaultChannel: (config.defaultChannel as string) ?? "",
    validatedBotName: (config.validatedBotName as string) ?? null,
    validatedTeamName: (config.validatedTeamName as string) ?? null,
    lastProbeAt: (config.lastProbeAt as string) ?? null,
    lastProbeError: (config.lastProbeError as string) ?? null,
  };
}

export { normalizeConfig as normalizeSlackConfig };
