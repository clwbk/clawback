import { describe, expect, it } from "vitest";

import type {
  ConnectorRecord,
  ConnectorSyncJobRecord,
} from "@/lib/control-plane";
import {
  hasIndexedKnowledgeSync,
  hasReadyKnowledgeConnector,
} from "./knowledge-path";

function createConnector(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
  return {
    id: "ctr_docs_01",
    workspace_id: "ws_01",
    type: "local_directory",
    name: "Company Docs",
    status: "active",
    config: {
      root_path: "./docs",
      recursive: true,
      include_extensions: [".md"],
    },
    created_by: "user_01",
    created_at: "2026-03-25T10:00:00.000Z",
    updated_at: "2026-03-25T10:00:00.000Z",
    ...overrides,
  };
}

function createSyncJob(overrides: Partial<ConnectorSyncJobRecord> = {}): ConnectorSyncJobRecord {
  return {
    id: "sync_01",
    workspace_id: "ws_01",
    connector_id: "ctr_docs_01",
    status: "completed",
    requested_by: "user_01",
    started_at: "2026-03-25T10:00:00.000Z",
    completed_at: "2026-03-25T10:01:00.000Z",
    error_summary: null,
    stats: {
      scanned_file_count: 8,
      indexed_document_count: 6,
      updated_document_count: 0,
      deleted_document_count: 0,
      skipped_file_count: 2,
      error_count: 0,
    },
    created_at: "2026-03-25T10:00:00.000Z",
    updated_at: "2026-03-25T10:01:00.000Z",
    ...overrides,
  };
}

describe("knowledgePath", () => {
  it("treats a completed sync with indexed documents as retrieval-ready", () => {
    expect(hasIndexedKnowledgeSync([createSyncJob()])).toBe(true);
  });

  it("treats a clean completed rescan as retrieval-ready even without new indexing", () => {
    expect(
      hasIndexedKnowledgeSync([
        createSyncJob({
          stats: {
            scanned_file_count: 4,
            indexed_document_count: 0,
            updated_document_count: 0,
            deleted_document_count: 0,
            skipped_file_count: 0,
            error_count: 0,
          },
        }),
      ]),
    ).toBe(true);
  });

  it("requires an active local-directory connector with ready sync state", () => {
    const readyConnector = createConnector();
    const disabledConnector = createConnector({
      id: "ctr_docs_02",
      status: "disabled",
      name: "Archive Docs",
    });
    const syncJobsByConnector = new Map<string, ConnectorSyncJobRecord[]>([
      [readyConnector.id, [createSyncJob()]],
      [disabledConnector.id, [createSyncJob({ connector_id: disabledConnector.id })]],
    ]);

    expect(
      hasReadyKnowledgeConnector([readyConnector, disabledConnector], syncJobsByConnector),
    ).toBe(true);
    expect(
      hasReadyKnowledgeConnector(
        [disabledConnector],
        new Map([[disabledConnector.id, [createSyncJob({ connector_id: disabledConnector.id })]]]),
      ),
    ).toBe(false);
  });
});
