import path from "node:path";

import { PgBoss } from "pg-boss";
import pino from "pino";

import { loadEnvFileIfPresent } from "@clawback/env";
import { connectorSyncJobExecuteSchema, runExecuteJobSchema } from "@clawback/contracts";
import { createDb, createPool, getDatabaseUrl } from "@clawback/db";
import { CONNECTOR_SYNC_JOB_NAME, RUN_EXECUTE_JOB_NAME } from "@clawback/domain";
import { OpenClawRunEngine } from "@clawback/model-adapters";
import { searchRetrievalCorpus, syncLocalDirectoryConnector } from "@clawback/retrieval";

import { ConnectorSyncService, DrizzleConnectorSyncStore } from "./connectors/index.js";
import { DrizzleRunExecutionStore, RunExecutionService } from "./runs/index.js";
import { getRepoRoot, writeRuntimeWorkerHeartbeat } from "./status.js";

const repoRoot = getRepoRoot();
loadEnvFileIfPresent(path.join(repoRoot, ".env.local"));
loadEnvFileIfPresent(path.join(repoRoot, ".env"));
loadEnvFileIfPresent(path.join(repoRoot, "infra", "compose", ".env"));

const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
});

async function ensurePgBossQueues(boss: PgBoss) {
  await boss.createQueue(RUN_EXECUTE_JOB_NAME);
  await boss.createQueue(CONNECTOR_SYNC_JOB_NAME);
}

async function main() {
  const startedAt = new Date().toISOString();
  const pool = createPool();
  const db = createDb(pool);
  const boss = new PgBoss(getDatabaseUrl());
  const runtimeBackend = new OpenClawRunEngine();
  const executionService = new RunExecutionService({
    store: new DrizzleRunExecutionStore(db),
    runtimeBackend,
    searchRetrieval: async ({ workspaceId, actor, connectorScope, query, limit }) =>
      await searchRetrievalCorpus({
        db,
        workspaceId,
        actor,
        connectorScope,
        query,
        ...(typeof limit === "number" ? { limit } : {}),
      }),
  });
  const connectorSyncService = new ConnectorSyncService({
    store: new DrizzleConnectorSyncStore(db),
    syncConnector: async ({ workspaceId, connectorId }) =>
      await syncLocalDirectoryConnector({
        db,
        workspaceId,
        connectorId,
        pathBase: getRepoRoot(),
      }),
  });

  await boss.start();
  await ensurePgBossQueues(boss);
  await writeRuntimeWorkerHeartbeat({
    startedAt,
    state: "ready",
    signal: null,
  });

  logger.info({
    service: "runtime-worker",
    status: "ready",
    runtimeBackend: "openclaw",
    queue: RUN_EXECUTE_JOB_NAME,
  });

  const workerId = await boss.work(RUN_EXECUTE_JOB_NAME, async (jobs) => {
    for (const job of jobs) {
      const payload = runExecuteJobSchema.parse(job.data);
      logger.info({
        service: "runtime-worker",
        status: "claimed",
        runId: payload.run_id,
        attempt: payload.attempt,
      });

      const result = await executionService.execute(payload);
      logger.info({
        service: "runtime-worker",
        status: "processed",
        runId: payload.run_id,
        outcome: result.outcome,
      });
    }
  });

  const connectorWorkerId = await boss.work(CONNECTOR_SYNC_JOB_NAME, async (jobs) => {
    for (const job of jobs) {
      const payload = connectorSyncJobExecuteSchema.parse(job.data);
      logger.info({
        service: "runtime-worker",
        status: "claimed",
        connectorId: payload.connector_id,
        syncJobId: payload.sync_job_id,
        queue: CONNECTOR_SYNC_JOB_NAME,
        attempt: payload.attempt,
      });

      const result = await connectorSyncService.execute(payload);
      logger.info({
        service: "runtime-worker",
        status: "processed",
        connectorId: payload.connector_id,
        syncJobId: payload.sync_job_id,
        queue: CONNECTOR_SYNC_JOB_NAME,
        outcome: result.outcome,
      });
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({
      service: "runtime-worker",
      status: "stopping",
      signal,
    });
    await writeRuntimeWorkerHeartbeat({
      startedAt,
      state: "stopping",
      signal,
    });
    await boss.offWork(RUN_EXECUTE_JOB_NAME, { id: workerId, wait: true });
    await boss.offWork(CONNECTOR_SYNC_JOB_NAME, { id: connectorWorkerId, wait: true });
    await boss.stop();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  logger.error({
    service: "runtime-worker",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
