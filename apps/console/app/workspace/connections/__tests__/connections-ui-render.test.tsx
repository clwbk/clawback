import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RegistryConnectionProvider } from "@/lib/control-plane";
import { registerProviderPanel } from "../../_lib/provider-panel-registry";
import { ProviderSetupCard } from "../provider-setup-card";
import { groupProvidersByCategory } from "../provider-grouping";

function CustomTestPanel({ note }: { note: string }) {
  return <div data-testid="custom-panel-body">{note}</div>;
}

registerProviderPanel("provider.test-custom", CustomTestPanel);

const customProvider: RegistryConnectionProvider = {
  id: "provider.test-custom",
  display_name: "Custom Test Provider",
  description: "A provider used to verify shell-wrapped custom panels.",
  provider: "calendar",
  access_modes: ["read_only"],
  capabilities: ["read_events"],
  stability: "pilot",
  category: "email",
  priority: 10,
  setup_steps: [],
};

const fallbackProvider: RegistryConnectionProvider = {
  id: "provider.notion",
  display_name: "Notion",
  description: "Knowledge source for team wikis, project notes, and meeting docs.",
  provider: "notion",
  access_modes: ["read_only"],
  capabilities: ["read_pages", "search"],
  stability: "experimental",
  category: "knowledge",
  priority: 30,
  setup_steps: [
    {
      id: "notion-connect",
      title: "Connect Notion workspace",
      description: "Authorize read-only access to Notion pages for context-aware workflows.",
      ctaLabel: "Connect Notion",
      operatorOnly: true,
      target: { surface: "connections" },
    },
  ],
};

function TestConnectionsSections() {
  const providers = [customProvider, fallbackProvider];
  const groups = groupProvidersByCategory(providers);

  return (
    <div>
      {groups.map((group) => (
        <section key={group.category}>
          <h2>{group.label}</h2>
          {group.providers.map((provider) => (
            <ProviderSetupCard
              key={provider.id}
              provider={provider}
              panelProps={
                provider.id === "provider.test-custom"
                  ? { note: "custom panel body" }
                  : undefined
              }
            />
          ))}
        </section>
      ))}
    </div>
  );
}

describe("connections UI render", () => {
  it("renders grouped category headings in markup", () => {
    const markup = renderToStaticMarkup(<TestConnectionsSections />);

    expect(markup).toContain("Email");
    expect(markup).toContain("Knowledge Sources");
  });

  it("renders a custom provider inside the generic shell", () => {
    const markup = renderToStaticMarkup(<TestConnectionsSections />);

    expect(markup).toContain("Custom Test Provider");
    expect(markup).toContain("A provider used to verify shell-wrapped custom panels.");
    expect(markup).toContain("read only");
    expect(markup).toContain("pilot");
    expect(markup).toContain("custom panel body");
  });

  it("renders an experimental fallback provider with coming-soon preview", () => {
    const markup = renderToStaticMarkup(<TestConnectionsSections />);

    expect(markup).toContain("Notion");
    expect(markup).toContain("Coming soon");
    expect(markup).toContain("Setup preview");
    expect(markup).toContain("Connect Notion workspace");
  });
});
