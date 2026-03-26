import type { StoredConnection } from "../../connections/types.js";
import type { WatchedInboxPayload, WatchedInboxResult } from "./types.js";

type GmailWatchHookMessage = {
  id: string;
  from: string;
  subject: string;
  snippet: string | null;
  body: string | null;
  html: string | null;
};

type GmailWatchHookPayload = {
  source: string | null;
  messages: GmailWatchHookMessage[];
};

type WatchedInboxProcessor = {
  processWatchedInboxEvent(payload: WatchedInboxPayload): Promise<WatchedInboxResult>;
};

type GmailWatchHookServiceOptions = {
  watchedInboxService: WatchedInboxProcessor;
};

export class GmailWatchHookService {
  constructor(private readonly options: GmailWatchHookServiceOptions) {}

  async processConnectionHook(
    connection: StoredConnection,
    rawPayload: unknown,
  ): Promise<GmailWatchHookResult> {
    validateConnection(connection);
    const payload = parseGmailWatchHookPayload(rawPayload);

    if (connection.attachedWorkerIds.length === 0) {
      throw new GmailWatchHookProcessingError(
        "no_attached_workers",
        `Gmail connection ${connection.id} has no attached workers.`,
        409,
      );
    }

    const results: GmailWatchHookWorkerResult[] = [];

    for (const message of payload.messages) {
      for (const workerId of connection.attachedWorkerIds) {
        const watchedResult = await this.options.watchedInboxService.processWatchedInboxEvent({
          external_message_id: `${message.id}:${workerId}`,
          worker_id: workerId,
          workspace_id: connection.workspaceId,
          from: message.from,
          subject: message.subject,
          body_text: message.body ?? message.snippet ?? "",
          body_html: message.html,
          thread_summary: message.snippet,
        });

        results.push({
          message_id: message.id,
          worker_id: workerId,
          source_event_id: watchedResult.source_event_id,
          work_item_id: watchedResult.work_item_id,
          inbox_item_id: watchedResult.inbox_item_id,
          activity_event_id: watchedResult.activity_event_id,
          deduplicated: watchedResult.deduplicated,
        });
      }
    }

    return {
      connection_id: connection.id,
      workspace_id: connection.workspaceId,
      processed_messages: payload.messages.length,
      attached_worker_ids: [...connection.attachedWorkerIds],
      created_results: results,
      deduplicated_results: results.filter((result) => result.deduplicated).length,
    };
  }
}

export type GmailWatchHookResult = {
  connection_id: string;
  workspace_id: string;
  processed_messages: number;
  attached_worker_ids: string[];
  created_results: GmailWatchHookWorkerResult[];
  deduplicated_results: number;
};

export type GmailWatchHookWorkerResult = {
  message_id: string;
  worker_id: string;
  source_event_id: string;
  work_item_id: string;
  inbox_item_id: string;
  activity_event_id: string;
  deduplicated: boolean;
};

export class GmailWatchHookProcessingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function parseGmailWatchHookPayload(rawPayload: unknown): GmailWatchHookPayload {
  const payload = isObject(rawPayload) ? rawPayload : {};
  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];

  if (rawMessages.length === 0) {
    throw new GmailWatchHookProcessingError(
      "missing_messages",
      "Gmail watch payload must include at least one message.",
    );
  }

  const messages = rawMessages.map((rawMessage, index) => parseMessage(rawMessage, index));
  const source = typeof payload.source === "string" ? payload.source : null;

  return { source, messages };
}

function parseMessage(rawMessage: unknown, index: number): GmailWatchHookMessage {
  const message = isObject(rawMessage) ? rawMessage : {};
  return {
    id: requireString(message.id, `messages[${index}].id`),
    from: requireString(message.from, `messages[${index}].from`),
    subject: requireString(message.subject, `messages[${index}].subject`),
    snippet: optionalString(message.snippet),
    body: optionalString(message.body),
    html: optionalString(message.html),
  };
}

function validateConnection(connection: StoredConnection) {
  if (connection.provider !== "gmail" || connection.accessMode !== "read_only") {
    throw new GmailWatchHookProcessingError(
      "invalid_connection",
      `Connection ${connection.id} is not a Gmail read-only connection.`,
      400,
    );
  }

  if (connection.status !== "connected") {
    throw new GmailWatchHookProcessingError(
      "connection_not_connected",
      `Connection ${connection.id} is not connected.`,
      409,
    );
  }
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GmailWatchHookProcessingError(
      "missing_required_field",
      `Missing required field: ${label}.`,
    );
  }

  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
