import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OpenClawGatewayClient } from "@clawback/model-adapters";

import type {
  OperatorActionsServiceContract,
  RuntimeControlStatus,
  RuntimeReadinessCheck,
  RuntimeReadinessStatus,
  RuntimeRestartResult,
} from "./types.js";

type CommandRunner = (params: { command: string; args: string[]; cwd: string }) => Promise<void>;
type GatewayClientLike = Pick<OpenClawGatewayClient, "request" | "close">;
type GatewayClientFactory = (options?: ConstructorParameters<typeof OpenClawGatewayClient>[0]) => GatewayClientLike;

type LocalOperatorActionsServiceOptions = {
  enabled?: boolean;
  env?: NodeJS.ProcessEnv;
  repoRoot?: string;
  now?: () => Date;
  runCommand?: CommandRunner;
  restartPollIntervalMs?: number;
  restartTimeoutMs?: number;
  gatewayClientFactory?: GatewayClientFactory;
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

function normalizeSecret(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveProviderEnvVar(provider: string | null) {
  if (!provider) {
    return null;
  }

  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "ollama":
      return "OLLAMA_API_KEY";
    default:
      return null;
  }
}

function parseProviderFromModelRef(modelRef: string | null) {
  if (!modelRef) {
    return null;
  }

  const [provider] = modelRef.split("/", 1);
  return provider?.trim() ? provider.trim() : null;
}

function toObjectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function discoverGatewayPrimaryModel(value: unknown) {
  const root = toObjectRecord(value);
  const candidates = [
    toStringOrNull(toObjectRecord(toObjectRecord(root.mainAgent).model).primary),
    toStringOrNull(toObjectRecord(toObjectRecord(root.main_agent).model).primary),
    toStringOrNull(toObjectRecord(toObjectRecord(root.agent).model).primary),
    toStringOrNull(toObjectRecord(root.model).primary),
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  const rawAgents = toObjectRecord(root.agents).list;
  if (!Array.isArray(rawAgents)) {
    return null;
  }

  const preferredEntry =
    rawAgents.find((entry) => {
      const id = toStringOrNull(toObjectRecord(entry).id);
      return id !== null && !id.startsWith("cb_");
    }) ?? rawAgents[0];

  return toStringOrNull(toObjectRecord(toObjectRecord(preferredEntry).model).primary);
}

function countPublishedAgents(value: unknown) {
  const root = toObjectRecord(value);
  const rawAgents = toObjectRecord(root.agents).list;
  if (!Array.isArray(rawAgents)) {
    return 0;
  }

  return rawAgents.filter((entry) => {
    const id = toStringOrNull(toObjectRecord(entry).id);
    return id !== null && id.startsWith("cb_");
  }).length;
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
  private readonly gatewayClientFactory: GatewayClientFactory;
  private inFlightRestart: Promise<RuntimeRestartResult> | null = null;
  private inFlightWorkerRestart: Promise<RuntimeRestartResult> | null = null;

  constructor(options: LocalOperatorActionsServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.enabled = options.enabled ?? defaultEnabled(this.env);
    this.now = options.now ?? defaultNow;
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.restartPollIntervalMs = options.restartPollIntervalMs ?? 250;
    this.restartTimeoutMs = options.restartTimeoutMs ?? 10_000;
    this.gatewayClientFactory = options.gatewayClientFactory ?? ((clientOptions) => new OpenClawGatewayClient(clientOptions));
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

  async getRuntimeReadinessStatus(): Promise<RuntimeReadinessStatus> {
    const configuredProvider = this.env.OPENCLAW_MODEL_PROVIDER_NAME ?? "openai";
    const configuredProviderEnvVar = resolveProviderEnvVar(configuredProvider);
    const configuredProviderKeyPresent =
      configuredProviderEnvVar !== null && normalizeSecret(this.env[configuredProviderEnvVar]);

    const checks: RuntimeReadinessStatus["checks"] = {
      gateway: {
        ok: false,
        summary: "OpenClaw gateway is not reachable.",
        detail: "The control plane could not read runtime config from OpenClaw.",
      },
      configured_provider_key: {
        ok: configuredProviderEnvVar === null ? true : configuredProviderKeyPresent,
        summary:
          configuredProviderEnvVar === null
            ? `Configured provider ${configuredProvider} does not use a known env-var mapping.`
            : configuredProviderKeyPresent
              ? `${configuredProviderEnvVar} is present for the configured ${configuredProvider} provider.`
              : `${configuredProviderEnvVar} is missing for the configured ${configuredProvider} provider.`,
        detail:
          configuredProviderEnvVar === null
            ? "Clawback cannot verify provider-key presence for this runtime provider automatically."
            : configuredProviderKeyPresent
              ? null
              : `Set ${configuredProviderEnvVar} on the host that runs OpenClaw and restart the stack.`,
      },
      gateway_main_provider_key: null,
    };

    let gatewayMainModel: string | null = null;
    let gatewayMainProvider: string | null = null;
    let gatewayMainProviderEnvVar: string | null = null;
    let gatewayMainProviderKeyPresent: boolean | null = null;
    let publishedAgentCount = 0;

    try {
      const client = this.gatewayClientFactory({
        clientId: "gateway-client",
        clientMode: "backend",
        clientDisplayName: "Clawback Runtime Status",
        caps: ["tool-events"],
      });
      try {
        const config = await client.request<{ value?: unknown }>("config.get", {});
        gatewayMainModel = discoverGatewayPrimaryModel(config?.value);
        gatewayMainProvider = parseProviderFromModelRef(gatewayMainModel);
        gatewayMainProviderEnvVar = resolveProviderEnvVar(gatewayMainProvider);
        gatewayMainProviderKeyPresent =
          gatewayMainProviderEnvVar === null
            ? null
            : normalizeSecret(this.env[gatewayMainProviderEnvVar]);
        publishedAgentCount = countPublishedAgents(config?.value);
      } finally {
        await client.close().catch(() => undefined);
      }

      checks.gateway = {
        ok: true,
        summary: "OpenClaw gateway responded to config.get.",
        detail:
          gatewayMainModel !== null
            ? `Gateway primary model appears to be ${gatewayMainModel}.`
            : "Gateway responded, but no primary model was discovered from the config snapshot.",
      };
    } catch (error) {
      checks.gateway = {
        ok: false,
        summary: "OpenClaw gateway is not reachable.",
        detail: error instanceof Error ? error.message : "config.get failed.",
      };
    }

    if (gatewayMainProvider !== null) {
      checks.gateway_main_provider_key = {
        ok:
          gatewayMainProviderEnvVar === null
            ? true
            : gatewayMainProviderKeyPresent === true,
        summary:
          gatewayMainProviderEnvVar === null
            ? `Gateway primary provider ${gatewayMainProvider} does not use a known env-var mapping.`
            : gatewayMainProviderKeyPresent
              ? `${gatewayMainProviderEnvVar} is present for the gateway primary provider ${gatewayMainProvider}.`
              : `${gatewayMainProviderEnvVar} is missing for the gateway primary provider ${gatewayMainProvider}.`,
        detail:
          gatewayMainProviderEnvVar === null
            ? "Clawback cannot verify provider-key presence for the discovered gateway provider automatically."
            : gatewayMainProviderKeyPresent
              ? null
              : `The gateway looks configured for ${gatewayMainModel ?? gatewayMainProvider}. Add ${gatewayMainProviderEnvVar} on the host or align the runtime model provider.`,
      };
    }

    const blockingChecks = [
      checks.gateway.ok,
      checks.configured_provider_key.ok,
      checks.gateway_main_provider_key?.ok ?? true,
    ];
    const ok = blockingChecks.every(Boolean);
    const providerMismatch =
      gatewayMainProvider !== null && gatewayMainProvider !== configuredProvider;

    return {
      ok,
      status: ok ? (providerMismatch ? "degraded" : "ready") : "blocked",
      configured_provider: configuredProvider,
      configured_provider_env_var: configuredProviderEnvVar,
      configured_provider_key_present: configuredProviderKeyPresent,
      gateway_main_model: gatewayMainModel,
      gateway_main_provider: gatewayMainProvider,
      gateway_main_provider_env_var: gatewayMainProviderEnvVar,
      gateway_main_provider_key_present: gatewayMainProviderKeyPresent,
      published_agent_count: publishedAgentCount,
      checks,
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
