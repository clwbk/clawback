import { OpenClawGatewayClient } from "@clawback/model-adapters";

type GatewayClientLike = {
  request<T = Record<string, unknown>>(method: string, params?: unknown): Promise<T>;
  close(): Promise<void>;
};

type CreateClient = () => GatewayClientLike;

type OpenClawGatewayServiceOptions = {
  createClient?: CreateClient;
};

// ---------------------------------------------------------------------------
// Structured gateway errors
// ---------------------------------------------------------------------------

export type OpenClawGatewayErrorCode =
  | "gateway_unreachable"
  | "channel_not_configured"
  | "session_expired"
  | "gateway_error";

export class OpenClawGatewayError extends Error {
  constructor(
    readonly code: OpenClawGatewayErrorCode,
    message: string,
    readonly statusCode: number = 502,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OpenClawGatewayError";
  }
}

/**
 * Classify an error thrown during gateway communication into a structured
 * `OpenClawGatewayError`. Connection-level failures (ECONNREFUSED, timeouts,
 * etc.) become `gateway_unreachable`. Responses that indicate a missing
 * WhatsApp channel become `channel_not_configured`. Everything else becomes
 * a generic `gateway_error`.
 */
function classifyGatewayError(error: unknown): OpenClawGatewayError {
  if (error instanceof OpenClawGatewayError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Connection-level failures
  if (
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("enotfound") ||
    lowerMessage.includes("etimedout") ||
    lowerMessage.includes("econnreset") ||
    lowerMessage.includes("socket hang up") ||
    lowerMessage.includes("connect timeout") ||
    lowerMessage.includes("websocket") ||
    lowerMessage.includes("connection refused")
  ) {
    return new OpenClawGatewayError(
      "gateway_unreachable",
      "OpenClaw gateway is unreachable. Check that the OpenClaw runtime is running.",
      502,
      error,
    );
  }

  // Channel / account not configured
  if (
    lowerMessage.includes("unknown channel") ||
    lowerMessage.includes("not configured") ||
    lowerMessage.includes("no whatsapp") ||
    lowerMessage.includes("channel not found") ||
    lowerMessage.includes("no account") ||
    lowerMessage.includes("no such account")
  ) {
    return new OpenClawGatewayError(
      "channel_not_configured",
      "OpenClaw WhatsApp channel is not configured. Add a WhatsApp account in the OpenClaw runtime first.",
      502,
      error,
    );
  }

  // Session expired / disconnected
  if (
    lowerMessage.includes("session expired") ||
    lowerMessage.includes("logged out") ||
    lowerMessage.includes("not logged in") ||
    lowerMessage.includes("session closed") ||
    lowerMessage.includes("disconnected")
  ) {
    return new OpenClawGatewayError(
      "session_expired",
      "WhatsApp session has expired. Re-pair to continue.",
      502,
      error,
    );
  }

  return new OpenClawGatewayError(
    "gateway_error",
    `OpenClaw gateway error: ${message}`,
    502,
    error,
  );
}

type ChannelsStatusPayload = {
  channelAccounts?: Record<string, unknown>;
  channelDefaultAccountId?: Record<string, unknown>;
};

export type OpenClawPairingStartResult = {
  qrDataUrl: string | null;
  message: string;
  accountId: string | null;
};

export type OpenClawPairingWaitResult = {
  connected: boolean;
  message: string;
  accountId: string | null;
};

export type OpenClawWhatsAppAccountStatus = {
  accountId: string;
  linked: boolean;
  connected: boolean;
  running: boolean;
  displayName: string | null;
  lastError: string | null;
};

export type OpenClawWhatsAppStatus = {
  defaultAccountId: string | null;
  accounts: OpenClawWhatsAppAccountStatus[];
};

export type OpenClawWhatsAppSendResult = {
  messageId: string;
  toJid: string | null;
};

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toBoolean(value: unknown) {
  return value === true;
}

function parseWhatsAppAccounts(payload: unknown): OpenClawWhatsAppStatus {
  const statusPayload = (payload ?? {}) as ChannelsStatusPayload;
  const rawAccounts = statusPayload.channelAccounts?.["whatsapp"];
  const defaultAccountId = toStringOrNull(statusPayload.channelDefaultAccountId?.["whatsapp"]);

  const accounts: OpenClawWhatsAppAccountStatus[] = [];
  if (Array.isArray(rawAccounts)) {
    for (const entry of rawAccounts) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const account = entry as Record<string, unknown>;
      const accountId = toStringOrNull(account.accountId);
      if (!accountId) {
        continue;
      }

      const probe = account.probe as Record<string, unknown> | undefined;
      accounts.push({
        accountId,
        linked: toBoolean(account.linked),
        connected: toBoolean(account.connected),
        running: toBoolean(account.running),
        displayName:
          toStringOrNull(account.name)
          ?? toStringOrNull(probe?.displayName)
          ?? accountId,
        lastError: toStringOrNull(account.lastError),
      });
    }
  }

  return {
    defaultAccountId,
    accounts,
  };
}

function resolveAccount(status: OpenClawWhatsAppStatus, accountId?: string | null) {
  if (accountId) {
    return status.accounts.find((entry) => entry.accountId === accountId) ?? null;
  }

  if (status.defaultAccountId) {
    return status.accounts.find((entry) => entry.accountId === status.defaultAccountId) ?? null;
  }

  return status.accounts[0] ?? null;
}

export class OpenClawGatewayService {
  private readonly createClient: CreateClient;

  constructor(options: OpenClawGatewayServiceOptions = {}) {
    this.createClient =
      options.createClient
      ?? (() =>
        new OpenClawGatewayClient({
          clientId: "clawback-whatsapp",
          clientMode: "backend",
          clientDisplayName: "Clawback WhatsApp",
        }));
  }

  private async withClient<T>(fn: (client: GatewayClientLike) => Promise<T>) {
    let client: GatewayClientLike;
    try {
      client = this.createClient();
    } catch (error) {
      throw classifyGatewayError(error);
    }
    try {
      return await fn(client);
    } catch (error) {
      throw classifyGatewayError(error);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async getWhatsAppStatus(params?: {
    probe?: boolean;
    timeoutMs?: number;
  }): Promise<OpenClawWhatsAppStatus> {
    const payload = await this.withClient(async (client) =>
      await client.request<ChannelsStatusPayload>("channels.status", {
        probe: params?.probe ?? true,
        timeoutMs: params?.timeoutMs ?? 10_000,
      }),
    );

    const status = parseWhatsAppAccounts(payload);

    // If the gateway responded but has no WhatsApp accounts at all, the
    // channel hasn't been configured yet. Surface this clearly.
    if (status.accounts.length === 0) {
      const raw = (payload ?? {}) as ChannelsStatusPayload;
      const hasWhatsAppKey = raw.channelAccounts && "whatsapp" in raw.channelAccounts;
      if (!hasWhatsAppKey) {
        throw new OpenClawGatewayError(
          "channel_not_configured",
          "OpenClaw WhatsApp channel is not configured. Add a WhatsApp account in the OpenClaw runtime first.",
          502,
        );
      }
    }

    return status;
  }

  async startWhatsAppLogin(params?: {
    accountId?: string | null;
    force?: boolean;
    timeoutMs?: number;
  }): Promise<OpenClawPairingStartResult> {
    const payload = await this.withClient(async (client) =>
      await client.request<Record<string, unknown>>("web.login.start", {
        ...(params?.accountId ? { accountId: params.accountId } : {}),
        ...(typeof params?.force === "boolean" ? { force: params.force } : {}),
        ...(typeof params?.timeoutMs === "number" ? { timeoutMs: params.timeoutMs } : {}),
      }),
    );

    return {
      qrDataUrl: toStringOrNull(payload.qrDataUrl),
      message: toStringOrNull(payload.message) ?? "OpenClaw pairing started.",
      accountId: toStringOrNull(payload.accountId) ?? params?.accountId ?? null,
    };
  }

  async waitForWhatsAppLogin(params?: {
    accountId?: string | null;
    timeoutMs?: number;
  }): Promise<OpenClawPairingWaitResult> {
    const payload = await this.withClient(async (client) =>
      await client.request<Record<string, unknown>>("web.login.wait", {
        ...(params?.accountId ? { accountId: params.accountId } : {}),
        ...(typeof params?.timeoutMs === "number" ? { timeoutMs: params.timeoutMs } : {}),
      }),
    );

    return {
      connected: payload.connected === true,
      message: toStringOrNull(payload.message) ?? "OpenClaw pairing finished.",
      accountId: toStringOrNull(payload.accountId) ?? params?.accountId ?? null,
    };
  }

  async probeWhatsAppAccount(params?: {
    accountId?: string | null;
    timeoutMs?: number;
  }) {
    const status = await this.getWhatsAppStatus({
      probe: true,
      ...(typeof params?.timeoutMs === "number" ? { timeoutMs: params.timeoutMs } : {}),
    });

    return {
      status,
      account: resolveAccount(status, params?.accountId),
    };
  }

  async sendWhatsAppMessage(params: {
    to: string;
    message: string;
    accountId?: string | null;
    idempotencyKey: string;
  }): Promise<OpenClawWhatsAppSendResult> {
    const payload = await this.withClient(async (client) =>
      await client.request<Record<string, unknown>>("send", {
        channel: "whatsapp",
        to: params.to,
        message: params.message,
        idempotencyKey: params.idempotencyKey,
        ...(params.accountId ? { accountId: params.accountId } : {}),
      }),
    );

    return {
      messageId: toStringOrNull(payload.messageId) ?? "",
      toJid: toStringOrNull(payload.toJid),
    };
  }
}
