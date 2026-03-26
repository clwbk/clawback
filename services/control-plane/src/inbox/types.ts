import type {
  InboxItemExecutionProjectionRecord,
  InboxItemKind,
  InboxItemProjectionRecord,
  InboxItemState,
  InputRouteKind,
  WorkerTriageRecord,
} from "@clawback/contracts";

export type StoredInboxItem = {
  id: string;
  workspaceId: string;
  kind: InboxItemKind;
  title: string;
  summary: string | null;
  assigneeIds: string[];
  workerId: string | null;
  workItemId: string | null;
  reviewId: string | null;
  routeKind: InputRouteKind | null;
  state: InboxItemState;
  triageJson: WorkerTriageRecord | null;
  executionStateJson?: InboxItemExecutionProjectionRecord | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateInboxItemInput = {
  kind: InboxItemKind;
  title: string;
  summary?: string | null;
  assigneeIds?: string[];
  workerId?: string | null;
  workItemId?: string | null;
  reviewId?: string | null;
  routeKind?: InputRouteKind | null;
  triageJson?: WorkerTriageRecord | null;
  executionStateJson?: InboxItemExecutionProjectionRecord | null;
};

export type UpdateInboxItemInput = {
  state?: InboxItemState;
  title?: string;
  summary?: string | null;
  assigneeIds?: string[];
  workItemId?: string | null;
  executionStateJson?: InboxItemExecutionProjectionRecord | null;
};

export interface InboxItemStore {
  listByWorkspace(workspaceId: string): Promise<StoredInboxItem[]>;
  listOpen(workspaceId: string): Promise<StoredInboxItem[]>;
  findById(workspaceId: string, id: string): Promise<StoredInboxItem | null>;
  findByReviewId(workspaceId: string, reviewId: string): Promise<StoredInboxItem | null>;
  findByWorkItemId?(workspaceId: string, workItemId: string): Promise<StoredInboxItem | null>;
  create(input: StoredInboxItem): Promise<StoredInboxItem>;
  update(id: string, input: Partial<StoredInboxItem>): Promise<StoredInboxItem>;
  remove(id: string): Promise<void>;
}

export type InboxItemProjectionRecordView = InboxItemProjectionRecord;
export type InboxItemRecordView = InboxItemProjectionRecordView;
