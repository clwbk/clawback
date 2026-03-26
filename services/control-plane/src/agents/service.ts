import {
  agentDraftRecordSchema,
  agentDraftSchema,
  agentRecordSchema,
  agentVersionSummarySchema,
  createAgentRequestSchema,
  getAgentDraftResponseSchema,
  modelRoutingSchema,
  publishAgentRequestSchema,
  publishAgentResponseSchema,
  toolPolicySchema,
  updateAgentDraftRequestSchema,
  updateAgentRequestSchema,
} from "@clawback/contracts";
import { AuthServiceError, type SessionContext } from "@clawback/auth";
import {
  buildDefaultAgentDraft,
  buildRuntimeAgentId,
  buildUniqueSlug,
  createClawbackId,
} from "@clawback/domain";

import type {
  AgentAggregate,
  AgentDraftView,
  AgentRecordView,
  AgentServiceContract,
  AgentStore,
  CreateAgentInputDto,
  GetAgentDraftView,
  PublishAgentInputDto,
  PublishAgentView,
  RuntimePublisher,
  StoredAgent,
  StoredAgentVersion,
  UpdateAgentDraftInputDto,
  UpdateAgentInputDto,
} from "./types.js";

type AgentServiceOptions = {
  store: AgentStore;
  runtimePublisher?: RuntimePublisher;
  now?: () => Date;
};

export class AgentService implements AgentServiceContract {
  private readonly now: () => Date;

  constructor(private readonly options: AgentServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async listAgents(actor: SessionContext) {
    const aggregates = await this.options.store.listAgentAggregates(actor.workspace.id);
    return {
      agents: aggregates
        .filter((aggregate) => this.canViewAgent(actor, aggregate))
        .map((aggregate) => this.toAgentRecordView(actor, aggregate)),
    };
  }

  async createAgent(actor: SessionContext, input: CreateAgentInputDto) {
    const parsed = createAgentRequestSchema.parse(input);
    this.assertCanCreateScope(actor, parsed.scope);

    const now = this.now();
    const slugs = await this.options.store.listAgentSlugs(actor.workspace.id);
    const slug = buildUniqueSlug(parsed.name, slugs);
    const draft = buildDefaultAgentDraft();

    return await this.options.store.runInTransaction(async (store) => {
      const agent = await store.createAgent({
        id: createClawbackId("agt"),
        workspaceId: actor.workspace.id,
        name: parsed.name,
        slug,
        scope: parsed.scope,
        ownerUserId: parsed.scope === "personal" ? actor.user.id : null,
        status: "active",
        createdBy: actor.user.id,
        createdAt: now,
        updatedAt: now,
      });

      const draftVersion = await store.createAgentVersion({
        id: createClawbackId("agtv"),
        workspaceId: actor.workspace.id,
        agentId: agent.id,
        versionNumber: 1,
        status: "draft",
        personaJson: draft.persona,
        instructionsMarkdown: draft.instructionsMarkdown,
        modelRoutingJson: draft.modelRouting,
        toolPolicyJson: {
          mode: draft.toolPolicy.mode,
          allowed_tools: draft.toolPolicy.allowedTools,
          tool_rules: Object.fromEntries(
            Object.entries(draft.toolPolicy.toolRules).map(([toolName, rule]) => [
              toolName,
              {
                risk_class: rule.riskClass,
                approval: rule.approval,
              },
            ]),
          ),
        },
        connectorPolicyJson: {
          enabled: draft.connectorPolicy.enabled,
          connector_ids: draft.connectorPolicy.connectorIds,
        },
        createdBy: actor.user.id,
        createdAt: now,
        publishedAt: null,
      });

      await store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: actor.workspace.id,
        actorType: "user",
        actorId: actor.user.id,
        eventType: "agent.created",
        targetType: "agent",
        targetId: agent.id,
        summary: `${parsed.scope === "shared" ? "Shared" : "Personal"} agent created`,
        payloadJson: {
          agent_id: agent.id,
          scope: parsed.scope,
          draft_version_id: draftVersion.id,
        },
        occurredAt: now,
      });

      return this.toAgentRecordView(actor, {
        agent,
        draftVersion,
        publishedVersion: null,
      });
    });
  }

  async getAgent(actor: SessionContext, agentId: string) {
    const aggregate = await this.getRequiredAggregate(actor.workspace.id, agentId);
    this.assertCanViewAgent(actor, aggregate);
    return this.toAgentRecordView(actor, aggregate);
  }

  async updateAgent(actor: SessionContext, agentId: string, input: UpdateAgentInputDto) {
    const parsed = updateAgentRequestSchema.parse(input);
    const aggregate = await this.getRequiredAggregate(actor.workspace.id, agentId);
    this.assertCanManageAgent(actor, aggregate);

    const nextName = parsed.name ?? aggregate.agent.name;
    const nextStatus = parsed.status ?? aggregate.agent.status;
    const updatedAgent = await this.options.store.updateAgent(agentId, {
      name: nextName,
      status: nextStatus,
      updatedAt: this.now(),
    });

    return this.toAgentRecordView(actor, {
      ...aggregate,
      agent: updatedAgent,
    });
  }

  async getDraft(actor: SessionContext, agentId: string) {
    const aggregate = await this.getRequiredAggregate(actor.workspace.id, agentId);
    this.assertCanManageAgent(actor, aggregate);

    return this.toDraftResponse(aggregate);
  }

  async updateDraft(actor: SessionContext, agentId: string, input: UpdateAgentDraftInputDto) {
    const parsed = updateAgentDraftRequestSchema.parse(input);
    const aggregate = await this.getRequiredAggregate(actor.workspace.id, agentId);
    this.assertCanManageAgent(actor, aggregate);

    const draftVersion = aggregate.draftVersion;
    if (!draftVersion) {
      throw new AuthServiceError({
        code: "draft_missing",
        message: "This agent does not have an editable draft.",
        statusCode: 409,
      });
    }

    const currentDraft = this.toAgentDraftView(draftVersion);
    const updatedDraft = await this.options.store.updateAgentVersion(draftVersion.id, {
      personaJson: parsed.persona ?? currentDraft.persona,
      instructionsMarkdown: parsed.instructions_markdown ?? currentDraft.instructions_markdown,
      modelRoutingJson: parsed.model_routing ?? currentDraft.model_routing,
      toolPolicyJson: parsed.tool_policy
        ? {
            mode: parsed.tool_policy.mode,
            allowed_tools: parsed.tool_policy.allowed_tools,
            tool_rules: parsed.tool_policy.tool_rules,
          }
        : {
            mode: currentDraft.tool_policy.mode,
            allowed_tools: currentDraft.tool_policy.allowed_tools,
            tool_rules: currentDraft.tool_policy.tool_rules,
          },
      connectorPolicyJson: parsed.connector_policy
        ? {
            enabled: parsed.connector_policy.enabled,
            connector_ids: parsed.connector_policy.connector_ids,
          }
        : {
            enabled: currentDraft.connector_policy.enabled,
            connector_ids: currentDraft.connector_policy.connector_ids,
          },
    });

    const updatedAgent = await this.options.store.updateAgent(agentId, {
      updatedAt: this.now(),
    });

    return this.toDraftResponse({
      agent: updatedAgent,
      draftVersion: updatedDraft,
      publishedVersion: aggregate.publishedVersion,
    });
  }

  async publishAgent(actor: SessionContext, agentId: string, input: PublishAgentInputDto) {
    const parsed = publishAgentRequestSchema.parse(input);
    const aggregate = await this.getRequiredAggregate(actor.workspace.id, agentId);
    this.assertCanPublishAgent(actor, aggregate);

    const draftVersion = aggregate.draftVersion;
    if (!draftVersion || draftVersion.id !== parsed.expected_draft_version_id) {
      throw new AuthServiceError({
        code: "draft_conflict",
        message: "The draft version no longer matches the expected version.",
        statusCode: 409,
      });
    }

    const runtimeAgentId = buildRuntimeAgentId(draftVersion.id);

    return await this.options.store.runInTransaction(async (store) => {
      const current = await store.findAgentAggregate(actor.workspace.id, agentId);
      if (!current) {
        throw new AuthServiceError({
          code: "agent_not_found",
          message: "Agent not found.",
          statusCode: 404,
        });
      }

      this.assertCanPublishAgent(actor, current);

      const currentDraft = current.draftVersion;
      if (!currentDraft || currentDraft.id !== parsed.expected_draft_version_id) {
        throw new AuthServiceError({
          code: "draft_conflict",
          message: "The draft version no longer matches the expected version.",
          statusCode: 409,
        });
      }

      const now = this.now();
      await store.supersedePublishedVersions(agentId);
      const publishedVersion = await store.updateAgentVersion(currentDraft.id, {
        status: "published",
        publishedAt: now,
      });

      const currentDraftView = this.toAgentDraftView(publishedVersion, "draft");
      const nextDraft = await store.createAgentVersion({
        id: createClawbackId("agtv"),
        workspaceId: publishedVersion.workspaceId,
        agentId: publishedVersion.agentId,
        versionNumber: publishedVersion.versionNumber + 1,
        status: "draft",
        personaJson: currentDraftView.persona,
        instructionsMarkdown: currentDraftView.instructions_markdown,
        modelRoutingJson: currentDraftView.model_routing,
        toolPolicyJson: {
          mode: currentDraftView.tool_policy.mode,
          allowed_tools: currentDraftView.tool_policy.allowed_tools,
          tool_rules: currentDraftView.tool_policy.tool_rules,
        },
        connectorPolicyJson: {
          enabled: currentDraftView.connector_policy.enabled,
          connector_ids: currentDraftView.connector_policy.connector_ids,
        },
        createdBy: actor.user.id,
        createdAt: now,
        publishedAt: null,
      });

      const updatedAgent = await store.updateAgent(agentId, {
        updatedAt: now,
      });
      await store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: actor.workspace.id,
        actorType: "user",
        actorId: actor.user.id,
        eventType: "agent.published",
        targetType: "agent_version",
        targetId: publishedVersion.id,
        summary: "Agent draft published",
        payloadJson: {
          agent_id: updatedAgent.id,
          published_version_id: publishedVersion.id,
          next_draft_version_id: nextDraft.id,
          runtime_agent_id: runtimeAgentId,
        },
        occurredAt: now,
      });

      return publishAgentResponseSchema.parse({
        agent: this.toAgentSummaryView(updatedAgent),
        published_version: this.toAgentVersionSummaryView(publishedVersion),
        draft_version: this.toAgentDraftView(nextDraft),
        runtime_publication: {
          status: "pending",
          runtime_agent_id: runtimeAgentId,
          detail: null,
        },
      });
    }).then(async (published) => {
      if (!this.options.runtimePublisher) {
        return published;
      }

      const publication = await this.options.runtimePublisher.publishAgentVersion({
        workspaceId: actor.workspace.id,
        agentId,
        agentVersionId: published.published_version.id,
        agentName: published.agent.name,
        instructionsMarkdown: draftVersion.instructionsMarkdown,
        persona: draftVersion.personaJson,
        modelRouting: modelRoutingSchema.parse(draftVersion.modelRoutingJson),
        toolPolicy: {
          allowedTools: toolPolicySchema.parse(draftVersion.toolPolicyJson).allowed_tools,
        },
        runtimeAgentId,
      });

      return publishAgentResponseSchema.parse({
        ...published,
        runtime_publication: {
          status: publication.status,
          runtime_agent_id: publication.runtimeAgentId,
          detail: publication.detail,
        },
      });
    });
  }

  private async getRequiredAggregate(workspaceId: string, agentId: string) {
    const aggregate = await this.options.store.findAgentAggregate(workspaceId, agentId);
    if (!aggregate) {
      throw new AuthServiceError({
        code: "agent_not_found",
        message: "Agent not found.",
        statusCode: 404,
      });
    }

    return aggregate;
  }

  private assertCanCreateScope(actor: SessionContext, scope: "personal" | "shared") {
    if (scope === "shared" && actor.membership.role !== "admin") {
      throw new AuthServiceError({
        code: "forbidden",
        message: "Only admins can create shared agents.",
        statusCode: 403,
      });
    }
  }

  private assertCanViewAgent(actor: SessionContext, aggregate: AgentAggregate) {
    if (!this.canViewAgent(actor, aggregate)) {
      throw new AuthServiceError({
        code: "agent_not_found",
        message: "Agent not found.",
        statusCode: 404,
      });
    }
  }

  private canViewAgent(actor: SessionContext, aggregate: AgentAggregate) {
    if (actor.membership.role === "admin") {
      return true;
    }

    if (aggregate.agent.scope === "personal") {
      return aggregate.agent.ownerUserId === actor.user.id;
    }

    return aggregate.agent.status === "active" && aggregate.publishedVersion !== null;
  }

  private assertCanManageAgent(actor: SessionContext, aggregate: AgentAggregate) {
    if (actor.membership.role === "admin") {
      return;
    }

    if (aggregate.agent.scope === "personal" && aggregate.agent.ownerUserId === actor.user.id) {
      return;
    }

    throw new AuthServiceError({
      code: "forbidden",
      message: "You do not have permission to manage this agent.",
      statusCode: 403,
    });
  }

  private assertCanPublishAgent(actor: SessionContext, aggregate: AgentAggregate) {
    if (actor.membership.role === "admin") {
      return;
    }

    if (aggregate.agent.scope === "personal" && aggregate.agent.ownerUserId === actor.user.id) {
      return;
    }

    throw new AuthServiceError({
      code: "forbidden",
      message: "You do not have permission to publish this agent.",
      statusCode: 403,
    });
  }

  private canSeeDraft(actor: SessionContext, aggregate: AgentAggregate) {
    if (actor.membership.role === "admin") {
      return true;
    }

    return aggregate.agent.scope === "personal" && aggregate.agent.ownerUserId === actor.user.id;
  }

  private toAgentRecordView(actor: SessionContext, aggregate: AgentAggregate): AgentRecordView {
    return agentRecordSchema.parse({
      ...this.toAgentSummaryView(aggregate.agent),
      draft_version: this.canSeeDraft(actor, aggregate) && aggregate.draftVersion
        ? this.toAgentVersionSummaryView(aggregate.draftVersion)
        : null,
      published_version: aggregate.publishedVersion
        ? this.toAgentVersionSummaryView(aggregate.publishedVersion)
        : null,
    });
  }

  private toDraftResponse(aggregate: AgentAggregate): GetAgentDraftView {
    const draftVersion = aggregate.draftVersion;
    if (!draftVersion) {
      throw new AuthServiceError({
        code: "draft_missing",
        message: "This agent does not have an editable draft.",
        statusCode: 409,
      });
    }

    return getAgentDraftResponseSchema.parse({
      agent: this.toAgentSummaryView(aggregate.agent),
      draft: this.toAgentDraftView(draftVersion),
      published_version: aggregate.publishedVersion
        ? this.toAgentVersionSummaryView(aggregate.publishedVersion)
        : null,
    });
  }

  private toAgentSummaryView(agent: StoredAgent) {
    return {
      id: agent.id,
      workspace_id: agent.workspaceId,
      name: agent.name,
      slug: agent.slug,
      scope: agent.scope,
      status: agent.status,
      owner_user_id: agent.ownerUserId,
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString(),
    };
  }

  private toAgentVersionSummaryView(version: StoredAgentVersion) {
    return agentVersionSummarySchema.parse({
      id: version.id,
      agent_id: version.agentId,
      version_number: version.versionNumber,
      status: version.status,
      published_at: version.publishedAt ? version.publishedAt.toISOString() : null,
      created_at: version.createdAt.toISOString(),
    });
  }

  private toAgentDraftView(
    version: StoredAgentVersion,
    forcedStatus: "draft" | null = null,
  ): AgentDraftView {
    const draft = agentDraftSchema.parse({
      persona: version.personaJson,
      instructions_markdown: version.instructionsMarkdown,
      model_routing: version.modelRoutingJson,
      tool_policy: version.toolPolicyJson,
      connector_policy: version.connectorPolicyJson,
    });

    return agentDraftRecordSchema.parse({
      id: version.id,
      agent_id: version.agentId,
      version_number: version.versionNumber,
      status: forcedStatus ?? "draft",
      published_at: null,
      created_at: version.createdAt.toISOString(),
      ...draft,
    });
  }
}
