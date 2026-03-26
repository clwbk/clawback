import type { WorkerDecision, WorkerTriageRecord } from "@clawback/contracts";

export function toCanonicalSourceTriageRecord(
  triage: WorkerDecision | WorkerTriageRecord,
): WorkerTriageRecord {
  return cloneWorkerTriageRecord(triage);
}

export function projectCanonicalSourceTriageRecord(
  triage: WorkerTriageRecord | null,
): WorkerTriageRecord | null {
  return triage ? cloneWorkerTriageRecord(triage) : null;
}

function cloneWorkerTriageRecord(
  triage: WorkerDecision | WorkerTriageRecord,
): WorkerTriageRecord {
  return {
    ...triage,
    reasons: [...triage.reasons],
  };
}
