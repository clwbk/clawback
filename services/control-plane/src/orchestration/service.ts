import {
  approvalPolicySchema,
  connectorScopeSchema,
  conversationListQuerySchema,
  conversationListResponseSchema,
  conversationDetailResponseSchema,
  conversationSchema,
  createConversationRequestSchema,
  createRunRequestSchema,
  createRunResponseSchema,
  getRunResponseSchema,
  messageSchema,
  modelRoutingSchema,
  runEventSchema,
  runSnapshotSchema,
  toolPolicySchema,
} from "@clawback/contracts";
import { AuthServiceError, type SessionContext } from "@clawback/auth";
import {
  RUN_EXECUTE_JOB_NAME,
  buildRuntimeAgentId,
  buildRuntimeSessionKey,
  createClawbackId,
} from "@clawback/domain";
import { V1_APPROVAL_MODE } from "@clawback/policy";

import type {
  ConversationRunServiceContract,
  ConversationListView,
  ConversationView,
  CreateConversationInputDto,
  CreateRunInputDto,
  CreateRunView,
  ListConversationsInputDto,
  OrchestrationStore,
  RunQueue,
  RunSnapshotView,
  RunRecordView,
  StoredAgent,
  StoredAgentVersion,
  StoredConversation,
  StoredMessage,
  StoredRun,
  StoredRunEvent,
} from "./types.js";

type ConversationRunServiceOptions = {
  store: OrchestrationStore;
  queue: RunQueue;
  now?: () => Date;
  streamBasePath?: string;
};

function toObjectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class ConversationRunService implements ConversationRunServiceContract {
  private readonly now: () => Date;
  private readonly streamBasePath: string;

  constructor(private readonly options: ConversationRunServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.streamBasePath = options.streamBasePath ?? "/api/runs";
  }

  async createConversation(actor: SessionContext, input: CreateConversationInputDto): Promise<ConversationView> {
    const parsed = createConversationRequestSchema.parse(input);
    const binding = await this.options.store.findAgentConversationBinding(
      actor.workspace.id,
      parsed.agent_id,
    );

    if (!binding) {
      throw new AuthServiceError({
        code: "agent_not_found",
        message: "Agent not found.",
        statusCode: 404,
      });
    }

    this.assertCanStartConversation(actor, binding.agent, binding.publishedVersion);

    const now = this.now();
    const conversation = await this.options.store.createConversation({
      id: createClawbackId("cnv"),
      workspaceId: actor.workspace.id,
      agentId: binding.agent.id,
      agentVersionId: binding.publishedVersion!.id,
      startedBy: actor.user.id,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return this.toConversationView(conversation);
  }

  async listConversations(
    actor: SessionContext,
    input: ListConversationsInputDto,
  ): Promise<ConversationListView> {
    const parsed = conversationListQuerySchema.parse(input);
    const filters: {
      agentId?: string;
      startedBy?: string;
    } = {};

    if (parsed.agent_id) {
      filters.agentId = parsed.agent_id;
    }

    if (actor.membership.role !== "admin") {
      filters.startedBy = actor.user.id;
    }

    const conversations = await this.options.store.listConversations(actor.workspace.id, filters);

    return conversationListResponseSchema.parse({
      conversations: conversations.map((conversation) => this.toConversationView(conversation)),
    });
  }

  async getConversation(actor: SessionContext, conversationId: string) {
    const bundle = await this.getRequiredConversationBundle(actor, conversationId);
    const messages = await this.options.store.listMessages(actor.workspace.id, conversationId);

    return conversationDetailResponseSchema.parse({
      conversation: this.toConversationView(bundle.conversation),
      messages: messages.map((message) => this.toMessageView(message)),
    });
  }

  async createRun(actor: SessionContext, input: CreateRunInputDto): Promise<CreateRunView> {
    const parsed = createRunRequestSchema.parse(input);
    const now = this.now();

    const result = await this.options.store.runInTransaction(async (store) => {
      const bundle = await store.findConversationBundle(actor.workspace.id, parsed.conversation_id);
      if (!bundle) {
        throw new AuthServiceError({
          code: "conversation_not_found",
          message: "Conversation not found.",
          statusCode: 404,
        });
      }

      this.assertCanAccessConversation(actor, bundle.conversation);

      if (bundle.conversation.status !== "active") {
        throw new AuthServiceError({
          code: "conversation_archived",
          message: "Archived conversations cannot accept new runs.",
          statusCode: 409,
        });
      }

      const messageSequence = await store.getNextMessageSequence(bundle.conversation.id);
      const runId = createClawbackId("run");
      const inputMessageId = createClawbackId("msg");
      const content = [
        {
          type: "text" as const,
          text: parsed.input.text,
        },
      ];

      const inputMessage = await store.createMessage({
        id: inputMessageId,
        workspaceId: actor.workspace.id,
        conversationId: bundle.conversation.id,
        runId,
        sequence: messageSequence,
        role: "user",
        authorUserId: actor.user.id,
        contentJson: content,
        citationsJson: null,
        tokenUsageJson: null,
        createdAt: now,
      });

      await store.touchConversation(bundle.conversation.id, now);

      const run = await store.createRun({
        id: runId,
        workspaceId: actor.workspace.id,
        agentId: bundle.agent.id,
        agentVersionId: bundle.agentVersion.id,
        conversationId: bundle.conversation.id,
        inputMessageId,
        initiatedBy: actor.user.id,
        channel: bundle.conversation.channel,
        status: "queued",
        startedAt: null,
        completedAt: null,
        currentStep: "queued",
        summary: null,
        createdAt: now,
        updatedAt: now,
      });

      const snapshot = this.buildRunSnapshot({
        actor,
        run,
        conversation: bundle.conversation,
        agent: bundle.agent,
        agentVersion: bundle.agentVersion,
        inputMessage,
      });

      await store.createRunSnapshot({
        id: createClawbackId("rsnp"),
        workspaceId: actor.workspace.id,
        runId,
        snapshotVersion: snapshot.snapshot_version,
        agentSnapshotJson: snapshot.agent,
        toolPolicyJson: snapshot.tool_policy,
        connectorScopeJson: snapshot.connector_scope,
        modelProfileJson: snapshot.model_profile,
        actorSummaryJson: snapshot.actor,
        approvalPolicyJson: snapshot.approval_policy,
        conversationBindingJson: snapshot.conversation,
        inputMessageJson: snapshot.input_message,
        createdAt: now,
      });

      await store.appendRunEvent({
        id: createClawbackId("evt"),
        workspaceId: actor.workspace.id,
        runId,
        eventType: "run.created",
        sequence: 1,
        actorType: "user",
        actorId: actor.user.id,
        payloadJson: {
          conversation_id: bundle.conversation.id,
          input_message_id: inputMessageId,
        },
        occurredAt: now,
      });

      await store.appendRunEvent({
        id: createClawbackId("evt"),
        workspaceId: actor.workspace.id,
        runId,
        eventType: "run.snapshot.created",
        sequence: 2,
        actorType: "service",
        actorId: "control-plane",
        payloadJson: {
          snapshot_version: snapshot.snapshot_version,
        },
        occurredAt: now,
      });

      await store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: actor.workspace.id,
        actorType: "user",
        actorId: actor.user.id,
        eventType: "run.created",
        targetType: "run",
        targetId: run.id,
        summary: "Conversation run queued",
        payloadJson: {
          conversation_id: bundle.conversation.id,
          agent_version_id: bundle.agentVersion.id,
        },
        occurredAt: now,
      });

      return {
        runId,
        conversationId: bundle.conversation.id,
        inputMessageId,
      };
    });

    try {
      await this.options.queue.enqueueRun({
        job_type: RUN_EXECUTE_JOB_NAME,
        run_id: result.runId,
        workspace_id: actor.workspace.id,
        attempt: 1,
        queued_at: now.toISOString(),
      });
    } catch (error) {
      const failedAt = this.now();
      await this.options.store.updateRun(result.runId, {
        status: "failed",
        completedAt: failedAt,
        currentStep: null,
        summary: error instanceof Error ? error.message : "Run queue dispatch failed.",
        updatedAt: failedAt,
      });
      await this.options.store.appendRunEvent({
        id: createClawbackId("evt"),
        workspaceId: actor.workspace.id,
        runId: result.runId,
        eventType: "run.failed",
        sequence: 3,
        actorType: "service",
        actorId: "control-plane",
        payloadJson: {
          error: error instanceof Error ? error.message : "Run queue dispatch failed.",
          stage: "queue.enqueue",
        },
        occurredAt: failedAt,
      });
      throw new AuthServiceError({
        code: "run_enqueue_failed",
        message:
          error instanceof Error
            ? `Run was created but could not be queued: ${error.message}`
            : "Run was created but could not be queued.",
        statusCode: 502,
      });
    }

    return createRunResponseSchema.parse({
      run_id: result.runId,
      conversation_id: result.conversationId,
      input_message_id: result.inputMessageId,
      stream_url: `${this.streamBasePath}/${result.runId}/stream`,
    });
  }

  async getRun(actor: SessionContext, runId: string): Promise<RunRecordView> {
    const run = await this.options.store.findRunById(actor.workspace.id, runId);
    if (!run) {
      throw new AuthServiceError({
        code: "run_not_found",
        message: "Run not found.",
        statusCode: 404,
      });
    }

    await this.getRequiredConversationBundle(actor, run.conversationId);
    return this.toRunView(run);
  }

  async listRunEvents(actor: SessionContext, runId: string) {
    const context = await this.getRunStreamContext(actor, runId);
    const events = await this.options.store.getRunEventsAfter(context.runId, 0);

    return events.map((event) => this.toRunEventView(event));
  }

  async getRunStreamContext(actor: SessionContext, runId: string) {
    const run = await this.options.store.findRunById(actor.workspace.id, runId);
    if (!run) {
      throw new AuthServiceError({
        code: "run_not_found",
        message: "Run not found.",
        statusCode: 404,
      });
    }

    const bundle = await this.getRequiredConversationBundle(actor, run.conversationId);

    return {
      runId: run.id,
      conversationId: bundle.conversation.id,
      terminal: run.status === "completed" || run.status === "failed" || run.status === "canceled",
    };
  }

  async listRunEventsAfter(actor: SessionContext, runId: string, afterSequence: number) {
    const context = await this.getRunStreamContext(actor, runId);
    const events = await this.options.store.getRunEventsAfter(context.runId, afterSequence);

    return events.map((event) => this.toRunEventView(event));
  }

  private async getRequiredConversationBundle(actor: SessionContext, conversationId: string) {
    const bundle = await this.options.store.findConversationBundle(actor.workspace.id, conversationId);
    if (!bundle) {
      throw new AuthServiceError({
        code: "conversation_not_found",
        message: "Conversation not found.",
        statusCode: 404,
      });
    }

    this.assertCanAccessConversation(actor, bundle.conversation);
    return bundle;
  }

  private assertCanStartConversation(
    actor: SessionContext,
    agent: StoredAgent,
    publishedVersion: StoredAgentVersion | null,
  ) {
    if (!publishedVersion || publishedVersion.status !== "published") {
      throw new AuthServiceError({
        code: "agent_not_published",
        message: "A conversation can only start from a published agent version.",
        statusCode: 409,
      });
    }

    if (actor.membership.role === "admin") {
      return;
    }

    if (agent.scope === "personal") {
      if (agent.ownerUserId === actor.user.id) {
        return;
      }
      throw new AuthServiceError({
        code: "agent_not_found",
        message: "Agent not found.",
        statusCode: 404,
      });
    }

    if (agent.status !== "active") {
      throw new AuthServiceError({
        code: "agent_not_found",
        message: "Agent not found.",
        statusCode: 404,
      });
    }
  }

  private assertCanAccessConversation(actor: SessionContext, conversation: StoredConversation) {
    if (actor.membership.role === "admin") {
      return;
    }

    if (conversation.startedBy !== actor.user.id) {
      throw new AuthServiceError({
        code: "conversation_not_found",
        message: "Conversation not found.",
        statusCode: 404,
      });
    }
  }

  private buildRunSnapshot(params: {
    actor: SessionContext;
    run: StoredRun;
    conversation: StoredConversation;
    agent: StoredAgent;
    agentVersion: StoredAgentVersion;
    inputMessage: StoredMessage;
  }): RunSnapshotView {
    const runtimeAgentId = buildRuntimeAgentId(params.agentVersion.id);
    const modelProfile = modelRoutingSchema.parse(toObjectRecord(params.agentVersion.modelRoutingJson));
    const toolPolicy = toolPolicySchema.parse(toObjectRecord(params.agentVersion.toolPolicyJson));
    const connectorScope = connectorScopeSchema.parse(
      toObjectRecord(params.agentVersion.connectorPolicyJson),
    );
    const approvalPolicy = approvalPolicySchema.parse({ mode: V1_APPROVAL_MODE });

    return runSnapshotSchema.parse({
      snapshot_version: 1,
      run_id: params.run.id,
      workspace_id: params.run.workspaceId,
      agent: {
        agent_id: params.agent.id,
        agent_version_id: params.agentVersion.id,
        scope: params.agent.scope,
        name: params.agent.name,
        persona: params.agentVersion.personaJson,
        instructions_markdown: params.agentVersion.instructionsMarkdown,
      },
      model_profile: modelProfile,
      conversation: {
        conversation_id: params.conversation.id,
        channel: params.conversation.channel,
        runtime_session_key: buildRuntimeSessionKey(runtimeAgentId, params.conversation.id),
      },
      actor: {
        user_id: params.actor.user.id,
        membership_role: params.actor.membership.role,
      },
      input_message: {
        message_id: params.inputMessage.id,
        content: params.inputMessage.contentJson,
      },
      tool_policy: toolPolicy,
      connector_scope: connectorScope,
      approval_policy: approvalPolicy,
    });
  }

  private toConversationView(conversation: StoredConversation): ConversationView {
    return conversationSchema.parse({
      id: conversation.id,
      workspace_id: conversation.workspaceId,
      agent_id: conversation.agentId,
      agent_version_id: conversation.agentVersionId,
      channel: conversation.channel,
      started_by: conversation.startedBy,
      status: conversation.status,
      title: conversation.title,
      last_message_at: conversation.lastMessageAt.toISOString(),
      created_at: conversation.createdAt.toISOString(),
      updated_at: conversation.updatedAt.toISOString(),
    });
  }

  private toMessageView(message: StoredMessage) {
    return messageSchema.parse({
      id: message.id,
      workspace_id: message.workspaceId,
      conversation_id: message.conversationId,
      run_id: message.runId,
      sequence: message.sequence,
      role: message.role,
      author_user_id: message.authorUserId,
      content: message.contentJson,
      citations: message.citationsJson,
      token_usage: message.tokenUsageJson,
      created_at: message.createdAt.toISOString(),
    });
  }

  private toRunView(run: StoredRun) {
    return getRunResponseSchema.parse({
      id: run.id,
      workspace_id: run.workspaceId,
      agent_id: run.agentId,
      agent_version_id: run.agentVersionId,
      conversation_id: run.conversationId,
      input_message_id: run.inputMessageId,
      initiated_by: run.initiatedBy,
      channel: run.channel,
      status: run.status,
      started_at: run.startedAt?.toISOString() ?? null,
      completed_at: run.completedAt?.toISOString() ?? null,
      current_step: run.currentStep,
      summary: run.summary,
      created_at: run.createdAt.toISOString(),
      updated_at: run.updatedAt.toISOString(),
    });
  }

  private toRunEventView(event: StoredRunEvent) {
    return runEventSchema.parse({
      event_id: event.id,
      event_type: event.eventType,
      workspace_id: event.workspaceId,
      run_id: event.runId,
      sequence: event.sequence,
      occurred_at: event.occurredAt.toISOString(),
      actor: {
        type: event.actorType,
        id: event.actorId,
      },
      payload: event.payloadJson,
    });
  }
}
