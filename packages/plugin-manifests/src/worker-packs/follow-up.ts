import type { WorkerPackPluginManifest } from "@clawback/plugin-sdk";

export const followUpWorkerPackManifest: WorkerPackPluginManifest = {
  id: "worker-pack.follow-up",
  kind: "worker_pack",
  version: "1.0.0",
  displayName: "Client Follow-Up",
  description: "Drafts follow-up emails from forwarded threads and watched inbox activity.",
  owner: "first_party",
  stability: "pilot",
  category: "email",
  priority: 10,
  workerPackId: "follow_up_v1",
  workerKind: "follow_up",
  defaultScope: "shared",
  supportedInputRouteKinds: ["chat", "forward_email", "watched_inbox"],
  outputKinds: ["email_draft", "meeting_recap"],
  actionKinds: ["send_email", "save_work"],
  requiredConnectionProviders: ["smtp_relay"],
  optionalConnectionProviders: ["gmail", "calendar", "drive"],
  setupHelp:
    "Install the Follow-Up worker, assign team members, and connect an SMTP relay for reviewed sends. " +
    "Optional: connect Gmail read-only for watched inbox, Calendar for meeting context, Drive for document context.",
  validate:
    "Checks that at least one input route is configured and SMTP relay is available for reviewed sends.",
  probe:
    "Verifies the worker is installed, has assigned members, and at least one input route is active.",
  status:
    "Reports worker status, number of assigned members, active input routes, connected systems, and pending work items.",
  recoveryHints: [
    { symptom: "No input routes active", fix: "Configure at least one input route (chat, forward email, or watched inbox) for the worker." },
    { symptom: "SMTP relay not connected", fix: "The worker needs SMTP relay for reviewed email sends. Configure the SMTP relay connection." },
    { symptom: "Worker shows no activity", fix: "Check that team members are assigned and at least one input route is receiving messages." },
  ],
  setupSteps: [
    {
      id: "install-follow-up",
      title: "Install Client Follow-Up",
      description: "Install the Follow-Up worker and assign members, assignees, and reviewers.",
      ctaLabel: "Install worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "follow_up" },
    },
  ],
};
