import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  OperatorActionsServiceContract,
  RuntimeControlStatus,
  RuntimeRestartResult,
} from "./types.js";

type CommandRunner = (params: { command: string; args: string[]; cwd: string }) => Promise<void>;

type LocalOperatorActionsServiceOptions = {
  enabled?: boolean;
  env?: NodeJS.ProcessEnv;
  repoRoot?: string;
  now?: () => Date;
  runCommand?: CommandRunner;
  restartPollIntervalMs?: number;
  restartTimeoutMs?: number;
};

type RuntimeWorkerHeartbeat = {
  pid: number;
  started_at: string;
  updated_at: string;
  state: "ready" | "stopping";
  signal: string | null;
};

function defaultEnabled(env: NodeJS.ProcessEnv) {
  const override = env.CLAWBACK_LOCAL_OPERATOR_ACTIONS_ENABLED;

  if (override === "1") {
    return true;
  }

  if (override === "0") {
    return false;
  }

  return env.NODE_ENV !== "production";
}

function defaultNow() {
  return new Date();
}

async function defaultRunCommand(params: {
  command: string;
  args: string[];
  cwd: string;
}) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim() || `${params.command} ${params.args.join(" ")} exited with code ${code}.`,
        ),
      );
    });
  });
}

function findRepoRoot(startDir: string) {
  let current = startDir;

  while (true) {
    const candidate = path.join(current, "pnpm-workspace.yaml");
    if (existsSync(candidate)) {
      return current;
    }

    if (path.dirname(current) === current) {
      throw new Error("Could not find the repository root from the current control-plane path.");
    }

    current = path.dirname(current);
  }
}

export class OperatorActionsServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "OperatorActionsServiceError";
  }
}

export class LocalOperatorActionsService implements OperatorActionsServiceContract {
  private readonly env: NodeJS.ProcessEnv;
  private readonly enabled: boolean;
  private readonly now: () => Date;
  private readonly runCommand: CommandRunner;
  private readonly repoRootPromise: Promise<string>;
  private readonly restartPollIntervalMs: number;
  private readonly restartTimeoutMs: number;
  private inFlightRestart: Promise<RuntimeRestartResult> | null = null;
  private inFlightWorkerRestart: Promise<RuntimeRestartResult> | null = null;

  constructor(options: LocalOperatorActionsServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.enabled = options.enabled ?? defaultEnabled(this.env);
    this.now = options.now ?? defaultNow;
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.restartPollIntervalMs = options.restartPollIntervalMs ?? 250;
    this.restartTimeoutMs = options.restartTimeoutMs ?? 10_000;
    this.repoRootPromise = Promise.resolve(
      options.repoRoot ??
        findRepoRoot(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")),
    );
  }

  async getRuntimeControlStatus(): Promise<RuntimeControlStatus> {
    if (!this.enabled) {
      return {
        enabled: false,
        mode: "disabled",
        target: "openclaw",
        label: "Restart OpenClaw",
        reason: "Local operator actions are disabled for this deployment.",
      };
    }

    const repoRoot = await this.repoRootPromise;
    const composeFile = path.join(repoRoot, "infra", "compose", "docker-compose.yml");
    const hostGatewayScript = path.join(repoRoot, "scripts", "run-host-openclaw.sh");
    const hostMode = this.env.CLAWBACK_LOCAL_OPENCLAW_MODE === "host";

    if (hostMode && existsSync(hostGatewayScript)) {
      return {
        enabled: false,
        mode: "disabled",
        target: "openclaw",
        label: "Restart OpenClaw",
        reason: "Host OpenClaw is managed by the local start-local session. Restart it from that terminal.",
      };
    }

    try {
      await fs.access(composeFile);
      return {
        enabled: true,
        mode: "local_compose",
        target: "openclaw",
        label: "Restart OpenClaw",
        reason: null,
      };
    } catch {
      return {
        enabled: false,
        mode: "disabled",
        target: "openclaw",
        label: "Restart OpenClaw",
        reason: "Docker Compose runtime controls are not available in this deployment.",
      };
    }
  }

  async getRuntimeWorkerControlStatus(): Promise<RuntimeControlStatus> {
    if (!this.enabled) {
      return {
        enabled: false,
        mode: "disabled",
        target: "runtime_worker",
        label: "Restart Runtime Worker",
        reason: "Local operator actions are disabled for this deployment.",
      };
    }

    const repoRoot = await this.repoRootPromise;
    const workerEntryPoint = this.getRuntimeWorkerEntryPoint(repoRoot);
    const heartbeatPath = this.getRuntimeWorkerHeartbeatPath(repoRoot);

    if (!existsSync(workerEntryPoint)) {
      return {
        enabled: false,
        mode: "disabled",
        target: "runtime_worker",
        label: "Restart Runtime Worker",
        reason: "The runtime worker source entrypoint is not available in this deployment.",
      };
    }

    const heartbeat = await this.readRuntimeWorkerHeartbeat(heartbeatPath);
    if (!heartbeat) {
      return {
        enabled: false,
        mode: "disabled",
        target: "runtime_worker",
        label: "Restart Runtime Worker",
        reason: "No local runtime worker heartbeat found. Start the worker with pnpm dev first.",
      };
    }

    return {
      enabled: true,
      mode: "local_dev_watch",
      target: "runtime_worker",
      label: "Restart Runtime Worker",
      reason: null,
    };
  }

  async restartOpenClaw(): Promise<RuntimeRestartResult> {
    const status = await this.getRuntimeControlStatus();
    if (!status.enabled) {
      throw new OperatorActionsServiceError(status.reason ?? "Runtime controls are unavailable.", 501);
    }

    if (this.inFlightRestart) {
      return await this.inFlightRestart;
    }

    const requestedAt = this.now().toISOString();
    this.inFlightRestart = this.performRestart(requestedAt).finally(() => {
      this.inFlightRestart = null;
    });
    return await this.inFlightRestart;
  }

  async restartRuntimeWorker(): Promise<RuntimeRestartResult> {
    const status = await this.getRuntimeWorkerControlStatus();
    if (!status.enabled) {
      throw new OperatorActionsServiceError(status.reason ?? "Runtime worker controls are unavailable.", 409);
    }

    if (this.inFlightWorkerRestart) {
      return await this.inFlightWorkerRestart;
    }

    const requestedAt = this.now().toISOString();
    this.inFlightWorkerRestart = this.performRuntimeWorkerRestart(requestedAt).finally(() => {
      this.inFlightWorkerRestart = null;
    });
    return await this.inFlightWorkerRestart;
  }

  private async performRestart(requestedAt: string) {
    const repoRoot = await this.repoRootPromise;
    return await this.performComposeRestart(repoRoot, requestedAt);
  }

  private async performComposeRestart(repoRoot: string, requestedAt: string) {
    const composeFile = path.join(repoRoot, "infra", "compose", "docker-compose.yml");
    const composeEnvFile = path.join(repoRoot, "infra", "compose", ".env");
    const composeEnvExample = path.join(repoRoot, "infra", "compose", ".env.example");

    try {
      await fs.access(composeEnvFile);
    } catch {
      await fs.copyFile(composeEnvExample, composeEnvFile);
    }

    const composeArgs = ["compose", "-f", composeFile, "--env-file", composeEnvFile];

    try {
      await this.runCommand({
        command: "docker",
        args: [...composeArgs, "restart", "openclaw"],
        cwd: repoRoot,
      });
      await this.runCommand({
        command: "docker",
        args: [...composeArgs, "up", "-d", "--wait", "openclaw"],
        cwd: repoRoot,
      });
    } catch (error) {
      throw new OperatorActionsServiceError(
        error instanceof Error ? error.message : "Failed to restart OpenClaw.",
        500,
      );
    }

    return {
      target: "openclaw",
      status: "completed",
      message: "OpenClaw was restarted and reported healthy again.",
      requested_at: requestedAt,
      completed_at: this.now().toISOString(),
    } satisfies RuntimeRestartResult;
  }

  private async performRuntimeWorkerRestart(requestedAt: string) {
    const repoRoot = await this.repoRootPromise;
    const heartbeatPath = this.getRuntimeWorkerHeartbeatPath(repoRoot);
    const workerEntryPoint = this.getRuntimeWorkerEntryPoint(repoRoot);
    const previousHeartbeat = await this.readRuntimeWorkerHeartbeat(heartbeatPath);

    if (!previousHeartbeat) {
      throw new OperatorActionsServiceError(
        "No local runtime worker heartbeat found. Start the worker with pnpm dev first.",
        409,
      );
    }

    const timestamp = this.now();
    await fs.utimes(workerEntryPoint, timestamp, timestamp);

    const deadline = Date.now() + this.restartTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, this.restartPollIntervalMs);
      });

      const heartbeat = await this.readRuntimeWorkerHeartbeat(heartbeatPath);
      if (!heartbeat) {
        continue;
      }

      if (
        heartbeat.started_at !== previousHeartbeat.started_at ||
        heartbeat.pid !== previousHeartbeat.pid
      ) {
        return {
          target: "runtime_worker",
          status: "completed",
          message: "Runtime worker restarted and checked in again.",
          requested_at: requestedAt,
          completed_at: this.now().toISOString(),
        } satisfies RuntimeRestartResult;
      }
    }

    throw new OperatorActionsServiceError(
      "Runtime worker did not report back after the local restart signal.",
      504,
    );
  }

  private getRuntimeWorkerEntryPoint(repoRoot: string) {
    return path.join(repoRoot, "services", "runtime-worker", "src", "index.ts");
  }

  private getRuntimeWorkerHeartbeatPath(repoRoot: string) {
    return path.join(repoRoot, ".runtime", "runtime-worker", "status.json");
  }

  private async readRuntimeWorkerHeartbeat(heartbeatPath: string): Promise<RuntimeWorkerHeartbeat | null> {
    try {
      const raw = await fs.readFile(heartbeatPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<RuntimeWorkerHeartbeat>;
      if (
        typeof parsed.pid === "number" &&
        typeof parsed.started_at === "string" &&
        typeof parsed.updated_at === "string" &&
        (parsed.state === "ready" || parsed.state === "stopping")
      ) {
        return {
          pid: parsed.pid,
          started_at: parsed.started_at,
          updated_at: parsed.updated_at,
          state: parsed.state,
          signal: typeof parsed.signal === "string" ? parsed.signal : null,
        };
      }
    } catch {
      return null;
    }

    return null;
  }
}
