import { inputRouteRecordSchema } from "@clawback/contracts";

import type { InputRouteRecordView, InputRouteStore, StoredInputRoute } from "./types.js";

type InputRouteServiceOptions = {
  store: InputRouteStore;
};

export class InputRouteService {
  constructor(private readonly options: InputRouteServiceOptions) {}

  async list(workspaceId: string): Promise<{ input_routes: InputRouteRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { input_routes: rows.map((row) => this.toView(row)) };
  }

  async syncWatchedInboxStatusForWorkers(
    workspaceId: string,
    workerIds: string[],
    status: StoredInputRoute["status"],
  ): Promise<{ input_routes: InputRouteRecordView[] }> {
    if (workerIds.length === 0) {
      return { input_routes: [] };
    }

    const rows = await this.options.store.listByWorkspace(workspaceId);
    const watchedRoutes = rows.filter(
      (row) => row.kind === "watched_inbox" && workerIds.includes(row.workerId),
    );

    const updated = await Promise.all(
      watchedRoutes.map(async (route) => {
        if (route.status === status) {
          return route;
        }

        return await this.options.store.update(route.id, {
          status,
          updatedAt: new Date(),
        });
      }),
    );

    return { input_routes: updated.map((row) => this.toView(row)) };
  }

  private toView(row: StoredInputRoute): InputRouteRecordView {
    return inputRouteRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      worker_id: row.workerId,
      kind: row.kind,
      status: row.status,
      label: row.label,
      description: row.description,
      address: row.address,
      capability_note: row.capabilityNote,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}
