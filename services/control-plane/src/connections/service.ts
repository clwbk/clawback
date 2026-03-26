import { connectionRecordSchema } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  ConnectionRecordView,
  ConnectionStore,
  CreateConnectionInput,
  StoredConnection,
  UpdateConnectionInput,
} from "./types.js";

type ConnectionServiceOptions = {
  store: ConnectionStore;
  now?: () => Date;
};

export class ConnectionService {
  private readonly now: () => Date;

  constructor(private readonly options: ConnectionServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async listAllStored(): Promise<StoredConnection[]> {
    return await this.options.store.listAll();
  }

  async listStored(workspaceId: string): Promise<StoredConnection[]> {
    return await this.options.store.listByWorkspace(workspaceId);
  }

  async list(workspaceId: string): Promise<{ connections: ConnectionRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { connections: rows.map((r) => this.toView(r)) };
  }

  async getById(workspaceId: string, id: string): Promise<ConnectionRecordView> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) throw new ConnectionNotFoundError(id);
    return this.toView(row);
  }

  async getStoredById(workspaceId: string, id: string): Promise<StoredConnection> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) throw new ConnectionNotFoundError(id);
    return row;
  }

  async create(workspaceId: string, input: CreateConnectionInput): Promise<ConnectionRecordView> {
    const now = this.now();
    const stored: StoredConnection = {
      id: createClawbackId("conn"),
      workspaceId,
      provider: input.provider,
      accessMode: input.accessMode,
      status: "not_connected",
      label: input.label,
      capabilities: input.capabilities ?? [],
      attachedWorkerIds: input.attachedWorkerIds ?? [],
      configJson: input.configJson ?? {},
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.options.store.create(stored);
    return this.toView(created);
  }

  async update(workspaceId: string, id: string, input: UpdateConnectionInput): Promise<ConnectionRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new ConnectionNotFoundError(id);

    const now = this.now();
    const updates: Partial<StoredConnection> = { updatedAt: now };
    if (input.status !== undefined) updates.status = input.status;
    if (input.label !== undefined) updates.label = input.label;
    if (input.capabilities !== undefined) updates.capabilities = input.capabilities;
    if (input.attachedWorkerIds !== undefined) updates.attachedWorkerIds = input.attachedWorkerIds;
    if (input.configJson !== undefined) updates.configJson = input.configJson;

    const updated = await this.options.store.update(id, updates);
    return this.toView(updated);
  }

  async countActive(workspaceId: string): Promise<number> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return rows.filter((r) => r.status === "connected").length;
  }

  private toView(row: StoredConnection): ConnectionRecordView {
    return connectionRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      provider: row.provider,
      access_mode: row.accessMode,
      status: row.status,
      label: row.label,
      capabilities: row.capabilities,
      attached_worker_ids: row.attachedWorkerIds,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class ConnectionNotFoundError extends Error {
  readonly code = "connection_not_found";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Connection not found: ${id}`);
  }
}
