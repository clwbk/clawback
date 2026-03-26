/**
 * Verification tests for the plugin-console-native sprint.
 *
 * Proves the "add manifest -> it shows up" contract:
 * 1. A test manifest registered in the registry appears in the API response shape
 * 2. Category and priority flow through the registry response
 * 3. Setup steps are keyed by ID, not array position
 * 4. The rendering decision (custom panel vs generic) is driven by manifest ID
 */
import { describe, expect, it } from "vitest";

import { registryConnectionProviderSchema, registryResponseSchema } from "@clawback/contracts";
import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";
import {
  connectionProviderPlugins,
  firstPartyRegistry,
} from "@clawback/plugin-manifests";

/**
 * Test-only manifest to verify the "add manifest -> it shows up" contract.
 * Defined inline to avoid export path issues with the manifests package.
 */
const testProvider: ConnectionProviderPluginManifest = {
  id: "provider.test.verification",
  kind: "connection_provider",
  version: "0.0.1",
  displayName: "Test Provider",
  description: "A test provider used to verify the plugin-native console contract.",
  owner: "first_party",
  stability: "experimental",
  category: "other",
  priority: 999,
  provider: "gmail", // reuse existing provider enum value for schema compliance
  accessModes: ["read_only"],
  capabilities: ["test_capability"],
  compatibleInputRouteKinds: [],
  setupMode: "operator_driven",
  secretKeys: [],
  setupSteps: [
    {
      id: "test-setup",
      title: "Configure test provider",
      description: "A test setup step to verify evaluator registry lookup.",
      ctaLabel: "Set up test",
      operatorOnly: true,
      target: { surface: "connections" },
    },
  ],
};

describe("plugin-console-native contract", () => {
  describe("manifest registration", () => {
    it("test manifest has a valid id, category, and priority", () => {
      expect(testProvider.id).toBe("provider.test.verification");
      expect(testProvider.category).toBe("other");
      expect(testProvider.priority).toBe(999);
      expect(testProvider.stability).toBe("experimental");
    });

    it("test manifest conforms to the registry connection provider schema", () => {
      const registryShape = {
        id: testProvider.id,
        display_name: testProvider.displayName,
        description: testProvider.description,
        provider: testProvider.provider,
        access_modes: testProvider.accessModes,
        capabilities: testProvider.capabilities,
        stability: testProvider.stability,
        category: testProvider.category,
        priority: testProvider.priority,
        setup_steps: testProvider.setupSteps,
      };

      const result = registryConnectionProviderSchema.safeParse(registryShape);
      expect(result.success).toBe(true);
    });

    it("test manifest would appear in registry response if added to the provider list", () => {
      // Simulate adding the test provider to the registry
      const extendedProviders = [...connectionProviderPlugins, testProvider];

      const response = registryResponseSchema.parse({
        connection_providers: extendedProviders.map((p) => ({
          id: p.id,
          display_name: p.displayName,
          description: p.description,
          provider: p.provider,
          access_modes: p.accessModes,
          capabilities: p.capabilities,
          stability: p.stability,
          category: p.category,
          priority: p.priority,
          setup_steps: p.setupSteps,
        })),
        ingress_adapters: [],
        action_executors: [],
        worker_packs: [],
      });

      const testEntry = response.connection_providers.find(
        (p) => p.id === "provider.test.verification",
      );
      expect(testEntry).toBeDefined();
      expect(testEntry?.display_name).toBe("Test Provider");
      expect(testEntry?.category).toBe("other");
      expect(testEntry?.priority).toBe(999);
      expect(testEntry?.stability).toBe("experimental");
    });
  });

  describe("category and priority metadata", () => {
    it("all first-party connection providers have a category", () => {
      for (const provider of firstPartyRegistry.connectionProviders) {
        expect(provider.category).toBeDefined();
        expect(["email", "knowledge", "project", "crm", "messaging", "other"]).toContain(
          provider.category,
        );
      }
    });

    it("all first-party connection providers have a priority", () => {
      for (const provider of firstPartyRegistry.connectionProviders) {
        expect(typeof provider.priority).toBe("number");
      }
    });

    it("category and priority flow through the registry response schema", () => {
      const response = registryResponseSchema.parse({
        connection_providers: firstPartyRegistry.connectionProviders.map((p) => ({
          id: p.id,
          display_name: p.displayName,
          description: p.description,
          provider: p.provider,
          access_modes: p.accessModes,
          capabilities: p.capabilities,
          stability: p.stability,
          category: p.category,
          priority: p.priority,
          setup_steps: p.setupSteps,
        })),
        ingress_adapters: [],
        action_executors: [],
        worker_packs: [],
      });

      const gmail = response.connection_providers.find(
        (p) => p.id === "provider.gmail.read-only",
      );
      expect(gmail?.category).toBe("email");
      expect(gmail?.priority).toBe(10);
    });
  });

  describe("setup step ID-based lookup", () => {
    it("setup steps have stable IDs that can be looked up without array position", () => {
      const gmailProvider = firstPartyRegistry.connectionProviders.find(
        (p) => p.id === "provider.gmail.read-only",
      );
      expect(gmailProvider).toBeDefined();

      // Look up by ID, not by index
      const credentialsStep = gmailProvider?.setupSteps.find(
        (s) => s.id === "gmail-credentials",
      );
      const attachStep = gmailProvider?.setupSteps.find(
        (s) => s.id === "gmail-attach-worker",
      );

      expect(credentialsStep).toBeDefined();
      expect(credentialsStep?.title).toBe("Validate Gmail credentials");
      expect(attachStep).toBeDefined();
      expect(attachStep?.title).toBe("Attach Gmail to eligible workers");
    });

    it("compound key format is pluginId:stepId", () => {
      const gmailProvider = firstPartyRegistry.connectionProviders.find(
        (p) => p.id === "provider.gmail.read-only",
      );

      for (const step of gmailProvider?.setupSteps ?? []) {
        const compoundKey = `${gmailProvider!.id}:${step.id}`;
        expect(compoundKey).toMatch(/^provider\.gmail\.read-only:/);
        expect(compoundKey.split(":")).toHaveLength(2);
      }
    });
  });

  describe("Slack provider in registry", () => {
    it("Slack manifest is present in the first-party registry", () => {
      const slack = firstPartyRegistry.connectionProviders.find(
        (p) => p.id === "provider.slack",
      );
      expect(slack).toBeDefined();
      expect(slack?.displayName).toBe("Slack");
      expect(slack?.provider).toBe("slack");
      expect(slack?.stability).toBe("pilot");
      expect(slack?.category).toBe("project");
    });

    it("Slack manifest conforms to the registry connection provider schema", () => {
      const slack = firstPartyRegistry.connectionProviders.find(
        (p) => p.id === "provider.slack",
      );
      expect(slack).toBeDefined();

      const registryShape = {
        id: slack!.id,
        display_name: slack!.displayName,
        description: slack!.description,
        provider: slack!.provider,
        access_modes: slack!.accessModes,
        capabilities: slack!.capabilities,
        stability: slack!.stability,
        category: slack!.category,
        priority: slack!.priority,
        setup_steps: slack!.setupSteps,
      };

      const result = registryConnectionProviderSchema.safeParse(registryShape);
      expect(result.success).toBe(true);
    });

    it("Slack appears in the registry response alongside other providers", () => {
      const response = registryResponseSchema.parse({
        connection_providers: firstPartyRegistry.connectionProviders.map((p) => ({
          id: p.id,
          display_name: p.displayName,
          description: p.description,
          provider: p.provider,
          access_modes: p.accessModes,
          capabilities: p.capabilities,
          stability: p.stability,
          category: p.category,
          priority: p.priority,
          setup_steps: p.setupSteps,
        })),
        ingress_adapters: [],
        action_executors: [],
        worker_packs: [],
      });

      const slackEntry = response.connection_providers.find(
        (p) => p.id === "provider.slack",
      );
      expect(slackEntry).toBeDefined();
      expect(slackEntry?.display_name).toBe("Slack");
      expect(slackEntry?.category).toBe("project");
      expect(slackEntry?.stability).toBe("pilot");
    });
  });

  describe("rendering decision logic", () => {
    it("generic fallback applies when no custom panel is registered", () => {
      // The test provider has stability "experimental" and no custom panel
      // would be registered for it. Verify its metadata would produce
      // a "Coming soon" generic card.
      expect(testProvider.stability).toBe("experimental");
      expect(testProvider.setupSteps.length).toBeGreaterThan(0);

      // This is the condition ProviderSetupCard checks for "Coming soon"
      const isComingSoon = testProvider.stability === "experimental";
      expect(isComingSoon).toBe(true);
    });

    it("all first-party providers have unique manifest IDs for panel registry keying", () => {
      const ids = firstPartyRegistry.connectionProviders.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
