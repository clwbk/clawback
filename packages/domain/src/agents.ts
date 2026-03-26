export type AgentDraftDefaults = {
  persona: Record<string, unknown>;
  instructionsMarkdown: string;
  modelRouting: {
    provider: string;
    model: string;
  };
  toolPolicy: {
    mode: "allow_list";
    allowedTools: string[];
    toolRules: Record<
      string,
      {
        riskClass: "safe" | "guarded" | "approval_gated" | "restricted";
        approval: "never" | "workspace_admin";
      }
    >;
  };
  connectorPolicy: {
    enabled: boolean;
    connectorIds: string[];
  };
};

export function slugifyName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "agent";
}

export function buildUniqueSlug(name: string, existingSlugs: Iterable<string>) {
  const baseSlug = slugifyName(name);
  const used = new Set(existingSlugs);

  if (!used.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  let candidate = `${baseSlug}-${suffix}`;

  while (used.has(candidate)) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }

  return candidate;
}

export function buildDefaultAgentDraft(): AgentDraftDefaults {
  return {
    persona: {},
    instructionsMarkdown: "",
    modelRouting: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
    },
    toolPolicy: {
      mode: "allow_list",
      allowedTools: [],
      toolRules: {},
    },
    connectorPolicy: {
      enabled: false,
      connectorIds: [],
    },
  };
}
