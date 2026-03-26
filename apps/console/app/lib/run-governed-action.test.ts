import { describe, expect, it } from "vitest";

import { extractGovernedActionSummary } from "./run-governed-action";
import type { RunEventRecord } from "@/lib/control-plane";

function buildEvent(
  sequence: number,
  event_type: RunEventRecord["event_type"],
  payload: Record<string, unknown>,
): RunEventRecord {
  return {
    event_id: `evt_${sequence}`,
    event_type,
    workspace_id: "ws_1",
    run_id: "run_1",
    sequence,
    occurred_at: "2026-03-12T17:30:00.000Z",
    actor: { type: "service", id: "test" },
    payload,
  };
}

describe("extractGovernedActionSummary", () => {
  it("extracts the approved create-ticket summary from run events", () => {
    const summary = extractGovernedActionSummary([
      buildEvent(1, "run.retrieval.completed", { result_count: 3 }),
      buildEvent(2, "run.tool.requested", {
        name: "create_ticket",
        args: { title: "Follow-up: checkout failover" },
      }),
      buildEvent(3, "run.waiting_for_approval", {
        action_type: "create_ticket",
        approval_request_id: "apr_1",
      }),
      buildEvent(4, "run.approval.resolved", {
        approval_request_id: "apr_1",
        decision: "approved",
        rationale: "Looks good.",
      }),
      buildEvent(5, "run.completed", {
        assistant_text:
          "✅ **Ticket created successfully**\n\n**Reference:** `MOCK-2026-42`  \n**Internal ID:** `tkt_1`",
      }),
    ]);

    expect(summary).toEqual({
      actionType: "create_ticket",
      actionTitle: "Follow-up: checkout failover",
      approvalId: "apr_1",
      approvalState: "approved",
      approvalRationale: "Looks good.",
      resultKind: "ticket",
      resultReference: "MOCK-2026-42",
      resultInternalId: "tkt_1",
      retrievalResultCount: 3,
    });
  });

  it("returns a pending summary before approval resolution", () => {
    const summary = extractGovernedActionSummary([
      buildEvent(1, "run.tool.requested", {
        name: "create_ticket",
        args: { title: "Follow-up: checkout failover" },
      }),
      buildEvent(2, "run.waiting_for_approval", {
        action_type: "create_ticket",
        approval_request_id: "apr_pending",
      }),
    ]);

    expect(summary).toEqual({
      actionType: "create_ticket",
      actionTitle: "Follow-up: checkout failover",
      approvalId: "apr_pending",
      approvalState: "pending",
      approvalRationale: null,
      resultKind: "ticket",
      resultReference: null,
      resultInternalId: null,
      retrievalResultCount: null,
    });
  });

  it("returns null when the run has no governed action", () => {
    expect(
      extractGovernedActionSummary([
        buildEvent(1, "run.created", {}),
        buildEvent(2, "run.completed", { assistant_text: "Hello." }),
      ]),
    ).toBeNull();
  });
});
