import { describe, expect, it } from "vitest";

import { shouldUseRunAsActiveStream } from "./use-conversations";
import type { ConversationDetail, RunEventRecord, RunRecord } from "@/lib/control-plane";

function buildRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run_123",
    workspace_id: "ws_123",
    agent_id: "agt_123",
    agent_version_id: "agv_123",
    conversation_id: "cnv_123",
    input_message_id: "msg_user_123",
    initiated_by: "usr_123",
    channel: "web",
    status: "running",
    started_at: null,
    completed_at: null,
    current_step: "modeling",
    summary: null,
    created_at: "2026-04-05T00:00:00.000Z",
    updated_at: "2026-04-05T00:00:00.000Z",
    ...overrides,
  };
}

function buildConversationDetail(
  messages: ConversationDetail["messages"],
): ConversationDetail {
  return {
    conversation: {
      id: "cnv_123",
      workspace_id: "ws_123",
      agent_id: "agt_123",
      agent_version_id: "agv_123",
      channel: "web",
      status: "active",
      title: null,
      started_by: "usr_123",
      last_message_at: "2026-04-05T00:00:00.000Z",
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
    },
    messages,
  };
}

function buildRunEvent(
  eventType: RunEventRecord["event_type"],
): RunEventRecord {
  return {
    event_id: "evt_123",
    event_type: eventType,
    workspace_id: "ws_123",
    run_id: "run_123",
    sequence: 1,
    occurred_at: "2026-04-05T00:00:00.000Z",
    actor: { type: "service", id: "svc_123" },
    payload: {},
  };
}

describe("active run stream selection", () => {
  it("does not resume a stream from stale optimistic state after a reload", () => {
    const detail = buildConversationDetail([
      {
        id: "msg_user_123",
        workspace_id: "ws_123",
        conversation_id: "cnv_123",
        run_id: "run_123",
        sequence: 0,
        role: "user",
        author_user_id: "usr_123",
        content: [{ type: "text", text: "What should we do next?" }],
        citations: null,
        token_usage: null,
        created_at: "2026-04-05T00:00:00.000Z",
      },
    ]);

    expect(
      shouldUseRunAsActiveStream({
        run: buildRun(),
        detail,
        events: [],
        hasAuthoritativeRunRecord: false,
        hasAuthoritativeRunEvents: false,
        allowStaleFallback: false,
      }),
    ).toBe(false);
  });

  it("can still resume a stream when authoritative run data says it is active", () => {
    const detail = buildConversationDetail([
      {
        id: "msg_user_123",
        workspace_id: "ws_123",
        conversation_id: "cnv_123",
        run_id: "run_123",
        sequence: 0,
        role: "user",
        author_user_id: "usr_123",
        content: [{ type: "text", text: "What should we do next?" }],
        citations: null,
        token_usage: null,
        created_at: "2026-04-05T00:00:00.000Z",
      },
    ]);

    expect(
      shouldUseRunAsActiveStream({
        run: buildRun(),
        detail,
        events: [],
        hasAuthoritativeRunRecord: true,
        hasAuthoritativeRunEvents: false,
        allowStaleFallback: false,
      }),
    ).toBe(true);
  });

  it("never resumes when persisted transcript or terminal events already exist", () => {
    const userMessage: ConversationDetail["messages"][number] = {
      id: "msg_user_123",
      workspace_id: "ws_123",
      conversation_id: "cnv_123",
      run_id: "run_123",
      sequence: 0,
      role: "user",
      author_user_id: "usr_123",
      content: [{ type: "text", text: "What should we do next?" }],
      citations: null,
      token_usage: null,
      created_at: "2026-04-05T00:00:00.000Z",
    };
    const detail = buildConversationDetail([
      userMessage,
      {
        id: "msg_assistant_123",
        workspace_id: "ws_123",
        conversation_id: "cnv_123",
        run_id: "run_123",
        sequence: 1,
        role: "assistant",
        author_user_id: null,
        content: [{ type: "text", text: "Draft the follow-up ticket." }],
        citations: null,
        token_usage: null,
        created_at: "2026-04-05T00:00:02.000Z",
      },
    ]);

    expect(
      shouldUseRunAsActiveStream({
        run: buildRun(),
        detail,
        events: [],
        hasAuthoritativeRunRecord: true,
        hasAuthoritativeRunEvents: false,
        allowStaleFallback: false,
      }),
    ).toBe(false);

    expect(
      shouldUseRunAsActiveStream({
        run: buildRun(),
        detail: buildConversationDetail([userMessage]),
        events: [buildRunEvent("run.completed")],
        hasAuthoritativeRunRecord: true,
        hasAuthoritativeRunEvents: true,
        allowStaleFallback: false,
      }),
    ).toBe(false);
  });
});
