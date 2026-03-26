import type {
  WorkerRecord,
  WorkerKind,
  WorkerScope,
  WorkerStatus,
} from "@clawback/contracts";

// ---------------------------------------------------------------------------
// Store types
// ---------------------------------------------------------------------------

export type StoredWorker = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  kind: WorkerKind;
  scope: WorkerScope;
  status: WorkerStatus;
  summary: string | null;
  memberIds: string[];
  assigneeIds: string[];
  reviewerIds: string[];
  inputRouteIds: string[];
  connectionIds: string[];
  actionIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateWorkerInput = {
  name: string;
  kind: WorkerKind;
  scope: WorkerScope;
  summary?: string | null;
  memberIds?: string[];
  assigneeIds?: string[];
  reviewerIds?: string[];
};

export type UpdateWorkerInput = {
  name?: string;
  status?: WorkerStatus;
  summary?: string | null;
  memberIds?: string[];
  assigneeIds?: string[];
  reviewerIds?: string[];
  inputRouteIds?: string[];
  connectionIds?: string[];
  actionIds?: string[];
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface WorkerStore {
  list(workspaceId: string): Promise<StoredWorker[]>;
  findById(workspaceId: string, id: string): Promise<StoredWorker | null>;
  findBySlug(workspaceId: string, slug: string): Promise<StoredWorker | null>;
  create(input: StoredWorker): Promise<StoredWorker>;
  update(id: string, input: Partial<StoredWorker>): Promise<StoredWorker>;
  remove(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service view types
// ---------------------------------------------------------------------------

export type WorkerRecordView = WorkerRecord;
