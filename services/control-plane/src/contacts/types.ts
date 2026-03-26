import type { ContactRecord, RelationshipClass } from "@clawback/contracts";

export type StoredContact = {
  id: string;
  workspaceId: string;
  primaryEmail: string;
  displayName: string;
  accountId: string | null;
  relationshipClass: RelationshipClass | null;
  ownerUserId: string | null;
  handlingNote: string | null;
  doNotAutoReply: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateContactInput = {
  primaryEmail: string;
  displayName: string;
  accountId?: string | null;
  relationshipClass?: RelationshipClass | null;
  ownerUserId?: string | null;
  handlingNote?: string | null;
  doNotAutoReply?: boolean;
};

export type UpdateContactInput = {
  primaryEmail?: string;
  displayName?: string;
  accountId?: string | null;
  relationshipClass?: RelationshipClass | null;
  ownerUserId?: string | null;
  handlingNote?: string | null;
  doNotAutoReply?: boolean;
};

export interface ContactStore {
  listByWorkspace(workspaceId: string): Promise<StoredContact[]>;
  findById(workspaceId: string, id: string): Promise<StoredContact | null>;
  findByEmail(workspaceId: string, email: string): Promise<StoredContact | null>;
  create(input: StoredContact): Promise<StoredContact>;
  update(id: string, input: Partial<StoredContact>): Promise<StoredContact>;
}

export type ContactRecordView = ContactRecord;
