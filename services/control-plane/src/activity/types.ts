import type {
  ActivityEventRecord,
  InputRouteKind,
} from "@clawback/contracts";

export type StoredActivityEvent = {
  id: string;
  workspaceId: string;
  timestamp: Date;
  workerId: string | null;
  routeKind: InputRouteKind | null;
  resultKind: string;
  title: string;
  summary: string | null;
  assigneeIds: string[];
  runId: string | null;
  workItemId: string | null;
  reviewId: string | null;
};

export type AppendActivityEventInput = {
  workerId?: string | null;
  routeKind?: InputRouteKind | null;
  resultKind: string;
  title: string;
  summary?: string | null;
  assigneeIds?: string[];
  runId?: string | null;
  workItemId?: string | null;
  reviewId?: string | null;
};

export interface ActivityEventStore {
  listByWorkspace(workspaceId: string, limit?: number): Promise<StoredActivityEvent[]>;
  findByReviewResult(
    workspaceId: string,
    reviewId: string,
    resultKind: string,
  ): Promise<StoredActivityEvent | null>;
  findByWorkItemResult?(
    workspaceId: string,
    workItemId: string,
    resultKind: string,
  ): Promise<StoredActivityEvent | null>;
  create(input: StoredActivityEvent): Promise<StoredActivityEvent>;
}

export type ActivityEventRecordView = ActivityEventRecord;
