import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { OpenClawGatewayRequestError } from "./openclaw-client.js";
import { OpenClawRunEngine } from "./openclaw-run-engine.js";
import type { RuntimePublicationInput } from "./types.js";

type FakeGatewayClient = {
  request<T = Record<string, unknown>>(method: string, params?: unknown): Promise<T>;
  close(): Promise<void>;
};

function createFakeGatewayClient(
  handler: (method: string, params: unknown, onEvent?: ((event: Record<string, unknown>) => void) | undefined) => unknown,
  onEvent?: (event: Record<string, unknown>) => void,
): FakeGatewayClient {
  return {
    async request<T = Record<string, unknown>>(method: string, params?: unknown) {
      return handler(method, params, onEvent) as T;
    },
    async close() {},
  };
}

function createPublicationInput(overrides: Partial<RuntimePublicationInput> = {}): RuntimePublicationInput {
  return {
    workspaceId: "ws_1",
    agentId: "agt_1",
    agentVersionId: "agtv_1",
    agentName: "Support Assistant",
    instructionsMarkdown: "Answer clearly.",
    persona: {},
    modelRouting: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
    },
    toolPolicy: {
      allowedTools: ["ticket_lookup", "draft_ticket", "create_ticket"],
    },
    runtimeAgentId: "cb_agtv_1",
    ...overrides,
  };
}

describe("OpenClawRunEngine", () => {
  const tempDirs: string[] = [];
  const initialCwd = process.cwd();

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.length = 0;
    process.chdir(initialCwd);
  });

  it("returns restart_required when OpenClaw schedules a restart and patches only the target agent entry", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-"));
    tempDirs.push(root);
    const configRoot = path.join(root, "config");

    const engine = new OpenClawRunEngine({
      hostWorkspaceRoot: root,
      hostConfigRoot: configRoot,
      runtimeWorkspaceRoot: "/runtime",
      clientFactory: () =>
        createFakeGatewayClient((method, params) => {
            requests.push({ method, params });
            if (method === "config.get") {
              return {
                hash: "cfg_hash_1",
                value: {
                  agents: {
                    list: [
                      { id: "main", name: "Main", workspace: "/runtime/main", model: { primary: "openai/gpt-4.1-mini" } },
                      {
                        id: "cb_agtv_1",
                        name: "Support Assistant",
                        workspace: "/runtime/stale",
                        model: { primary: "openai/gpt-4.1-mini" },
                      },
                    ],
                  },
                },
              };
            }

            if (method === "config.patch") {
              return {
                ok: true,
                restart: {
                  ok: true,
                  delayMs: 2000,
                  reason: "config.patch",
                  coalesced: false,
                  cooldownMsApplied: 0,
                },
              };
            }

            throw new Error(`Unexpected method ${method}`);
          }),
    });

    const result = await engine.publishAgentVersion(createPublicationInput());

    expect(result.status).toBe("restart_required");
    expect(result.detail).toContain("OpenClaw scheduled a runtime restart");

    const patch = requests.find((entry) => entry.method === "config.patch");
    expect(patch).toBeDefined();
    expect(JSON.parse(String((patch?.params as { raw?: string }).raw))).toEqual({
      agents: {
        list: [
          {
            id: "cb_agtv_1",
            name: "Support Assistant",
            workspace: "/runtime/ws_1/agt_1/agtv_1",
            model: {
              primary: "openai/gpt-4.1-mini",
            },
            tools: {
              profile: "minimal",
              alsoAllow: ["ticket_lookup", "draft_ticket", "create_ticket"],
            },
          },
        ],
      },
    });

    expect(
      JSON.parse(
        await readFile(
          path.join(configRoot, "agents", "cb_agtv_1", "agent", "auth-profiles.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      version: 1,
      profiles: {
        "openai:default": {
          type: "api_key",
          provider: "openai",
          keyRef: {
            source: "env",
            provider: "default",
            id: "OPENAI_API_KEY",
          },
        },
      },
      order: {
        openai: ["openai:default"],
      },
    });
  });

  it("surfaces OpenClaw control-plane rate limiting with retry guidance", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-"));
    tempDirs.push(root);

    const engine = new OpenClawRunEngine({
      hostWorkspaceRoot: root,
      runtimeWorkspaceRoot: "/runtime",
      clientFactory: () =>
        createFakeGatewayClient((method) => {
            if (method === "config.get") {
              return {
                hash: "cfg_hash_1",
                value: {
                  agents: {
                    list: [],
                  },
                },
              };
            }

            throw new OpenClawGatewayRequestError({
              message: "rate limit exceeded",
              code: "UNAVAILABLE",
              retryAfterMs: 31_000,
            });
          }),
    });

    const result = await engine.publishAgentVersion(createPublicationInput());

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("rate-limited");
    expect(result.detail).toContain("31s");
  });

  it("writes OpenRouter auth profile refs when the runtime provider is openrouter", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-openrouter-"));
    tempDirs.push(root);
    const configRoot = path.join(root, "config");

    const engine = new OpenClawRunEngine({
      hostWorkspaceRoot: root,
      hostConfigRoot: configRoot,
      runtimeWorkspaceRoot: "/runtime",
      clientFactory: () =>
        createFakeGatewayClient((method, params) => {
          requests.push({ method, params });
          if (method === "config.get") {
            return {
              hash: "cfg_hash_1",
              value: {
                agents: {
                  list: [],
                },
              },
            };
          }

          if (method === "config.patch") {
            return {
              ok: true,
            };
          }

          throw new Error(`Unexpected method ${method}`);
        }),
    });

    await engine.publishAgentVersion(
      createPublicationInput({
        modelRouting: {
          provider: "openrouter",
          model: "anthropic/claude-sonnet-4-5",
        },
      }),
    );

    expect(
      JSON.parse(
        await readFile(
          path.join(configRoot, "agents", "cb_agtv_1", "agent", "auth-profiles.json"),
          "utf8",
        ),
      ),
    ).toEqual({
      version: 1,
      profiles: {
        "openrouter:default": {
          type: "api_key",
          provider: "openrouter",
          keyRef: {
            source: "env",
            provider: "default",
            id: "OPENROUTER_API_KEY",
          },
        },
      },
      order: {
        openrouter: ["openrouter:default"],
      },
    });
  });

  it("defaults published workspace paths to the host root for loopback gateways", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-"));
    tempDirs.push(root);

    const engine = new OpenClawRunEngine({
      gatewayUrl: "ws://127.0.0.1:18789",
      hostWorkspaceRoot: root,
      clientFactory: () =>
        createFakeGatewayClient((method, params) => {
          requests.push({ method, params });
          if (method === "config.get") {
            return {
              hash: "cfg_hash_1",
              value: {
                agents: {
                  list: [],
                },
              },
            };
          }

          if (method === "config.patch") {
            return {
              ok: true,
            };
          }

          throw new Error(`Unexpected method ${method}`);
        }),
    });

    const result = await engine.publishAgentVersion(createPublicationInput());

    expect(result.status).toBe("materialized");
    const patch = requests.find((entry) => entry.method === "config.patch");
    expect(JSON.parse(String((patch?.params as { raw?: string }).raw))).toEqual({
      agents: {
        list: [
          {
            id: "cb_agtv_1",
            name: "Support Assistant",
            workspace: path.join(root, "ws_1", "agt_1", "agtv_1"),
            model: {
              primary: "openai/gpt-4.1-mini",
            },
            tools: {
              profile: "minimal",
              alsoAllow: ["ticket_lookup", "draft_ticket", "create_ticket"],
            },
          },
        ],
      },
    });
  });

  it("resolves default runtime and state paths from the repo root instead of the process cwd", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-cwd-"));
    tempDirs.push(root);
    process.chdir(root);

    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const repoRoot = path.resolve(packageRoot, "..", "..");

    const engine = new OpenClawRunEngine({
      gatewayUrl: "ws://127.0.0.1:18789",
      clientFactory: () =>
        createFakeGatewayClient((method, params) => {
          requests.push({ method, params });
          if (method === "config.get") {
            return {
              hash: "cfg_hash_1",
              value: {
                agents: {
                  list: [],
                },
              },
            };
          }

          if (method === "config.patch") {
            return {
              ok: true,
            };
          }

          throw new Error(`Unexpected method ${method}`);
        }),
    });

    await engine.publishAgentVersion(createPublicationInput());

    const patch = requests.find((entry) => entry.method === "config.patch");
    expect(JSON.parse(String((patch?.params as { raw?: string }).raw))).toEqual({
      agents: {
        list: [
          {
            id: "cb_agtv_1",
            name: "Support Assistant",
            workspace: path.join(repoRoot, ".runtime", "openclaw", "workspace", "clawback", "ws_1", "agt_1", "agtv_1"),
            model: {
              primary: "openai/gpt-4.1-mini",
            },
            tools: {
              profile: "minimal",
              alsoAllow: ["ticket_lookup", "draft_ticket", "create_ticket"],
            },
          },
        ],
      },
    });
  });

  it("skips config.patch when host openclaw.json already has the matching agent entry", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-hostcfg-"));
    tempDirs.push(root);
    const configRoot = path.join(root, "config");
    await mkdir(path.join(configRoot), { recursive: true });
    await writeFile(
      path.join(configRoot, "openclaw.json"),
      JSON.stringify(
        {
          agents: {
            list: [
              {
                id: "cb_agtv_1",
                name: "Support Assistant",
                workspace: path.join(root, "ws_1", "agt_1", "agtv_1"),
                model: { primary: "openai/gpt-4.1-mini" },
                tools: {
                  profile: "minimal",
                  alsoAllow: ["ticket_lookup", "draft_ticket", "create_ticket"],
                },
              },
            ],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const engine = new OpenClawRunEngine({
      gatewayUrl: "ws://127.0.0.1:18789",
      hostWorkspaceRoot: root,
      hostConfigRoot: configRoot,
      clientFactory: () =>
        createFakeGatewayClient((method, params) => {
          requests.push({ method, params });
          if (method === "config.get") {
            return {
              hash: "cfg_hash_1",
              value: {
                agents: {
                  list: [],
                },
              },
            };
          }

          throw new Error(`Unexpected method ${method}`);
        }),
    });

    const result = await engine.publishAgentVersion(createPublicationInput());

    expect(result.status).toBe("materialized");
    expect(requests.map((entry) => entry.method)).toEqual(["config.get"]);
  });

  it("uses gateway-compatible backend client identity for publication and execution", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-"));
    tempDirs.push(root);
    const capturedOptions: Array<Record<string, unknown>> = [];
    const requests: Array<{ method: string; params: unknown }> = [];

    const engine = new OpenClawRunEngine({
      hostWorkspaceRoot: root,
      runtimeWorkspaceRoot: "/runtime",
      stateDir: "/tmp/clawback-openclaw-client",
      clientFactory: (options) => {
        capturedOptions.push({ ...(options as Record<string, unknown>) });
        return createFakeGatewayClient((method, params) => {
          requests.push({ method, params });
          if (method === "config.get") {
            return {
              hash: "cfg_hash_1",
              value: {
                agents: {
                  list: [
                    {
                      id: "cb_agtv_1",
                      name: "Support Assistant",
                      workspace: "/runtime/ws_1/agt_1/agtv_1",
                      model: { primary: "openai/gpt-4.1-mini" },
                      tools: {
                        profile: "minimal",
                        alsoAllow: ["ticket_lookup", "draft_ticket", "create_ticket"],
                      },
                    },
                  ],
                },
              },
            };
          }

          if (method === "agent") {
            return {
              runId: "rt_1",
              acceptedAt: Date.parse("2026-03-10T12:00:01Z"),
            };
          }

          if (method === "agent.wait") {
            return {
              status: "ok",
              startedAt: Date.parse("2026-03-10T12:00:02Z"),
              endedAt: Date.parse("2026-03-10T12:00:04Z"),
            };
          }

          if (method === "chat.history") {
            return {
              messages: [],
            };
          }

          throw new Error(`Unexpected method ${method}`);
        }, options?.onEvent as ((event: Record<string, unknown>) => void) | undefined);
      },
    });

    await engine.executeRun({
      runId: "run_1",
      conversationId: "cnv_1",
      runtimeAgentId: "cb_agtv_1",
      runtimeSessionKey: "agent:cb_agtv_1:conversation:cnv_1",
      messageText: "hello",
      idempotencyKey: "run_1:1",
      timeoutMs: 30_000,
      publication: createPublicationInput(),
    });

    expect(capturedOptions).toHaveLength(3);
    expect(capturedOptions[0]).toMatchObject({
      clientId: "gateway-client",
      clientMode: "backend",
      clientDisplayName: "Clawback Control Plane",
      caps: ["tool-events"],
      stateDir: "/tmp/clawback-openclaw-client/control-plane",
    });
    expect(capturedOptions[1]).toMatchObject({
      clientId: "gateway-client",
      clientMode: "backend",
      clientDisplayName: "Clawback Runtime Worker",
      caps: ["tool-events"],
      stateDir: "/tmp/clawback-openclaw-client/runtime-worker",
    });
    expect(capturedOptions[2]).toMatchObject({
      clientId: "gateway-client",
      clientMode: "backend",
      clientDisplayName: "Clawback Runtime Worker",
      caps: ["tool-events"],
      stateDir: "/tmp/clawback-openclaw-client/runtime-worker-history",
    });
    expect(requests.find((entry) => entry.method === "agent")?.params).toMatchObject({
      message: "hello",
      agentId: "cb_agtv_1",
      sessionKey: "agent:cb_agtv_1:conversation:cnv_1",
      idempotencyKey: "run_1:1",
      timeout: 30,
      deliver: false,
    });
  });

  it("falls back to streamed assistant text when chat history recovery fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-history-fallback-"));
    tempDirs.push(root);
    let clientCount = 0;

    const engine = new OpenClawRunEngine({
      hostWorkspaceRoot: root,
      runtimeWorkspaceRoot: "/runtime",
      clientFactory: (options) => {
        clientCount += 1;
        return createFakeGatewayClient((method, _params, onEvent) => {
          if (method === "config.get") {
            return {
              hash: "cfg_hash_1",
              value: {
                agents: {
                  list: [
                    {
                      id: "cb_agtv_1",
                      name: "Support Assistant",
                      workspace: "/runtime/ws_1/agt_1/agtv_1",
                      model: { primary: "openai/gpt-4.1-mini" },
                      tools: {
                        profile: "minimal",
                        alsoAllow: ["ticket_lookup", "draft_ticket", "create_ticket"],
                      },
                    },
                  ],
                },
              },
            };
          }

          if (method === "agent") {
            onEvent?.({
              event: "agent",
              payload: {
                runId: "rt_1",
                stream: "assistant",
                ts: Date.parse("2026-03-10T12:00:03Z"),
                data: { delta: "partial but useful answer" },
              },
            });
            return {
              runId: "rt_1",
              acceptedAt: Date.parse("2026-03-10T12:00:01Z"),
            };
          }

          if (method === "agent.wait") {
            return {
              status: "ok",
              startedAt: Date.parse("2026-03-10T12:00:02Z"),
              endedAt: Date.parse("2026-03-10T12:00:04Z"),
            };
          }

          if (method === "chat.history") {
            throw new Error("history unavailable");
          }

          throw new Error(`Unexpected method ${method}`);
        }, options?.onEvent as ((event: Record<string, unknown>) => void) | undefined);
      },
    });

    const result = await engine.executeRun({
      runId: "run_1",
      conversationId: "cnv_1",
      runtimeAgentId: "cb_agtv_1",
      runtimeSessionKey: "agent:cb_agtv_1:conversation:cnv_1",
      messageText: "hello",
      idempotencyKey: "run_1:1",
      timeoutMs: 30_000,
      publication: createPublicationInput(),
    });

    expect(clientCount).toBe(3);
    expect(result.completionStatus).toBe("completed");
    expect(result.assistantText).toBe("partial but useful answer");
  });

  it("prefers reconciled runtime history when the buffered assistant text is partial", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clawback-model-adapter-"));
    tempDirs.push(root);

    const engine = new OpenClawRunEngine({
      hostWorkspaceRoot: root,
      runtimeWorkspaceRoot: "/runtime",
      clientFactory: (options) => {
        return createFakeGatewayClient((method, params, onEvent) => {
            if (method === "config.get") {
              return {
                hash: "cfg_hash_1",
                value: {
                  agents: {
                    list: [
                      {
                        id: "cb_agtv_1",
                        name: "Support Assistant",
                        workspace: "/runtime/ws_1/agt_1/agtv_1",
                        model: { primary: "openai/gpt-4.1-mini" },
                        tools: {
                          profile: "minimal",
                          alsoAllow: ["ticket_lookup", "draft_ticket", "create_ticket"],
                        },
                      },
                    ],
                  },
                },
              };
            }

            if (method === "agent") {
              onEvent?.({
                type: "event",
                event: "agent",
                payload: {
                  runId: "rt_1",
                  stream: "assistant",
                  ts: Date.parse("2026-03-10T12:00:02Z"),
                  data: {
                    delta: "partial",
                  },
                },
              });

              return {
                runId: "rt_1",
                acceptedAt: Date.parse("2026-03-10T12:00:01Z"),
              };
            }

            if (method === "agent.wait") {
              return {
                status: "ok",
                startedAt: Date.parse("2026-03-10T12:00:02Z"),
                endedAt: Date.parse("2026-03-10T12:00:04Z"),
              };
            }

            if (method === "chat.history") {
              expect(params).toMatchObject({
                sessionKey: "agent:cb_agtv_1:conversation:cnv_1",
              });

              return {
                messages: [
                  {
                    message: {
                      role: "assistant",
                      content: [
                        {
                          type: "output_text",
                          text: "partial but complete answer",
                        },
                      ],
                    },
                  },
                ],
              };
            }

            throw new Error(`Unexpected method ${method}`);
          }, options?.onEvent as ((event: Record<string, unknown>) => void) | undefined);
      },
    });

    const result = await engine.executeRun({
      runId: "run_1",
      conversationId: "cnv_1",
      runtimeAgentId: "cb_agtv_1",
      runtimeSessionKey: "agent:cb_agtv_1:conversation:cnv_1",
      messageText: "hello",
      idempotencyKey: "run_1:1",
      timeoutMs: 30_000,
      publication: createPublicationInput(),
    });

    expect(result.completionStatus).toBe("completed");
    expect(result.assistantText).toBe("partial but complete answer");
  });
});
