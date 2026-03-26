import {
  approvalSurfaceIdentityListResponseSchema,
  approvalSurfaceIdentityRecordSchema,
} from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  ApprovalSurfaceIdentityRecordView,
  ApprovalSurfaceIdentityStore,
  CreateApprovalSurfaceIdentityInput,
  StoredApprovalSurfaceIdentity,
  UpdateApprovalSurfaceIdentityInput,
} from "./types.js";

type ApprovalSurfaceIdentityServiceOptions = {
  store: ApprovalSurfaceIdentityStore;
  now?: () => Date;
};

function normalizeExternalIdentity(value: string) {
  return value.trim().toLowerCase();
}

export class ApprovalSurfaceIdentityService {
  private readonly now: () => Date;

  constructor(private readonly options: ApprovalSurfaceIdentityServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list(workspaceId: string): Promise<{ identities: ApprovalSurfaceIdentityRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return approvalSurfaceIdentityListResponseSchema.parse({
      identities: rows.map((row) => this.toView(row)),
    });
  }

  async getById(workspaceId: string, id: string): Promise<ApprovalSurfaceIdentityRecordView> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) {
      throw new ApprovalSurfaceIdentityNotFoundError(id);
    }
    return this.toView(row);
  }

  async findAllowedIdentity(
    workspaceId: string,
    channel: StoredApprovalSurfaceIdentity["channel"],
    externalIdentity: string,
  ): Promise<ApprovalSurfaceIdentityRecordView | null> {
    const row = await this.options.store.findByChannelAndIdentity(
      workspaceId,
      channel,
      normalizeExternalIdentity(externalIdentity),
    );
    if (!row || row.status !== "allowed") {
      return null;
    }
    return this.toView(row);
  }

  async upsert(
    workspaceId: string,
    input: CreateApprovalSurfaceIdentityInput,
  ): Promise<ApprovalSurfaceIdentityRecordView> {
    const now = this.now();
    const normalizedIdentity = normalizeExternalIdentity(input.externalIdentity);
    const byIdentity = await this.options.store.findByChannelAndIdentity(
      workspaceId,
      input.channel,
      normalizedIdentity,
    );
    if (byIdentity && byIdentity.userId !== input.userId) {
      throw new ApprovalSurfaceIdentityConflictError(
        `External identity ${normalizedIdentity} is already assigned in this workspace.`,
      );
    }

    const byUser = await this.options.store.findByChannelAndUser(
      workspaceId,
      input.channel,
      input.userId,
    );
    if (byUser) {
      const updated = await this.options.store.update(byUser.id, {
        externalIdentity: normalizedIdentity,
        label: input.label?.trim() || byUser.label,
        status: "allowed",
        updatedAt: now,
      });
      return this.toView(updated);
    }

    const created = await this.options.store.create({
      id: createClawbackId("aps"),
      workspaceId,
      channel: input.channel,
      userId: input.userId,
      externalIdentity: normalizedIdentity,
      label: input.label?.trim() || normalizedIdentity,
      status: "allowed",
      createdAt: now,
      updatedAt: now,
    });
    return this.toView(created);
  }

  async update(
    workspaceId: string,
    id: string,
    input: UpdateApprovalSurfaceIdentityInput,
  ): Promise<ApprovalSurfaceIdentityRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) {
      throw new ApprovalSurfaceIdentityNotFoundError(id);
    }

    const nextIdentity =
      input.externalIdentity !== undefined
        ? normalizeExternalIdentity(input.externalIdentity)
        : existing.externalIdentity;
    if (nextIdentity !== existing.externalIdentity) {
      const conflict = await this.options.store.findByChannelAndIdentity(
        workspaceId,
        existing.channel,
        nextIdentity,
      );
      if (conflict && conflict.id !== id) {
        throw new ApprovalSurfaceIdentityConflictError(
          `External identity ${nextIdentity} is already assigned in this workspace.`,
        );
      }
    }

    const updated = await this.options.store.update(id, {
      externalIdentity: nextIdentity,
      label: input.label?.trim() || existing.label,
      status: input.status ?? existing.status,
      updatedAt: this.now(),
    });
    return this.toView(updated);
  }

  private toView(row: StoredApprovalSurfaceIdentity): ApprovalSurfaceIdentityRecordView {
    return approvalSurfaceIdentityRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      channel: row.channel,
      user_id: row.userId,
      external_identity: row.externalIdentity,
      label: row.label,
      status: row.status,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class ApprovalSurfaceIdentityNotFoundError extends Error {
  readonly code = "approval_surface_identity_not_found";
  readonly statusCode = 404;

  constructor(id: string) {
    super(`Approval surface identity not found: ${id}`);
  }
}

export class ApprovalSurfaceIdentityConflictError extends Error {
  readonly code = "approval_surface_identity_conflict";
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
  }
}

export { normalizeExternalIdentity };
