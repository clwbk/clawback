import { describe, expect, it } from "vitest";

import { executionContinuityStateSchema } from "./execution-continuity.js";

describe("executionContinuityStateSchema", () => {
  it("accepts the normalized worker-neutral continuity shape", () => {
    expect(
      executionContinuityStateSchema.parse({
        continuity_family: "governed_action",
        state: "waiting_review",
        current_step: "wait_for_review",
        pause_reason: "human_review",
        resume_reason: null,
        last_decision: "request_review",
        target_worker_id: null,
        downstream_work_item_id: null,
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

  it("normalizes legacy Follow-Up continuity records", () => {
    expect(
      executionContinuityStateSchema.parse({
        worker_kind: "follow_up",
        state: "running",
        current_step: "resume_after_review",
        pause_reason: null,
        resume_reason: "review_approved",
        last_decision: "request_review",
      }),
    ).toEqual({
      continuity_family: "governed_action",
      state: "running",
      current_step: "resume_after_review",
      pause_reason: null,
      resume_reason: "review_approved",
      last_decision: "request_review",
      target_worker_id: null,
      downstream_work_item_id: null,
    });
  });
});
