import { beforeEach, describe, expect, it } from "vitest";

import { WorkItemService, WorkItemNotFoundError } from "./service.js";
import type { StoredWorkItem, WorkItemStore } from "./types.js";

class MemoryWorkItemStore implements WorkItemStore {
  items: StoredWorkItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items
      .filter((i) => i.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async listByWorker(workerId: string) {
    return this.items
      .filter((i) => i.workerId === workerId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null;
  }

  async create(input: StoredWorkItem) {
    this.items.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredWorkItem>) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }

  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

describe("WorkItemService", () => {
  let store: MemoryWorkItemStore;
  let service: WorkItemService;
  const WS = "ws_test";
  const NOW = new Date("2026-03-18T10:00:00Z");

  beforeEach(() => {
    store = new MemoryWorkItemStore();
    service = new WorkItemService({ store, now: () => NOW });
  });

  it("creates a work item with generated id", async () => {
    const result = await service.create(WS, {
      workerId: "wkr_01",
      kind: "email_draft",
      title: "Follow-up: Acme Corp",
      summary: "Draft reply to Sarah.",
      assigneeIds: ["usr_emma"],
      sourceRouteKind: "watched_inbox",
    });

    expect(result.id).toMatch(/^wi_/);
    expect(result.workspace_id).toBe(WS);
    expect(result.worker_id).toBe("wkr_01");
    expect(result.kind).toBe("email_draft");
    expect(result.status).toBe("draft");
    expect(result.title).toBe("Follow-up: Acme Corp");
    expect(result.source_route_kind).toBe("watched_inbox");
  });

  it("lists by workspace", async () => {
    await service.create(WS, { workerId: "wkr_01", kind: "email_draft", title: "Item A" });
    await service.create(WS, { workerId: "wkr_02", kind: "proposal_draft", title: "Item B" });
    await service.create("ws_other", { workerId: "wkr_03", kind: "ticket_draft", title: "Item C" });

    const result = await service.listByWorkspace(WS);
    expect(result.work_items).toHaveLength(2);
  });

  it("lists by worker", async () => {
    await service.create(WS, { workerId: "wkr_01", kind: "email_draft", title: "Item A" });
    await service.create(WS, { workerId: "wkr_01", kind: "sent_update", title: "Item B" });
    await service.create(WS, { workerId: "wkr_02", kind: "proposal_draft", title: "Item C" });

    const result = await service.listByWorker("wkr_01");
    expect(result.work_items).toHaveLength(2);
  });

  it("updates status", async () => {
    const created = await service.create(WS, { workerId: "wkr_01", kind: "email_draft", title: "Test" });
    const updated = await service.update(WS, created.id, { status: "pending_review" });
    expect(updated.status).toBe("pending_review");
  });

  it("returns authoritative execution continuity on work item views", async () => {
    const created = await service.create(WS, {
      workerId: "wkr_01",
      kind: "email_draft",
      title: "Execution continuity",
      executionStateJson: {
        continuity_family: "governed_action",
        state: "waiting_review",
        current_step: "wait_for_review",
        pause_reason: "human_review",
        resume_reason: null,
        last_decision: "shadow_draft",
        target_worker_id: null,
        downstream_work_item_id: null,
      },
    });

    expect(created.execution_state_json).toMatchObject({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "shadow_draft",
    });
  });

  it("throws when updating nonexistent item", async () => {
    await expect(
      service.update(WS, "wi_missing", { status: "completed" }),
    ).rejects.toBeInstanceOf(WorkItemNotFoundError);
  });

  it("removes a work item", async () => {
    const created = await service.create(WS, { workerId: "wkr_01", kind: "email_draft", title: "Test" });
    await service.remove(WS, created.id);
    const list = await service.listByWorkspace(WS);
    expect(list.work_items).toHaveLength(0);
  });
});
