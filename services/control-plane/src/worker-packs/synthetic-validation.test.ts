import { describe, expect, it } from "vitest";

import {
  syntheticValidationWorkerPackManifest,
  workerPackPlugins,
} from "@clawback/plugin-manifests";

import {
  bugfixWorkerPack,
  firstPartyWorkerPacks,
  getWorkerPackByKind,
  syntheticValidationWorkerPack,
} from "./index.js";

describe("synthetic validation worker pack", () => {
  it("builds on the frozen Phase 3 contract", () => {
    expect(syntheticValidationWorkerPack.id).toBe("synthetic_validation_v1");
    expect(syntheticValidationWorkerPack.name).toBe("Synthetic Validation");
    expect(syntheticValidationWorkerPack.systemPrompt).toContain(
      "synthetic validation worker",
    );
  });

  it("matches its manifest workerPackId and worker kind", () => {
    expect(syntheticValidationWorkerPack.id).toBe(
      syntheticValidationWorkerPackManifest.workerPackId,
    );
    expect(syntheticValidationWorkerPack.kind).toBe(
      syntheticValidationWorkerPackManifest.workerKind,
    );
  });

  it("matches manifest default scope", () => {
    expect(syntheticValidationWorkerPack.defaultScope).toBe(
      syntheticValidationWorkerPackManifest.defaultScope,
    );
  });

  it("matches manifest supported input route kinds", () => {
    expect(
      syntheticValidationWorkerPack.supportedInputRoutes.map((route) => route.kind).sort(),
    ).toEqual([...syntheticValidationWorkerPackManifest.supportedInputRouteKinds].sort());
  });

  it("matches manifest action kinds", () => {
    expect(
      syntheticValidationWorkerPack.actionCapabilities.map((action) => action.kind).sort(),
    ).toEqual([...syntheticValidationWorkerPackManifest.actionKinds].sort());
  });

  it("matches manifest output kinds", () => {
    expect([...syntheticValidationWorkerPack.outputKinds].sort()).toEqual(
      [...syntheticValidationWorkerPackManifest.outputKinds].sort(),
    );
  });

  it("stays install-only", () => {
    expect(syntheticValidationWorkerPack.runtime).toBeUndefined();
  });

  it("remains experimental", () => {
    expect(syntheticValidationWorkerPackManifest.stability).toBe("experimental");
    expect(syntheticValidationWorkerPackManifest.category).toBe("other");
    expect(syntheticValidationWorkerPackManifest.priority).toBe(99);
  });

  it("does not enter first-party product discovery arrays", () => {
    expect(firstPartyWorkerPacks.map((pack) => pack.id)).not.toContain(
      syntheticValidationWorkerPack.id,
    );
    expect(workerPackPlugins.map((manifest) => manifest.workerPackId)).not.toContain(
      syntheticValidationWorkerPack.id,
    );
  });

  it("does not disturb worker-kind lookup for real product packs", () => {
    expect(getWorkerPackByKind("bugfix")?.id).toBe(bugfixWorkerPack.id);
  });
});
