import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { toolRuleRecordSchema } from "./tools.js";

export const agentScopeSchema = z.enum(["personal", "shared"]);
export const agentStatusSchema = z.enum(["active", "archived"]);
export const agentVersionStatusSchema = z.enum(["draft", "published", "superseded"]);

export const modelRoutingSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

export const toolPolicySchema = z.object({
  mode: z.enum(["allow_list"]),
  allowed_tools: z.array(z.string()),
  tool_rules: toolRuleRecordSchema.default({}),
});

export const connectorScopeSchema = z.object({
  enabled: z.boolean(),
  connector_ids: z.array(clawbackIdSchema),
});

export const approvalPolicySchema = z.object({
  mode: z.enum(["none", "workspace_admin"]),
});

export const agentDraftSchema = z.object({
  persona: z.record(z.string(), z.unknown()),
  instructions_markdown: z.string(),
  model_routing: modelRoutingSchema,
  tool_policy: toolPolicySchema.default({
    mode: "allow_list",
    allowed_tools: [],
    tool_rules: {},
  }),
  connector_policy: connectorScopeSchema.default({
    enabled: false,
    connector_ids: [],
  }),
});

export const agentPathParamsSchema = z.object({
  agentId: clawbackIdSchema,
});

export const createAgentRequestSchema = z.object({
  name: z.string().min(1),
  scope: agentScopeSchema,
});

export const updateAgentRequestSchema = z.object({
  name: z.string().min(1).optional(),
  status: agentStatusSchema.optional(),
});

export const updateAgentDraftRequestSchema = z.object({
  persona: z.record(z.string(), z.unknown()).optional(),
  instructions_markdown: z.string().optional(),
  model_routing: modelRoutingSchema.optional(),
  tool_policy: toolPolicySchema.optional(),
  connector_policy: connectorScopeSchema.optional(),
});

export const publishAgentRequestSchema = z.object({
  expected_draft_version_id: clawbackIdSchema,
});

export const agentSummarySchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  scope: agentScopeSchema,
  status: agentStatusSchema,
  owner_user_id: clawbackIdSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const agentVersionSummarySchema = z.object({
  id: clawbackIdSchema,
  agent_id: clawbackIdSchema,
  version_number: z.number().int().positive(),
  status: agentVersionStatusSchema,
  published_at: isoTimestampSchema.nullable(),
  created_at: isoTimestampSchema,
});

export const agentRecordSchema = agentSummarySchema.extend({
  draft_version: agentVersionSummarySchema.nullable(),
  published_version: agentVersionSummarySchema.nullable(),
});

export const agentListResponseSchema = z.object({
  agents: z.array(agentRecordSchema),
});

export const createAgentResponseSchema = agentRecordSchema;
export const getAgentResponseSchema = agentRecordSchema;

export const agentDraftRecordSchema = z.object({
  id: clawbackIdSchema,
  agent_id: clawbackIdSchema,
  version_number: z.number().int().positive(),
  status: z.literal("draft"),
  published_at: z.null(),
  created_at: isoTimestampSchema,
  persona: z.record(z.string(), z.unknown()),
  instructions_markdown: z.string(),
  model_routing: modelRoutingSchema,
  tool_policy: toolPolicySchema,
  connector_policy: connectorScopeSchema,
});

export const getAgentDraftResponseSchema = z.object({
  agent: agentSummarySchema,
  draft: agentDraftRecordSchema,
  published_version: agentVersionSummarySchema.nullable(),
});

export const publishRuntimePublicationSchema = z.object({
  status: z.enum(["pending", "materialized", "restart_required", "failed"]),
  runtime_agent_id: z.string().min(1),
  detail: z.string().nullable().default(null),
});

export const publishAgentResponseSchema = z.object({
  agent: agentSummarySchema,
  published_version: agentVersionSummarySchema.extend({
    status: z.literal("published"),
    published_at: isoTimestampSchema,
  }),
  draft_version: agentDraftRecordSchema,
  runtime_publication: publishRuntimePublicationSchema,
});
