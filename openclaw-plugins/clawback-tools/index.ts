const DEFAULT_WAIT_TIMEOUT_MS = 5 * 60 * 1000;

function toObjectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readPluginConfig(api) {
  const raw = toObjectRecord(api.pluginConfig);
  const controlPlaneBaseUrl =
    typeof raw.controlPlaneBaseUrl === "string" && raw.controlPlaneBaseUrl.trim().length > 0
      ? raw.controlPlaneBaseUrl.trim().replace(/\/+$/, "")
      : null;
  const runtimeApiToken =
    typeof raw.runtimeApiToken === "string" && raw.runtimeApiToken.trim().length > 0
      ? raw.runtimeApiToken.trim()
      : null;

  if (!controlPlaneBaseUrl || !runtimeApiToken) {
    throw new Error("clawback-tools plugin requires controlPlaneBaseUrl and runtimeApiToken.");
  }

  return {
    controlPlaneBaseUrl,
    runtimeApiToken,
  };
}

async function callControlPlane({ config, path, payload }) {
  const response = await fetch(`${config.controlPlaneBaseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.runtimeApiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  const responseBody = rawText.length > 0 ? JSON.parse(rawText) : null;

  if (!response.ok) {
    const errorMessage =
      responseBody && typeof responseBody.error === "string"
        ? responseBody.error
        : `Clawback control-plane request failed with ${response.status}`;
    throw new Error(errorMessage);
  }

  return responseBody;
}

function toTextResult(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function buildSessionPayload(ctx, toolCallId) {
  if (!ctx.sessionKey) {
    throw new Error("clawback-tools requires a sessionKey in tool context.");
  }

  return {
    runtime_session_key: ctx.sessionKey,
    tool_invocation_id: toolCallId,
  };
}

const plugin = {
  id: "clawback-tools",
  name: "Clawback Tools",
  description: "Incident Copilot ticket tools backed by the Clawback control-plane",
  register(api) {
    const pluginConfig = readPluginConfig(api);

    api.registerTool(
      (_ctx) => ({
        name: "ticket_lookup",
        description: "Look up related incident or follow-up tickets in Clawback.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: {
              type: "string",
              description: "Search query for related incidents, tickets, or follow-up work.",
            },
            limit: {
              type: "number",
              description: "Maximum number of results to return.",
            },
          },
        },
        async execute(toolCallId, params) {
          const requestPayload = buildSessionPayload(_ctx, toolCallId);
          const result = await callControlPlane({
            config: pluginConfig,
            path: "/api/runtime/ticket-tools/lookup",
            payload: {
              ...requestPayload,
              query: typeof params?.query === "string" ? params.query : undefined,
              limit: typeof params?.limit === "number" ? params.limit : undefined,
            },
          });

          return toTextResult({
            tool: "ticket_lookup",
            results: result.results ?? [],
          });
        },
      }),
      { optional: true },
    );

    api.registerTool(
      (_ctx) => ({
        name: "draft_ticket",
        description:
          "Create a draft follow-up ticket with no external side effects. Pass either title + body markdown, or title plus structured summary/cause/impact/action fields.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            body: {
              type: "string",
              description: "Freeform markdown ticket body with incident summary, impact, likely cause, and next actions.",
            },
            summary: { type: "string" },
            likely_cause: { type: "string" },
            impact: { type: "string" },
            recommended_actions: {
              type: "array",
              items: { type: "string" },
            },
            owner: { type: "string" },
          },
          required: ["title"],
        },
        async execute(toolCallId, params) {
          const requestPayload = buildSessionPayload(_ctx, toolCallId);
          const result = await callControlPlane({
            config: pluginConfig,
            path: "/api/runtime/ticket-tools/draft",
            payload: {
              ...requestPayload,
              draft: {
                title: params.title,
                body: typeof params?.body === "string" ? params.body : undefined,
                summary: params.summary,
                likely_cause: params.likely_cause,
                impact: params.impact,
                recommended_actions: params.recommended_actions,
                owner: params.owner,
              },
            },
          });

          return toTextResult({
            tool: "draft_ticket",
            draft_ticket: result.draft_ticket,
          });
        },
      }),
      { optional: true },
    );

    api.registerTool(
      (_ctx) => ({
        name: "create_ticket",
        description:
          "Create the real follow-up ticket in Clawback after approval. Pass either title + body markdown, or title plus structured summary/cause/impact/action fields.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            body: {
              type: "string",
              description: "Freeform markdown ticket body with incident summary, impact, likely cause, and next actions.",
            },
            summary: { type: "string" },
            likely_cause: { type: "string" },
            impact: { type: "string" },
            recommended_actions: {
              type: "array",
              items: { type: "string" },
            },
            owner: { type: "string" },
          },
          required: ["title"],
        },
        async execute(toolCallId, params) {
          const requestPayload = buildSessionPayload(_ctx, toolCallId);
          const result = await callControlPlane({
            config: pluginConfig,
            path: "/api/runtime/ticket-tools/create",
            payload: {
              ...requestPayload,
              wait_timeout_ms: DEFAULT_WAIT_TIMEOUT_MS,
              draft: {
                title: params.title,
                body: typeof params?.body === "string" ? params.body : undefined,
                summary: params.summary,
                likely_cause: params.likely_cause,
                impact: params.impact,
                recommended_actions: params.recommended_actions,
                owner: params.owner,
              },
            },
          });

          return toTextResult({
            tool: "create_ticket",
            ...result,
          });
        },
      }),
      { optional: true },
    );
  },
};

export default plugin;
