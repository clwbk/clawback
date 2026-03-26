import { describe, expect, it, beforeEach } from "vitest";
import type { WorkerTriageRecord } from "@clawback/contracts";

import { ActivityService } from "../activity/service.js";
import type { StoredActivityEvent, ActivityEventStore } from "../activity/types.js";
import { InboxItemService } from "../inbox/service.js";
import type { InboxItemStore, StoredInboxItem } from "../inbox/types.js";
import { RouteConfirmationError, RouteConfirmationService } from "./service.js";
import { WorkItemService } from "../work-items/service.js";
import type { StoredWorkItem, WorkItemStore } from "../work-items/types.js";
import { WorkerService } from "../workers/service.js";
import type { StoredWorker, WorkerStore } from "../workers/types.js";

const NOW = new Date("2026-03-23T15:00:00.000Z");
const WS = "ws_route_confirm";
const ORIGIN_WORKER_ID = "wkr_follow_up_01";
const TARGET_WORKER_ID = "wkr_proposal_01";

class MemoryWorkerStore implements WorkerStore {
  constructor(private readonly workers: StoredWorker[]) {}

  async list(workspaceId: string) {
    return this.workers.filter((worker) => worker.workspaceId === workspaceId);
  }

  async findById(workspaceId: string, id: string) {
    return this.workers.find((worker) => worker.workspaceId === workspaceId && worker.id === id) ?? null;
  }

  async findBySlug(workspaceId: string, slug: string) {
    return this.workers.find((worker) => worker.workspaceId === workspaceId && worker.slug === slug) ?? null;
  }

  async create(input: StoredWorker) {
    this.workers.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredWorker>) {
    const index = this.workers.findIndex((worker) => worker.id === id);
    if (index < 0) {
      throw new Error(`Unknown worker ${id}`);
    }
    this.workers[index] = { ...this.workers[index]!, ...input };
    return this.workers[index]!;
  }

  async remove(id: string) {
    const index = this.workers.findIndex((worker) => worker.id === id);
    if (index >= 0) {
      this.workers.splice(index, 1);
    }
  }
}

class MemoryWorkItemStore implements WorkItemStore {
  readonly items: StoredWorkItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((item) => item.workspaceId === workspaceId);
  }

  async listByWorker(workerId: string) {
    return this.items.filter((item) => item.workerId === workerId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((item) => item.workspaceId === workspaceId && item.id === id) ?? null;
  }

  async findBySourceInboxItemId(workspaceId: string, sourceInboxItemId: string) {
    return this.items.find(
      (item) => item.workspaceId === workspaceId && item.sourceInboxItemId === sourceInboxItemId,
    ) ?? null;
  }

  async create(input: StoredWorkItem) {
    const existing = await this.findBySourceInboxItemId(input.workspaceId, input.sourceInboxItemId ?? "");
    if (input.sourceInboxItemId && existing) {
      const error = new Error("duplicate source inbox");
      (error as Error & { code: string; constraint: string }).code = "23505";
      (error as Error & { code: string; constraint: string }).constraint = "work_items_source_inbox_item_id_key";
      throw error;
    }
    this.items.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredWorkItem>) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error(`Unknown work item ${id}`);
    }
    this.items[index] = { ...this.items[index]!, ...input };
    return this.items[index]!;
  }

  async remove(id: string) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }
}

class MemoryInboxItemStore implements InboxItemStore {
  readonly items: StoredInboxItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((item) => item.workspaceId === workspaceId);
  }

  async listOpen(workspaceId: string) {
    return this.items.filter((item) => item.workspaceId === workspaceId && item.state === "open");
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((item) => item.workspaceId === workspaceId && item.id === id) ?? null;
  }

  async findByReviewId(workspaceId: string, reviewId: string) {
    return this.items.find((item) => item.workspaceId === workspaceId && item.reviewId === reviewId) ?? null;
  }

  async findByWorkItemId(workspaceId: string, workItemId: string) {
    return this.items.find((item) => item.workspaceId === workspaceId && item.workItemId === workItemId) ?? null;
  }

  async create(input: StoredInboxItem) {
    this.items.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredInboxItem>) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error(`Unknown inbox item ${id}`);
    }
    this.items[index] = { ...this.items[index]!, ...input };
    return this.items[index]!;
  }

  async remove(id: string) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }
}

class MemoryActivityStore implements ActivityEventStore {
  readonly events: StoredActivityEvent[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.events.filter((event) => event.workspaceId === workspaceId);
  }

  async findByReviewResult(workspaceId: string, reviewId: string, resultKind: string) {
    return this.events.find(
      (event) => event.workspaceId === workspaceId && event.reviewId === reviewId && event.resultKind === resultKind,
    ) ?? null;
  }

  async findByWorkItemResult(workspaceId: string, workItemId: string, resultKind: string) {
    return this.events.find(
      (event) => event.workspaceId === workspaceId && event.workItemId === workItemId && event.resultKind === resultKind,
    ) ?? null;
  }

  async create(input: StoredActivityEvent) {
    this.events.push(input);
    return input;
  }
}

function seedWorkers() {
  return [
    {
      id: ORIGIN_WORKER_ID,
      workspaceId: WS,
      slug: "follow-up",
      name: "Follow-Up",
      kind: "follow_up",
      scope: "shared",
      status: "active",
      summary: null,
      memberIds: [],
      assigneeIds: ["usr_follow_up_01"],
      reviewerIds: ["usr_reviewer_01"],
      inputRouteIds: [],
      connectionIds: [],
      actionIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: TARGET_WORKER_ID,
      workspaceId: WS,
      slug: "proposal",
      name: "Proposal",
      kind: "proposal",
      scope: "shared",
      status: "active",
      summary: null,
      memberIds: [],
      assigneeIds: ["usr_proposal_01"],
      reviewerIds: ["usr_proposal_reviewer_01"],
      inputRouteIds: [],
      connectionIds: [],
      actionIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ] satisfies StoredWorker[];
}

function buildRouteTriage(overrides: Partial<WorkerTriageRecord> = {}): WorkerTriageRecord {
  return {
    intent: "proposal",
    confidence: "high",
    posture: "acknowledge",
    relationship: "prospect",
    source_kind: "inbound_email",
    decision: "route_to_worker",
    reasons: ["resolved_via_exact_contact", "proposal_worker_recommended"],
    route_target_worker_id: TARGET_WORKER_ID,
    ...overrides,
  };
}

describe("RouteConfirmationService", () => {
  let workerService: WorkerService;
  let workItemStore: MemoryWorkItemStore;
  let workItemService: WorkItemService;
  let inboxItemStore: MemoryInboxItemStore;
  let inboxItemService: InboxItemService;
  let activityStore: MemoryActivityStore;
  let activityService: ActivityService;
  let service: RouteConfirmationService;

  beforeEach(() => {
    workerService = new WorkerService({
      store: new MemoryWorkerStore(seedWorkers()),
      now: () => NOW,
    });
    workItemStore = new MemoryWorkItemStore();
    workItemService = new WorkItemService({ store: workItemStore, now: () => NOW });
    inboxItemStore = new MemoryInboxItemStore();
    inboxItemService = new InboxItemService({ store: inboxItemStore, now: () => NOW });
    activityStore = new MemoryActivityStore();
    activityService = new ActivityService({ store: activityStore, now: () => NOW });
    service = new RouteConfirmationService({
      inboxItemService,
      workItemService,
      activityService,
      workerService,
    });
  });

  it("creates downstream work and resolves the originating route suggestion", async () => {
    const originInboxItem = await inboxItemService.create(WS, {
      kind: "review",
      title: "Route suggested: Proposal request from Globex",
      summary: "Follow-Up suggests routing this proposal request to Proposal.",
      assigneeIds: ["usr_reviewer_01"],
      workerId: ORIGIN_WORKER_ID,
      routeKind: "watched_inbox",
      triageJson: buildRouteTriage(),
    });

    const result = await service.confirm(WS, originInboxItem.id, {
      actor: { userId: "usr_admin", displayName: "Ava Operator" },
    });

    expect(result.already_confirmed).toBe(false);
    expect(result.destination_work_item.worker_id).toBe(TARGET_WORKER_ID);
    expect(result.destination_work_item.kind).toBe("proposal_draft");
    expect(result.destination_work_item.source_inbox_item_id).toBe(originInboxItem.id);
    expect(result.destination_inbox_item.worker_id).toBe(TARGET_WORKER_ID);
    expect(result.destination_inbox_item.work_item_id).toBe(result.destination_work_item.id);

    const updatedOrigin = await inboxItemService.getById(WS, originInboxItem.id);
    expect(updatedOrigin.state).toBe("resolved");
    expect(updatedOrigin.work_item_id).toBe(result.destination_work_item.id);
    expect(updatedOrigin.title).toBe("Route handled: Proposal request from Globex");
    expect(updatedOrigin.execution_state_json).toMatchObject({
      continuity_family: "governed_action",
      state: "completed",
      current_step: "record_outcome",
      pause_reason: null,
      resume_reason: "route_confirmed",
      last_decision: "route_to_worker",
      target_worker_id: TARGET_WORKER_ID,
      downstream_work_item_id: result.destination_work_item.id,
    });

    expect(activityStore.events).toHaveLength(1);
    expect(activityStore.events[0]!.resultKind).toBe("route_handoff_confirmed");
    expect(activityStore.events[0]!.workItemId).toBe(result.destination_work_item.id);
  });

  it("treats repeated confirmation as idempotent", async () => {
    const originInboxItem = await inboxItemService.create(WS, {
      kind: "review",
      title: "Route suggested: Proposal request from Globex",
      assigneeIds: ["usr_reviewer_01"],
      workerId: ORIGIN_WORKER_ID,
      routeKind: "watched_inbox",
      triageJson: buildRouteTriage(),
    });

    const first = await service.confirm(WS, originInboxItem.id);
    const second = await service.confirm(WS, originInboxItem.id);

    expect(first.destination_work_item.id).toBe(second.destination_work_item.id);
    expect(second.already_confirmed).toBe(true);
    expect((await workItemService.listByWorkspace(WS)).work_items).toHaveLength(1);
    expect((await inboxItemService.list(WS)).items).toHaveLength(2);
    expect(activityStore.events.filter((event) => event.resultKind === "route_handoff_confirmed")).toHaveLength(1);
    const updatedOrigin = await inboxItemService.getById(WS, originInboxItem.id);
    expect(updatedOrigin.execution_state_json).toMatchObject({
      resume_reason: "route_confirmed",
      downstream_work_item_id: first.destination_work_item.id,
    });
  });

  it("does not create downstream work when the target is unsafe", async () => {
    await workerService.update(WS, TARGET_WORKER_ID, { status: "paused" });
    const originInboxItem = await inboxItemService.create(WS, {
      kind: "review",
      title: "Route suggested: Proposal request from Globex",
      assigneeIds: ["usr_reviewer_01"],
      workerId: ORIGIN_WORKER_ID,
      routeKind: "watched_inbox",
      triageJson: buildRouteTriage(),
    });

    await expect(service.confirm(WS, originInboxItem.id)).rejects.toMatchObject({
      code: "route_confirmation_target_unavailable",
    } satisfies Partial<RouteConfirmationError>);

    expect((await workItemService.listByWorkspace(WS)).work_items).toHaveLength(0);
    const unchangedOrigin = await inboxItemService.getById(WS, originInboxItem.id);
    expect(unchangedOrigin.state).toBe("open");
    expect(unchangedOrigin.work_item_id).toBeNull();
  });

  it("rejects unresolved or guessy suggestions without creating downstream work", async () => {
    const originInboxItem = await inboxItemService.create(WS, {
      kind: "review",
      title: "Route review needed: Support issue from Acme",
      assigneeIds: ["usr_reviewer_01"],
      workerId: ORIGIN_WORKER_ID,
      routeKind: "watched_inbox",
      triageJson: buildRouteTriage({
        decision: "request_review",
        posture: null,
        route_target_worker_id: null,
        reasons: ["bugfix_worker_recommended", "route_missing"],
      }),
    });

    await expect(service.confirm(WS, originInboxItem.id)).rejects.toMatchObject({
      code: "route_confirmation_not_available",
    } satisfies Partial<RouteConfirmationError>);

    expect((await workItemService.listByWorkspace(WS)).work_items).toHaveLength(0);
    expect((await inboxItemService.list(WS)).items).toHaveLength(1);
  });
});
