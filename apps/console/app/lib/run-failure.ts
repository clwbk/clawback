import type { RunEventRecord, RunRecord } from "./control-plane";

export type RunFailurePresentation = {
  title: string;
  message: string;
};

function latestRunFailureMessage(run: RunRecord, events: RunEventRecord[]) {
  const failedEvent = [...events]
    .reverse()
    .find((event) => event.event_type === "run.failed");
  const eventMessage =
    typeof failedEvent?.payload.error === "string" ? failedEvent.payload.error.trim() : "";
  const runSummary = typeof run.summary === "string" ? run.summary.trim() : "";
  return eventMessage || runSummary || "The request could not be completed.";
}

export function buildRunFailurePresentation(params: {
  run: RunRecord;
  events: RunEventRecord[];
  isAdmin?: boolean;
}): RunFailurePresentation {
  const rawMessage = latestRunFailureMessage(params.run, params.events);
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return {
      title: "Run timed out",
      message: params.isAdmin
        ? rawMessage
        : "The request took too long and did not complete.",
    };
  }

  if (
    normalized.includes("api key") ||
    normalized.includes("provider") ||
    normalized.includes("gateway") ||
    normalized.includes("econnrefused") ||
    normalized.includes("unavailable")
  ) {
    return {
      title: "Demo runtime unavailable",
      message: params.isAdmin
        ? rawMessage
        : "The model runtime is not ready for live answers right now.",
    };
  }

  return {
    title: "Request failed",
    message: params.isAdmin ? rawMessage : "The request could not be completed.",
  };
}
