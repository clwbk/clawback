import type {
  WorkItemAuthorityRecord,
  WorkItemExecutionContinuityRecord,
  WorkItemExecutionOutcome,
  WorkItemExecutionStatus,
  WorkItemKind,
  WorkItemStatus,
  InputRouteKind,
  WorkerTriageRecord,
} from "@clawback/contracts";

export type StoredWorkItem = {
  id: string;
  workspaceId: string;
  workerId: string;
  kind: WorkItemKind;
  status: WorkItemStatus;
  title: string;
  summary: string | null;
  draftTo?: string | null;
  draftSubject?: string | null;
  draftBody?: string | null;
  executionStatus?: WorkItemExecutionStatus;
  executionError?: string | null;
  assigneeIds: string[];
  reviewerIds: string[];
  sourceRouteKind: InputRouteKind | null;
  sourceEventId: string | null;
  sourceInboxItemId?: string | null;
  reviewId: string | null;
  runId: string | null;
  triageJson: WorkerTriageRecord | null;
  executionStateJson?: WorkItemExecutionContinuityRecord | null;
  executionOutcomeJson?: WorkItemExecutionOutcome | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateWorkItemInput = {
  workerId: string;
  kind: WorkItemKind;
  title: string;
  summary?: string | null;
  draftTo?: string | null;
  draftSubject?: string | null;
  draftBody?: string | null;
  executionStatus?: WorkItemExecutionStatus;
  executionError?: string | null;
  assigneeIds?: string[];
  reviewerIds?: string[];
  sourceRouteKind?: InputRouteKind | null;
  sourceEventId?: string | null;
  sourceInboxItemId?: string | null;
  reviewId?: string | null;
  runId?: string | null;
  triageJson?: WorkerTriageRecord | null;
  executionStateJson?: WorkItemExecutionContinuityRecord | null;
  executionOutcomeJson?: WorkItemExecutionOutcome | null;
};

export type UpdateWorkItemInput = {
  status?: WorkItemStatus;
  title?: string;
  summary?: string | null;
  draftTo?: string | null;
  draftSubject?: string | null;
  draftBody?: string | null;
  executionStatus?: WorkItemExecutionStatus;
  executionError?: string | null;
  assigneeIds?: string[];
  reviewerIds?: string[];
  reviewId?: string | null;
  runId?: string | null;
  executionStateJson?: WorkItemExecutionContinuityRecord | null;
  executionOutcomeJson?: WorkItemExecutionOutcome | null;
};

export interface WorkItemStore {
  listByWorkspace(workspaceId: string): Promise<StoredWorkItem[]>;
  listByWorker(workerId: string): Promise<StoredWorkItem[]>;
  findById(workspaceId: string, id: string): Promise<StoredWorkItem | null>;
  findBySourceInboxItemId?(workspaceId: string, sourceInboxItemId: string): Promise<StoredWorkItem | null>;
  create(input: StoredWorkItem): Promise<StoredWorkItem>;
  update(id: string, input: Partial<StoredWorkItem>): Promise<StoredWorkItem>;
  remove(id: string): Promise<void>;
}

export type WorkItemAuthorityRecordView = WorkItemAuthorityRecord;
export type WorkItemRecordView = WorkItemAuthorityRecordView;
