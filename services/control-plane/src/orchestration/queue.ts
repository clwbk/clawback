import { PgBoss } from "pg-boss";

import { connectorSyncJobExecuteSchema, runExecuteJobSchema } from "@clawback/contracts";
import { getDatabaseUrl } from "@clawback/db";
import { CONNECTOR_SYNC_JOB_NAME, RUN_EXECUTE_JOB_NAME } from "@clawback/domain";

import type { RunQueue } from "./types.js";

export class PgBossRunQueue implements RunQueue {
  constructor(private readonly boss: PgBoss) {}

  async enqueueRun(job: typeof runExecuteJobSchema._output) {
    const parsed = runExecuteJobSchema.parse(job);
    await this.boss.send(RUN_EXECUTE_JOB_NAME, parsed, {
      retryLimit: 3,
    });
  }

  async enqueueConnectorSync(job: typeof connectorSyncJobExecuteSchema._output) {
    const parsed = connectorSyncJobExecuteSchema.parse(job);
    await this.boss.send(CONNECTOR_SYNC_JOB_NAME, parsed, {
      expireInSeconds: 60 * 60,
      heartbeatSeconds: 60,
      retryLimit: 3,
    });
  }
}

export async function ensurePgBossQueues(boss: PgBoss) {
  await boss.createQueue(RUN_EXECUTE_JOB_NAME);
  await boss.createQueue(CONNECTOR_SYNC_JOB_NAME);
}

export async function createPgBossQueue() {
  const boss = new PgBoss(getDatabaseUrl());
  await boss.start();
  await ensurePgBossQueues(boss);
  return boss;
}
