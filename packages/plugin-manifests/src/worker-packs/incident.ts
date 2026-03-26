import type { WorkerPackPluginManifest } from "@clawback/plugin-sdk";

export const incidentWorkerPackManifest: WorkerPackPluginManifest = {
  id: "worker-pack.incident",
  kind: "worker_pack",
  version: "1.0.0",
  displayName: "Incident",
  description: "Triages incidents, coordinates response, and tracks resolution.",
  owner: "first_party",
  stability: "pilot",
  category: "project",
  priority: 20,
  workerPackId: "incident_v1",
  workerKind: "incident",
  defaultScope: "shared",
  supportedInputRouteKinds: ["chat"],
  outputKinds: ["ticket_draft", "action_plan"],
  actionKinds: ["create_ticket", "save_work"],
  requiredConnectionProviders: [],
  optionalConnectionProviders: [],
  setupHelp:
    "Install the Incident worker and assign team members for triage and coordination. " +
    "The worker accepts chat input to triage incidents, coordinate response, and track resolution.",
  validate:
    "Checks that the worker is installed and has at least one assigned member.",
  probe:
    "Verifies the worker is active and at least one input route is configured.",
  status:
    "Reports worker status, number of assigned members, active incidents, and resolution rate.",
  recoveryHints: [
    { symptom: "No members assigned", fix: "Assign at least one team member to the Incident worker in the worker settings." },
    { symptom: "Worker shows no activity", fix: "Send a chat message to the worker to start an incident triage." },
  ],
  setupSteps: [
    {
      id: "install-incident",
      title: "Install Incident worker",
      description: "Install the Incident worker and assign members, assignees, and reviewers.",
      ctaLabel: "Install worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "incident" },
    },
  ],
};
