import type { WorkerPackPluginManifest } from "@clawback/plugin-sdk";

export const syntheticValidationWorkerPackManifest: WorkerPackPluginManifest = {
  id: "worker-pack.synthetic-validation",
  kind: "worker_pack",
  version: "1.0.0",
  displayName: "Synthetic Validation",
  description:
    "Contract-testing worker pack used to validate manifest/runtime alignment without entering product discovery surfaces.",
  owner: "first_party",
  stability: "experimental",
  category: "other",
  priority: 99,
  workerPackId: "synthetic_validation_v1",
  workerKind: "bugfix",
  defaultScope: "shared",
  supportedInputRouteKinds: ["chat"],
  outputKinds: ["ticket_draft"],
  actionKinds: ["save_work"],
  requiredConnectionProviders: [],
  optionalConnectionProviders: [],
  setupSteps: [
    {
      id: "install-synthetic-validation",
      title: "Install Synthetic Validation worker",
      description:
        "Install the synthetic validation worker for contract testing.",
      ctaLabel: "Install worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "bugfix" },
    },
  ],
};
