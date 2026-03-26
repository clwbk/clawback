import { z } from "zod";

import {
  messageSchema,
  runEventSchema,
  runSnapshotSchema,
} from "@clawback/contracts";
import { buildRuntimeAgentId, createClawbackId } from "@clawback/domain";
import type {
  RuntimeBackend,
  RuntimeExecutionInput,
  RuntimeStreamEvent,
} from "@clawback/model-adapters";
import { buildRetrievalAugmentedPrompt } from "@clawback/retrieval";

import type { RunExecutionStore, RunJob } from "./types.js";

type RunExecutionServiceOptions = {
  store: RunExecutionStore;
  runtimeBackend: RuntimeBackend;
  searchRetrieval?: (input: {
    workspaceId: string;
    actor: {
      userId: string;
      membershipRole: "admin" | "user";
    };
    connectorScope: {
      enabled: boolean;
      connectorIds: string[];
    };
    query: string;
    limit?: number;
  }) => Promise<{
    query: string;
    results: Array<{
      connector_id: string;
      connector_name: string;
      document_id: string;
      document_version_id: string;
      chunk_id: string;
      title: string | null;
      path_or_uri: string;
      snippet: string;
      score: number;
      content: string;
    }>;
  }>;
  now?: () => Date;
};

export class RunExecutionService {
  private readonly now: () => Date;
  private readonly eventWriteChainByRunId = new Map<string, Promise<void>>();

  constructor(private readonly options: RunExecutionServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async execute(job: RunJob) {
    const context = await this.options.store.getRunExecutionContext(job.workspace_id, job.run_id);
    if (!context) {
      return { outcome: "missing" as const };
    }

    if (context.run.status === "completed" || context.run.status === "failed" || context.run.status === "canceled") {
      return { outcome: "ignored" as const };
    }

    const snapshot = runSnapshotSchema.parse({
      snapshot_version: context.snapshot.snapshotVersion,
      run_id: context.snapshot.runId,
      workspace_id: context.snapshot.workspaceId,
      agent: context.snapshot.agentSnapshotJson,
      model_profile: context.snapshot.modelProfileJson,
      conversation: context.snapshot.conversationBindingJson,
      actor: context.snapshot.actorSummaryJson,
      input_message: context.snapshot.inputMessageJson,
      tool_policy: context.snapshot.toolPolicyJson,
      connector_scope: context.snapshot.connectorScopeJson,
      approval_policy: context.snapshot.approvalPolicyJson,
    });

    const startedAt = this.now();

    try {
      await this.options.store.updateRun(job.run_id, {
        status: "running",
        startedAt,
        currentStep: "claimed",
        updatedAt: startedAt,
      });

      await this.appendEvent({
        workspaceId: job.workspace_id,
        runId: job.run_id,
        eventType: "run.claimed",
        actorType: "service",
        actorId: "runtime-worker",
        occurredAt: startedAt,
        payloadJson: {
          attempt: job.attempt,
        },
      });

      const originalMessageText = snapshot.input_message.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("")
        .trim();
      let messageText = originalMessageText;
      let citations: Array<{
        connector_id: string;
        connector_name: string;
        document_id: string;
        document_version_id: string;
        chunk_id: string;
        title: string | null;
        path_or_uri: string;
        snippet: string;
        score: number;
      }> | null = null;

      if (
        this.options.searchRetrieval &&
        snapshot.connector_scope.enabled &&
        snapshot.connector_scope.connector_ids.length > 0 &&
        originalMessageText
      ) {
        const retrievalRequestedAt = this.now();
        await this.options.store.updateRun(job.run_id, {
          currentStep: "retrieving",
          updatedAt: retrievalRequestedAt,
        });
        await this.appendEvent({
          workspaceId: job.workspace_id,
          runId: job.run_id,
          eventType: "run.retrieval.requested",
          actorType: "service",
          actorId: "runtime-worker",
          occurredAt: retrievalRequestedAt,
          payloadJson: {
            connector_ids: snapshot.connector_scope.connector_ids,
            query: originalMessageText,
          },
        });

        try {
          const retrieval = await this.options.searchRetrieval({
            workspaceId: job.workspace_id,
            actor: {
              userId: snapshot.actor.user_id,
              membershipRole: snapshot.actor.membership_role,
            },
            connectorScope: {
              enabled: snapshot.connector_scope.enabled,
              connectorIds: snapshot.connector_scope.connector_ids,
            },
            query: originalMessageText,
            limit: 6,
          });
          const retrievalStatus = retrieval.results.length > 0 ? "applied" : "no_results";
          const retrievalCitations = retrieval.results.map(({ content: _content, ...result }) => result);

          messageText = buildRetrievalAugmentedPrompt({
            question: originalMessageText,
            results: retrieval.results.map((result) => ({
              title: result.title,
              path_or_uri: result.path_or_uri,
              content: result.content,
            })),
            status: retrievalStatus,
          });

          if (retrievalStatus === "applied") {
            citations = retrievalCitations;
          }

          await this.appendEvent({
            workspaceId: job.workspace_id,
            runId: job.run_id,
            eventType: "run.retrieval.completed",
            actorType: "service",
            actorId: "runtime-worker",
            occurredAt: this.now(),
            payloadJson: {
              query: retrieval.query,
              requested_connector_ids: snapshot.connector_scope.connector_ids,
              retrieval_status: retrievalStatus,
              degraded: retrievalStatus !== "applied",
              result_count: retrieval.results.length,
              citation_count: retrievalCitations.length,
              citations: retrievalCitations,
            },
          });
        } catch (error) {
          messageText = buildRetrievalAugmentedPrompt({
            question: originalMessageText,
            results: [],
            status: "failed",
          });

          await this.appendEvent({
            workspaceId: job.workspace_id,
            runId: job.run_id,
            eventType: "run.retrieval.completed",
            actorType: "service",
            actorId: "runtime-worker",
            occurredAt: this.now(),
            payloadJson: {
              query: originalMessageText,
              requested_connector_ids: snapshot.connector_scope.connector_ids,
              retrieval_status: "failed",
              degraded: true,
              citation_count: 0,
              result_count: 0,
              citations: [],
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }

      const executionInput: RuntimeExecutionInput = {
        runId: job.run_id,
        conversationId: snapshot.conversation.conversation_id,
        runtimeAgentId: buildRuntimeAgentId(snapshot.agent.agent_version_id),
        runtimeSessionKey: snapshot.conversation.runtime_session_key,
        messageText,
        idempotencyKey: `${job.run_id}:${job.attempt}`,
        timeoutMs: 30_000,
        publication: {
          workspaceId: job.workspace_id,
          agentId: snapshot.agent.agent_id,
          agentVersionId: snapshot.agent.agent_version_id,
          agentName: snapshot.agent.name,
          instructionsMarkdown: snapshot.agent.instructions_markdown,
          persona: snapshot.agent.persona,
          modelRouting: snapshot.model_profile,
          toolPolicy: {
            allowedTools: snapshot.tool_policy.allowed_tools,
          },
          runtimeAgentId: buildRuntimeAgentId(snapshot.agent.agent_version_id),
        },
      };

      let assistantMessageId: string | null = null;

      const result = await this.options.runtimeBackend.executeRun(executionInput, {
        onAccepted: async (accepted) => {
          await this.options.store.updateRun(job.run_id, {
            currentStep: "dispatched",
            updatedAt: this.now(),
          });
          await this.appendEvent({
            workspaceId: job.workspace_id,
            runId: job.run_id,
            eventType: "run.dispatch.accepted",
            actorType: "service",
            actorId: "runtime-worker",
            occurredAt: this.now(),
            payloadJson: {
              runtime_run_id: accepted.runtimeRunId,
              accepted_at: accepted.acceptedAt,
            },
          });
        },
        onEvent: async (event) => {
          const mapped = this.mapRuntimeEvent(job.workspace_id, job.run_id, event);
          if (!mapped) {
            return;
          }

          if (mapped.eventType === "run.model.started") {
            await this.options.store.updateRun(job.run_id, {
              currentStep: "modeling",
              updatedAt: this.now(),
            });
          }

          await this.appendEvent({
            workspaceId: job.workspace_id,
            runId: job.run_id,
            eventType: mapped.eventType,
            actorType: "service",
            actorId: "runtime-worker",
            occurredAt: new Date(event.occurredAt),
            payloadJson: mapped.payload,
          });
        },
      });

      const completedAt = result.endedAt ? new Date(result.endedAt) : this.now();
      if (result.completionStatus !== "completed") {
        await this.options.store.updateRun(job.run_id, {
          status: "failed",
          completedAt,
          currentStep: null,
          summary: result.errorMessage ?? "Run failed.",
          updatedAt: completedAt,
        });

        await this.appendEvent({
          workspaceId: job.workspace_id,
          runId: job.run_id,
          eventType: "run.failed",
          actorType: "service",
          actorId: "runtime-worker",
          occurredAt: completedAt,
          payloadJson: {
            runtime_run_id: result.runtimeRunId,
            error: result.errorMessage ?? "Run failed.",
            completion_status: result.completionStatus,
          },
        });

        return { outcome: "failed" as const };
      }

      if (result.assistantText) {
        const messageSequence = await this.options.store.getNextMessageSequence(snapshot.conversation.conversation_id);
        const assistantMessage = messageSchema.parse({
          id: createClawbackId("msg"),
          workspace_id: job.workspace_id,
          conversation_id: snapshot.conversation.conversation_id,
          run_id: job.run_id,
          sequence: messageSequence,
          role: "assistant",
          author_user_id: null,
          content: [
            {
              type: "text",
              text: result.assistantText,
            },
          ],
          citations,
          token_usage: null,
          created_at: completedAt.toISOString(),
        });

        const persisted = await this.options.store.createMessage({
          id: assistantMessage.id,
          workspaceId: assistantMessage.workspace_id,
          conversationId: assistantMessage.conversation_id,
          runId: assistantMessage.run_id,
          sequence: assistantMessage.sequence,
          role: assistantMessage.role,
          authorUserId: assistantMessage.author_user_id,
          contentJson: assistantMessage.content,
          citationsJson: assistantMessage.citations,
          tokenUsageJson: assistantMessage.token_usage,
          createdAt: new Date(assistantMessage.created_at),
        });

        assistantMessageId = persisted.id;
        await this.options.store.touchConversation(snapshot.conversation.conversation_id, completedAt);
      }

      await this.options.store.updateRun(job.run_id, {
        status: "completed",
        completedAt,
        currentStep: null,
        summary: result.assistantText ? result.assistantText.slice(0, 240) : null,
        updatedAt: completedAt,
      });

      await this.appendEvent({
        workspaceId: job.workspace_id,
        runId: job.run_id,
        eventType: "run.completed",
        actorType: "service",
        actorId: "runtime-worker",
        occurredAt: completedAt,
        payloadJson: {
          runtime_run_id: result.runtimeRunId,
          assistant_message_id: assistantMessageId,
          assistant_text: result.assistantText,
        },
      });

      return { outcome: "completed" as const };
    } catch (error) {
      const failedAt = this.now();
      const message = error instanceof Error ? error.message : String(error);

      await this.options.store.updateRun(job.run_id, {
        status: "failed",
        completedAt: failedAt,
        currentStep: null,
        summary: message,
        updatedAt: failedAt,
      });
      await this.appendEvent({
        workspaceId: job.workspace_id,
        runId: job.run_id,
        eventType: "run.failed",
        actorType: "service",
        actorId: "runtime-worker",
        occurredAt: failedAt,
        payloadJson: {
          error: message,
        },
      });

      return { outcome: "failed" as const };
    } finally {
      this.eventWriteChainByRunId.delete(job.run_id);
    }
  }

  private isRunEventSequenceConflict(error: unknown) {
    let current: unknown = error;
    while (current && typeof current === "object") {
      const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
      if (
        candidate.code === "23505" &&
        candidate.constraint === "run_events_run_sequence_key"
      ) {
        return true;
      }
      current = candidate.cause;
    }

    return false;
  }

  private mapRuntimeEvent(_workspaceId: string, _runId: string, event: RuntimeStreamEvent) {
    if (event.type === "assistant") {
      const delta = typeof event.payload.delta === "string" ? event.payload.delta : "";
      if (!delta) {
        return null;
      }

        return {
          eventType: "run.output.delta" as const,
          payload: {
            delta,
        },
      };
    }

    if (event.type === "lifecycle") {
      if (event.phase === "start") {
        return {
          eventType: "run.model.started" as const,
          payload: {},
        };
      }

      return null;
    }

    if (event.type === "tool") {
      const phase = event.phase ?? "";
      if (phase === "start") {
        return {
          eventType: "run.tool.requested" as const,
          payload: event.payload,
        };
      }

      if (phase === "result" || phase === "end") {
        return {
          eventType: "run.tool.completed" as const,
          payload: event.payload,
        };
      }
    }

    return null;
  }

  private async appendEvent(params: {
    workspaceId: string;
    runId: string;
    eventType: z.infer<typeof runEventSchema>["event_type"];
    actorType: "user" | "service" | "system";
    actorId: string;
    occurredAt: Date;
    payloadJson: Record<string, unknown>;
  }) {
    const previousWrite = this.eventWriteChainByRunId.get(params.runId) ?? Promise.resolve();
    const nextWrite = previousWrite.then(async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const sequence = (await this.options.store.getMaxRunEventSequence(params.runId)) + 1;

        try {
          await this.options.store.appendRunEvent({
            id: createClawbackId("evt"),
            workspaceId: params.workspaceId,
            runId: params.runId,
            eventType: params.eventType,
            sequence,
            actorType: params.actorType,
            actorId: params.actorId,
            payloadJson: params.payloadJson,
            occurredAt: params.occurredAt,
          });
          return;
        } catch (error) {
          if (!this.isRunEventSequenceConflict(error) || attempt === 4) {
            throw error;
          }
        }
      }
    });

    this.eventWriteChainByRunId.set(params.runId, nextWrite.catch(() => undefined));
    await nextWrite;
  }
}
