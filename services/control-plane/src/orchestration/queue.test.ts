import { describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";

import { PgBossRunQueue } from "./queue.js";

const makeBoss = () => {
  const boss = {
    send: vi.fn(async () => "job_1"),
  };

  return boss as unknown as PgBoss & {
    send: ReturnType<typeof vi.fn>;
  };
};

describe("PgBossRunQueue", () => {
  it("uses bounded retry expiry for run execution jobs", async () => {
    const boss = makeBoss();
    const queue = new PgBossRunQueue(boss);

    await queue.enqueueRun({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-29T12:00:00.000Z",
    });

    expect(boss.send).toHaveBeenCalledWith(
      "run.execute",
      {
        job_type: "run.execute",
        run_id: "run_1",
        workspace_id: "ws_1",
        attempt: 1,
        queued_at: "2026-03-29T12:00:00.000Z",
      },
      {
        expireInSeconds: 5 * 60,
        retryLimit: 3,
      },
    );
  });

  it("uses a shorter lease for connector sync jobs", async () => {
    const boss = makeBoss();
    const queue = new PgBossRunQueue(boss);

    await queue.enqueueConnectorSync({
      job_type: "connector.sync",
      sync_job_id: "sync_1",
      connector_id: "ctr_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-29T12:00:00.000Z",
    });

    expect(boss.send).toHaveBeenCalledWith(
      "connector.sync",
      {
        job_type: "connector.sync",
        sync_job_id: "sync_1",
        connector_id: "ctr_1",
        workspace_id: "ws_1",
        attempt: 1,
        queued_at: "2026-03-29T12:00:00.000Z",
      },
      {
        expireInSeconds: 10 * 60,
        heartbeatSeconds: 60,
        retryLimit: 3,
      },
    );
  });
});
