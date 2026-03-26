import type { StoredConnection } from "../../connections/index.js";
import { normalizeWhatsAppConfig } from "./whatsapp-config.js";
import type { WhatsAppConnectionConfig } from "./types.js";

export type ResolvedWhatsAppConnection = {
  connectionId: string;
  workspaceId: string;
  config: WhatsAppConnectionConfig;
  status: string;
  accessMode: string;
};

function toResolvedConnection(
  connection: StoredConnection,
): ResolvedWhatsAppConnection | null {
  if (connection.provider !== "whatsapp") {
    return null;
  }

  const config = normalizeWhatsAppConfig(connection.configJson);
  return {
    connectionId: connection.id,
    workspaceId: connection.workspaceId,
    config,
    status: connection.status,
    accessMode: connection.accessMode,
  };
}

function isConfiguredForTransport(connection: ResolvedWhatsAppConnection): boolean {
  if (connection.accessMode !== "write_capable") {
    return false;
  }

  if (connection.config.transportMode === "openclaw_pairing") {
    return connection.config.pairingStatus === "paired";
  }

  return Boolean(
    connection.config.phoneNumberId
      && connection.config.accessToken
      && connection.config.verifyToken,
  );
}

function compareConnections(a: ResolvedWhatsAppConnection, b: ResolvedWhatsAppConnection) {
  if (a.status === "connected" && b.status !== "connected") return -1;
  if (a.status !== "connected" && b.status === "connected") return 1;
  return a.connectionId.localeCompare(b.connectionId);
}

export function findWorkspaceWhatsAppConnection(
  connections: StoredConnection[],
  workspaceId: string,
): ResolvedWhatsAppConnection | null {
  return connections
    .filter((connection) => connection.workspaceId === workspaceId)
    .map(toResolvedConnection)
    .filter((connection): connection is ResolvedWhatsAppConnection => Boolean(connection))
    .filter(isConfiguredForTransport)
    .sort(compareConnections)[0] ?? null;
}

export function findWhatsAppConnectionByVerifyToken(
  connections: StoredConnection[],
  verifyToken: string,
): ResolvedWhatsAppConnection | null {
  return connections
    .map(toResolvedConnection)
    .filter((connection): connection is ResolvedWhatsAppConnection => Boolean(connection))
    .find((connection) => connection.config.verifyToken === verifyToken) ?? null;
}

export function findWhatsAppConnectionByPhoneNumberId(
  connections: StoredConnection[],
  phoneNumberId: string,
): ResolvedWhatsAppConnection | null {
  return connections
    .map(toResolvedConnection)
    .filter((connection): connection is ResolvedWhatsAppConnection => Boolean(connection))
    .filter(isConfiguredForTransport)
    .sort(compareConnections)
    .find((connection) => connection.config.phoneNumberId === phoneNumberId) ?? null;
}
