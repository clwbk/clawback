import { contactRecordSchema } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  ContactStore,
  CreateContactInput,
  StoredContact,
  UpdateContactInput,
  ContactRecordView,
} from "./types.js";

type ContactServiceOptions = {
  store: ContactStore;
  now?: () => Date;
};

export class ContactService {
  private readonly now: () => Date;

  constructor(private readonly options: ContactServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list(workspaceId: string): Promise<{ contacts: ContactRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { contacts: rows.map((r) => this.toView(r)) };
  }

  async getById(workspaceId: string, id: string): Promise<ContactRecordView> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) throw new ContactNotFoundError(id);
    return this.toView(row);
  }

  async findByEmail(workspaceId: string, email: string): Promise<ContactRecordView | null> {
    const row = await this.options.store.findByEmail(workspaceId, email);
    return row ? this.toView(row) : null;
  }

  async create(workspaceId: string, input: CreateContactInput): Promise<ContactRecordView> {
    const now = this.now();
    const stored: StoredContact = {
      id: createClawbackId("cot"),
      workspaceId,
      primaryEmail: input.primaryEmail,
      displayName: input.displayName,
      accountId: input.accountId ?? null,
      relationshipClass: input.relationshipClass ?? null,
      ownerUserId: input.ownerUserId ?? null,
      handlingNote: input.handlingNote ?? null,
      doNotAutoReply: input.doNotAutoReply ?? false,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.options.store.create(stored);
    return this.toView(created);
  }

  async update(workspaceId: string, id: string, input: UpdateContactInput): Promise<ContactRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new ContactNotFoundError(id);

    const now = this.now();
    const updates: Partial<StoredContact> = { updatedAt: now };
    if (input.primaryEmail !== undefined) updates.primaryEmail = input.primaryEmail;
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.accountId !== undefined) updates.accountId = input.accountId;
    if (input.relationshipClass !== undefined) updates.relationshipClass = input.relationshipClass;
    if (input.ownerUserId !== undefined) updates.ownerUserId = input.ownerUserId;
    if (input.handlingNote !== undefined) updates.handlingNote = input.handlingNote;
    if (input.doNotAutoReply !== undefined) updates.doNotAutoReply = input.doNotAutoReply;

    const updated = await this.options.store.update(id, updates);
    return this.toView(updated);
  }

  private toView(row: StoredContact): ContactRecordView {
    return contactRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      primary_email: row.primaryEmail,
      display_name: row.displayName,
      account_id: row.accountId,
      relationship_class: row.relationshipClass,
      owner_user_id: row.ownerUserId,
      handling_note: row.handlingNote,
      do_not_auto_reply: row.doNotAutoReply,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class ContactNotFoundError extends Error {
  readonly code = "contact_not_found";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Contact not found: ${id}`);
  }
}
