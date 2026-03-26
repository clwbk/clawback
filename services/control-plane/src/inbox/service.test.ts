import { beforeEach, describe, expect, it } from "vitest";

import { InboxItemService, InboxItemNotFoundError, InboxItemStateError } from "./service.js";
import type { StoredInboxItem, InboxItemStore } from "./types.js";

class MemoryInboxItemStore implements InboxItemStore {
  items: StoredInboxItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items
      .filter((i) => i.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listOpen(workspaceId: string) {
    return this.items
      .filter((i) => i.workspaceId === workspaceId && i.state === "open")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null;
  }

  async findByReviewId(workspaceId: string, reviewId: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.reviewId === reviewId) ?? null;
  }

  async create(input: StoredInboxItem) {
    this.items.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredInboxItem>) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }

  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

describe("InboxItemService", () => {
  let store: MemoryInboxItemStore;
  let service: InboxItemService;
  const WS = "ws_test";
  const NOW = new Date("2026-03-18T10:00:00Z");

  beforeEach(() => {
    store = new MemoryInboxItemStore();
    service = new InboxItemService({ store, now: () => NOW });
  });

  it("creates an inbox item in open state", async () => {
    const result = await service.create(WS, {
      kind: "review",
      title: "Review email draft",
      summary: "Draft reply needs approval.",
      assigneeIds: ["usr_dave"],
      workerId: "wkr_01",
      workItemId: "wi_01",
      reviewId: "rev_01",
      routeKind: "watched_inbox",
    });

    expect(result.id).toMatch(/^inb_/);
    expect(result.state).toBe("open");
    expect(result.kind).toBe("review");
    expect(result.worker_id).toBe("wkr_01");
  });

  it("lists open items only", async () => {
    await service.create(WS, { kind: "review", title: "Item A" });
    const b = await service.create(WS, { kind: "shadow", title: "Item B" });
    await service.resolve(WS, b.id);

    const open = await service.listOpen(WS);
    expect(open.items).toHaveLength(1);
    expect(open.items[0]!.title).toBe("Item A");
  });

  it("resolves an open item", async () => {
    const created = await service.create(WS, { kind: "review", title: "Resolve me" });
    const resolved = await service.resolve(WS, created.id);
    expect(resolved.state).toBe("resolved");
  });

  it("returns synced execution state as an inbox projection", async () => {
    const created = await service.create(WS, {
      kind: "review",
      title: "Projection view",
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

  it("dismisses an open item", async () => {
    const created = await service.create(WS, { kind: "setup", title: "Dismiss me" });
    const dismissed = await service.dismiss(WS, created.id);
    expect(dismissed.state).toBe("dismissed");
  });

  it("throws when resolving a non-open item", async () => {
    const created = await service.create(WS, { kind: "review", title: "Already done" });
    await service.resolve(WS, created.id);
    await expect(service.resolve(WS, created.id)).rejects.toBeInstanceOf(InboxItemStateError);
  });

  it("throws when getting nonexistent item", async () => {
    await expect(service.getById(WS, "inb_missing")).rejects.toBeInstanceOf(InboxItemNotFoundError);
  });
});
