import type {
  ConnectionRecord,
  ConnectionProvider,
  ConnectionAccessMode,
  ConnectionStatus,
} from "@clawback/contracts";

export type StoredConnection = {
  id: string;
  workspaceId: string;
  provider: ConnectionProvider;
  accessMode: ConnectionAccessMode;
  status: ConnectionStatus;
  label: string;
  capabilities: string[];
  attachedWorkerIds: string[];
  configJson?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateConnectionInput = {
  provider: ConnectionProvider;
  accessMode: ConnectionAccessMode;
  label: string;
  capabilities?: string[];
  attachedWorkerIds?: string[];
  configJson?: Record<string, unknown>;
};

export type UpdateConnectionInput = {
  status?: ConnectionStatus;
  label?: string;
  capabilities?: string[];
  attachedWorkerIds?: string[];
  configJson?: Record<string, unknown>;
};

export interface ConnectionStore {
  listAll(): Promise<StoredConnection[]>;
  listByWorkspace(workspaceId: string): Promise<StoredConnection[]>;
  findById(workspaceId: string, id: string): Promise<StoredConnection | null>;
  create(input: StoredConnection): Promise<StoredConnection>;
  update(id: string, input: Partial<StoredConnection>): Promise<StoredConnection>;
  remove(id: string): Promise<void>;
}

export type ConnectionRecordView = ConnectionRecord;
