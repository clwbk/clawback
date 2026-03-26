/**
 * WhatsApp integration types following the frozen provider lifecycle contract.
 *
 * See: docs/adr/0006-plugin-operator-lifecycle-and-doctor.md
 */

// ---------------------------------------------------------------------------
// Transport mode
// ---------------------------------------------------------------------------

export type WhatsAppTransportMode = "openclaw_pairing" | "meta_cloud_api";

// ---------------------------------------------------------------------------
// Config stored in connection.configJson
// ---------------------------------------------------------------------------

export type WhatsAppConnectionConfig = {
  /** Which transport adapter is active. Defaults to "meta_cloud_api" for backward compat. */
  transportMode: WhatsAppTransportMode;

  // -- Meta Cloud API fields (used when transportMode === "meta_cloud_api") --
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  /** Display name of the WhatsApp business phone number. */
  validatedDisplayName: string | null;

  // -- OpenClaw Pairing fields (used when transportMode === "openclaw_pairing") --
  /** Current pairing status for the OpenClaw session. */
  pairingStatus: "unpaired" | "paired" | "error" | null;
  /** Reference to the paired OpenClaw identity (opaque string from OpenClaw). */
  pairedIdentityRef: string | null;

  // -- Shared fields --
  lastProbeAt: string | null;
  lastProbeError: string | null;
};

// ---------------------------------------------------------------------------
// Lifecycle types (operator contract)
// ---------------------------------------------------------------------------

export type WhatsAppOperationalState =
  | "setup_required"
  | "configured"
  | "ready"
  | "degraded"
  | "error";

export type WhatsAppDiagnosticIssue = {
  severity: "info" | "warn" | "error";
  code: string;
  summary: string;
  detail?: string;
};

export type WhatsAppValidationResult = {
  ok: boolean;
  issues: WhatsAppDiagnosticIssue[];
};

export type WhatsAppProbeResult = {
  ok: boolean;
  checkedAt: string;
  summary: string;
  issues: WhatsAppDiagnosticIssue[];
  displayName?: string | null | undefined;
};

export type WhatsAppOperationalStatus = {
  state: WhatsAppOperationalState;
  summary: string;
  lastProbeAt: string | null;
  blockingIssueCodes: string[];
};

export type WhatsAppRecoveryHint = {
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

export type WhatsAppSetupInput = {
  phone_number_id: string;
  access_token: string;
  verify_token: string;
};

// ---------------------------------------------------------------------------
// Status response (returned by the status endpoint)
// ---------------------------------------------------------------------------

export type WhatsAppStatusResponse = {
  connection_id: string;
  connection_status: string;
  transport_mode: WhatsAppTransportMode;
  pairing_status: WhatsAppConnectionConfig["pairingStatus"];
  paired_identity_ref: string | null;
  operational: WhatsAppOperationalStatus;
  probe: WhatsAppProbeResult | null;
  recovery_hints: WhatsAppRecoveryHint[];
};

export type WhatsAppPairingStartResponse = {
  pairing: {
    qr_data_url: string | null;
    message: string;
    account_id: string | null;
  };
  status: WhatsAppStatusResponse;
};

export type WhatsAppPairingWaitResponse = {
  pairing: {
    connected: boolean;
    message: string;
    account_id: string | null;
  };
  status: WhatsAppStatusResponse;
};

// ---------------------------------------------------------------------------
// WhatsApp Cloud API types
// ---------------------------------------------------------------------------

export type WhatsAppWebhookVerification = {
  "hub.mode": string;
  "hub.verify_token": string;
  "hub.challenge": string;
};

export type WhatsAppWebhookPayload = {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: {
        messaging_product: string;
        metadata?: {
          display_phone_number: string;
          phone_number_id: string;
        };
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          interactive?: {
            type: string;
            button_reply?: {
              id: string;
              title: string;
            };
          };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
};

export type WhatsAppSendMessagePayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: {
    type: "button";
    header?: { type: "text"; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      buttons: Array<{
        type: "reply";
        reply: { id: string; title: string };
      }>;
    };
  };
};
