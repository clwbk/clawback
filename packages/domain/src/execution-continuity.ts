import type {
  ExecutionContinuityPauseReason,
  ExecutionContinuityResumeReason,
  ExecutionContinuityStateRecord,
  WorkerDecision,
} from "@clawback/contracts";
import { executionContinuityStateSchema } from "@clawback/contracts";

export function parseExecutionContinuityState(
  value: unknown,
): ExecutionContinuityStateRecord | null {
  if (!value) {
    return null;
  }
  return executionContinuityStateSchema.parse(value);
}

export function buildPausedExecutionContinuityState(input: {
  lastDecision: WorkerDecision["decision"];
  pauseReason: ExecutionContinuityPauseReason;
  targetWorkerId?: string | null;
}): ExecutionContinuityStateRecord {
  return {
    continuity_family: "governed_action",
    state: "waiting_review",
    current_step: "wait_for_review",
    pause_reason: input.pauseReason,
    resume_reason: null,
    last_decision: input.lastDecision,
    target_worker_id: input.targetWorkerId ?? null,
    downstream_work_item_id: null,
  };
}

export function resumeExecutionContinuityAfterReviewDecision(
  state: ExecutionContinuityStateRecord,
  decision: "approved" | "denied",
): ExecutionContinuityStateRecord {
  if (decision === "approved") {
    return {
      ...state,
      state: "running",
      current_step: "resume_after_review",
      pause_reason: null,
      resume_reason: "review_approved",
    };
  }

  return {
    ...state,
    state: "completed",
    current_step: "record_outcome",
    pause_reason: null,
    resume_reason: "review_denied",
  };
}

export function markExecutionContinuityActionRunning(
  state: ExecutionContinuityStateRecord,
): ExecutionContinuityStateRecord {
  return {
    ...state,
    state: "running",
    current_step: "execute_action",
    pause_reason: null,
  };
}

export function markExecutionContinuityCompleted(
  state: ExecutionContinuityStateRecord,
  resumeReason: ExecutionContinuityResumeReason | null = state.resume_reason,
): ExecutionContinuityStateRecord {
  return {
    ...state,
    state: "completed",
    current_step: "record_outcome",
    pause_reason: null,
    resume_reason: resumeReason,
  };
}

export function markExecutionContinuityFailed(
  state: ExecutionContinuityStateRecord,
): ExecutionContinuityStateRecord {
  return {
    ...state,
    state: "failed",
    current_step: "execute_action",
    pause_reason: null,
  };
}

export function resumeExecutionContinuityAfterRouteConfirmation(
  state: ExecutionContinuityStateRecord,
  input: {
    targetWorkerId: string | null;
    downstreamWorkItemId: string;
  },
): ExecutionContinuityStateRecord {
  return {
    ...state,
    state: "running",
    current_step: "resume_after_route_confirmation",
    pause_reason: null,
    resume_reason: "route_confirmed",
    target_worker_id: input.targetWorkerId ?? state.target_worker_id ?? null,
    downstream_work_item_id: input.downstreamWorkItemId,
  };
}
