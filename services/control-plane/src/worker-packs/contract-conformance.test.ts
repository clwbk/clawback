/**
 * Phase 3 Worker-Pack Contract Conformance Tests
 *
 * Strengthens first-party worker-pack conformance against the frozen
 * Phase 3 contract surface. Covers structural invariants, manifest/install
 * alignment, cross-pack uniqueness, and execution-module presence.
 */
import { describe, expect, it } from "vitest";

import { workerPackPlugins } from "@clawback/plugin-manifests";

import { followUpWorkerPack } from "./follow-up-pack.js";
import { proposalWorkerPack } from "./proposal-pack.js";
import { incidentWorkerPack } from "./incident-pack.js";
import { bugfixWorkerPack } from "./bugfix-pack.js";
import type { WorkerPackDefinition } from "./types.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const allPacks: WorkerPackDefinition[] = [
  followUpWorkerPack,
  proposalWorkerPack,
  incidentWorkerPack,
  bugfixWorkerPack,
];

const packById = new Map(allPacks.map((p) => [p.id, p]));
const manifestByPackId = new Map(
  workerPackPlugins.map((m) => [m.workerPackId, m]),
);

// ---------------------------------------------------------------------------
// A — Contract structural conformance
// ---------------------------------------------------------------------------

describe("contract structural conformance", () => {
  for (const pack of allPacks) {
    describe(`pack "${pack.id}"`, () => {
      it("has a non-empty systemPrompt", () => {
        expect(pack.systemPrompt.trim().length).toBeGreaterThan(0);
      });

      it("has at least one supportedInputRoute", () => {
        expect(pack.supportedInputRoutes.length).toBeGreaterThanOrEqual(1);
      });

      it("has at least one actionCapability", () => {
        expect(pack.actionCapabilities.length).toBeGreaterThanOrEqual(1);
      });

      it("install summary is non-empty", () => {
        expect(pack.summary.trim().length).toBeGreaterThan(0);
      });

      it("manifest workerPackId matches contract id", () => {
        const manifest = manifestByPackId.get(pack.id);
        expect(
          manifest,
          `no manifest found for pack id "${pack.id}"`,
        ).toBeDefined();
        expect(manifest!.workerPackId).toBe(pack.id);
      });

      it("manifest workerKind matches contract kind", () => {
        const manifest = manifestByPackId.get(pack.id);
        expect(manifest).toBeDefined();
        expect(manifest!.workerKind).toBe(pack.kind);
      });

      it("manifest defaultScope matches contract defaultScope", () => {
        const manifest = manifestByPackId.get(pack.id);
        expect(manifest).toBeDefined();
        expect(manifest!.defaultScope).toBe(pack.defaultScope);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// B — Manifest/install compatibility fields
// ---------------------------------------------------------------------------

describe("manifest/install compatibility fields", () => {
  for (const pack of allPacks) {
    const manifest = manifestByPackId.get(pack.id);
    if (!manifest) continue;

    describe(`pack "${pack.id}"`, () => {
      it("input route kinds match between manifest and install", () => {
        const installKinds = pack.supportedInputRoutes
          .map((r) => r.kind)
          .sort();
        const manifestKinds = [...manifest.supportedInputRouteKinds].sort();
        expect(installKinds).toEqual(manifestKinds);
      });

      it("action kinds match between manifest and install", () => {
        const installKinds = pack.actionCapabilities
          .map((a) => a.kind)
          .sort();
        const manifestKinds = [...manifest.actionKinds].sort();
        expect(installKinds).toEqual(manifestKinds);
      });

      it("output kinds match between manifest and install", () => {
        const installKinds = [...pack.outputKinds].sort();
        const manifestKinds = [...manifest.outputKinds].sort();
        expect(installKinds).toEqual(manifestKinds);
      });

      it("has all expected compatibility fields on the contract", () => {
        expect(pack).toHaveProperty("id");
        expect(pack).toHaveProperty("name");
        expect(pack).toHaveProperty("kind");
        expect(pack).toHaveProperty("defaultScope");
        expect(pack).toHaveProperty("summary");
        expect(pack).toHaveProperty("systemPrompt");
        expect(pack).toHaveProperty("supportedInputRoutes");
        expect(pack).toHaveProperty("outputKinds");
        expect(pack).toHaveProperty("actionCapabilities");
      });
    });
  }
});

// ---------------------------------------------------------------------------
// C — Execution module presence (runtime declaration conformance)
// ---------------------------------------------------------------------------

describe("execution module conformance", () => {
  it("follow-up pack has an execution module with progression types", async () => {
    // The follow-up pack is the only pack with a native execution pipeline.
    // Importing the module proves the execution surface exists and exports
    // the expected function and types.
    const mod = await import("./follow-up-execution.js");
    expect(typeof mod.runFollowUpExecution).toBe("function");
    expect(typeof mod.buildFollowUpExecutionStateForArtifact).toBe("function");
  });

  it("proposal pack does NOT have an execution module", async () => {
    // Proposal, incident, and bugfix are declarative packs with no
    // native execution pipeline.
    try {
      await import("./proposal-execution.js" as string);
      // If this succeeds, someone added an execution module — fail loudly.
      expect.fail("proposal-execution module should not exist");
    } catch {
      // expected: module not found
    }
  });

  it("incident pack does NOT have an execution module", async () => {
    try {
      await import("./incident-execution.js" as string);
      expect.fail("incident-execution module should not exist");
    } catch {
      // expected: module not found
    }
  });

  it("bugfix pack does NOT have an execution module", async () => {
    try {
      await import("./bugfix-execution.js" as string);
      expect.fail("bugfix-execution module should not exist");
    } catch {
      // expected: module not found
    }
  });
});

// ---------------------------------------------------------------------------
// D — Cross-pack uniqueness
// ---------------------------------------------------------------------------

describe("cross-pack uniqueness", () => {
  it("all runtime pack IDs are unique", () => {
    const ids = allPacks.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all manifest IDs are unique", () => {
    const ids = workerPackPlugins.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all manifest workerPackIds are unique", () => {
    const wpIds = workerPackPlugins.map((m) => m.workerPackId);
    expect(new Set(wpIds).size).toBe(wpIds.length);
  });

  it("all pack worker kinds are unique", () => {
    const kinds = allPacks.map((p) => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("every runtime pack has exactly one manifest", () => {
    for (const pack of allPacks) {
      const matchingManifests = workerPackPlugins.filter(
        (m) => m.workerPackId === pack.id,
      );
      expect(
        matchingManifests.length,
        `pack "${pack.id}" should have exactly 1 manifest, found ${matchingManifests.length}`,
      ).toBe(1);
    }
  });

  it("every manifest has exactly one runtime pack", () => {
    for (const manifest of workerPackPlugins) {
      const matchingPacks = allPacks.filter(
        (p) => p.id === manifest.workerPackId,
      );
      expect(
        matchingPacks.length,
        `manifest "${manifest.id}" should have exactly 1 runtime pack, found ${matchingPacks.length}`,
      ).toBe(1);
    }
  });
});
