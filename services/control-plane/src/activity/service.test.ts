import { beforeEach, describe, expect, it } from "vitest";

import { ActivityService } from "./service.js";
import type { StoredActivityEvent, ActivityEventStore } from "./types.js";

class MemoryActivityEventStore implements ActivityEventStore {
  events: StoredActivityEvent[] = [];

  async listByWorkspace(workspaceId: string, limit = 50) {
    return this.events
      .filter((e) => e.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async create(input: StoredActivityEvent) {
    this.events.push({ ...input });
    return { ...input };
  }

  async findByReviewResult(workspaceId: string, reviewId: string, resultKind: string) {
    return this.events.find(
      (event) =>
        event.workspaceId === workspaceId
        && event.reviewId === reviewId
        && event.resultKind === resultKind,
    ) ?? null;
  }

  async findByWorkItemResult(workspaceId: string, workItemId: string, resultKind: string) {
    return this.events.find(
      (event) =>
        event.workspaceId === workspaceId
        && event.workItemId === workItemId
        && event.resultKind === resultKind,
    ) ?? null;
  }
}

describe("ActivityService", () => {
  let store: MemoryActivityEventStore;
  let service: ActivityService;
  const WS = "ws_test";
  const NOW = new Date("2026-03-18T10:00:00Z");

  beforeEach(() => {
    store = new MemoryActivityEventStore();
    service = new ActivityService({ store, now: () => NOW });
  });

  it("appends an activity event", async () => {
    const result = await service.append(WS, {
      workerId: "wkr_01",
      routeKind: "watched_inbox",
      resultKind: "review_requested",
      title: "Review requested for Acme follow-up",
      summary: "Dave needs to approve.",
      assigneeIds: ["usr_dave"],
      runId: "run_01",
      workItemId: "wi_01",
      reviewId: "rev_01",
    });

    expect(result.id).toMatch(/^evt_/);
    expect(result.worker_id).toBe("wkr_01");
    expect(result.route_kind).toBe("watched_inbox");
    expect(result.result_kind).toBe("review_requested");
    expect(result.title).toBe("Review requested for Acme follow-up");
    expect(result.timestamp).toBeTruthy();
  });

  it("lists events by workspace with ordering", async () => {
    let tick = 0;
    const timedService = new ActivityService({
      store,
      now: () => new Date(NOW.getTime() + (tick++) * 1000),
    });

    await timedService.append(WS, { resultKind: "first", title: "Event 1" });
    await timedService.append(WS, { resultKind: "second", title: "Event 2" });
    await timedService.append("ws_other", { resultKind: "other", title: "Other" });

    const result = await service.list(WS);
    expect(result.events).toHaveLength(2);
    // Most recent first
    expect(result.events[0]!.result_kind).toBe("second");
    expect(result.events[1]!.result_kind).toBe("first");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await service.append(WS, { resultKind: `kind_${i}`, title: `Event ${i}` });
    }

    const result = await service.list(WS, 3);
    expect(result.events).toHaveLength(3);
  });

  it("handles minimal input", async () => {
    const result = await service.append(WS, {
      resultKind: "work_item_created",
      title: "Minimal event",
    });

    expect(result.worker_id).toBeNull();
    expect(result.route_kind).toBeNull();
    expect(result.summary).toBeNull();
    expect(result.assignee_ids).toEqual([]);
    expect(result.run_id).toBeNull();
    expect(result.work_item_id).toBeNull();
    expect(result.review_id).toBeNull();
  });

  it("finds an existing review result event", async () => {
    const created = await service.append(WS, {
      resultKind: "review_approved",
      title: "Approved",
      reviewId: "rev_01",
    });

    const found = await service.findByReviewResult(WS, "rev_01", "review_approved");
    expect(found?.id).toBe(created.id);
  });

  it("appends a review result at most once", async () => {
    const first = await service.appendReviewResultOnce(WS, {
      resultKind: "review_denied",
      title: "Denied",
      reviewId: "rev_02",
    });
    const second = await service.appendReviewResultOnce(WS, {
      resultKind: "review_denied",
      title: "Denied again",
      reviewId: "rev_02",
    });

    expect(second.id).toBe(first.id);
    expect(store.events).toHaveLength(1);
  });

  it("appends a work-item result at most once", async () => {
    const first = await service.appendWorkItemResultOnce(WS, {
      resultKind: "route_handoff_confirmed",
      title: "Route confirmed",
      workItemId: "wi_02",
    });
    const second = await service.appendWorkItemResultOnce(WS, {
      resultKind: "route_handoff_confirmed",
      title: "Route confirmed again",
      workItemId: "wi_02",
    });

    expect(second.id).toBe(first.id);
    expect(store.events).toHaveLength(1);
  });
});
