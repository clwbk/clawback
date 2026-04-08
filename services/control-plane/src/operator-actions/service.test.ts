import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LocalOperatorActionsService,
  OperatorActionsServiceError,
} from "./service.js";

function createGatewayClientFactory(handler: (method: string, params: unknown) => unknown | Promise<unknown>) {
  return () => ({
    async request<T = Record<string, unknown>>(method: string, params?: unknown) {
      return await handler(method, params) as T;
    },
    async close() {},
  });
}

async function createRepoFixture() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "clawback-operator-actions-"));
  await fs.writeFile(path.join(repoRoot, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n", "utf8");
  await fs.mkdir(path.join(repoRoot, "infra", "compose"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "scripts"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, "services", "runtime-worker", "src"), { recursive: true });
  await fs.mkdir(path.join(repoRoot, ".runtime", "runtime-worker"), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, "infra", "compose", "docker-compose.yml"),
    "services:\n  openclaw:\n    image: openclaw\n",
    "utf8",
  );
  await fs.writeFile(path.join(repoRoot, "infra", "compose", ".env.example"), "OPENCLAW_GATEWAY_PORT=18789\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "scripts", "run-host-openclaw.sh"), "#!/usr/bin/env bash\nexit 0\n", "utf8");
  await fs.writeFile(path.join(repoRoot, "services", "runtime-worker", "src", "index.ts"), "export {};\n", "utf8");
  return repoRoot;
}

async function writeRuntimeWorkerHeartbeat(repoRoot: string, params: {
  pid: number;
  startedAt: string;
  updatedAt?: string;
  state?: "ready" | "stopping";
  signal?: string | null;
}) {
  await fs.writeFile(
    path.join(repoRoot, ".runtime", "runtime-worker", "status.json"),
    `${JSON.stringify(
      {
        pid: params.pid,
        started_at: params.startedAt,
        updated_at: params.updatedAt ?? params.startedAt,
        state: params.state ?? "ready",
        signal: params.signal ?? null,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

describe("LocalOperatorActionsService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports disabled status when local operator actions are off", async () => {
    const service = new LocalOperatorActionsService({
      enabled: false,
      repoRoot: "/tmp/irrelevant",
    });

    await expect(service.getRuntimeControlStatus()).resolves.toEqual({
      enabled: false,
      mode: "disabled",
      target: "openclaw",
      label: "Restart OpenClaw",
      reason: "Local operator actions are disabled for this deployment.",
    });

    await expect(service.restartOpenClaw()).rejects.toMatchObject({
      name: "OperatorActionsServiceError",
      statusCode: 501,
    });
    await expect(service.getRuntimeWorkerControlStatus()).resolves.toEqual({
      enabled: false,
      mode: "disabled",
      target: "runtime_worker",
      label: "Restart Runtime Worker",
      reason: "Local operator actions are disabled for this deployment.",
    });
  });

  it("restarts OpenClaw through docker compose and waits for health", async () => {
    const repoRoot = await createRepoFixture();
    const runCommand = vi.fn(async () => {});

    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      now: () => new Date("2026-03-11T15:00:00.000Z"),
      runCommand,
    });

    await expect(service.getRuntimeControlStatus()).resolves.toEqual({
      enabled: true,
      mode: "local_compose",
      target: "openclaw",
      label: "Restart OpenClaw",
      reason: null,
    });

    await expect(service.restartOpenClaw()).resolves.toEqual({
      target: "openclaw",
      status: "completed",
      message: "OpenClaw was restarted and reported healthy again.",
      requested_at: "2026-03-11T15:00:00.000Z",
      completed_at: "2026-03-11T15:00:00.000Z",
    });

    expect(runCommand).toHaveBeenNthCalledWith(1, {
      command: "docker",
      args: [
        "compose",
        "-f",
        path.join(repoRoot, "infra", "compose", "docker-compose.yml"),
        "--env-file",
        path.join(repoRoot, "infra", "compose", ".env"),
        "restart",
        "openclaw",
      ],
      cwd: repoRoot,
    });
    expect(runCommand).toHaveBeenNthCalledWith(2, {
      command: "docker",
      args: [
        "compose",
        "-f",
        path.join(repoRoot, "infra", "compose", "docker-compose.yml"),
        "--env-file",
        path.join(repoRoot, "infra", "compose", ".env"),
        "up",
        "-d",
        "--wait",
        "openclaw",
      ],
      cwd: repoRoot,
    });
    await expect(fs.readFile(path.join(repoRoot, "infra", "compose", ".env"), "utf8")).resolves.toBe(
      "OPENCLAW_GATEWAY_PORT=18789\n",
    );
  });

  it("disables dashboard restart when local host mode is enabled", async () => {
    const repoRoot = await createRepoFixture();
    const runCommand = vi.fn(async () => {});

    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      env: {
        ...process.env,
        CLAWBACK_LOCAL_OPENCLAW_MODE: "host",
      },
      now: () => new Date("2026-03-11T15:00:00.000Z"),
      runCommand,
    });

    await expect(service.getRuntimeControlStatus()).resolves.toEqual({
      enabled: false,
      mode: "disabled",
      target: "openclaw",
      label: "Restart OpenClaw",
      reason: "Host OpenClaw is managed by the local start-local session. Restart it from that terminal.",
    });

    await expect(service.restartOpenClaw()).rejects.toEqual(
      new OperatorActionsServiceError(
        "Host OpenClaw is managed by the local start-local session. Restart it from that terminal.",
        501,
      ),
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("returns a 500-style error when docker compose restart fails", async () => {
    const repoRoot = await createRepoFixture();
    const runCommand = vi.fn(async () => {
      throw new Error("docker compose restart failed");
    });

    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      runCommand,
    });

    await expect(service.restartOpenClaw()).rejects.toEqual(
      new OperatorActionsServiceError("docker compose restart failed", 500),
    );
  });

  it("restarts the local runtime worker by waiting for a new heartbeat", async () => {
    const repoRoot = await createRepoFixture();
    await writeRuntimeWorkerHeartbeat(repoRoot, {
      pid: 101,
      startedAt: "2026-03-11T15:00:00.000Z",
    });

    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      now: () => new Date("2026-03-11T15:01:00.000Z"),
      restartPollIntervalMs: 10,
      restartTimeoutMs: 500,
    });

    await expect(service.getRuntimeWorkerControlStatus()).resolves.toEqual({
      enabled: true,
      mode: "local_dev_watch",
      target: "runtime_worker",
      label: "Restart Runtime Worker",
      reason: null,
    });

    setTimeout(() => {
      void writeRuntimeWorkerHeartbeat(repoRoot, {
        pid: 202,
        startedAt: "2026-03-11T15:01:01.000Z",
      });
    }, 30);

    await expect(service.restartRuntimeWorker()).resolves.toEqual({
      target: "runtime_worker",
      status: "completed",
      message: "Runtime worker restarted and checked in again.",
      requested_at: "2026-03-11T15:01:00.000Z",
      completed_at: "2026-03-11T15:01:00.000Z",
    });
  });

  it("reports runtime worker restart as unavailable without a heartbeat", async () => {
    const repoRoot = await createRepoFixture();
    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      restartPollIntervalMs: 10,
      restartTimeoutMs: 100,
    });

    await expect(service.getRuntimeWorkerControlStatus()).resolves.toEqual({
      enabled: false,
      mode: "disabled",
      target: "runtime_worker",
      label: "Restart Runtime Worker",
      reason: "No local runtime worker heartbeat found. Start the worker with pnpm dev first.",
    });

    await expect(service.restartRuntimeWorker()).rejects.toEqual(
      new OperatorActionsServiceError(
        "No local runtime worker heartbeat found. Start the worker with pnpm dev first.",
        409,
      ),
    );
  });

  it("reports ready runtime status when gateway and provider keys are aligned", async () => {
    const repoRoot = await createRepoFixture();
    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      env: {
        ...process.env,
        OPENAI_API_KEY: "sk-test",
      },
      gatewayClientFactory: createGatewayClientFactory(async (method) => {
        if (method !== "config.get") {
          throw new Error(`Unexpected method ${method}`);
        }

        return {
          value: {
            mainAgent: {
              model: {
                primary: "openai/gpt-4.1-mini",
              },
            },
            agents: {
              list: [
                {
                  id: "cb_agtv_1",
                  model: {
                    primary: "openai/gpt-4.1-mini",
                  },
                },
              ],
            },
          },
        };
      }),
    });

    await expect(service.getRuntimeReadinessStatus()).resolves.toMatchObject({
      ok: true,
      status: "ready",
      configured_provider: "openai",
      configured_provider_env_var: "OPENAI_API_KEY",
      configured_provider_key_present: true,
      gateway_main_model: "openai/gpt-4.1-mini",
      gateway_main_provider: "openai",
      gateway_main_provider_env_var: "OPENAI_API_KEY",
      gateway_main_provider_key_present: true,
      published_agent_count: 1,
    });
  });

  it("reports blocked runtime status when the gateway expects anthropic without a key", async () => {
    const repoRoot = await createRepoFixture();
    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      env: {
        ...process.env,
        OPENAI_API_KEY: "sk-test",
      },
      gatewayClientFactory: createGatewayClientFactory(async (method) => {
        if (method !== "config.get") {
          throw new Error(`Unexpected method ${method}`);
        }

        return {
          value: {
            mainAgent: {
              model: {
                primary: "anthropic/claude-opus-4-6",
              },
            },
          },
        };
      }),
    });

    await expect(service.getRuntimeReadinessStatus()).resolves.toMatchObject({
      ok: false,
      status: "blocked",
      configured_provider: "openai",
      configured_provider_env_var: "OPENAI_API_KEY",
      configured_provider_key_present: true,
      gateway_main_model: "anthropic/claude-opus-4-6",
      gateway_main_provider: "anthropic",
      gateway_main_provider_env_var: "ANTHROPIC_API_KEY",
      gateway_main_provider_key_present: false,
      checks: {
        gateway: {
          ok: true,
        },
        configured_provider_key: {
          ok: true,
        },
        gateway_main_provider_key: {
          ok: false,
        },
      },
    });
  });

  it("reports ready runtime status when the configured provider and gateway primary model both use openrouter", async () => {
    const repoRoot = await createRepoFixture();
    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      env: {
        ...process.env,
        OPENCLAW_MODEL_PROVIDER_NAME: "openrouter",
        OPENROUTER_API_KEY: "sk-or-test",
      },
      gatewayClientFactory: createGatewayClientFactory(async (method) => {
        if (method !== "config.get") {
          throw new Error(`Unexpected method ${method}`);
        }

        return {
          value: {
            agents: {
              list: [
                {
                  id: "cb_agtv_1",
                  model: {
                    primary: "openrouter/openai/gpt-4.1-mini",
                  },
                },
              ],
            },
          },
        };
      }),
    });

    await expect(service.getRuntimeReadinessStatus()).resolves.toMatchObject({
      ok: true,
      status: "ready",
      configured_provider: "openrouter",
      configured_provider_env_var: "OPENROUTER_API_KEY",
      configured_provider_key_present: true,
      gateway_main_model: "openrouter/openai/gpt-4.1-mini",
      gateway_main_provider: "openrouter",
      gateway_main_provider_env_var: "OPENROUTER_API_KEY",
      gateway_main_provider_key_present: true,
      published_agent_count: 1,
      checks: {
        gateway: {
          ok: true,
        },
        configured_provider_key: {
          ok: true,
        },
        gateway_main_provider_key: {
          ok: true,
        },
      },
    });
  });

  it("reports blocked runtime status when the OpenClaw gateway is unreachable", async () => {
    const repoRoot = await createRepoFixture();
    const service = new LocalOperatorActionsService({
      enabled: true,
      repoRoot,
      env: {
        ...process.env,
      },
      gatewayClientFactory: createGatewayClientFactory(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:18789");
      }),
    });

    await expect(service.getRuntimeReadinessStatus()).resolves.toMatchObject({
      ok: false,
      status: "blocked",
      configured_provider: "openai",
      configured_provider_env_var: "OPENAI_API_KEY",
      configured_provider_key_present: false,
      gateway_main_model: null,
      checks: {
        gateway: {
          ok: false,
        },
        configured_provider_key: {
          ok: false,
        },
        gateway_main_provider_key: null,
      },
    });
  });
});
