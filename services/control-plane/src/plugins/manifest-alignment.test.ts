/**
 * Manifest/Runtime Alignment Tests
 *
 * These tests enforce that every worker-pack manifest in @clawback/plugin-manifests
 * has a corresponding runtime pack in services/control-plane/src/worker-packs/,
 * and that key properties stay in sync.
 *
 * Architecture:
 * - Manifests = metadata, setup, discovery (packages/plugin-manifests)
 * - Runtime packs = execution logic, prompts, defaults (worker-packs/)
 * - Linked by workerPackId, verified here.
 */
import { describe, expect, it } from "vitest";

import {
  workerPackPlugins,
} from "@clawback/plugin-manifests";

import { followUpWorkerPack } from "../worker-packs/follow-up-pack.js";
import { proposalWorkerPack } from "../worker-packs/proposal-pack.js";
import { incidentWorkerPack } from "../worker-packs/incident-pack.js";
import { bugfixWorkerPack } from "../worker-packs/bugfix-pack.js";
import type { WorkerPackContract } from "../worker-packs/types.js";

// ---------------------------------------------------------------------------
// Build a lookup of runtime packs by ID
// ---------------------------------------------------------------------------

const runtimePacks: WorkerPackContract[] = [
  followUpWorkerPack,
  proposalWorkerPack,
  incidentWorkerPack,
  bugfixWorkerPack,
];

const runtimePackById = new Map(runtimePacks.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("manifest/runtime worker-pack alignment", () => {
  it("every manifest has a matching runtime pack with the same ID", () => {
    for (const manifest of workerPackPlugins) {
      const runtime = runtimePackById.get(manifest.workerPackId);
      expect(
        runtime,
        `Manifest "${manifest.id}" references workerPackId "${manifest.workerPackId}" but no runtime pack with that ID exists`,
      ).toBeDefined();
    }
  });

  it("every runtime pack has a matching manifest", () => {
    const manifestPackIds = new Set(workerPackPlugins.map((m) => m.workerPackId));
    for (const runtime of runtimePacks) {
      expect(
        manifestPackIds.has(runtime.id),
        `Runtime pack "${runtime.id}" has no corresponding manifest with workerPackId="${runtime.id}"`,
      ).toBe(true);
    }
  });

  for (const manifest of workerPackPlugins) {
    const runtime = runtimePackById.get(manifest.workerPackId);
    if (!runtime) continue;

    describe(`pack "${manifest.workerPackId}"`, () => {
      it("worker kind matches", () => {
        expect(runtime.manifest.workerKind).toBe(manifest.workerKind);
      });

      it("default scope matches", () => {
        expect(runtime.manifest.defaultScope).toBe(manifest.defaultScope);
      });

      it("supported input route kinds match", () => {
        const runtimeRouteKinds = runtime.install.supportedInputRoutes
          .map((r) => r.kind)
          .sort();
        const manifestRouteKinds = [...manifest.supportedInputRouteKinds].sort();
        expect(runtimeRouteKinds).toEqual(manifestRouteKinds);
      });

      it("action kinds match", () => {
        const runtimeActionKinds = runtime.install.actionCapabilities
          .map((a) => a.kind)
          .sort();
        const manifestActionKinds = [...manifest.actionKinds].sort();
        expect(runtimeActionKinds).toEqual(manifestActionKinds);
      });

      it("output kinds match", () => {
        const runtimeOutputKinds = [...runtime.manifest.outputKinds].sort();
        const manifestOutputKinds = [...manifest.outputKinds].sort();
        expect(runtimeOutputKinds).toEqual(manifestOutputKinds);
      });

      it("embeds the referenced manifest on the pack contract", () => {
        expect(runtime.manifest.workerPackId).toBe(manifest.workerPackId);
        expect(runtime.id).toBe(manifest.workerPackId);
      });
    });
  }
});
