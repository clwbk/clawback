import type { WorkerPackPluginManifest } from "@clawback/plugin-sdk";

export const proposalWorkerPackManifest: WorkerPackPluginManifest = {
  id: "worker-pack.proposal",
  kind: "worker_pack",
  version: "1.0.0",
  displayName: "Proposal",
  description: "Drafts proposals, action plans, and scoped deliverables from chat and uploads.",
  owner: "first_party",
  stability: "pilot",
  category: "project",
  priority: 10,
  workerPackId: "proposal_v1",
  workerKind: "proposal",
  defaultScope: "shared",
  supportedInputRouteKinds: ["chat", "upload"],
  outputKinds: ["proposal_draft", "action_plan"],
  actionKinds: ["save_work"],
  requiredConnectionProviders: [],
  optionalConnectionProviders: ["drive"],
  setupHelp:
    "Install the Proposal worker and assign team members. Optional: connect Google Drive for document context. " +
    "The worker accepts chat and upload inputs to draft proposals, action plans, and scoped deliverables.",
  validate:
    "Checks that the worker is installed and has at least one assigned member.",
  probe:
    "Verifies the worker is active and at least one input route (chat or upload) is configured.",
  status:
    "Reports worker status, number of assigned members, active input routes, and pending proposals.",
  recoveryHints: [
    { symptom: "No members assigned", fix: "Assign at least one team member to the Proposal worker in the worker settings." },
    { symptom: "Drive documents not available", fix: "Connect Google Drive and attach it to this worker for document context." },
  ],
  setupSteps: [
    {
      id: "install-proposal",
      title: "Install Proposal worker",
      description: "Install the Proposal worker and attach knowledge sources such as shared drive.",
      ctaLabel: "Install worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "proposal" },
    },
  ],
};
