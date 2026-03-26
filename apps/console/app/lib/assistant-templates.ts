import { buildDraftToolPolicy } from "./tool-catalog";

export type AssistantTemplateDefinition = {
  id: string;
  name: string;
  badge: string;
  summary: string;
  defaultName: string;
  category: "operations" | "client-work" | "projects" | "general";
  starterPrompts: string[];
  instructionsMarkdown: string;
  modelRouting: {
    provider: string;
    model: string;
  };
  allowedToolIds: string[];
};

export type AssistantTemplateDraft = {
  instructions_markdown: string;
  model_routing: {
    provider: string;
    model: string;
  };
  tool_policy: ReturnType<typeof buildDraftToolPolicy>;
  connector_policy: {
    enabled: boolean;
    connector_ids: string[];
  };
};

export const assistantTemplateCatalog: AssistantTemplateDefinition[] = [
  {
    id: "blank",
    name: "Blank Assistant",
    badge: "General",
    summary: "Start from a minimal shell and shape the assistant yourself.",
    defaultName: "New Assistant",
    category: "general",
    starterPrompts: [
      "What should this assistant help with first?",
      "What knowledge should it use?",
      "What should always require review?",
    ],
    instructionsMarkdown: "",
    modelRouting: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
    },
    allowedToolIds: [],
  },
  {
    id: "incident-copilot",
    name: "Incident Copilot",
    badge: "Operations",
    summary: "Investigate incidents, synthesize evidence, and prepare governed follow-up actions.",
    defaultName: "Incident Copilot",
    category: "operations",
    starterPrompts: [
      "Why did checkout fail last night?",
      "What should we do next?",
      "Draft a follow-up ticket for the team.",
    ],
    instructionsMarkdown: [
      "You are an incident-response copilot.",
      "",
      "Use connected knowledge to explain what happened, cite evidence clearly, and keep outputs structured.",
      "When a next step should become a tracked follow-up, prepare it as a ticket draft first.",
      "Only request risky actions when the user explicitly wants the system to proceed.",
    ].join("\n"),
    modelRouting: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
    },
    allowedToolIds: ["ticket_lookup", "draft_ticket", "create_ticket"],
  },
  {
    id: "client-follow-up",
    name: "Client Follow-Up Copilot",
    badge: "Client Work",
    summary: "Turn notes and project context into clean, client-ready follow-ups and next steps.",
    defaultName: "Client Follow-Up Copilot",
    category: "client-work",
    starterPrompts: [
      "Draft a follow-up from today’s client call.",
      "Turn these notes into a concise email.",
      "What should we send the client next?",
    ],
    instructionsMarkdown: [
      "You help a small team prepare client-ready follow-ups from notes, briefs, and prior context.",
      "",
      "Keep drafts concise, confident, and specific.",
      "Prefer clear next steps, dates, owners, and open questions over generic prose.",
      "If the user asks for a send-ready draft, make the output easy to review before it is sent.",
    ].join("\n"),
    modelRouting: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
    },
    allowedToolIds: [],
  },
  {
    id: "proposal-assistant",
    name: "Proposal And Scope Assistant",
    badge: "Projects",
    summary: "Shape proposals, statements of work, and action plans from scattered project context.",
    defaultName: "Proposal Assistant",
    category: "projects",
    starterPrompts: [
      "Draft a statement of work from this brief.",
      "Turn these notes into a scoped proposal.",
      "What should the client deliverables be?",
    ],
    instructionsMarkdown: [
      "You help a small team turn briefs, call notes, and project context into structured scopes and proposals.",
      "",
      "Highlight deliverables, assumptions, risks, pricing inputs, and unanswered questions.",
      "When information is missing, call it out explicitly rather than guessing.",
    ].join("\n"),
    modelRouting: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
    },
    allowedToolIds: [],
  },
  {
    id: "bugfix-copilot",
    name: "Bugfix Copilot",
    badge: "Engineering",
    summary: "Investigate issues, summarize likely fixes, and prepare reviewable engineering work.",
    defaultName: "Bugfix Copilot",
    category: "projects",
    starterPrompts: [
      "Summarize the bug and likely root cause.",
      "Draft a fix plan from these notes.",
      "What should go into the PR description?",
    ],
    instructionsMarkdown: [
      "You are an engineering copilot for a small product team.",
      "",
      "Use connected docs, tickets, and notes to explain bugs clearly and propose concrete next steps.",
      "Structure outputs so they are easy to review as tasks, patches, or PR descriptions later.",
    ].join("\n"),
    modelRouting: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
    },
    allowedToolIds: [],
  },
];

export function getAssistantTemplate(templateId: string | null | undefined) {
  return assistantTemplateCatalog.find((template) => template.id === templateId) ?? null;
}

export function buildAssistantTemplateDraft(
  template: AssistantTemplateDefinition,
): AssistantTemplateDraft {
  return {
    instructions_markdown: template.instructionsMarkdown,
    model_routing: template.modelRouting,
    tool_policy: buildDraftToolPolicy(template.allowedToolIds),
    connector_policy: {
      enabled: false,
      connector_ids: [],
    },
  };
}

export function suggestAssistantTemplate(params: {
  agentName: string;
  selectedToolIds?: string[];
}) {
  const normalizedName = params.agentName.trim().toLowerCase();
  const selectedToolIds = params.selectedToolIds ?? [];

  if (
    selectedToolIds.includes("create_ticket") ||
    normalizedName.includes("incident") ||
    normalizedName.includes("copilot")
  ) {
    return getAssistantTemplate("incident-copilot");
  }
  if (normalizedName.includes("follow-up") || normalizedName.includes("client")) {
    return getAssistantTemplate("client-follow-up");
  }
  if (normalizedName.includes("proposal") || normalizedName.includes("scope")) {
    return getAssistantTemplate("proposal-assistant");
  }
  if (normalizedName.includes("bug") || normalizedName.includes("fix")) {
    return getAssistantTemplate("bugfix-copilot");
  }

  return getAssistantTemplate("blank");
}
