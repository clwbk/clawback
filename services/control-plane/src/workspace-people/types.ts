import type { WorkspacePersonRecord } from "@clawback/contracts";

export type StoredWorkspacePerson = {
  id: string;
  email: string;
  displayName: string;
  role: WorkspacePersonRecord["role"];
};

export interface WorkspacePeopleStore {
  listByWorkspace(workspaceId: string): Promise<StoredWorkspacePerson[]>;
}

export type WorkspacePersonRecordView = WorkspacePersonRecord;
