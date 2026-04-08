import { describe, expect, it } from "vitest";

import {
  followUpActions,
  followUpConnections,
  followUpRoutes,
  inboxItems,
  workers,
  workItems,
} from "@/lib/dev-fixtures";
import type {
  ConnectorRecord,
  ConnectorSyncJobRecord,
} from "@/lib/control-plane";
import { buildPilotSetupSteps } from "./setup-progress";

const docsConnector: ConnectorRecord = {
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
};

const docsSyncJob: ConnectorSyncJobRecord = {
  id: "sync_01",
  workspace_id: "ws_01",
  connector_id: docsConnector.id,
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
};

describe("buildPilotSetupSteps", () => {
  it("starts with the no-Google knowledge path and marks it complete when seeded docs are indexed", () => {
    const steps = buildPilotSetupSteps({
      workers,
      connections: followUpConnections,
      inputRoutes: followUpRoutes,
      actionCapabilities: followUpActions,
      inboxItems: [],
      workItems: [],
      connectors: [docsConnector],
      syncJobsByConnector: new Map([[docsConnector.id, [docsSyncJob]]]),
    });

    expect(steps.slice(0, 5).map((step) => step.id)).toEqual([
      "connector.local-directory:seeded-knowledge-ready",
      "worker-pack.follow-up:install-follow-up",
      "ingress.forward-email:forward-email-ready",
      "demo.follow-up:run-sample-activity",
      "provider.smtp-relay:smtp-configure",
    ]);
    expect(steps[0]).toMatchObject({
      complete: true,
      href: "/workspace/connectors",
      ctaLabel: "Open Knowledge",
    });
    expect(steps[3]).toMatchObject({
      complete: false,
      href: "/workspace/workers/wkr_followup_01?focus=proof",
      ctaLabel: "Run sample activity",
    });
  });

  it("marks the demo activity step complete once a follow-up worker has real inbox or work state", () => {
    const steps = buildPilotSetupSteps({
      workers,
      connections: followUpConnections,
      inputRoutes: followUpRoutes,
      actionCapabilities: followUpActions,
      inboxItems,
      workItems,
      connectors: [],
      syncJobsByConnector: new Map(),
    });

    expect(
      steps.find((step) => step.id === "demo.follow-up:run-sample-activity"),
    ).toMatchObject({
      complete: true,
      href: "/workspace/workers/wkr_followup_01?focus=proof",
    });
  });
});
