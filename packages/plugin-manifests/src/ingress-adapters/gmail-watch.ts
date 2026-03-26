import type { IngressAdapterPluginManifest } from "@clawback/plugin-sdk";

export const gmailWatchHookAdapter: IngressAdapterPluginManifest = {
  id: "ingress.gmail.watch-hook",
  kind: "ingress_adapter",
  version: "1.0.0",
  displayName: "Gmail Watch Hook",
  description: "Accepts Gmail watch notifications from gog/OpenClaw and normalizes them into watched inbox events.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 10,
  adapterKind: "watch_hook",
  normalizedInputRouteKinds: ["watched_inbox"],
  authentication: "shared_token",
  provider: "gmail",
  setupHelp:
    "Configure gog/OpenClaw to post Gmail watch notifications to the Clawback ingress endpoint. " +
    "The endpoint expects a shared_token for authentication. Set CLAWBACK_GMAIL_WATCH_TOKEN in environment.",
  validate:
    "Checks that the shared watch token is configured and matches between OpenClaw and Clawback.",
  probe:
    "Verifies the ingress endpoint is reachable and accepts a test ping with the configured token.",
  status:
    "Reports whether the watch hook endpoint is active, last notification received timestamp, and notification count.",
  recoveryHints: [
    { symptom: "401 on webhook delivery", fix: "The shared token does not match between OpenClaw and Clawback. Verify CLAWBACK_GMAIL_WATCH_TOKEN." },
    { symptom: "No notifications arriving", fix: "Check that the Gmail push subscription is active and OpenClaw is running and configured to forward to Clawback." },
  ],
  setupSteps: [
    {
      id: "gmail-watch-hook",
      title: "Point Gmail watcher at Clawback",
      description: "Configure gog/OpenClaw to post Gmail watch notifications into Clawback.",
      ctaLabel: "Review operator guide",
      operatorOnly: true,
      docsHref: "/docs/admin-guide",
      target: { surface: "setup" },
    },
  ],
};
