import { describe, expect, it } from "vitest";

import {
  buildAssistantTemplateDraft,
  getAssistantTemplate,
  suggestAssistantTemplate,
} from "./assistant-templates";

describe("assistant templates", () => {
  it("builds a draft payload from a template", () => {
    const template = getAssistantTemplate("incident-copilot");
    expect(template).not.toBeNull();

    const draft = buildAssistantTemplateDraft(template!);
    expect(draft.model_routing.provider).toBe("openai-compatible");
    expect(draft.tool_policy.allowed_tools).toEqual([
      "create_ticket",
      "draft_ticket",
      "ticket_lookup",
    ]);
  });

  it("suggests incident copilot when ticket capabilities are present", () => {
    const suggested = suggestAssistantTemplate({
      agentName: "Ops Helper",
      selectedToolIds: ["ticket_lookup", "create_ticket"],
    });

    expect(suggested?.id).toBe("incident-copilot");
  });

  it("falls back to blank when no template fit is obvious", () => {
    const suggested = suggestAssistantTemplate({
      agentName: "General Helper",
      selectedToolIds: [],
    });

    expect(suggested?.id).toBe("blank");
  });
});
