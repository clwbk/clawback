import type {
  GmailPilotPollResult,
  GmailPilotPollTrigger,
} from "@clawback/contracts";

import type { ConnectionService } from "../../connections/service.js";
import type { StoredConnection } from "../../connections/types.js";
import {
  fetchGmailProfile,
  getGmailReadOnlyAccessToken,
  GmailPilotSetupError,
  normalizeGmailPilotConfig,
  type GmailPilotConfig,
} from "../../connections/gmail-pilot-setup.js";
import type { InputRouteStore } from "../../input-routes/types.js";
import { GmailWatchHookService } from "./gmail-hook.js";

type GmailPollingServiceOptions = {
  connectionService: ConnectionService;
  inputRouteStore: InputRouteStore;
  gmailWatchHookService: GmailWatchHookService;
  now?: () => Date;
  pollIntervalMs?: number;
  enabled?: boolean;
  fetchImpl?: typeof fetch;
};

type GmailHistoryListResult = {
  latestHistoryId: string | null;
  messageIds: string[];
};

type GmailNormalizedMessage = {
  id: string;
  from: string;
  subject: string;
  snippet: string | null;
  body: string | null;
  html: string | null;
  internalDate: string | null;
  labelIds: string[];
};

export type GmailPollingServiceContract = {
  pollConnection(
    workspaceId: string,
    connectionId: string,
    trigger?: GmailPilotPollTrigger,
  ): Promise<GmailPilotPollResult>;
  pollEligibleConnections(): Promise<GmailPilotPollResult[]>;
  start(): void;
  stop(): Promise<void>;
};

export class GmailPollingService implements GmailPollingServiceContract {
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly enabled: boolean;
  private readonly fetchImpl: typeof fetch;
  private timer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Map<string, Promise<GmailPilotPollResult>>();

  constructor(private readonly options: GmailPollingServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = Number.isFinite(options.pollIntervalMs) && (options.pollIntervalMs ?? 0) > 0
      ? options.pollIntervalMs!
      : 60_000;
    this.enabled = options.enabled ?? process.env.NODE_ENV !== "test";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  start() {
    if (!this.enabled || this.timer) {
      return;
    }

    void this.pollEligibleConnections();
    this.timer = setInterval(() => {
      void this.pollEligibleConnections();
    }, this.pollIntervalMs);
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await Promise.allSettled(this.inFlight.values());
  }

  async pollEligibleConnections(): Promise<GmailPilotPollResult[]> {
    const connections = await this.options.connectionService.listAllStored();
    const results: GmailPilotPollResult[] = [];

    for (const connection of connections) {
      if (!(await this.isEligibleConnection(connection))) {
        continue;
      }

      try {
        results.push(await this.pollStoredConnection(connection, "background"));
      } catch {
        // The poller persists connection-level error state and should keep
        // scanning the rest of the workspace connections.
      }
    }

    return results;
  }

  async pollConnection(
    workspaceId: string,
    connectionId: string,
    trigger: GmailPilotPollTrigger = "manual",
  ): Promise<GmailPilotPollResult> {
    const connection = await this.options.connectionService.getStoredById(workspaceId, connectionId);
    return await this.pollStoredConnection(connection, trigger);
  }

  private async pollStoredConnection(
    connection: StoredConnection,
    trigger: GmailPilotPollTrigger,
  ): Promise<GmailPilotPollResult> {
    const existing = this.inFlight.get(connection.id);
    if (existing) {
      return await existing;
    }

    const promise = this.runPoll(connection, trigger)
      .finally(() => {
        this.inFlight.delete(connection.id);
      });
    this.inFlight.set(connection.id, promise);
    return await promise;
  }

  private async runPoll(
    connection: StoredConnection,
    trigger: GmailPilotPollTrigger,
  ): Promise<GmailPilotPollResult> {
    const polledAt = this.now().toISOString();
    const config = normalizeGmailPilotConfig(connection.configJson);
    const attachedWorkerIds = await this.getEligibleWorkerIds(connection);

    if (connection.provider !== "gmail" || connection.accessMode !== "read_only") {
      throw new GmailPollingError(
        "invalid_connection",
        "Only Gmail read-only connections can be polled for watched inbox ingress.",
        400,
      );
    }

    if (connection.status !== "connected") {
      throw await this.persistAndThrow(connection, config, polledAt, new GmailPollingError(
        "connection_not_connected",
        "Connect Gmail before checking the inbox.",
        409,
      ));
    }

    if (attachedWorkerIds.length === 0) {
      throw await this.persistAndThrow(connection, config, polledAt, new GmailPollingError(
        "no_attached_watched_inbox_workers",
        "Attach Gmail to at least one worker with an active watched inbox route first.",
        409,
      ));
    }

    try {
      const accessToken = await getGmailReadOnlyAccessToken(config, this.fetchImpl);
      const profile = await fetchGmailProfile(accessToken, this.fetchImpl);
      const checkpoint = config.watchCheckpointHistoryId;

      if (!checkpoint || !profile.historyId) {
        const nextConfig = this.withRuntimeUpdate(config, {
          watchStatus: "bootstrapping",
          watchLastCheckedAt: polledAt,
          watchLastSuccessAt: polledAt,
          watchLastError: null,
          watchCheckpointHistoryId: profile.historyId,
        });
        await this.persistRuntimeState(connection, nextConfig);
        return buildPollResult({
          connection,
          trigger,
          attachedWorkerIds,
          config: nextConfig,
          bootstrapped: true,
          processedMessages: 0,
          createdResults: 0,
          deduplicatedResults: 0,
        });
      }

      let history: GmailHistoryListResult;
      try {
        history = await this.listAddedMessageIds(accessToken, checkpoint);
      } catch (error) {
        if (error instanceof GmailHistoryCheckpointExpiredError) {
          const resetConfig = this.withRuntimeUpdate(config, {
            watchStatus: "bootstrapping",
            watchLastCheckedAt: polledAt,
            watchLastSuccessAt: polledAt,
            watchLastError: null,
            watchCheckpointHistoryId: profile.historyId,
          });
          await this.persistRuntimeState(connection, resetConfig);
          return buildPollResult({
            connection,
            trigger,
            attachedWorkerIds,
            config: resetConfig,
            bootstrapped: true,
            processedMessages: 0,
            createdResults: 0,
            deduplicatedResults: 0,
          });
        }
        throw error;
      }

      const messages = await this.fetchMessages(accessToken, history.messageIds);
      const latestMessageAt = latestInternalDate(messages);

      if (messages.length === 0) {
        const nextConfig = this.withRuntimeUpdate(config, {
          watchStatus: "polling",
          watchLastCheckedAt: polledAt,
          watchLastSuccessAt: polledAt,
          watchLastError: null,
          watchCheckpointHistoryId: history.latestHistoryId ?? profile.historyId ?? checkpoint,
        });
        await this.persistRuntimeState(connection, nextConfig);
        return buildPollResult({
          connection,
          trigger,
          attachedWorkerIds,
          config: nextConfig,
          bootstrapped: false,
          processedMessages: 0,
          createdResults: 0,
          deduplicatedResults: 0,
        });
      }

      const hookResult = await this.options.gmailWatchHookService.processConnectionHook(
        {
          ...connection,
          attachedWorkerIds,
        },
        {
          source: "gmail_poller",
          messages: messages.map((message) => ({
            id: message.id,
            from: message.from,
            subject: message.subject,
            snippet: message.snippet,
            body: message.body,
            html: message.html,
          })),
        },
      );

      const nextConfig = this.withRuntimeUpdate(config, {
        watchStatus: "polling",
        watchLastCheckedAt: polledAt,
        watchLastSuccessAt: polledAt,
        watchLastMessageAt: latestMessageAt,
        watchLastError: null,
        watchCheckpointHistoryId: history.latestHistoryId ?? profile.historyId ?? checkpoint,
      });
      await this.persistRuntimeState(connection, nextConfig);

      return buildPollResult({
        connection,
        trigger,
        attachedWorkerIds,
        config: nextConfig,
        bootstrapped: false,
        processedMessages: hookResult.processed_messages,
        createdResults: hookResult.created_results.length,
        deduplicatedResults: hookResult.deduplicated_results,
      });
    } catch (error) {
      throw await this.persistAndThrow(connection, config, polledAt, coercePollingError(error));
    }
  }

  private async isEligibleConnection(connection: StoredConnection) {
    if (connection.provider !== "gmail" || connection.accessMode !== "read_only") {
      return false;
    }
    if (connection.status !== "connected" || connection.attachedWorkerIds.length === 0) {
      return false;
    }
    const workerIds = await this.getEligibleWorkerIds(connection);
    return workerIds.length > 0;
  }

  private async getEligibleWorkerIds(connection: StoredConnection) {
    const routes = await this.options.inputRouteStore.listByWorkspace(connection.workspaceId);
    const activeWatchedWorkerIds = new Set(
      routes
        .filter((route) => route.kind === "watched_inbox" && route.status === "active")
        .map((route) => route.workerId),
    );

    return connection.attachedWorkerIds.filter((workerId) => activeWatchedWorkerIds.has(workerId));
  }

  private withRuntimeUpdate(
    config: GmailPilotConfig,
    runtime: Partial<Pick<
      GmailPilotConfig,
      | "watchStatus"
      | "watchLastCheckedAt"
      | "watchLastSuccessAt"
      | "watchLastMessageAt"
      | "watchLastError"
      | "watchCheckpointHistoryId"
    >>,
  ): GmailPilotConfig {
    return {
      ...config,
      ...runtime,
    };
  }

  private async persistRuntimeState(connection: StoredConnection, config: GmailPilotConfig) {
    await this.options.connectionService.update(connection.workspaceId, connection.id, {
      configJson: config,
    });
  }

  private async persistAndThrow(
    connection: StoredConnection,
    config: GmailPilotConfig,
    polledAt: string,
    error: GmailPollingError,
  ): Promise<GmailPollingError> {
    const nextConfig = this.withRuntimeUpdate(config, {
      watchStatus: "error",
      watchLastCheckedAt: polledAt,
      watchLastError: error.message,
    });
    await this.persistRuntimeState(connection, nextConfig);
    return error;
  }

  private async listAddedMessageIds(accessToken: string, startHistoryId: string): Promise<GmailHistoryListResult> {
    const seen = new Set<string>();
    let pageToken: string | null = null;
    let latestHistoryId: string | null = null;

    do {
      const params = new URLSearchParams({
        startHistoryId,
        maxResults: "100",
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const response = await this.fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/me/history?${params.toString()}`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      const json = (await response.json().catch(() => ({}))) as {
        history?: Array<{
          messagesAdded?: Array<{ message?: { id?: string } }>;
          labelsAdded?: Array<{ labelIds?: string[]; message?: { id?: string } }>;
        }>;
        historyId?: string;
        nextPageToken?: string;
        error?: { message?: string; status?: string };
      };

      if (response.status === 404) {
        throw new GmailHistoryCheckpointExpiredError(
          json.error?.message ?? "Stored Gmail history checkpoint has expired.",
        );
      }

      if (!response.ok) {
        throw new GmailPollingError(
          "gmail_history_failed",
          json.error?.message ?? "Failed to read Gmail history.",
          502,
        );
      }

      for (const history of json.history ?? []) {
        for (const entry of history.messagesAdded ?? []) {
          const messageId = entry.message?.id;
          if (messageId) {
            seen.add(messageId);
          }
        }
        for (const entry of history.labelsAdded ?? []) {
          const messageId = entry.message?.id;
          const labelIds = Array.isArray(entry.labelIds)
            ? entry.labelIds.filter((value): value is string => typeof value === "string")
            : [];
          if (messageId && labelIds.includes("INBOX")) {
            seen.add(messageId);
          }
        }
      }

      latestHistoryId = typeof json.historyId === "string" ? json.historyId : latestHistoryId;
      pageToken = typeof json.nextPageToken === "string" ? json.nextPageToken : null;
    } while (pageToken);

    return {
      latestHistoryId,
      messageIds: [...seen],
    };
  }

  private async fetchMessages(accessToken: string, messageIds: string[]) {
    const messages = await Promise.all(messageIds.map(async (messageId) => {
      const response = await this.fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
        },
      );
      const json = (await response.json().catch(() => ({}))) as GmailMessageResponse;

      if (!response.ok) {
        throw new GmailPollingError(
          "gmail_message_failed",
          json.error?.message ?? `Failed to load Gmail message ${messageId}.`,
          502,
        );
      }

      return normalizeGmailMessage(json);
    }));

    return messages
      .filter((message): message is GmailNormalizedMessage => Boolean(message))
      .filter((message) => {
      const labelIds = message.labelIds ?? [];
      if (labelIds.includes("SENT") || labelIds.includes("DRAFT")) {
        return false;
      }
      return labelIds.includes("INBOX");
      });
  }
}

type GmailMessageResponse = {
  id?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
  error?: { message?: string };
};

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
};

function normalizeGmailMessage(message: GmailMessageResponse): GmailNormalizedMessage | null {
  if (!message.id) {
    return null;
  }

  const headers = new Map<string, string>();
  walkHeaders(message.payload, headers);

  const bodies = extractBodies(message.payload);
  return {
    id: message.id,
    from: headers.get("from") ?? "unknown sender",
    subject: headers.get("subject") ?? "(no subject)",
    snippet: typeof message.snippet === "string" ? message.snippet : null,
    body: bodies.text,
    html: bodies.html,
    internalDate: normalizeInternalDate(message.internalDate),
    labelIds: Array.isArray(message.labelIds) ? message.labelIds.filter((value): value is string => typeof value === "string") : [],
  };
}

function walkHeaders(part: GmailMessagePart | undefined, headers: Map<string, string>) {
  if (!part) {
    return;
  }

  for (const header of part.headers ?? []) {
    if (header.name && header.value && !headers.has(header.name.toLowerCase())) {
      headers.set(header.name.toLowerCase(), header.value);
    }
  }

  for (const child of part.parts ?? []) {
    walkHeaders(child, headers);
  }
}

function extractBodies(part: GmailMessagePart | undefined): { text: string | null; html: string | null } {
  if (!part) {
    return { text: null, html: null };
  }

  const found = {
    text: part.mimeType === "text/plain" ? decodeBody(part.body?.data) : null,
    html: part.mimeType === "text/html" ? decodeBody(part.body?.data) : null,
  };

  for (const child of part.parts ?? []) {
    const childBodies = extractBodies(child);
    if (!found.text && childBodies.text) {
      found.text = childBodies.text;
    }
    if (!found.html && childBodies.html) {
      found.html = childBodies.html;
    }
  }

  return found;
}

function decodeBody(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function normalizeInternalDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function latestInternalDate(messages: GmailNormalizedMessage[]) {
  const timestamps = messages
    .map((message) => message.internalDate)
    .filter((value): value is string => typeof value === "string")
    .sort();
  return timestamps.at(-1) ?? null;
}

function buildPollResult(params: {
  connection: StoredConnection;
  trigger: GmailPilotPollTrigger;
  attachedWorkerIds: string[];
  config: GmailPilotConfig;
  bootstrapped: boolean;
  processedMessages: number;
  createdResults: number;
  deduplicatedResults: number;
}): GmailPilotPollResult {
  return {
    connection_id: params.connection.id,
    workspace_id: params.connection.workspaceId,
    trigger: params.trigger,
    watch_status: params.config.watchStatus ?? "idle",
    bootstrapped: params.bootstrapped,
    processed_messages: params.processedMessages,
    created_results: params.createdResults,
    deduplicated_results: params.deduplicatedResults,
    attached_worker_ids: params.attachedWorkerIds,
    last_checked_at: params.config.watchLastCheckedAt,
    last_success_at: params.config.watchLastSuccessAt,
    last_message_at: params.config.watchLastMessageAt,
    last_error: params.config.watchLastError,
  };
}

function coercePollingError(error: unknown): GmailPollingError {
  if (error instanceof GmailPollingError) {
    return error;
  }
  if (error instanceof GmailPilotSetupError) {
    return new GmailPollingError(error.code, error.message, error.statusCode);
  }
  if (error instanceof Error) {
    return new GmailPollingError("gmail_poll_failed", error.message, 502);
  }
  return new GmailPollingError("gmail_poll_failed", "Failed to check Gmail inbox.", 502);
}

class GmailHistoryCheckpointExpiredError extends Error {}

export class GmailPollingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
