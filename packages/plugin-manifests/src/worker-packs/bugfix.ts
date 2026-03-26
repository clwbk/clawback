import type { WorkerPackPluginManifest } from "@clawback/plugin-sdk";

export const bugfixWorkerPackManifest: WorkerPackPluginManifest = {
  id: "worker-pack.bugfix",
  kind: "worker_pack",
  version: "1.0.0",
  displayName: "Bugfix",
  description: "Investigates bug reports, documents findings, and tracks fixes.",
  owner: "first_party",
  stability: "pilot",
  category: "project",
  priority: 20,
  workerPackId: "bugfix_v1",
  workerKind: "bugfix",
  defaultScope: "shared",
  supportedInputRouteKinds: ["chat"],
  outputKinds: ["ticket_draft", "action_plan"],
  actionKinds: ["create_ticket", "save_work"],
  requiredConnectionProviders: [],
  optionalConnectionProviders: [],
  setupHelp:
    "Install the Bugfix worker and assign team members for bug investigation. " +
    "The worker accepts chat input to investigate bug reports, document findings, and track fixes.",
  validate:
    "Checks that the worker is installed and has at least one assigned member.",
  probe:
    "Verifies the worker is active and at least one input route is configured.",
  status:
    "Reports worker status, number of assigned members, active bug investigations, and fix rate.",
  recoveryHints: [
    { symptom: "No members assigned", fix: "Assign at least one team member to the Bugfix worker in the worker settings." },
    { symptom: "Worker shows no activity", fix: "Send a chat message to the worker to start a bug investigation." },
  ],
  setupSteps: [
    {
      id: "install-bugfix",
      title: "Install Bugfix worker",
      description: "Install the Bugfix worker and assign members, assignees, and reviewers.",
      ctaLabel: "Install worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "bugfix" },
    },
  ],
};
