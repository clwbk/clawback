import type {
  FollowUpExecutionPauseReason,
  FollowUpExecutionResumeReason,
  FollowUpExecutionStateRecord,
  WorkerDecision,
} from "@clawback/contracts";
import {
  buildPausedExecutionContinuityState,
  markExecutionContinuityActionRunning,
  markExecutionContinuityCompleted,
  markExecutionContinuityFailed,
  parseExecutionContinuityState,
  resumeExecutionContinuityAfterReviewDecision,
  resumeExecutionContinuityAfterRouteConfirmation,
} from "./execution-continuity.js";

export function parseFollowUpExecutionState(
  value: unknown,
): FollowUpExecutionStateRecord | null {
  return parseExecutionContinuityState(value);
}

export function buildFollowUpPausedExecutionState(input: {
  lastDecision: WorkerDecision["decision"];
  pauseReason: FollowUpExecutionPauseReason;
  targetWorkerId?: string | null;
}): FollowUpExecutionStateRecord {
  return buildPausedExecutionContinuityState(input);
}

export function resumeFollowUpExecutionAfterReviewDecision(
  state: FollowUpExecutionStateRecord,
  decision: "approved" | "denied",
): FollowUpExecutionStateRecord {
  return resumeExecutionContinuityAfterReviewDecision(state, decision);
}

export function markFollowUpExecutionActionRunning(
  state: FollowUpExecutionStateRecord,
): FollowUpExecutionStateRecord {
  return markExecutionContinuityActionRunning(state);
}

export function markFollowUpExecutionCompleted(
  state: FollowUpExecutionStateRecord,
  resumeReason: FollowUpExecutionResumeReason | null = state.resume_reason,
): FollowUpExecutionStateRecord {
  return markExecutionContinuityCompleted(state, resumeReason);
}

export function markFollowUpExecutionFailed(
  state: FollowUpExecutionStateRecord,
): FollowUpExecutionStateRecord {
  return markExecutionContinuityFailed(state);
}

export function resumeFollowUpExecutionAfterRouteConfirmation(
  state: FollowUpExecutionStateRecord,
  input: {
    targetWorkerId: string | null;
    downstreamWorkItemId: string;
  },
): FollowUpExecutionStateRecord {
  return resumeExecutionContinuityAfterRouteConfirmation(state, input);
}
