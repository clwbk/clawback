import { describe, expect, it } from "vitest";

import {
  buildPausedExecutionContinuityState,
  parseExecutionContinuityState,
  resumeExecutionContinuityAfterReviewDecision,
} from "./execution-continuity.js";

describe("execution continuity helpers", () => {
  it("builds paused continuity in the worker-neutral shape", () => {
    expect(
      buildPausedExecutionContinuityState({
        lastDecision: "request_review",
        pauseReason: "human_review",
      }),
    ).toEqual({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "request_review",
      target_worker_id: null,
      downstream_work_item_id: null,
    });
  });

  it("parses and normalizes legacy Follow-Up records before resuming", () => {
    const parsed = parseExecutionContinuityState({
      worker_kind: "follow_up",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "request_review",
    });

    expect(
      resumeExecutionContinuityAfterReviewDecision(parsed!, "approved"),
    ).toMatchObject({
      continuity_family: "governed_action",
      state: "running",
      current_step: "resume_after_review",
      resume_reason: "review_approved",
    });
  });
});
