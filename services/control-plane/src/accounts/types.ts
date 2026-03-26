import type { AccountRecord, RelationshipClass } from "@clawback/contracts";

export type StoredAccount = {
  id: string;
  workspaceId: string;
  name: string;
  primaryDomain: string | null;
  relationshipClass: RelationshipClass | null;
  ownerUserId: string | null;
  handlingNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAccountInput = {
  name: string;
  primaryDomain?: string | null;
  relationshipClass?: RelationshipClass | null;
  ownerUserId?: string | null;
  handlingNote?: string | null;
};

export type UpdateAccountInput = {
  name?: string;
  primaryDomain?: string | null;
  relationshipClass?: RelationshipClass | null;
  ownerUserId?: string | null;
  handlingNote?: string | null;
};

export interface AccountStore {
  listByWorkspace(workspaceId: string): Promise<StoredAccount[]>;
  findById(workspaceId: string, id: string): Promise<StoredAccount | null>;
  findByDomain(workspaceId: string, domain: string): Promise<StoredAccount | null>;
  create(input: StoredAccount): Promise<StoredAccount>;
  update(id: string, input: Partial<StoredAccount>): Promise<StoredAccount>;
}

export type AccountRecordView = AccountRecord;
