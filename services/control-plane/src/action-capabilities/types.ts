import type { ActionCapabilityRecord } from "@clawback/contracts";

export type StoredActionCapability = {
  id: string;
  workspaceId: string;
  workerId: string;
  kind: ActionCapabilityRecord["kind"];
  boundaryMode: ActionCapabilityRecord["boundary_mode"];
  reviewerIds: string[];
  destinationConnectionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface ActionCapabilityStore {
  listByWorkspace(workspaceId: string): Promise<StoredActionCapability[]>;
  findById(workspaceId: string, id: string): Promise<StoredActionCapability | null>;
  create(input: StoredActionCapability): Promise<StoredActionCapability>;
  update(id: string, input: Partial<StoredActionCapability>): Promise<StoredActionCapability>;
}

export type ActionCapabilityRecordView = ActionCapabilityRecord;
