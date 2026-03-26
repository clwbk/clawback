import type { InputRouteRecord } from "@clawback/contracts";

export type StoredInputRoute = {
  id: string;
  workspaceId: string;
  workerId: string;
  kind: InputRouteRecord["kind"];
  status: InputRouteRecord["status"];
  label: string;
  description: string | null;
  address: string | null;
  capabilityNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface InputRouteStore {
  listByWorkspace(workspaceId: string): Promise<StoredInputRoute[]>;
  findById(workspaceId: string, id: string): Promise<StoredInputRoute | null>;
  create(input: StoredInputRoute): Promise<StoredInputRoute>;
  update(id: string, input: Partial<StoredInputRoute>): Promise<StoredInputRoute>;
}

export type InputRouteRecordView = InputRouteRecord;
