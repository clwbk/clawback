import { activityEventRecordSchema } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  ActivityEventRecordView,
  ActivityEventStore,
  AppendActivityEventInput,
  StoredActivityEvent,
} from "./types.js";

type ActivityServiceOptions = {
  store: ActivityEventStore;
  now?: () => Date;
};

export class ActivityService {
  private readonly now: () => Date;

  constructor(private readonly options: ActivityServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list(workspaceId: string, limit?: number): Promise<{ events: ActivityEventRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId, limit);
    return { events: rows.map((r) => this.toView(r)) };
  }

  async findByReviewResult(
    workspaceId: string,
    reviewId: string,
    resultKind: string,
  ): Promise<ActivityEventRecordView | null> {
    const row = await this.options.store.findByReviewResult(workspaceId, reviewId, resultKind);
    return row ? this.toView(row) : null;
  }

  async findByWorkItemResult(
    workspaceId: string,
    workItemId: string,
    resultKind: string,
  ): Promise<ActivityEventRecordView | null> {
    const row = this.options.store.findByWorkItemResult
      ? await this.options.store.findByWorkItemResult(workspaceId, workItemId, resultKind)
      : (await this.options.store.listByWorkspace(workspaceId)).find(
          (event) => event.workItemId === workItemId && event.resultKind === resultKind,
        ) ?? null;
    return row ? this.toView(row) : null;
  }

  async append(workspaceId: string, input: AppendActivityEventInput): Promise<ActivityEventRecordView> {
    const now = this.now();
    const stored: StoredActivityEvent = {
      id: createClawbackId("evt"),
      workspaceId,
      timestamp: now,
      workerId: input.workerId ?? null,
      routeKind: input.routeKind ?? null,
      resultKind: input.resultKind,
      title: input.title,
      summary: input.summary ?? null,
      assigneeIds: input.assigneeIds ?? [],
      runId: input.runId ?? null,
      workItemId: input.workItemId ?? null,
      reviewId: input.reviewId ?? null,
    };
    const created = await this.options.store.create(stored);
    return this.toView(created);
  }

  async appendReviewResultOnce(
    workspaceId: string,
    input: Omit<AppendActivityEventInput, "reviewId"> & { reviewId: string },
  ): Promise<ActivityEventRecordView> {
    const existing = await this.findByReviewResult(workspaceId, input.reviewId, input.resultKind);
    if (existing) {
      return existing;
    }

    return this.append(workspaceId, input);
  }

  async appendWorkItemResultOnce(
    workspaceId: string,
    input: Omit<AppendActivityEventInput, "workItemId"> & { workItemId: string },
  ): Promise<ActivityEventRecordView> {
    const existing = await this.findByWorkItemResult(workspaceId, input.workItemId, input.resultKind);
    if (existing) {
      return existing;
    }

    return this.append(workspaceId, input);
  }

  private toView(row: StoredActivityEvent): ActivityEventRecordView {
    return activityEventRecordSchema.parse({
      id: row.id,
      timestamp: row.timestamp.toISOString(),
      worker_id: row.workerId,
      route_kind: row.routeKind,
      result_kind: row.resultKind,
      title: row.title,
      summary: row.summary,
      assignee_ids: row.assigneeIds,
      run_id: row.runId,
      work_item_id: row.workItemId,
      review_id: row.reviewId,
    });
  }
}
