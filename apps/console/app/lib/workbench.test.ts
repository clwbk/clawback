import { describe, expect, it } from "vitest";

import { extractWorkbenchSummary } from "./workbench";

describe("extractWorkbenchSummary", () => {
  it("surfaces the latest governed action and citations", () => {
    const result = extractWorkbenchSummary({
      conversationDetail: {
        conversation: {
          id: "cnv_1",
          workspace_id: "ws_1",
          agent_id: "agt_1",
          agent_version_id: "agv_1",
          channel: "web",
          started_by: "usr_1",
          status: "active",
          title: "Test",
          last_message_at: "2026-03-16T16:00:00.000Z",
          created_at: "2026-03-16T16:00:00.000Z",
          updated_at: "2026-03-16T16:00:00.000Z",
        },
        messages: [
          {
            id: "msg_1",
            workspace_id: "ws_1",
            conversation_id: "cnv_1",
            run_id: "run_1",
            sequence: 1,
            role: "assistant",
            author_user_id: null,
            content: [{ type: "text", text: "Done." }],
            citations: [
              {
                connector_id: "con_1",
                connector_name: "Docs",
                document_id: "doc_1",
                document_version_id: "ver_1",
                chunk_id: "chk_1",
                title: "Runbook",
                path_or_uri: "/docs/runbook.md",
                snippet: "Follow these steps",
                score: 0.9,
              },
            ],
            token_usage: null,
            created_at: "2026-03-16T16:00:00.000Z",
          },
        ],
      },
      runsById: {
        run_1: {
          id: "run_1",
          workspace_id: "ws_1",
          agent_id: "agt_1",
          conversation_id: "cnv_1",
          agent_version_id: "agv_1",
          input_message_id: "msg_in_1",
          status: "completed",
          current_step: "done",
          channel: "web",
          initiated_by: "usr_1",
          started_at: "2026-03-16T16:00:00.000Z",
          completed_at: "2026-03-16T16:01:00.000Z",
          summary: null,
          created_at: "2026-03-16T16:00:00.000Z",
          updated_at: "2026-03-16T16:01:00.000Z",
        },
      },
      runEventsById: {
        run_1: [
          {
            event_id: "evt_1",
            workspace_id: "ws_1",
            run_id: "run_1",
            sequence: 1,
            event_type: "run.tool.requested",
            actor: {
              type: "service",
              id: "svc_1",
            },
            payload: {
              tool_name: "create_ticket",
              args: {
                title: "Investigate checkout failover regression",
              },
            },
            occurred_at: "2026-03-16T16:00:10.000Z",
          },
          {
            event_id: "evt_2",
            workspace_id: "ws_1",
            run_id: "run_1",
            sequence: 2,
            event_type: "run.waiting_for_approval",
            actor: {
              type: "service",
              id: "svc_1",
            },
            payload: {
              action_type: "create_ticket",
              approval_request_id: "apr_1",
            },
            occurred_at: "2026-03-16T16:00:20.000Z",
          },
        ],
      },
    });

    expect(result.latestRunId).toBe("run_1");
    expect(result.latestCitations).toHaveLength(1);
    expect(result.governedAction?.approvalId).toBe("apr_1");
  });
});
