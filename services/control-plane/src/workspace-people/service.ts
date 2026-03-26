import { workspacePersonRecordSchema } from "@clawback/contracts";

import type {
  StoredWorkspacePerson,
  WorkspacePeopleStore,
  WorkspacePersonRecordView,
} from "./types.js";

type WorkspacePeopleServiceOptions = {
  store: WorkspacePeopleStore;
};

export class WorkspacePeopleService {
  constructor(private readonly options: WorkspacePeopleServiceOptions) {}

  async list(workspaceId: string): Promise<{ people: WorkspacePersonRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { people: rows.map((row) => this.toView(row)) };
  }

  private toView(row: StoredWorkspacePerson): WorkspacePersonRecordView {
    return workspacePersonRecordSchema.parse({
      id: row.id,
      email: row.email,
      display_name: row.displayName,
      role: row.role,
    });
  }
}
