import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const smtpRelayProvider: ConnectionProviderPluginManifest = {
  id: "provider.smtp-relay",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "SMTP Relay",
  description: "Reviewed-send destination for outbound email delivery.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 20,
  provider: "smtp_relay",
  accessModes: ["write_capable"],
  capabilities: ["send_email"],
  compatibleInputRouteKinds: [],
  setupMode: "operator_driven",
  secretKeys: [
    "CLAWBACK_SMTP_HOST",
    "CLAWBACK_SMTP_PORT",
    "CLAWBACK_SMTP_USERNAME",
    "CLAWBACK_SMTP_PASSWORD",
    "CLAWBACK_SMTP_FROM_ADDRESS",
  ],
  setupHelp:
    "Configure your SMTP relay credentials. Required: CLAWBACK_SMTP_HOST, CLAWBACK_SMTP_FROM_ADDRESS. " +
    "Optional: CLAWBACK_SMTP_PORT (default 587), CLAWBACK_SMTP_USERNAME, CLAWBACK_SMTP_PASSWORD.",
  validate:
    "Checks that CLAWBACK_SMTP_HOST and CLAWBACK_SMTP_FROM_ADDRESS are set. Verifies port is a valid number.",
  probe:
    "Opens a TCP connection to the SMTP host:port and checks for a 220 greeting. Does not send any email.",
  status:
    "Reports whether the SMTP relay is reachable, the configured from-address, and last successful send timestamp.",
  recoveryHints: [
    { symptom: "Connection timeout", fix: "Verify SMTP host is reachable and port is correct. Check firewall rules." },
    { symptom: "Authentication failed", fix: "Check SMTP username and password. Some providers require app-specific passwords." },
    { symptom: "Emails rejected as spam", fix: "Verify SPF/DKIM/DMARC records for the from-address domain." },
  ],
  setupSteps: [
    {
      id: "smtp-configure",
      title: "Configure SMTP relay",
      description: "Set the relay environment variables and verify the outbound reviewed-send path.",
      ctaLabel: "Configure SMTP relay",
      operatorOnly: true,
      target: { surface: "connections", focus: "smtp" },
    },
  ],
};
