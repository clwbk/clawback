/**
 * WhatsApp transport adapter doctor checks.
 *
 * Provides diagnostic checks for the WhatsApp approval surface connection,
 * following the plugin operator lifecycle contract from ADR 0006.
 *
 * These checks inspect the connection config and synthesize operator-facing
 * diagnostics about transport mode selection and adapter health.
 */

import type {
  WhatsAppConnectionConfig,
  WhatsAppDiagnosticIssue,
  WhatsAppTransportMode,
} from "./types.js";
import { normalizeWhatsAppConfig } from "./whatsapp-config.js";

// ---------------------------------------------------------------------------
// Doctor check result
// ---------------------------------------------------------------------------

export type WhatsAppDoctorCheckResult = {
  check: string;
  ok: boolean;
  severity: "info" | "warn" | "error";
  summary: string;
  detail?: string;
};

export type WhatsAppDoctorReport = {
  provider: "whatsapp";
  transportMode: WhatsAppTransportMode | null;
  checks: WhatsAppDoctorCheckResult[];
  healthy: boolean;
};

// ---------------------------------------------------------------------------
// Doctor
// ---------------------------------------------------------------------------

export function runWhatsAppDoctorChecks(
  rawConfig: unknown,
): WhatsAppDoctorReport {
  const config = normalizeWhatsAppConfig(rawConfig);
  const checks: WhatsAppDoctorCheckResult[] = [];

  // Check 1: Transport mode selected?
  const transportModeCheck = checkTransportModeSelected(config);
  checks.push(transportModeCheck);

  if (!transportModeCheck.ok) {
    // Can't run adapter-specific checks without a transport mode
    return {
      provider: "whatsapp",
      transportMode: null,
      checks,
      healthy: false,
    };
  }

  // Adapter-specific checks
  if (config.transportMode === "openclaw_pairing") {
    checks.push(...checkOpenClawPairingHealth(config));
  } else if (config.transportMode === "meta_cloud_api") {
    checks.push(...checkMetaCloudApiHealth(config));
  }

  const healthy = checks.every((c) => c.ok || c.severity === "info");

  return {
    provider: "whatsapp",
    transportMode: config.transportMode,
    checks,
    healthy,
  };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkTransportModeSelected(
  config: WhatsAppConnectionConfig,
): WhatsAppDoctorCheckResult {
  if (config.transportMode === "openclaw_pairing" || config.transportMode === "meta_cloud_api") {
    return {
      check: "transport_mode_selected",
      ok: true,
      severity: "info",
      summary: `Transport mode: ${config.transportMode === "openclaw_pairing" ? "OpenClaw Pairing" : "Meta Cloud API"}.`,
    };
  }

  return {
    check: "transport_mode_selected",
    ok: false,
    severity: "error",
    summary: "No WhatsApp transport mode selected.",
    detail: "Select either OpenClaw Pairing (recommended) or Meta Cloud API in the connection settings.",
  };
}

function checkOpenClawPairingHealth(
  config: WhatsAppConnectionConfig,
): WhatsAppDoctorCheckResult[] {
  const checks: WhatsAppDoctorCheckResult[] = [];
  const lastError = config.lastProbeError?.toLowerCase() ?? "";

  // Check: Gateway reachability (inferred from last probe error)
  if (lastError.includes("unreachable") || lastError.includes("econnrefused")) {
    checks.push({
      check: "openclaw_gateway_reachable",
      ok: false,
      severity: "error",
      summary: "OpenClaw gateway is unreachable.",
      detail:
        "The OpenClaw runtime could not be contacted. Verify it is running and accessible from this server.",
    });
  } else if (lastError.includes("channel not configured") || lastError.includes("no whatsapp")) {
    checks.push({
      check: "openclaw_gateway_reachable",
      ok: true,
      severity: "info",
      summary: "OpenClaw gateway is reachable.",
    });
    checks.push({
      check: "openclaw_channel_configured",
      ok: false,
      severity: "error",
      summary: "OpenClaw WhatsApp channel is not configured.",
      detail:
        "The OpenClaw runtime is running but has no WhatsApp account configured. " +
        "Add a WhatsApp account in the OpenClaw runtime before pairing.",
    });
  } else if (lastError.includes("session expired") || lastError.includes("logged out") || lastError.includes("disconnected")) {
    checks.push({
      check: "openclaw_gateway_reachable",
      ok: true,
      severity: "info",
      summary: "OpenClaw gateway is reachable.",
    });
    checks.push({
      check: "openclaw_session_health",
      ok: false,
      severity: "error",
      summary: "WhatsApp session has expired.",
      detail:
        "The previously paired WhatsApp session has been disconnected. " +
        "Re-pair by generating a new QR code and scanning it.",
    });
  }

  // Pairing status
  if (config.pairingStatus === "paired") {
    checks.push({
      check: "openclaw_pairing_status",
      ok: true,
      severity: "info",
      summary: "OpenClaw pairing is active.",
      ...(config.pairedIdentityRef
        ? { detail: `Paired identity: ${config.pairedIdentityRef}` }
        : {}),
    });
  } else if (config.pairingStatus === "error") {
    checks.push({
      check: "openclaw_pairing_status",
      ok: false,
      severity: "error",
      summary: "OpenClaw pairing session is in an error state.",
      detail: "Try re-pairing with a fresh QR code. If the problem persists, check the OpenClaw runtime.",
    });
  } else {
    checks.push({
      check: "openclaw_pairing_status",
      ok: false,
      severity: "error",
      summary: "OpenClaw pairing has not been completed.",
      detail: "Scan the QR code with a dedicated work WhatsApp identity to complete pairing.",
    });
  }

  // Last probe
  if (config.lastProbeAt && !config.lastProbeError) {
    checks.push({
      check: "openclaw_last_probe",
      ok: true,
      severity: "info",
      summary: `Last probe succeeded at ${config.lastProbeAt}.`,
    });
  } else if (config.lastProbeError) {
    checks.push({
      check: "openclaw_last_probe",
      ok: false,
      severity: "warn",
      summary: "Last probe reported an issue.",
      detail: config.lastProbeError,
    });
  }

  return checks;
}

function checkMetaCloudApiHealth(
  config: WhatsAppConnectionConfig,
): WhatsAppDoctorCheckResult[] {
  const checks: WhatsAppDoctorCheckResult[] = [];

  // Phone number ID
  if (config.phoneNumberId) {
    checks.push({
      check: "meta_phone_number_id",
      ok: true,
      severity: "info",
      summary: "Phone Number ID is configured.",
    });
  } else {
    checks.push({
      check: "meta_phone_number_id",
      ok: false,
      severity: "error",
      summary: "Phone Number ID is not configured.",
      detail: "Obtain the Phone Number ID from the Meta Developer Dashboard.",
    });
  }

  // Access token
  if (config.accessToken) {
    checks.push({
      check: "meta_access_token",
      ok: true,
      severity: "info",
      summary: "Access token is configured.",
    });
  } else {
    checks.push({
      check: "meta_access_token",
      ok: false,
      severity: "error",
      summary: "Access token is not configured.",
      detail: "Generate a permanent access token in the Meta Developer Dashboard.",
    });
  }

  // Verify token
  if (config.verifyToken) {
    checks.push({
      check: "meta_verify_token",
      ok: true,
      severity: "info",
      summary: "Webhook verify token is configured.",
    });
  } else {
    checks.push({
      check: "meta_verify_token",
      ok: false,
      severity: "error",
      summary: "Webhook verify token is not configured.",
      detail: "Set a verify token and use the same value when registering the webhook in Meta.",
    });
  }

  // Last probe
  if (config.lastProbeAt && !config.lastProbeError) {
    checks.push({
      check: "meta_last_probe",
      ok: true,
      severity: "info",
      summary: `Last probe succeeded at ${config.lastProbeAt}.`,
    });
  } else if (config.lastProbeError) {
    checks.push({
      check: "meta_last_probe",
      ok: false,
      severity: "warn",
      summary: "Last probe reported an issue.",
      detail: config.lastProbeError,
    });
  }

  return checks;
}
