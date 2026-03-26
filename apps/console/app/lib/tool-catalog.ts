export type DemoToolDefinition = {
  id: string;
  label: string;
  summary: string;
  riskClass: "safe" | "guarded" | "approval_gated" | "restricted";
  approval: "never" | "workspace_admin";
};

export type DraftToolRule = {
  risk_class: "safe" | "guarded" | "approval_gated" | "restricted";
  approval: "never" | "workspace_admin";
};

export const incidentCopilotToolCatalog: DemoToolDefinition[] = [
  {
    id: "ticket_lookup",
    label: "Ticket Lookup",
    summary: "Inspect related incident and follow-up records without changing anything.",
    riskClass: "safe",
    approval: "never",
  },
  {
    id: "draft_ticket",
    label: "Draft Ticket",
    summary: "Prepare a structured follow-up ticket payload from the incident context.",
    riskClass: "guarded",
    approval: "never",
  },
  {
    id: "create_ticket",
    label: "Create Ticket",
    summary: "Create the real follow-up ticket through the approval-gated action path.",
    riskClass: "approval_gated",
    approval: "workspace_admin",
  },
];

export function buildDraftToolPolicy(
  selectedToolIds: string[],
  existingRules: Record<string, DraftToolRule> = {},
) {
  const allowedTools = Array.from(new Set(selectedToolIds)).sort();
  const catalogRules: Record<string, DraftToolRule> = Object.fromEntries(
    incidentCopilotToolCatalog.map((tool) => [
      tool.id,
      {
        risk_class: tool.riskClass,
        approval: tool.approval,
      },
    ]),
  );

  return {
    mode: "allow_list" as const,
    allowed_tools: allowedTools,
    tool_rules: Object.fromEntries(
      allowedTools.map((toolId) => [
        toolId,
        existingRules[toolId] ??
          catalogRules[toolId] ??
          ({ risk_class: "safe", approval: "never" } satisfies DraftToolRule),
      ]),
    ) as Record<string, DraftToolRule>,
  };
}
