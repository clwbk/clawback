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

function sortRunsByCreatedAt(runsById: Record<string, RunRecord>) {
  return [...Object.values(runsById)].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

function findLatestStructuredWorkRunId(params: {
  runsById: Record<string, RunRecord>;
  runEventsById: Record<string, RunEventRecord[]>;
}) {
  return (
    sortRunsByCreatedAt(params.runsById).find((run) => {
      const events = params.runEventsById[run.id] ?? [];
      return (
        extractGovernedActionSummary(events) !== null ||
        run.status === "waiting_for_approval" ||
        run.status === "failed"
      );
    })?.id ?? null
  );
}

export function extractWorkbenchSummary(params: {
  conversationDetail: ConversationDetail | null;
  runsById: Record<string, RunRecord>;
  runEventsById: Record<string, RunEventRecord[]>;
}): WorkbenchSummary {
  const messages = params.conversationDetail?.messages ?? [];
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const latestStructuredWorkRunId = findLatestStructuredWorkRunId({
    runsById: params.runsById,
    runEventsById: params.runEventsById,
  });
  const latestRunIdFromRuns = sortRunsByCreatedAt(params.runsById)[0]?.id ?? null;
  const latestRunId =
    latestStructuredWorkRunId ??
    latestAssistantMessage?.run_id ??
    latestRunIdFromRuns ??
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
