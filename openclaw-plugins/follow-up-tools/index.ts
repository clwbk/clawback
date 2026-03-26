/**
 * OpenClaw plugin for the Client Follow-Up worker.
 *
 * Registers tools:
 * - draft_follow_up: Create a follow-up email draft (no side effects)
 * - draft_recap: Create a meeting recap draft (no side effects)
 * - request_send: Request approval to send an email (creates review-gated action)
 *
 * Follows the same plugin pattern as openclaw-plugins/clawback-tools/index.ts.
 */

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
    throw new Error("follow-up-tools plugin requires controlPlaneBaseUrl and runtimeApiToken.");
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
    throw new Error("follow-up-tools requires a sessionKey in tool context.");
  }

  return {
    runtime_session_key: ctx.sessionKey,
    tool_invocation_id: toolCallId,
  };
}

const plugin = {
  id: "follow-up-tools",
  name: "Follow-Up Tools",
  description: "Client Follow-Up worker tools for drafting emails and meeting recaps",
  register(api) {
    const pluginConfig = readPluginConfig(api);

    // Tool: draft_follow_up
    api.registerTool(
      (_ctx) => ({
        name: "draft_follow_up",
        description:
          "Draft a follow-up email reply. This creates a draft work item with no external side effects. The draft will be presented to a human reviewer before any email is sent.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            to: {
              type: "string",
              description: "Recipient email address.",
            },
            subject: {
              type: "string",
              description: "Email subject line.",
            },
            body: {
              type: "string",
              description: "Email body text (plain text or markdown).",
            },
            context_summary: {
              type: "string",
              description: "Brief summary of the original thread context.",
            },
            source_event_id: {
              type: "string",
              description: "ID of the source event (forwarded email) this draft responds to.",
            },
          },
          required: ["to", "subject", "body"],
        },
        async execute(toolCallId, params) {
          const requestPayload = buildSessionPayload(_ctx, toolCallId);
          const result = await callControlPlane({
            config: pluginConfig,
            path: "/api/runtime/follow-up-tools/draft",
            payload: {
              ...requestPayload,
              draft: {
                to: params.to,
                subject: params.subject,
                body: params.body,
                context_summary: params.context_summary,
                source_event_id: params.source_event_id,
              },
            },
          });

          return toTextResult({
            tool: "draft_follow_up",
            draft: result.draft,
          });
        },
      }),
      { optional: true },
    );

    // Tool: draft_recap
    api.registerTool(
      (_ctx) => ({
        name: "draft_recap",
        description:
          "Draft a meeting recap email. Summarizes key discussion points, decisions, and action items from a meeting.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            to: {
              type: "string",
              description: "Recipient email address(es), comma-separated.",
            },
            subject: {
              type: "string",
              description: "Email subject line for the recap.",
            },
            meeting_summary: {
              type: "string",
              description: "Summary of the meeting discussion.",
            },
            action_items: {
              type: "array",
              items: { type: "string" },
              description: "List of action items from the meeting.",
            },
            decisions: {
              type: "array",
              items: { type: "string" },
              description: "List of decisions made during the meeting.",
            },
          },
          required: ["to", "subject", "meeting_summary"],
        },
        async execute(toolCallId, params) {
          const requestPayload = buildSessionPayload(_ctx, toolCallId);
          const result = await callControlPlane({
            config: pluginConfig,
            path: "/api/runtime/follow-up-tools/draft-recap",
            payload: {
              ...requestPayload,
              recap: {
                to: params.to,
                subject: params.subject,
                meeting_summary: params.meeting_summary,
                action_items: params.action_items,
                decisions: params.decisions,
              },
            },
          });

          return toTextResult({
            tool: "draft_recap",
            draft: result.draft,
          });
        },
      }),
      { optional: true },
    );

    // Tool: request_send
    api.registerTool(
      (_ctx) => ({
        name: "request_send",
        description:
          "Request approval to send an email. This creates a review-gated action that requires human approval before the email is actually sent. Use this after drafting a follow-up.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            work_item_id: {
              type: "string",
              description: "ID of the work item (email draft) to send.",
            },
            to: {
              type: "string",
              description: "Recipient email address.",
            },
            subject: {
              type: "string",
              description: "Email subject line.",
            },
            body: {
              type: "string",
              description: "Final email body to send.",
            },
          },
          required: ["work_item_id", "to", "subject", "body"],
        },
        async execute(toolCallId, params) {
          const requestPayload = buildSessionPayload(_ctx, toolCallId);
          const result = await callControlPlane({
            config: pluginConfig,
            path: "/api/runtime/follow-up-tools/request-send",
            payload: {
              ...requestPayload,
              wait_timeout_ms: DEFAULT_WAIT_TIMEOUT_MS,
              send_request: {
                work_item_id: params.work_item_id,
                to: params.to,
                subject: params.subject,
                body: params.body,
              },
            },
          });

          return toTextResult({
            tool: "request_send",
            ...result,
          });
        },
      }),
      { optional: true },
    );
  },
};

export default plugin;
