/**
 * OpenClaw pairing lifecycle adapter for the WhatsApp approval surface.
 *
 * This handles operator-facing pairing state, QR login, and live gateway
 * health checks. Review authority and decision truth still stay in Clawback.
 */

import type { ConnectionService } from "../../connections/index.js";
import type {
  WhatsAppConnectionConfig,
  WhatsAppValidationResult,
  WhatsAppProbeResult,
  WhatsAppRecoveryHint,
  WhatsAppDiagnosticIssue,
} from "./types.js";
import { normalizeWhatsAppConfig } from "./whatsapp-config.js";
import { WhatsAppSetupError } from "./whatsapp-errors.js";
import type { OpenClawGatewayService } from "./openclaw-gateway-service.js";
import { OpenClawGatewayError } from "./openclaw-gateway-service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenClawPairingStatus =
  | "setup_required"
  | "configured"
  | "ready"
  | "degraded"
  | "error";

export type OpenClawPairingStartResult = {
  qrDataUrl: string | null;
  message: string;
  accountId: string | null;
};

export type OpenClawPairingWaitResult = {
  connected: boolean;
  message: string;
  accountId: string | null;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type OpenClawPairingAdapterOptions = {
  connectionService: ConnectionService;
  gatewayService: OpenClawGatewayService;
  now?: () => Date;
};

export class OpenClawPairingAdapter {
  private readonly now: () => Date;

  constructor(private readonly options: OpenClawPairingAdapterOptions) {
    this.now = options.now ?? (() => new Date());
  }

  // -------------------------------------------------------------------------
  // validate(): cheap local config check
  // -------------------------------------------------------------------------

  validate(config: WhatsAppConnectionConfig): WhatsAppValidationResult {
    const issues: WhatsAppDiagnosticIssue[] = [];

    if (config.transportMode !== "openclaw_pairing") {
      issues.push({
        severity: "error",
        code: "wrong_transport_mode",
        summary: "This adapter only handles openclaw_pairing transport mode.",
      });
      return { ok: false, issues };
    }

    if (!config.pairingStatus || config.pairingStatus === "unpaired") {
      issues.push({
        severity: "error",
        code: "pairing_required",
        summary: "OpenClaw pairing has not been completed. Scan the QR code to pair.",
      });
    }

    if (config.pairingStatus === "error") {
      issues.push({
        severity: "error",
        code: "pairing_error",
        summary: "OpenClaw pairing session is in an error state.",
      });
    }

    if (config.pairingStatus === "paired" && !config.pairedIdentityRef) {
      issues.push({
        severity: "warn",
        code: "missing_paired_identity_ref",
        summary: "Paired but no identity reference stored. Re-pair recommended.",
      });
    }

    const hasErrors = issues.some((i) => i.severity === "error");
    return { ok: !hasErrors, issues };
  }

  // -------------------------------------------------------------------------
  // startPairing(): request a QR login through the OpenClaw gateway
  // -------------------------------------------------------------------------

  async startPairing(
    workspaceId: string,
    connectionId: string,
    input?: {
      force?: boolean;
      timeoutMs?: number;
    },
  ): Promise<OpenClawPairingStartResult> {
    const { config } = await this.loadConnection(workspaceId, connectionId);
    const accountId = config.pairedIdentityRef;

    try {
      const result = await this.options.gatewayService.startWhatsAppLogin({
        ...(accountId ? { accountId } : {}),
        ...(typeof input?.force === "boolean" ? { force: input.force } : {}),
        ...(typeof input?.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
      });

      return {
        qrDataUrl: result.qrDataUrl,
        message: result.message,
        accountId: result.accountId ?? accountId,
      };
    } catch (error) {
      throw gatewayErrorToSetupError(error);
    }
  }

  // -------------------------------------------------------------------------
  // waitForPairing(): wait for scan completion and persist paired state
  // -------------------------------------------------------------------------

  async waitForPairing(
    workspaceId: string,
    connectionId: string,
    input?: {
      timeoutMs?: number;
    },
  ): Promise<OpenClawPairingWaitResult> {
    const { config } = await this.loadConnection(workspaceId, connectionId);
    const accountId = config.pairedIdentityRef;

    let result;
    try {
      result = await this.options.gatewayService.waitForWhatsAppLogin({
        ...(accountId ? { accountId } : {}),
        ...(typeof input?.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
      });
    } catch (error) {
      throw gatewayErrorToSetupError(error);
    }

    const checkedAt = this.now().toISOString();
    if (!result.connected) {
      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "not_connected",
        configJson: {
          ...config,
          pairingStatus: "unpaired",
          lastProbeAt: checkedAt,
          lastProbeError: result.message,
        } as unknown as Record<string, unknown>,
      });

      return {
        connected: false,
        message: result.message,
        accountId: result.accountId ?? accountId,
      };
    }

    let probeResult;
    try {
      probeResult = await this.options.gatewayService.probeWhatsAppAccount({
        accountId: result.accountId ?? accountId,
      });
    } catch (error) {
      throw gatewayErrorToSetupError(error);
    }
    const resolvedAccount = probeResult.account;
    const pairedIdentityRef = resolvedAccount?.accountId ?? result.accountId ?? accountId ?? null;

    await this.options.connectionService.update(workspaceId, connectionId, {
      status: resolvedAccount?.connected ? "connected" : "error",
      configJson: {
        ...config,
        pairingStatus: resolvedAccount?.linked ? "paired" : "error",
        pairedIdentityRef,
        validatedDisplayName: resolvedAccount?.displayName ?? config.validatedDisplayName,
        lastProbeAt: checkedAt,
        lastProbeError: resolvedAccount?.connected ? null : result.message,
      } as unknown as Record<string, unknown>,
    });

    return {
      connected: Boolean(resolvedAccount?.connected),
      message: result.message,
      accountId: pairedIdentityRef,
    };
  }

  // -------------------------------------------------------------------------
  // probe(): live reachability check against the OpenClaw gateway
  // -------------------------------------------------------------------------

  async probe(
    workspaceId: string,
    connectionId: string,
  ): Promise<WhatsAppProbeResult> {
    const { config } = await this.loadConnection(workspaceId, connectionId);
    const checkedAt = this.now().toISOString();

    const validation = this.validate(config);
    if (!validation.ok) {
      const result: WhatsAppProbeResult = {
        ok: false,
        checkedAt,
        summary: "Configuration is incomplete for OpenClaw pairing.",
        issues: validation.issues,
      };

      await this.options.connectionService.update(workspaceId, connectionId, {
        configJson: {
          ...config,
          lastProbeAt: checkedAt,
          lastProbeError: result.summary,
        } as unknown as Record<string, unknown>,
      });

      return result;
    }

    try {
      const { account } = await this.options.gatewayService.probeWhatsAppAccount({
        accountId: config.pairedIdentityRef,
      });

      const probeResult = account?.linked && account.connected
        ? {
            ok: true,
            checkedAt,
            summary: `OpenClaw pairing active (${account.displayName ?? account.accountId}).`,
            issues: [],
            displayName: account.displayName ?? account.accountId,
          }
        : {
            ok: false,
            checkedAt,
            summary: account?.linked
              ? account.lastError ?? "OpenClaw pairing is linked but not connected."
              : "OpenClaw pairing has not been completed.",
            issues: [
              {
                severity: "error" as const,
                code: account?.linked ? "session_unhealthy" : "pairing_required",
                summary: account?.linked
                  ? account.lastError ?? "OpenClaw pairing is linked but not connected."
                  : "OpenClaw pairing has not been completed.",
              },
            ],
          };

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: probeResult.ok ? "connected" : "error",
        configJson: {
          ...config,
          pairingStatus: account?.linked ? "paired" : "unpaired",
          pairedIdentityRef: account?.accountId ?? config.pairedIdentityRef,
          validatedDisplayName: account?.displayName ?? config.validatedDisplayName,
          lastProbeAt: checkedAt,
          lastProbeError: probeResult.ok ? null : probeResult.summary,
        } as unknown as Record<string, unknown>,
      });

      return probeResult;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "OpenClaw pairing probe failed.";

      await this.options.connectionService.update(workspaceId, connectionId, {
        status: "error",
        configJson: {
          ...config,
          pairingStatus: config.pairingStatus === "paired" ? "error" : config.pairingStatus,
          lastProbeAt: checkedAt,
          lastProbeError: message,
        } as unknown as Record<string, unknown>,
      });

      return {
        ok: false,
        checkedAt,
        summary: message,
        issues: [
          {
            severity: "error",
            code: "runtime_unreachable",
            summary: message,
          },
        ],
      };
    }
  }

  // -------------------------------------------------------------------------
  // status(): synthesize operator-facing state
  // -------------------------------------------------------------------------

  status(config: WhatsAppConnectionConfig): OpenClawPairingStatus {
    if (config.transportMode !== "openclaw_pairing") {
      return "error";
    }

    if (!config.pairingStatus || config.pairingStatus === "unpaired") {
      return "setup_required";
    }

    if (config.pairingStatus === "error") {
      return "error";
    }

    if (config.pairingStatus === "paired" && !config.lastProbeAt) {
      return "configured";
    }

    if (config.pairingStatus === "paired" && config.lastProbeError) {
      return "degraded";
    }

    return "ready";
  }

  // -------------------------------------------------------------------------
  // recoveryHints(): actionable operator guidance
  // -------------------------------------------------------------------------

  recoveryHints(config: WhatsAppConnectionConfig): WhatsAppRecoveryHint[] {
    const hints: WhatsAppRecoveryHint[] = [];
    const adapterStatus = this.status(config);

    if (adapterStatus === "setup_required") {
      hints.push({
        code: "complete_pairing",
        label: "Complete OpenClaw pairing",
        description:
          "Scan the QR code with a dedicated work WhatsApp identity to complete pairing. " +
          "Use a separate work number, not your personal WhatsApp.",
        docsHref: "/docs/whatsapp-openclaw-pairing-guide",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    if (adapterStatus === "error") {
      hints.push({
        code: "repair_pairing",
        label: "Re-pair the OpenClaw session",
        description:
          "The pairing session has encountered an error. Disconnect and re-pair using a fresh QR code. " +
          "If this keeps happening, check that the OpenClaw runtime is healthy.",
        docsHref: "/docs/whatsapp-openclaw-pairing-guide",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    if (adapterStatus === "degraded") {
      hints.push({
        code: "check_openclaw_runtime",
        label: "Confirm OpenClaw runtime health",
        description:
          "The last probe detected an issue. The paired session may have been disconnected. " +
          "Check that the OpenClaw runtime is running and the paired device is online.",
        docsHref: "/docs/whatsapp-openclaw-pairing-guide",
        target: { surface: "connections", focus: "whatsapp" },
      });

      hints.push({
        code: "verify_approver_mapping",
        label: "Confirm mapped approvers are still allowlisted",
        description:
          "After re-pairing, verify that the workspace identity mappings still point to " +
          "the correct WhatsApp identities and that they are on the allowlist.",
        target: { surface: "connections", focus: "whatsapp-identities" },
      });
    }

    return hints;
  }

  // -------------------------------------------------------------------------
  // recoveryHints(): actionable operator guidance (extended for gateway errors)
  // -------------------------------------------------------------------------

  recoveryHintsForGatewayError(error: OpenClawGatewayError): WhatsAppRecoveryHint[] {
    const hints: WhatsAppRecoveryHint[] = [];

    if (error.code === "gateway_unreachable") {
      hints.push({
        code: "check_openclaw_runtime",
        label: "Start the OpenClaw runtime",
        description:
          "The OpenClaw gateway could not be reached. Make sure the OpenClaw runtime process is running " +
          "and accessible from this server.",
        docsHref: "/docs/whatsapp-openclaw-pairing-guide",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    if (error.code === "channel_not_configured") {
      hints.push({
        code: "configure_openclaw_channel",
        label: "Configure OpenClaw WhatsApp channel first",
        description:
          "The OpenClaw runtime is reachable but has no WhatsApp channel configured. " +
          "Add a WhatsApp account in the OpenClaw runtime configuration before pairing.",
        docsHref: "/docs/whatsapp-openclaw-pairing-guide",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    if (error.code === "session_expired") {
      hints.push({
        code: "repair_pairing",
        label: "Re-pair the WhatsApp session",
        description:
          "The previous WhatsApp session has expired or been disconnected. " +
          "Generate a new QR code and scan it with your WhatsApp device to re-establish the connection.",
        docsHref: "/docs/whatsapp-openclaw-pairing-guide",
        target: { surface: "connections", focus: "whatsapp" },
      });
    }

    return hints;
  }

  private async loadConnection(workspaceId: string, connectionId: string) {
    const connection = await this.options.connectionService.getStoredById(
      workspaceId,
      connectionId,
    );

    if (connection.provider !== "whatsapp") {
      throw new WhatsAppSetupError(
        "invalid_connection",
        "OpenClaw pairing is only supported for WhatsApp connections.",
        400,
      );
    }

    const config = normalizeWhatsAppConfig(connection.configJson);
    if (config.transportMode !== "openclaw_pairing") {
      throw new WhatsAppSetupError(
        "wrong_transport_mode",
        "This operation is only for openclaw_pairing transport mode.",
        400,
      );
    }

    return { connection, config };
  }
}

// ---------------------------------------------------------------------------
// Helper: convert OpenClawGatewayError to WhatsAppSetupError
// ---------------------------------------------------------------------------

function gatewayErrorToSetupError(error: unknown): WhatsAppSetupError {
  if (error instanceof WhatsAppSetupError) {
    return error;
  }

  if (error instanceof OpenClawGatewayError) {
    return new WhatsAppSetupError(error.code, error.message, error.statusCode);
  }

  const message = error instanceof Error ? error.message : "OpenClaw pairing failed.";
  return new WhatsAppSetupError("gateway_error", message, 502);
}
