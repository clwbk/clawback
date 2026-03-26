import type { IngressAdapterPluginManifest } from "@clawback/plugin-sdk";

export const postmarkInboundAdapter: IngressAdapterPluginManifest = {
  id: "ingress.postmark.forward-email",
  kind: "ingress_adapter",
  version: "1.0.0",
  displayName: "Postmark Inbound Email",
  description: "Normalizes Postmark inbound webhooks into forwarded-email source events.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 20,
  adapterKind: "provider_inbound",
  normalizedInputRouteKinds: ["forward_email"],
  authentication: "shared_token",
  provider: "postmark",
  setupHelp:
    "Configure Postmark to forward inbound emails to the Clawback forwarded-email endpoint. " +
    "In Postmark, set the inbound webhook URL to your Clawback instance's /api/ingress/postmark endpoint. " +
    "Authentication uses a shared token set via CLAWBACK_POSTMARK_INBOUND_TOKEN.",
  validate:
    "Checks that the inbound token is configured and the ingress endpoint is registered.",
  probe:
    "Verifies the ingress endpoint accepts a test POST with the configured authentication token.",
  status:
    "Reports whether the Postmark inbound endpoint is active, last email received timestamp, and email count.",
  recoveryHints: [
    { symptom: "Webhook returns 401", fix: "The inbound token does not match. Verify CLAWBACK_POSTMARK_INBOUND_TOKEN matches the webhook configuration." },
    { symptom: "Emails not arriving in Clawback", fix: "Check Postmark's inbound webhook logs for delivery failures. Verify the webhook URL is correct and publicly accessible." },
    { symptom: "Email body is empty", fix: "Ensure Postmark is sending the full MIME body. Check the inbound stream's 'Include raw email' setting." },
  ],
  setupSteps: [
    {
      id: "postmark-webhook",
      title: "Point Postmark at Clawback",
      description: "Configure the Postmark inbound webhook to post to the Clawback forwarded-email endpoint.",
      ctaLabel: "Review operator guide",
      operatorOnly: true,
      docsHref: "/docs/admin-guide",
      target: { surface: "setup" },
    },
  ],
};
