import type {
  ConversationDetail,
  RetrievalCitation,
  RunEventRecord,
  RunRecord,
} from "./control-plane";
import {
  extractGovernedActionSummary,
  type GovernedActionSummary,
} from "./run-governed-action";

export type WorkbenchSummary = {
  latestRunId: string | null;
  latestCitations: RetrievalCitation[];
  governedAction: GovernedActionSummary | null;
};

export function extractWorkbenchSummary(params: {
  conversationDetail: ConversationDetail | null;
  runsById: Record<string, RunRecord>;
  runEventsById: Record<string, RunEventRecord[]>;
}): WorkbenchSummary {
  const messages = params.conversationDetail?.messages ?? [];
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const latestRunId =
    latestAssistantMessage?.run_id ??
    [...Object.values(params.runsById)]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0]?.id ??
    null;
  const latestRunEvents = latestRunId ? (params.runEventsById[latestRunId] ?? []) : [];

  return {
    latestRunId,
    latestCitations: latestAssistantMessage?.citations ?? [],
    governedAction:
      latestRunId && params.runsById[latestRunId]
        ? extractGovernedActionSummary(latestRunEvents)
        : null,
  };
}
