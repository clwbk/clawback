import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExternalWorkflowRequest } from "@clawback/contracts";

import { ActivityService } from "../activity/service.js";
import type { StoredActivityEvent, ActivityEventStore } from "../activity/types.js";
import { InboxItemService } from "../inbox/service.js";
import type { StoredInboxItem, InboxItemStore } from "../inbox/types.js";
import { ReviewResolutionService } from "../reviews/resolution-service.js";
import {
  markReviewedExternalWorkflowExecutionRunning,
  queueReviewedExternalWorkflowExecution,
} from "../reviews/reviewed-external-workflow-execution.js";
import {
  markReviewedSendExecutionRunning,
  queueReviewedSendExecution,
} from "../reviews/reviewed-send-execution.js";
import { ReviewService } from "../reviews/service.js";
import type { StoredReview, ReviewStore } from "../reviews/types.js";
import { WorkItemService } from "../work-items/service.js";
import type { StoredWorkItem, WorkItemStore } from "../work-items/types.js";

class MemoryReviewStore implements ReviewStore {
  reviews: StoredReview[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.reviews.filter((review) => review.workspaceId === workspaceId);
  }

  async listPending(workspaceId: string) {
    return this.reviews.filter(
      (review) => review.workspaceId === workspaceId && review.status === "pending",
    );
  }

  async findById(workspaceId: string, id: string) {
    return this.reviews.find((review) => review.workspaceId === workspaceId && review.id === id) ?? null;
  }

  async create(input: StoredReview) {
    this.reviews.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredReview>) {
    const review = this.reviews.find((candidate) => candidate.id === id);
    if (!review) {
      throw new Error("review not found");
    }
    Object.assign(review, input);
    return { ...review };
  }

  async remove(id: string) {
    this.reviews = this.reviews.filter((review) => review.id !== id);
  }
}

class MemoryWorkItemStore implements WorkItemStore {
  items: StoredWorkItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((item) => item.workspaceId === workspaceId);
  }

  async listByWorker(workerId: string) {
    return this.items.filter((item) => item.workerId === workerId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((item) => item.workspaceId === workspaceId && item.id === id) ?? null;
  }

  async create(input: StoredWorkItem) {
    this.items.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredWorkItem>) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) {
      throw new Error("work item not found");
    }
    Object.assign(item, input);
    return { ...item };
  }

  async remove(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
  }
}

class MemoryInboxItemStore implements InboxItemStore {
  items: StoredInboxItem[] = [];

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
    return this.items.find(
      (item) => item.workspaceId === workspaceId && item.reviewId === reviewId,
    ) ?? null;
  }

  async create(input: StoredInboxItem) {
    this.items.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredInboxItem>) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) {
      throw new Error("inbox item not found");
    }
    Object.assign(item, input);
    return { ...item };
  }

  async remove(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
  }
}

class MemoryActivityEventStore implements ActivityEventStore {
  events: StoredActivityEvent[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.events.filter((event) => event.workspaceId === workspaceId);
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

  async create(input: StoredActivityEvent) {
    this.events.push({ ...input });
    return { ...input };
  }
}

const WS = "ws_test";
const WORKER_ID = "wkr_followup";
const REVIEW_ID = "rev_crash_guard";
const WORK_ITEM_ID = "wi_crash_guard";
const SMTP_CONNECTION_ID = "conn_smtp_01";
const N8N_CONNECTION_ID = "conn_n8n_01";

function createHarness() {
  const reviewStore = new MemoryReviewStore();
  const workItemStore = new MemoryWorkItemStore();
  const inboxItemStore = new MemoryInboxItemStore();
  const activityStore = new MemoryActivityEventStore();
  const now = () => new Date(Date.now());

  const reviewService = new ReviewService({ store: reviewStore, now });
  const workItemService = new WorkItemService({ store: workItemStore, now });
  const inboxItemService = new InboxItemService({ store: inboxItemStore, now });
  const activityService = new ActivityService({ store: activityStore, now });

  const sendReviewedEmail = vi.fn(async () => ({
    providerMessageId: "msg_test_01",
  }));
  const runReviewedExternalWorkflow = vi.fn(async () => ({
    response_status_code: 202,
    response_summary: "queued",
    backend_reference: "wf_exec_01",
  }));

  const resolutionService = new ReviewResolutionService({
    reviewService,
    workItemService,
    inboxItemService,
    activityService,
    workerService: {
      async getById(workspaceId: string, id: string) {
        return {
          id,
          workspace_id: workspaceId,
          slug: `worker-${id}`,
          name: `Worker ${id}`,
          kind: "follow_up",
          scope: "shared",
          status: "active",
          summary: null,
          member_ids: [],
          assignee_ids: [],
          reviewer_ids: [],
          input_route_ids: [],
          connection_ids: [],
          action_ids: [],
          created_at: new Date("2026-03-18T00:00:00.000Z").toISOString(),
          updated_at: new Date("2026-03-18T00:00:00.000Z").toISOString(),
        };
      },
    },
    actionCapabilityService: {
      async list() {
        return {
          action_capabilities: [
            {
              id: "act_send_email_test",
              worker_id: WORKER_ID,
              kind: "send_email",
              boundary_mode: "ask_me",
              reviewer_ids: [],
              destination_connection_id: SMTP_CONNECTION_ID,
            },
          ],
        };
      },
    },
    connectionService: {
      async getById(_workspaceId: string, id: string) {
        return {
          id,
          provider: "smtp_relay",
          access_mode: "write_capable",
          status: "connected",
          label: "SMTP Relay",
        };
      },
      async getStoredById(_workspaceId: string, id: string) {
        return {
          id,
          provider: "n8n",
          accessMode: "write_capable",
          status: "connected",
          label: "n8n Backend",
          configJson: {
            base_url: "https://n8n.example.com",
            auth_token: "n8n-auth-token",
            webhook_path_prefix: "webhook",
          },
        };
      },
    },
    reviewedEmailSender: {
      sendReviewedEmail,
    },
    reviewedExternalWorkflowExecutor: {
      runReviewedExternalWorkflow,
    },
  });

  return {
    reviewStore,
    workItemStore,
    activityStore,
    reviewService,
    workItemService,
    resolutionService,
    sendReviewedEmail,
    runReviewedExternalWorkflow,
  };
}

async function seedReviewedSendExecutingState(
  harness: ReturnType<typeof createHarness>,
  executingSinceMsAgo: number,
) {
  const attemptedAt = new Date(Date.now() - executingSinceMsAgo);
  const executionOutcome = markReviewedSendExecutionRunning(
    queueReviewedSendExecution({
      existing: null,
      reviewId: REVIEW_ID,
      decision: null,
      connectionId: SMTP_CONNECTION_ID,
      connectionLabel: "SMTP Relay",
      attemptedAt,
    }),
  );

  await harness.workItemStore.create({
    id: WORK_ITEM_ID,
    workspaceId: WS,
    workerId: WORKER_ID,
    kind: "email_draft",
    status: "approved",
    title: "Follow up with Acme",
    summary: "Crash-safety send test",
    draftTo: "sarah@acme.com",
    draftSubject: "Checking in",
    draftBody: "Wanted to follow up on our last conversation.",
    executionStatus: "executing",
    executionError: null,
    assigneeIds: ["usr_dave"],
    reviewerIds: ["usr_dave"],
    sourceRouteKind: "forward_email",
    sourceEventId: "src_evt_01",
    sourceInboxItemId: null,
    reviewId: REVIEW_ID,
    runId: null,
    triageJson: null,
    executionStateJson: null,
    executionOutcomeJson: executionOutcome,
    createdAt: attemptedAt,
    updatedAt: attemptedAt,
  });

  await harness.reviewStore.create({
    id: REVIEW_ID,
    workspaceId: WS,
    actionKind: "send_email",
    status: "approved",
    workerId: WORKER_ID,
    workItemId: WORK_ITEM_ID,
    reviewerIds: ["usr_dave"],
    assigneeIds: ["usr_dave"],
    sourceRouteKind: "forward_email",
    actionDestination: "sarah@acme.com",
    requestedAt: new Date(attemptedAt.getTime() - 60_000),
    resolvedAt: attemptedAt,
    createdAt: new Date(attemptedAt.getTime() - 60_000),
    updatedAt: attemptedAt,
  });
}

async function seedExternalWorkflowExecutingState(
  harness: ReturnType<typeof createHarness>,
  executingSinceMsAgo: number,
) {
  const attemptedAt = new Date(Date.now() - executingSinceMsAgo);
  const request: ExternalWorkflowRequest = {
    backend_kind: "n8n",
    connection_id: N8N_CONNECTION_ID,
    workflow_identifier: "wf_follow_up",
    payload: {
      account_id: "acct_01",
    },
  };
  const executionOutcome = markReviewedExternalWorkflowExecutionRunning(
    queueReviewedExternalWorkflowExecution({
      existing: null,
      reviewId: REVIEW_ID,
      decision: null,
      request,
      connectionLabel: "n8n Backend",
      attemptedAt,
    }),
  );

  await harness.workItemStore.create({
    id: WORK_ITEM_ID,
    workspaceId: WS,
    workerId: WORKER_ID,
    kind: "email_draft",
    status: "approved",
    title: "Run workflow",
    summary: "Crash-safety workflow test",
    draftTo: null,
    draftSubject: null,
    draftBody: null,
    executionStatus: "executing",
    executionError: null,
    assigneeIds: ["usr_dave"],
    reviewerIds: ["usr_dave"],
    sourceRouteKind: "forward_email",
    sourceEventId: "src_evt_01",
    sourceInboxItemId: null,
    reviewId: REVIEW_ID,
    runId: null,
    triageJson: null,
    executionStateJson: null,
    executionOutcomeJson: executionOutcome,
    createdAt: attemptedAt,
    updatedAt: attemptedAt,
  });

  await harness.reviewStore.create({
    id: REVIEW_ID,
    workspaceId: WS,
    actionKind: "run_external_workflow",
    status: "approved",
    workerId: WORKER_ID,
    workItemId: WORK_ITEM_ID,
    reviewerIds: ["usr_dave"],
    assigneeIds: ["usr_dave"],
    sourceRouteKind: "forward_email",
    actionDestination: null,
    requestPayloadJson: request,
    requestedAt: new Date(attemptedAt.getTime() - 60_000),
    resolvedAt: attemptedAt,
    createdAt: new Date(attemptedAt.getTime() - 60_000),
    updatedAt: attemptedAt,
  });
}

describe("Crash safety: stale executing guards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-27T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not auto-resend a reviewed send that is still freshly executing", async () => {
    const harness = createHarness();
    await seedReviewedSendExecutingState(harness, 30_000);

    const result = await harness.resolutionService.resolve(WS, REVIEW_ID, {
      decision: "approved",
    });

    expect(result.status).toBe("approved");
    expect(harness.sendReviewedEmail).not.toHaveBeenCalled();

    const workItem = await harness.workItemService.getById(WS, WORK_ITEM_ID);
    expect(workItem.status).toBe("approved");
    expect(workItem.execution_status).toBe("executing");
    expect(workItem.execution_error).toBeNull();
  });

  it("marks a stale reviewed send executing attempt failed without auto-resending", async () => {
    const harness = createHarness();
    await seedReviewedSendExecutingState(harness, 3 * 60_000);

    const result = await harness.resolutionService.resolve(WS, REVIEW_ID, {
      decision: "approved",
    });

    expect(result.status).toBe("approved");
    expect(harness.sendReviewedEmail).not.toHaveBeenCalled();

    const workItem = await harness.workItemService.getById(WS, WORK_ITEM_ID);
    expect(workItem.status).toBe("failed");
    expect(workItem.execution_status).toBe("failed");
    expect(workItem.execution_error).toContain("did not auto-resend");
    expect(workItem.execution_outcome_json).toMatchObject({
      kind: "reviewed_send_email",
      status: "failed",
      attempt_count: 1,
      error_classification: "transient",
    });

    expect(harness.activityStore.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resultKind: "send_failed",
          workItemId: WORK_ITEM_ID,
        }),
      ]),
    );
  });

  it("does not auto-rerun an external workflow that is still freshly executing", async () => {
    const harness = createHarness();
    await seedExternalWorkflowExecutingState(harness, 30_000);

    const result = await harness.resolutionService.resolve(WS, REVIEW_ID, {
      decision: "approved",
    });

    expect(result.status).toBe("approved");
    expect(harness.runReviewedExternalWorkflow).not.toHaveBeenCalled();

    const workItem = await harness.workItemService.getById(WS, WORK_ITEM_ID);
    expect(workItem.status).toBe("approved");
    expect(workItem.execution_status).toBe("executing");
    expect(workItem.execution_error).toBeNull();
  });

  it("marks a stale external workflow executing attempt failed without auto-rerunning", async () => {
    const harness = createHarness();
    await seedExternalWorkflowExecutingState(harness, 3 * 60_000);

    const result = await harness.resolutionService.resolve(WS, REVIEW_ID, {
      decision: "approved",
    });

    expect(result.status).toBe("approved");
    expect(harness.runReviewedExternalWorkflow).not.toHaveBeenCalled();

    const workItem = await harness.workItemService.getById(WS, WORK_ITEM_ID);
    expect(workItem.status).toBe("failed");
    expect(workItem.execution_status).toBe("failed");
    expect(workItem.execution_error).toContain("did not auto-retry");
    expect(workItem.execution_outcome_json).toMatchObject({
      kind: "reviewed_external_workflow",
      status: "failed",
      attempt_count: 1,
    });

    expect(harness.activityStore.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resultKind: "external_workflow_handoff_failed",
          workItemId: WORK_ITEM_ID,
        }),
      ]),
    );
  });
});
