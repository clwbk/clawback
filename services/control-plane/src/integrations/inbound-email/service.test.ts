import { describe, expect, it, beforeEach } from "vitest";
import type { FollowUpExecutionStateRecord } from "@clawback/contracts";

import { InboundEmailService, InboundEmailRoutingError, InboundEmailWorkerNotFoundError } from "./service.js";
import type {
  InboundEmailPayload,
  InputRouteLookup,
  InputRouteWithWorker,
  SourceEventStore,
  StoredSourceEvent,
  WorkerLookup,
  WorkerSummary,
} from "./types.js";
import type { ReviewRecordView } from "../../reviews/types.js";

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

class FakeSourceEventStore implements SourceEventStore {
  readonly events: StoredSourceEvent[] = [];

  async findByExternalMessageId(workspaceId: string, externalMessageId: string) {
    return (
      this.events.find(
        (e) => e.workspaceId === workspaceId && e.externalMessageId === externalMessageId,
      ) ?? null
    );
  }

  async create(input: StoredSourceEvent) {
    this.events.push(input);
    return input;
  }
}

class FakeInputRouteLookup implements InputRouteLookup {
  readonly routes: InputRouteWithWorker[] = [];

  async findByAddress(address: string) {
    return this.routes.find((r) => r.address === address) ?? null;
  }
}

class FakeWorkerLookup implements WorkerLookup {
  readonly workers: WorkerSummary[] = [];

  async findById(workspaceId: string, id: string) {
    return (
      this.workers.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null
    );
  }
}

type CreatedWorkItem = {
  id: string;
  workspaceId: string;
  workerId: string;
  title: string;
  kind: string;
  status: string;
  reviewId: string | null;
  executionStateJson?: FollowUpExecutionStateRecord | null;
};
type CreatedInboxItem = {
  id: string;
  workspaceId: string;
  workerId: string | null;
  title: string;
  kind: string;
  reviewId: string | null;
  executionStateJson?: FollowUpExecutionStateRecord | null;
};
type CreatedActivity = { id: string; workspaceId: string; title: string; resultKind: string; reviewId?: string | null };
type CreatedReview = ReviewRecordView;

class FakeWorkItemService {
  readonly items: CreatedWorkItem[] = [];
  private counter = 0;

  async create(
    workspaceId: string,
    input: {
      workerId: string;
      kind: string;
      title: string;
      executionStateJson?: FollowUpExecutionStateRecord | null;
    },
  ) {
    this.counter += 1;
    const item = {
      id: `wi_test_${this.counter}`,
      workspaceId,
      status: "draft",
      reviewId: null,
      ...input,
    };
    this.items.push(item);
    return item;
  }

  async update(
    _workspaceId: string,
    id: string,
    input: {
      status?: string;
      reviewId?: string | null;
      executionStateJson?: FollowUpExecutionStateRecord | null;
    },
  ) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) throw new Error("not found");
    if (input.status !== undefined) item.status = input.status;
    if (input.reviewId !== undefined) item.reviewId = input.reviewId;
    if (input.executionStateJson !== undefined) item.executionStateJson = input.executionStateJson;
    return item;
  }
}

class FakeInboxItemService {
  readonly items: CreatedInboxItem[] = [];
  private counter = 0;

  async create(
    workspaceId: string,
    input: {
      kind: string;
      title: string;
      workerId?: string | null;
      reviewId?: string | null;
      executionStateJson?: FollowUpExecutionStateRecord | null;
    },
  ) {
    this.counter += 1;
    const item = {
      id: `inb_test_${this.counter}`,
      workspaceId,
      workerId: input.workerId ?? null,
      reviewId: input.reviewId ?? null,
      ...input,
    };
    this.items.push(item);
    return item;
  }
}

class FakeReviewService {
  readonly reviews: CreatedReview[] = [];
  private counter = 0;

  async create(
    workspaceId: string,
    input: {
      actionKind: "send_email";
      workerId: string;
      workItemId?: string | null;
      reviewerIds?: string[];
      assigneeIds?: string[];
      sourceRouteKind?: "forward_email" | null;
      actionDestination?: string | null;
    },
  ) {
    this.counter += 1;
    const id = `rev_test_${this.counter}`;
    const review = {
      id,
      workspace_id: workspaceId,
      action_kind: input.actionKind,
      status: "pending" as const,
      worker_id: input.workerId,
      work_item_id: input.workItemId ?? null,
      reviewer_ids: input.reviewerIds ?? [],
      assignee_ids: input.assigneeIds ?? [],
      source_route_kind: input.sourceRouteKind ?? null,
      action_destination: input.actionDestination ?? null,
      requested_at: new Date("2026-03-18T10:00:00Z").toISOString(),
      resolved_at: null,
      created_at: new Date("2026-03-18T10:00:00Z").toISOString(),
      updated_at: new Date("2026-03-18T10:00:00Z").toISOString(),
    };
    this.reviews.push(review);
    return review;
  }
}

class FakeActivityService {
  readonly events: CreatedActivity[] = [];
  private counter = 0;

  async append(
    workspaceId: string,
    input: { resultKind: string; title: string; reviewId?: string | null },
  ) {
    this.counter += 1;
    const event = { id: `evt_test_${this.counter}`, workspaceId, ...input };
    this.events.push(event);
    return event;
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "ws_test_01";
const WORKER_ID = "wkr_followup_test";
const ROUTE_ID = "rte_fwd_test";

function createTestRoute(): InputRouteWithWorker {
  return {
    id: ROUTE_ID,
    workspaceId: WORKSPACE_ID,
    workerId: WORKER_ID,
    kind: "forward_email",
    address: "followup-acme@inbound.clawback.dev",
  };
}

function createTestWorker(): WorkerSummary {
  return {
    id: WORKER_ID,
    workspaceId: WORKSPACE_ID,
    slug: "client-follow-up",
    name: "Client Follow-Up",
    kind: "follow_up",
    assigneeIds: ["usr_emma"],
    reviewerIds: ["usr_dave"],
  };
}

function createTestPayload(overrides?: Partial<InboundEmailPayload>): InboundEmailPayload {
  return {
    message_id: "<test-msg-001@mail.example.com>",
    from: "sarah@acmecorp.com",
    to: "followup-acme@inbound.clawback.dev",
    subject: "Re: Q3 Renewal Discussion",
    body_text: "Hi Dave, wanted to follow up on our renewal discussion...",
    body_html: "<p>Hi Dave, wanted to follow up...</p>",
    attachments: [{ filename: "proposal.pdf", content_type: "application/pdf", size: 12345 }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InboundEmailService", () => {
  let sourceEventStore: FakeSourceEventStore;
  let inputRouteLookup: FakeInputRouteLookup;
  let workerLookup: FakeWorkerLookup;
  let workItemService: FakeWorkItemService;
  let inboxItemService: FakeInboxItemService;
  let reviewService: FakeReviewService;
  let activityService: FakeActivityService;
  let service: InboundEmailService;

  beforeEach(() => {
    sourceEventStore = new FakeSourceEventStore();
    inputRouteLookup = new FakeInputRouteLookup();
    workerLookup = new FakeWorkerLookup();
    workItemService = new FakeWorkItemService();
    inboxItemService = new FakeInboxItemService();
    reviewService = new FakeReviewService();
    activityService = new FakeActivityService();

    inputRouteLookup.routes.push(createTestRoute());
    workerLookup.workers.push(createTestWorker());

    service = new InboundEmailService({
      sourceEventStore,
      inputRouteLookup,
      workerLookup,
      workItemService,
      inboxItemService,
      reviewService,
      activityService,
      now: () => new Date("2026-03-18T10:00:00Z"),
    });
  });

  it("processes a forwarded email end-to-end: source event -> work item -> review -> inbox item", async () => {
    const payload = createTestPayload();
    const result = await service.processInboundEmail(payload);

    // Result should contain all created IDs
    expect(result.source_event_id).toMatch(/^src_/);
    expect(result.work_item_id).toBe("wi_test_1");
    expect(result.inbox_item_id).toBe("inb_test_1");
    expect(result.review_id).toBe("rev_test_1");
    expect(result.worker_id).toBe(WORKER_ID);
    expect(result.workspace_id).toBe(WORKSPACE_ID);
    expect(result.deduplicated).toBe(false);

    // Source event was created with correct data
    expect(sourceEventStore.events).toHaveLength(1);
    const srcEvent = sourceEventStore.events[0]!;
    expect(srcEvent.kind).toBe("forwarded_email");
    expect(srcEvent.externalMessageId).toBe(payload.message_id);
    expect(srcEvent.fromAddress).toBe("sarah@acmecorp.com");
    expect(srcEvent.subject).toBe("Re: Q3 Renewal Discussion");
    expect(srcEvent.workerId).toBe(WORKER_ID);
    expect(srcEvent.inputRouteId).toBe(ROUTE_ID);

    // Work item was created with correct kind and linkage
    expect(workItemService.items).toHaveLength(1);
    const workItem = workItemService.items[0]!;
    expect(workItem.kind).toBe("email_draft");
    expect(workItem.title).toContain("Q3 Renewal Discussion");
    expect(workItem.workerId).toBe(WORKER_ID);
    expect(workItem.status).toBe("pending_review");
    expect(workItem.reviewId).toBe("rev_test_1");
    expect(workItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "shadow_draft",
    });

    expect(reviewService.reviews).toHaveLength(1);
    expect(reviewService.reviews[0]!.action_kind).toBe("send_email");
    expect(reviewService.reviews[0]!.action_destination).toBe("sarah@acmecorp.com");

    // Inbox item was created
    expect(inboxItemService.items).toHaveLength(1);
    const inboxItem = inboxItemService.items[0]!;
    expect(inboxItem.kind).toBe("review");
    expect(inboxItem.title).toContain("Q3 Renewal Discussion");
    expect(inboxItem.workerId).toBe(WORKER_ID);
    expect(inboxItem.reviewId).toBe("rev_test_1");
    expect(inboxItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "shadow_draft",
    });

    // Activity event was created
    expect(activityService.events).toHaveLength(1);
    expect(activityService.events[0]!.resultKind).toBe("review_requested");
    expect(activityService.events[0]!.reviewId).toBe("rev_test_1");
  });

  it("deduplicates emails by message_id", async () => {
    const payload = createTestPayload();

    // First processing
    const first = await service.processInboundEmail(payload);
    expect(first.deduplicated).toBe(false);

    // Second processing with the same message_id
    const second = await service.processInboundEmail(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.source_event_id).toBe(first.source_event_id);

    // Only one source event and one work item created
    expect(sourceEventStore.events).toHaveLength(1);
    expect(workItemService.items).toHaveLength(1);
  });

  it("throws InboundEmailRoutingError for unknown address", async () => {
    const payload = createTestPayload({ to: "unknown@inbound.clawback.dev" });

    await expect(service.processInboundEmail(payload)).rejects.toThrow(InboundEmailRoutingError);
    await expect(service.processInboundEmail(payload)).rejects.toThrow(
      "No active input route found for address: unknown@inbound.clawback.dev",
    );
  });

  it("throws InboundEmailWorkerNotFoundError when worker is missing", async () => {
    workerLookup.workers.length = 0; // Remove the worker

    const payload = createTestPayload();
    await expect(service.processInboundEmail(payload)).rejects.toThrow(InboundEmailWorkerNotFoundError);
  });

  it("assigns inbox item to reviewers when available", async () => {
    const payload = createTestPayload();
    await service.processInboundEmail(payload);

    const inboxItem = inboxItemService.items[0]!;
    // Reviewer IDs from the worker (Dave) should be the assignees on the inbox item
    expect(inboxItem).toMatchObject({
      kind: "review",
    });
  });

  it("handles emails without attachments", async () => {
    const { attachments: _, ...rest } = createTestPayload();
    const payload: InboundEmailPayload = rest;
    const result = await service.processInboundEmail(payload);

    expect(result.deduplicated).toBe(false);
    const srcEvent = sourceEventStore.events[0]!;
    expect(srcEvent.attachmentsJson).toEqual([]);
  });

  it("handles emails without HTML body", async () => {
    const payload = createTestPayload();
    payload.body_html = null;
    const result = await service.processInboundEmail(payload);

    expect(result.deduplicated).toBe(false);
    const srcEvent = sourceEventStore.events[0]!;
    expect(srcEvent.bodyHtml).toBeNull();
  });
});
