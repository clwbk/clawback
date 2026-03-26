import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildHostRuntimeWorkspacePath,
  buildOpenClawModelRef,
  buildOpenClawRuntimeWorkspacePath,
} from "@clawback/domain";

import { OpenClawGatewayClient, OpenClawGatewayRequestError } from "./openclaw-client.js";
import type {
  RuntimeBackend,
  RuntimeExecutionInput,
  RuntimeExecutionResult,
  RuntimePublicationInput,
  RuntimePublicationResult,
  RuntimeStreamEvent,
} from "./types.js";

type OpenClawConfigGetResult = {
  hash?: string;
  value?: Record<string, unknown>;
};

type OpenClawPatchResult = {
  ok?: boolean;
  restart?: {
    ok?: boolean;
    delayMs?: number;
    reason?: string;
    mode?: string;
    coalesced?: boolean;
    cooldownMsApplied?: number;
  };
};

type OpenClawAgentAccepted = {
  runId: string;
  acceptedAt?: number | string;
};

type OpenClawWaitResult = {
  status?: string;
  startedAt?: number | string;
  endedAt?: number | string;
  error?: string;
};

type OpenClawHistoryResult = {
  messages?: unknown[];
};

type OpenClawAgentEventPayload = {
  runId?: string;
  stream?: string;
  ts?: number;
  data?: Record<string, unknown>;
};

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

type OpenClawAuthProfileStore = {
  version: 1;
  profiles: Record<
    string,
    {
      type: "api_key";
      provider: string;
      keyRef: {
        source: "env";
        provider: "default";
        id: string;
      };
    }
  >;
  order: Record<string, string[]>;
};

function toIsoTimestamp(value: number | string | undefined | null) {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }

  return null;
}

function extractAssistantTextFromHistory(messages: unknown[]) {
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const entry = messages[idx] as Record<string, unknown> | undefined;
    const message = (entry?.message ?? entry) as Record<string, unknown> | undefined;
    if (!message || message.role !== "assistant") {
      continue;
    }

    const content = Array.isArray(message.content) ? message.content : [];
    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const block = part as Record<string, unknown>;
        if (
          (block.type === "text" || block.type === "output_text" || block.type === "input_text") &&
          typeof block.text === "string"
        ) {
          return block.text;
        }
        return "";
      })
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    timer.unref?.();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function toObjectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasMatchingAgentEntry(
  currentEntry:
    | {
        id?: unknown;
        name?: unknown;
        workspace?: unknown;
        model?: { primary?: unknown };
        tools?: { profile?: unknown; allow?: unknown; alsoAllow?: unknown };
      }
    | undefined,
  nextAgentEntry: {
    id: string;
    name: string;
    workspace: string;
    model: { primary: string };
    tools: { profile: string; alsoAllow: string[] };
  },
) {
  return Boolean(
    currentEntry &&
      currentEntry.name === nextAgentEntry.name &&
      currentEntry.workspace === nextAgentEntry.workspace &&
      currentEntry.model?.primary === nextAgentEntry.model.primary &&
      currentEntry.tools?.profile === nextAgentEntry.tools.profile &&
      JSON.stringify(
        Array.isArray(currentEntry.tools?.alsoAllow) ? currentEntry.tools?.alsoAllow : [],
      ) === JSON.stringify(nextAgentEntry.tools.alsoAllow),
  );
}

function renderAgentsMarkdown(input: RuntimePublicationInput) {
  const personaLines = Object.entries(input.persona)
    .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
    .join("\n");
  const toolLines =
    input.toolPolicy.allowedTools.length > 0
      ? input.toolPolicy.allowedTools.map((toolName) => `- ${toolName}`).join("\n")
      : "- no optional Clawback tools enabled";

  return [
    "# Clawback Agent",
    "",
    `Name: ${input.agentName}`,
    `Version: ${input.agentVersionId}`,
    "",
    "## Tool Policy",
    toolLines,
    "",
    "## Persona",
    personaLines || "- {}",
    "",
    "## Instructions",
    input.instructionsMarkdown.trim() || "_No additional instructions._",
    "",
  ].join("\n");
}

function toGatewayAgentTimeoutSeconds(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    return undefined;
  }

  return Math.ceil(timeoutMs / 1000);
}

function resolveRuntimeProviderId(input: RuntimePublicationInput, defaultProvider: string) {
  return input.modelRouting.provider === "openai-compatible" ? defaultProvider : input.modelRouting.provider;
}

function resolveProviderEnvVar(provider: string) {
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

function buildAuthProfileStore(provider: string, envVar: string): OpenClawAuthProfileStore {
  const profileId = `${provider}:default`;
  return {
    version: 1,
    profiles: {
      [profileId]: {
        type: "api_key",
        provider,
        keyRef: {
          source: "env",
          provider: "default",
          id: envVar,
        },
      },
    },
    order: {
      [provider]: [profileId],
    },
  };
}

export type OpenClawRunEngineOptions = {
  gatewayUrl?: string;
  gatewayToken?: string;
  stateDir?: string;
  runtimeWorkspaceRoot?: string;
  hostWorkspaceRoot?: string;
  hostConfigRoot?: string;
  modelProviderName?: string;
  clientFactory?: (options: ConstructorParameters<typeof OpenClawGatewayClient>[0]) => {
    request<T = Record<string, unknown>>(method: string, params?: unknown): Promise<T>;
    close(): Promise<void>;
  };
};

function isLoopbackGatewayUrl(value: string) {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export class OpenClawRunEngine implements RuntimeBackend {
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;
  private readonly stateDir: string;
  private readonly runtimeWorkspaceRoot: string;
  private readonly hostWorkspaceRoot: string;
  private readonly hostConfigRoot: string;
  private readonly modelProviderName: string;
  private readonly clientFactory: NonNullable<OpenClawRunEngineOptions["clientFactory"]>;

  constructor(options: OpenClawRunEngineOptions = {}) {
    const defaultGatewayPort = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
    this.gatewayUrl =
      options.gatewayUrl ?? process.env.OPENCLAW_GATEWAY_URL ?? `ws://127.0.0.1:${defaultGatewayPort}`;
    this.gatewayToken = options.gatewayToken ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
    this.stateDir =
      options.stateDir ?? process.env.OPENCLAW_STATE_DIR ?? path.join(repoRoot, ".runtime", "openclaw-client");
    this.hostWorkspaceRoot =
      options.hostWorkspaceRoot ??
      process.env.OPENCLAW_HOST_WORKSPACE_ROOT ??
      path.join(repoRoot, ".runtime", "openclaw", "workspace", "clawback");
    this.hostConfigRoot =
      options.hostConfigRoot ??
      process.env.OPENCLAW_HOST_CONFIG_ROOT ??
      path.join(repoRoot, ".runtime", "openclaw", "config");
    this.runtimeWorkspaceRoot =
      options.runtimeWorkspaceRoot ??
      process.env.OPENCLAW_RUNTIME_WORKSPACE_ROOT ??
      (isLoopbackGatewayUrl(this.gatewayUrl) ? this.hostWorkspaceRoot : "/home/node/.openclaw/workspace/clawback");
    this.modelProviderName =
      options.modelProviderName ?? process.env.OPENCLAW_MODEL_PROVIDER_NAME ?? "openai";
    this.clientFactory = options.clientFactory ?? ((clientOptions) => new OpenClawGatewayClient(clientOptions));
  }

  async publishAgentVersion(input: RuntimePublicationInput): Promise<RuntimePublicationResult> {
    const hostWorkspacePath = buildHostRuntimeWorkspacePath({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      hostWorkspaceRoot: this.hostWorkspaceRoot,
    });

    await fs.mkdir(hostWorkspacePath, { recursive: true });
    await fs.writeFile(path.join(hostWorkspacePath, "AGENTS.md"), `${renderAgentsMarkdown(input)}\n`, "utf8");

    const runtimeProvider = resolveRuntimeProviderId(input, this.modelProviderName);
    const providerEnvVar = resolveProviderEnvVar(runtimeProvider);
    if (providerEnvVar) {
      const authStorePath = path.join(
        this.hostConfigRoot,
        "agents",
        input.runtimeAgentId.toLowerCase(),
        "agent",
        "auth-profiles.json",
      );
      await fs.mkdir(path.dirname(authStorePath), { recursive: true });
      await fs.writeFile(
        authStorePath,
        `${JSON.stringify(buildAuthProfileStore(runtimeProvider, providerEnvVar), null, 2)}\n`,
        "utf8",
      );
    }

    const runtimeWorkspacePath = buildOpenClawRuntimeWorkspacePath({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      agentVersionId: input.agentVersionId,
      runtimeWorkspaceRoot: this.runtimeWorkspaceRoot,
    });

    const client = this.clientFactory({
      url: this.gatewayUrl,
      token: this.gatewayToken,
      stateDir: path.join(this.stateDir, "control-plane"),
      clientId: "gateway-client",
      clientMode: "backend",
      clientDisplayName: "Clawback Control Plane",
      caps: ["tool-events"],
    });

    try {
      const config = await client.request<OpenClawConfigGetResult>("config.get", {});
      const baseHash = config.hash;
      if (!baseHash) {
        throw new Error("OpenClaw config.get did not return a base hash.");
      }

      const currentConfig = toObjectRecord(config.value);
      const currentAgents = Array.isArray(toObjectRecord(currentConfig.agents).list)
        ? ((toObjectRecord(currentConfig.agents).list as unknown[]) ?? [])
        : [];

      const nextAgentEntry = {
        id: input.runtimeAgentId,
        name: input.agentName,
        workspace: runtimeWorkspacePath,
        model: {
          primary: buildOpenClawModelRef({
            provider: input.modelRouting.provider,
            model: input.modelRouting.model,
            defaultProvider: this.modelProviderName,
          }),
        },
        tools: {
          profile: "minimal",
          alsoAllow: input.toolPolicy.allowedTools,
        },
      };

      let currentEntry = currentAgents.find((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }

        return (entry as { id?: unknown }).id === input.runtimeAgentId;
      }) as
        | {
            id?: unknown;
            name?: unknown;
            workspace?: unknown;
            model?: { primary?: unknown };
            tools?: { profile?: unknown; allow?: unknown };
          }
        | undefined;

      if (!currentEntry) {
        try {
          const hostConfig = JSON.parse(
            await fs.readFile(path.join(this.hostConfigRoot, "openclaw.json"), "utf8"),
          ) as Record<string, unknown>;
          const hostAgents = Array.isArray(toObjectRecord(hostConfig.agents).list)
            ? ((toObjectRecord(hostConfig.agents).list as unknown[]) ?? [])
            : [];
          currentEntry = hostAgents.find((entry) => {
            if (!entry || typeof entry !== "object") {
              return false;
            }

            return (entry as { id?: unknown }).id === input.runtimeAgentId;
          }) as
            | {
                id?: unknown;
                name?: unknown;
                workspace?: unknown;
                model?: { primary?: unknown };
                tools?: { profile?: unknown; allow?: unknown; alsoAllow?: unknown };
              }
            | undefined;
        } catch {
          currentEntry = undefined;
        }
      }

      if (hasMatchingAgentEntry(currentEntry, nextAgentEntry)) {
        return {
          status: "materialized",
          runtimeAgentId: input.runtimeAgentId,
          detail: null,
        };
      }

      const patch = await client.request<OpenClawPatchResult>("config.patch", {
        raw: JSON.stringify({
          agents: {
            list: [nextAgentEntry],
          },
        }),
        baseHash,
        note: `clawback publish ${input.agentVersionId}`,
      });

      const restart = patch.restart;
      const restartRequired = Boolean(restart?.ok);
      const detail = restartRequired
        ? [
            "OpenClaw scheduled a runtime restart for this publish.",
            restart?.coalesced ? "A restart was already pending, so this publish joined the existing cycle." : null,
            typeof restart?.cooldownMsApplied === "number" && restart.cooldownMsApplied > 0
              ? `Restart cooldown added ${Math.ceil(restart.cooldownMsApplied / 1000)}s of delay.`
              : null,
            typeof restart?.delayMs === "number"
              ? `Restart delay: ${Math.ceil(restart.delayMs / 1000)}s.`
              : null,
            "Treat publish as a serialized deployment event and batch admin publishes when possible.",
          ]
            .filter(Boolean)
            .join(" ")
        : null;

      return {
        status: restartRequired ? "restart_required" : "materialized",
        runtimeAgentId: input.runtimeAgentId,
        detail,
      };
    } catch (error) {
      if (error instanceof OpenClawGatewayRequestError && error.code === "UNAVAILABLE") {
        const retryDetail =
          typeof error.retryAfterMs === "number" && error.retryAfterMs > 0
            ? ` Retry after ${Math.ceil(error.retryAfterMs / 1000)}s.`
            : "";

        return {
          status: "failed",
          runtimeAgentId: input.runtimeAgentId,
          detail: `OpenClaw temporarily rejected the publish because control-plane writes are rate-limited.${retryDetail}`,
        };
      }

      return {
        status: "failed",
        runtimeAgentId: input.runtimeAgentId,
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await client.close();
    }
  }

  async executeRun(
    input: RuntimeExecutionInput,
    options?: {
      onAccepted?: (accepted: { runtimeRunId: string; acceptedAt: string | null }) => Promise<void> | void;
      onEvent?: (event: RuntimeStreamEvent) => Promise<void> | void;
    },
  ): Promise<RuntimeExecutionResult> {
    const publication = await this.publishAgentVersion(input.publication);
    if (publication.status === "failed") {
      throw new Error(
        publication.detail ?? `Failed to materialize runtime agent ${input.publication.runtimeAgentId}.`,
      );
    }

    let runtimeRunId = "";
    let acceptedAt: string | null = null;
    let assistantBuffer = "";
    const bufferedEvents: OpenClawAgentEventPayload[] = [];

    const client = this.clientFactory({
      url: this.gatewayUrl,
      token: this.gatewayToken,
      stateDir: path.join(this.stateDir, "runtime-worker"),
      clientId: "gateway-client",
      clientMode: "backend",
      clientDisplayName: "Clawback Runtime Worker",
      caps: ["tool-events"],
      onEvent: (event) => {
        if (event.event !== "agent") {
          return;
        }

        const payload = toObjectRecord(event.payload) as OpenClawAgentEventPayload;
        if (!runtimeRunId) {
          bufferedEvents.push(payload);
          return;
        }

        if (payload.runId !== runtimeRunId) {
          return;
        }

        void this.forwardRuntimeEvent(payload, options?.onEvent, (delta) => {
          assistantBuffer += delta;
        });
      },
    });

    try {
      const accepted = await client.request<OpenClawAgentAccepted>("agent", {
        message: input.messageText,
        agentId: input.runtimeAgentId,
        sessionKey: input.runtimeSessionKey,
        idempotencyKey: input.idempotencyKey,
        timeout: toGatewayAgentTimeoutSeconds(input.timeoutMs),
        deliver: false,
      });

      runtimeRunId = accepted.runId;
      acceptedAt = toIsoTimestamp(accepted.acceptedAt);
      await options?.onAccepted?.({
        runtimeRunId,
        acceptedAt,
      });

      for (const payload of bufferedEvents) {
        if (payload.runId !== runtimeRunId) {
          continue;
        }
        await this.forwardRuntimeEvent(payload, options?.onEvent, (delta) => {
          assistantBuffer += delta;
        });
      }

      const wait = await client.request<OpenClawWaitResult>("agent.wait", {
        runId: runtimeRunId,
        timeoutMs: input.timeoutMs,
      });

      const fallbackAssistantText = assistantBuffer.trim();
      const assistantText =
        wait.status === "ok"
          ? await this.recoverAssistantText({
              runtimeSessionKey: input.runtimeSessionKey,
              fallbackAssistantText,
              timeoutMs: input.timeoutMs,
            })
          : fallbackAssistantText;

      return {
        runtimeRunId,
        acceptedAt,
        completionStatus:
          wait.status === "ok"
            ? "completed"
            : wait.status === "timeout"
              ? "timeout"
              : "failed",
        startedAt: toIsoTimestamp(wait.startedAt),
        endedAt: toIsoTimestamp(wait.endedAt),
        assistantText,
        errorMessage: wait.status === "ok" ? null : wait.error ?? "OpenClaw run failed.",
      };
    } finally {
      await client.close();
    }
  }

  private async recoverAssistantText(params: {
    runtimeSessionKey: string;
    fallbackAssistantText: string;
    timeoutMs?: number;
  }) {
    const historyClient = this.clientFactory({
      url: this.gatewayUrl,
      token: this.gatewayToken,
      stateDir: path.join(this.stateDir, "runtime-worker-history"),
      clientId: "gateway-client",
      clientMode: "backend",
      clientDisplayName: "Clawback Runtime Worker",
      caps: ["tool-events"],
    });

    try {
      const history = await withTimeout(
        historyClient.request<OpenClawHistoryResult>("chat.history", {
          sessionKey: params.runtimeSessionKey,
          limit: 50,
        }),
        Math.min(5_000, Math.max(1_000, Math.floor(params.timeoutMs ?? 5_000))),
        "OpenClaw chat.history",
      );
      const recoveredAssistantText = extractAssistantTextFromHistory(history.messages ?? []);
      return recoveredAssistantText || params.fallbackAssistantText;
    } catch {
      return params.fallbackAssistantText;
    } finally {
      await historyClient.close();
    }
  }

  private async forwardRuntimeEvent(
    payload: OpenClawAgentEventPayload,
    onEvent: ((event: RuntimeStreamEvent) => Promise<void> | void) | undefined,
    onAssistantDelta: (delta: string) => void,
  ) {
    const stream = typeof payload.stream === "string" ? payload.stream : "unknown";
    const data = toObjectRecord(payload.data);
    const phase = typeof data.phase === "string" ? data.phase : null;

    if (stream === "assistant" && typeof data.delta === "string") {
      onAssistantDelta(data.delta);
    }

    await onEvent?.({
      type:
        stream === "assistant" || stream === "lifecycle" || stream === "tool"
          ? stream
          : "unknown",
      phase,
      payload: data,
      occurredAt: toIsoTimestamp(payload.ts) ?? new Date().toISOString(),
    });
  }
}
