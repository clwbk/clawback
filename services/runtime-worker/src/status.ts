import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RuntimeWorkerHeartbeat = {
  pid: number;
  started_at: string;
  updated_at: string;
  state: "ready" | "stopping";
  signal: string | null;
};

export function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

export function getRuntimeWorkerHeartbeatPath() {
  const statusDir =
    process.env.CLAWBACK_RUNTIME_WORKER_STATUS_DIR ??
    path.join(getRepoRoot(), ".runtime", "runtime-worker");
  return path.join(statusDir, "status.json");
}

export async function writeRuntimeWorkerHeartbeat(params: {
  startedAt: string;
  state: RuntimeWorkerHeartbeat["state"];
  signal: string | null;
}) {
  const heartbeatPath = getRuntimeWorkerHeartbeatPath();
  await fs.mkdir(path.dirname(heartbeatPath), { recursive: true });
  await fs.writeFile(
    heartbeatPath,
    `${JSON.stringify(
      {
        pid: process.pid,
        started_at: params.startedAt,
        updated_at: new Date().toISOString(),
        state: params.state,
        signal: params.signal,
      } satisfies RuntimeWorkerHeartbeat,
      null,
      2,
    )}\n`,
    "utf8",
  );
}

export function validateRuntimeWorkerHeartbeat(
  heartbeat: RuntimeWorkerHeartbeat,
  options: {
    signalProcess?: (pid: number, signal: number) => void;
  } = {},
) {
  if (!Number.isInteger(heartbeat.pid) || heartbeat.pid <= 0) {
    throw new Error("Runtime worker heartbeat is missing a valid pid.");
  }

  if (heartbeat.state !== "ready") {
    throw new Error(`Runtime worker heartbeat is not ready (state=${heartbeat.state}).`);
  }

  const signalProcess = options.signalProcess ?? ((pid: number, signal: number) => process.kill(pid, signal));
  signalProcess(heartbeat.pid, 0);
}

export async function assertRuntimeWorkerHealthy() {
  const raw = await fs.readFile(getRuntimeWorkerHeartbeatPath(), "utf8");
  const heartbeat = JSON.parse(raw) as RuntimeWorkerHeartbeat;
  validateRuntimeWorkerHeartbeat(heartbeat);
}
