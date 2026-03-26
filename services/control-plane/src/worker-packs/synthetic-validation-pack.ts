import { syntheticValidationWorkerPackManifest } from "@clawback/plugin-manifests";

import { defineWorkerPackContract } from "./types.js";

/**
 * Synthetic Validation worker pack.
 *
 * This pack exists only to prove that a non-runtime, install-only pack can be
 * defined against the frozen Phase 3 contract without inheriting Follow-Up
 * behavior. It is intentionally not part of product discovery surfaces.
 */
export const syntheticValidationWorkerPack = defineWorkerPackContract({
  manifest: syntheticValidationWorkerPackManifest,
  install: {
    summary:
      "Contract-testing worker used to validate manifest/runtime alignment.",
    systemPrompt:
      "You are a synthetic validation worker used only for contract testing.",
    supportedInputRoutes: [
      {
        kind: "chat",
        label: "Chat",
        description: "Chat input for contract testing.",
      },
    ],
    actionCapabilities: [
      {
        kind: "save_work",
        defaultBoundaryMode: "auto",
      },
    ],
  },
});
