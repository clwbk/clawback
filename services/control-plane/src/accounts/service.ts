import { accountRecordSchema } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  AccountStore,
  CreateAccountInput,
  StoredAccount,
  UpdateAccountInput,
  AccountRecordView,
} from "./types.js";

type AccountServiceOptions = {
  store: AccountStore;
  now?: () => Date;
};

export class AccountService {
  private readonly now: () => Date;

  constructor(private readonly options: AccountServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list(workspaceId: string): Promise<{ accounts: AccountRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { accounts: rows.map((r) => this.toView(r)) };
  }

  async getById(workspaceId: string, id: string): Promise<AccountRecordView> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) throw new AccountNotFoundError(id);
    return this.toView(row);
  }

  async findByDomain(workspaceId: string, domain: string): Promise<AccountRecordView | null> {
    const row = await this.options.store.findByDomain(workspaceId, domain);
    return row ? this.toView(row) : null;
  }

  async create(workspaceId: string, input: CreateAccountInput): Promise<AccountRecordView> {
    const now = this.now();
    const stored: StoredAccount = {
      id: createClawbackId("acc"),
      workspaceId,
      name: input.name,
      primaryDomain: input.primaryDomain ?? null,
      relationshipClass: input.relationshipClass ?? null,
      ownerUserId: input.ownerUserId ?? null,
      handlingNote: input.handlingNote ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.options.store.create(stored);
    return this.toView(created);
  }

  async update(workspaceId: string, id: string, input: UpdateAccountInput): Promise<AccountRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new AccountNotFoundError(id);

    const now = this.now();
    const updates: Partial<StoredAccount> = { updatedAt: now };
    if (input.name !== undefined) updates.name = input.name;
    if (input.primaryDomain !== undefined) updates.primaryDomain = input.primaryDomain;
    if (input.relationshipClass !== undefined) updates.relationshipClass = input.relationshipClass;
    if (input.ownerUserId !== undefined) updates.ownerUserId = input.ownerUserId;
    if (input.handlingNote !== undefined) updates.handlingNote = input.handlingNote;

    const updated = await this.options.store.update(id, updates);
    return this.toView(updated);
  }

  private toView(row: StoredAccount): AccountRecordView {
    return accountRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      name: row.name,
      primary_domain: row.primaryDomain,
      relationship_class: row.relationshipClass,
      owner_user_id: row.ownerUserId,
      handling_note: row.handlingNote,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class AccountNotFoundError extends Error {
  readonly code = "account_not_found";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Account not found: ${id}`);
  }
}
