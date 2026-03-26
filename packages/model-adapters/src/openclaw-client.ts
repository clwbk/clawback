import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

import {
  loadOrCreateDeviceIdentity,
  publicKeyRawBase64UrlFromPem,
  signDevicePayload,
} from "./device-identity.js";

type GatewayRequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

type GatewayConnectRequestParams = {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName: string;
    version: string;
    platform: string;
    deviceFamily: string;
    mode: string;
  };
  role: string;
  scopes: string[];
  caps: string[];
  commands: string[];
  permissions: Record<string, boolean>;
  auth?: {
    token: string;
  };
  locale: string;
  userAgent: string;
  device: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce: string;
  };
};

type GatewayResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    message?: string;
    code?: string;
    retryAfterMs?: number;
  };
};

type GatewayEventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class OpenClawGatewayRequestError extends Error {
  readonly code: string | null;
  readonly retryAfterMs: number | null;

  constructor(params: {
    message: string;
    code?: string | null;
    retryAfterMs?: number | null;
  }) {
    super(params.message);
    this.name = "OpenClawGatewayRequestError";
    this.code = params.code ?? null;
    this.retryAfterMs = params.retryAfterMs ?? null;
  }
}

export type OpenClawGatewayClientOptions = {
  url?: string;
  token?: string;
  stateDir?: string;
  clientId?: string;
  clientMode?: string;
  clientDisplayName?: string;
  clientVersion?: string;
  platform?: string;
  deviceFamily?: string;
  scopes?: string[];
  caps?: string[];
  onEvent?: (event: GatewayEventFrame) => void;
};

const PROTOCOL_VERSION = 3;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
  platform: string;
  deviceFamily: string;
}) {
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token,
    params.nonce,
    params.platform,
    params.deviceFamily,
  ].join("|");
}

export function buildGatewayConnectRequestParams(params: {
  protocolVersion: number;
  token: string;
  clientId: string;
  clientMode: string;
  clientDisplayName: string;
  clientVersion: string;
  platform: string;
  deviceFamily: string;
  scopes: string[];
  caps: string[];
  nonce: string;
  signedAtMs: number;
  identity: {
    deviceId: string;
    publicKeyPem: string;
    privateKeyPem: string;
  };
}): GatewayConnectRequestParams {
  const payload = buildDeviceAuthPayload({
    deviceId: params.identity.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: "operator",
    scopes: params.scopes,
    signedAtMs: params.signedAtMs,
    token: params.token,
    nonce: params.nonce,
    platform: params.platform,
    deviceFamily: params.deviceFamily,
  });

  return {
    minProtocol: params.protocolVersion,
    maxProtocol: params.protocolVersion,
    client: {
      id: params.clientId,
      displayName: params.clientDisplayName,
      version: params.clientVersion,
      platform: params.platform,
      deviceFamily: params.deviceFamily,
      mode: params.clientMode,
    },
    role: "operator",
    scopes: params.scopes,
    caps: params.caps,
    commands: [],
    permissions: {},
    ...(params.token ? { auth: { token: params.token } } : {}),
    locale: "en-US",
    userAgent: `${params.clientId}/${params.clientVersion}`,
    device: {
      id: params.identity.deviceId,
      publicKey: publicKeyRawBase64UrlFromPem(params.identity.publicKeyPem),
      signature: signDevicePayload(params.identity.privateKeyPem, payload),
      signedAt: params.signedAtMs,
      nonce: params.nonce,
    },
  };
}

export class OpenClawGatewayClient {
  private readonly options: Required<
    Pick<
      OpenClawGatewayClientOptions,
      "url" | "token" | "stateDir" | "clientId" | "clientDisplayName" | "clientVersion" | "platform" | "deviceFamily"
    >
  > & {
    clientMode: string;
    scopes: string[];
    caps: string[];
    onEvent: ((event: GatewayEventFrame) => void) | undefined;
  };

  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private nextRequestId = 1;

  constructor(options: OpenClawGatewayClientOptions = {}) {
    const defaultGatewayPort = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
    this.options = {
      url: options.url ?? process.env.OPENCLAW_GATEWAY_URL ?? `ws://127.0.0.1:${defaultGatewayPort}`,
      token: options.token ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "",
      stateDir:
        options.stateDir ??
        process.env.OPENCLAW_STATE_DIR ??
        path.join(repoRoot, ".runtime", "openclaw-client"),
      clientId: options.clientId ?? "gateway-client",
      clientMode: options.clientMode ?? "backend",
      clientDisplayName: options.clientDisplayName ?? "Clawback",
      clientVersion: options.clientVersion ?? "0.1.0",
      platform: options.platform ?? process.platform,
      deviceFamily: options.deviceFamily ?? os.platform(),
      scopes: options.scopes ?? ["operator.read", "operator.write", "operator.admin", "operator.approvals"],
      caps: options.caps ?? ["tool-events"],
      onEvent: options.onEvent,
    };
  }

  async connect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.options.url, {
        maxPayload: 25 * 1024 * 1024,
      });

      this.socket = socket;

      let connectNonce: string | null = null;
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      socket.on("message", (raw) => {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        const frame = JSON.parse(text) as GatewayEventFrame | GatewayResponseFrame;

        if (frame.type === "event" && frame.event === "connect.challenge") {
          connectNonce =
            frame.payload && typeof frame.payload === "object" && "nonce" in frame.payload
              ? String((frame.payload as { nonce?: unknown }).nonce ?? "")
              : "";

          const identity = loadOrCreateDeviceIdentity(
            path.join(this.options.stateDir, `${this.options.clientId}.json`),
          );
          const signedAtMs = Date.now();
          const connectFrame: GatewayRequestFrame = {
            type: "req",
            id: "connect-1",
            method: "connect",
            params: buildGatewayConnectRequestParams({
              protocolVersion: PROTOCOL_VERSION,
              token: this.options.token,
              clientId: this.options.clientId,
              clientMode: this.options.clientMode,
              clientDisplayName: this.options.clientDisplayName,
              clientVersion: this.options.clientVersion,
              platform: this.options.platform,
              deviceFamily: this.options.deviceFamily,
              scopes: this.options.scopes,
              caps: this.options.caps,
              nonce: connectNonce,
              signedAtMs,
              identity,
            }),
          };

          socket.send(JSON.stringify(connectFrame));
          return;
        }

        if (frame.type === "res") {
          if (frame.id === "connect-1") {
            if (frame.ok) {
              finish();
              return;
            }

            finish(
              new OpenClawGatewayRequestError({
                message:
                  frame.error?.message ??
                  `OpenClaw connect failed${frame.error?.code ? ` (${frame.error.code})` : ""}.`,
                code: frame.error?.code ?? null,
                retryAfterMs: frame.error?.retryAfterMs ?? null,
              }),
            );
            return;
          }

          const pending = this.pending.get(frame.id);
          if (!pending) {
            return;
          }

          this.pending.delete(frame.id);
          if (frame.ok) {
            pending.resolve(frame.payload);
            return;
          }

          pending.reject(
            new OpenClawGatewayRequestError({
              message:
                frame.error?.message ??
                `OpenClaw request failed${frame.error?.code ? ` (${frame.error.code})` : ""}.`,
              code: frame.error?.code ?? null,
              retryAfterMs: frame.error?.retryAfterMs ?? null,
            }),
          );
          return;
        }

        if (frame.type === "event") {
          this.options.onEvent?.(frame);
        }
      });

      socket.once("error", (error) => {
        finish(error instanceof Error ? error : new Error(String(error)));
      });

      socket.once("close", (code, reason) => {
        if (!settled) {
          finish(new Error(`OpenClaw socket closed during connect (${code}): ${reason.toString()}`));
          return;
        }

        this.socket = null;
        for (const pending of this.pending.values()) {
          pending.reject(new Error(`OpenClaw socket closed (${code}).`));
        }
        this.pending.clear();
      });
    });
  }

  async request<T = Record<string, unknown>>(method: string, params?: unknown) {
    await this.connect();
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("OpenClaw socket is not connected.");
    }

    const id = `req-${this.nextRequestId++}`;
    const frame: GatewayRequestFrame = {
      type: "req",
      id,
      method,
      params,
    };

    const result = await new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.socket?.send(JSON.stringify(frame));
    });

    return result;
  }

  async close() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.close();
      setTimeout(resolve, 250).unref();
    });
  }
}
