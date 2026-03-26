import { actionCapabilityRecordSchema } from "@clawback/contracts";

import type {
  ActionCapabilityRecordView,
  ActionCapabilityStore,
  StoredActionCapability,
} from "./types.js";

type ActionCapabilityServiceOptions = {
  store: ActionCapabilityStore;
};

export class ActionCapabilityService {
  constructor(private readonly options: ActionCapabilityServiceOptions) {}

  async list(workspaceId: string): Promise<{ action_capabilities: ActionCapabilityRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { action_capabilities: rows.map((row) => this.toView(row)) };
  }

  async update(
    workspaceId: string,
    id: string,
    input: {
      boundaryMode?: StoredActionCapability["boundaryMode"];
      reviewerIds?: string[];
      destinationConnectionId?: string | null;
    },
  ): Promise<ActionCapabilityRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) {
      throw new ActionCapabilityNotFoundError(id);
    }

    const updates: Partial<StoredActionCapability> = {
      updatedAt: new Date(),
    };
    if (input.boundaryMode !== undefined) updates.boundaryMode = input.boundaryMode;
    if (input.reviewerIds !== undefined) updates.reviewerIds = input.reviewerIds;
    if (input.destinationConnectionId !== undefined) {
      updates.destinationConnectionId = input.destinationConnectionId;
    }

    const updated = await this.options.store.update(id, updates);

    return this.toView(updated);
  }

  private toView(row: StoredActionCapability): ActionCapabilityRecordView {
    return actionCapabilityRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      worker_id: row.workerId,
      kind: row.kind,
      boundary_mode: row.boundaryMode,
      reviewer_ids: row.reviewerIds,
      destination_connection_id: row.destinationConnectionId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class ActionCapabilityNotFoundError extends Error {
  readonly code = "action_capability_not_found";
  readonly statusCode = 404;

  constructor(id: string) {
    super(`Action capability not found: ${id}`);
  }
}
