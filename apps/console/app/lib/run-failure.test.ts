import { describe, expect, it } from "vitest";

import { buildRunFailurePresentation } from "./run-failure";

const baseRun = {
  id: "run_1",
  workspace_id: "ws_1",
  agent_id: "agt_1",
  conversation_id: "cnv_1",
  agent_version_id: "agv_1",
  input_message_id: "msg_in_1",
  status: "failed" as const,
  current_step: null,
  channel: "web" as const,
  initiated_by: "usr_1",
  started_at: "2026-03-16T16:00:00.000Z",
  completed_at: "2026-03-16T16:00:10.000Z",
  summary: "No API key found for provider anthropic.",
  created_at: "2026-03-16T16:00:00.000Z",
  updated_at: "2026-03-16T16:00:10.000Z",
};

describe("buildRunFailurePresentation", () => {
  it("sanitizes provider-key failures for non-admin viewers", () => {
    expect(
      buildRunFailurePresentation({
        run: baseRun,
        events: [],
        isAdmin: false,
      }),
    ).toEqual({
      title: "Demo runtime unavailable",
      message: "The model runtime is not ready for live answers right now.",
    });
  });

  it("keeps provider-key failures explicit for admins", () => {
    expect(
      buildRunFailurePresentation({
        run: baseRun,
        events: [],
        isAdmin: true,
      }),
    ).toEqual({
      title: "Demo runtime unavailable",
      message: "No API key found for provider anthropic.",
    });
  });

  it("maps timeouts to a clearer user-facing message", () => {
    expect(
      buildRunFailurePresentation({
        run: {
          ...baseRun,
          summary: "Run timed out waiting for model output.",
        },
        events: [],
      }),
    ).toEqual({
      title: "Run timed out",
      message: "The request took too long and did not complete.",
    });
  });
});
