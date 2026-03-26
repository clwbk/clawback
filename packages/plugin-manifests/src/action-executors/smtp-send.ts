import type { ActionExecutorPluginManifest } from "@clawback/plugin-sdk";

export const smtpReviewedSendExecutor: ActionExecutorPluginManifest = {
  id: "action.smtp-reviewed-send",
  kind: "action_executor",
  version: "1.0.0",
  displayName: "SMTP Reviewed Send",
  description: "Executes governed reviewed email sends through the configured SMTP relay.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 10,
  actionKind: "send_email",
  destinationProviders: ["smtp_relay"],
  defaultBoundaryMode: "ask_me",
  executionModel: "governed_async",
  secretKeys: [
    "CLAWBACK_SMTP_HOST",
    "CLAWBACK_SMTP_PORT",
    "CLAWBACK_SMTP_USERNAME",
    "CLAWBACK_SMTP_PASSWORD",
    "CLAWBACK_SMTP_FROM_ADDRESS",
  ],
  setupHelp:
    "Requires a configured SMTP relay connection. The executor uses the same credentials as the SMTP relay provider. " +
    "All sends are governed — the worker proposes, a human reviews, and only approved emails are dispatched.",
  validate:
    "Checks that the SMTP relay connection is active and all required credentials are available.",
  probe:
    "Verifies SMTP relay reachability by opening a TCP connection and checking for a 220 greeting.",
  status:
    "Reports SMTP relay connection status, configured from-address, and count of emails sent/pending/failed.",
  recoveryHints: [
    { symptom: "SMTP relay not configured", fix: "Set up the SMTP relay connection provider first. This executor depends on it." },
    { symptom: "Email rejected by relay", fix: "Check the SMTP relay logs. Common causes: invalid from-address, missing SPF record, or relay policy rejection." },
    { symptom: "Timeout during send", fix: "The SMTP relay may be overloaded or unreachable. Verify host:port and check network connectivity." },
  ],
  setupSteps: [
    {
      id: "smtp-reviewed-send",
      title: "Verify reviewed send path",
      description: "Confirm SMTP relay configuration before approving outbound email in the product.",
      ctaLabel: "Configure SMTP relay",
      operatorOnly: true,
      target: { surface: "connections", focus: "smtp" },
    },
  ],
};
