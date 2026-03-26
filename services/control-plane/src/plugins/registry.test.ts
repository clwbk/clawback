import { describe, expect, it } from "vitest";

import {
  actionExecutorPlugins,
  connectionProviderPlugins,
  getConnectionProviderPlugin,
  getWorkerPackPlugin,
  ingressAdapterPlugins,
  listActionExecutorPlugins,
  listConnectionProviderPlugins,
  listIngressAdapterPlugins,
  listWorkerPackPlugins,
  workerPackPlugins,
} from "./registry.js";

describe("plugin registry", () => {
  it("exposes first-party plugin manifests by class", () => {
    expect(listConnectionProviderPlugins()).toHaveLength(connectionProviderPlugins.length);
    expect(listIngressAdapterPlugins()).toHaveLength(ingressAdapterPlugins.length);
    expect(listActionExecutorPlugins()).toHaveLength(actionExecutorPlugins.length);
    expect(listWorkerPackPlugins()).toHaveLength(workerPackPlugins.length);
  });

  it("can look up representative provider and worker-pack manifests", () => {
    expect(getConnectionProviderPlugin("provider.gmail.read-only")?.provider).toBe("gmail");
    expect(getWorkerPackPlugin("follow_up_v1")?.workerKind).toBe("follow_up");
  });

  it("keeps plugin ids unique within each registry", () => {
    const registries = [
      connectionProviderPlugins,
      ingressAdapterPlugins,
      actionExecutorPlugins,
      workerPackPlugins,
    ];

    for (const registry of registries) {
      const ids = registry.map((plugin) => plugin.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
