import { describe, expect, it } from "vitest";

import type { StoredConnection } from "../../connections/index.js";
import {
  findWhatsAppConnectionByPhoneNumberId,
  findWhatsAppConnectionByVerifyToken,
  findWorkspaceWhatsAppConnection,
} from "./runtime-config.js";

function makeConnection(overrides?: Partial<StoredConnection>): StoredConnection {
  return {
    id: overrides?.id ?? "conn_1",
    workspaceId: overrides?.workspaceId ?? "ws_1",
    provider: overrides?.provider ?? "whatsapp",
    accessMode: overrides?.accessMode ?? "write_capable",
    status: overrides?.status ?? "connected",
    label: overrides?.label ?? "WhatsApp",
    capabilities: overrides?.capabilities ?? [],
    attachedWorkerIds: overrides?.attachedWorkerIds ?? [],
    configJson: overrides?.configJson ?? {
      phoneNumberId: "12345",
      accessToken: "token",
      verifyToken: "verify-token",
    },
    createdAt: overrides?.createdAt ?? new Date("2026-03-22T00:00:00Z"),
    updatedAt: overrides?.updatedAt ?? new Date("2026-03-22T00:00:00Z"),
  };
}

describe("whatsapp runtime config lookup", () => {
  it("finds a configured WhatsApp connection for the workspace", () => {
    const result = findWorkspaceWhatsAppConnection([
      makeConnection({ workspaceId: "ws_1" }),
      makeConnection({ id: "conn_2", workspaceId: "ws_2" }),
    ], "ws_1");

    expect(result?.workspaceId).toBe("ws_1");
    expect(result?.config.phoneNumberId).toBe("12345");
  });

  it("prefers connected WhatsApp connections when multiple are present", () => {
    const result = findWorkspaceWhatsAppConnection([
      makeConnection({
        id: "conn_error",
        status: "error",
        configJson: { phoneNumberId: "111", accessToken: "token", verifyToken: "verify" },
      }),
      makeConnection({
        id: "conn_connected",
        status: "connected",
        configJson: { phoneNumberId: "222", accessToken: "token", verifyToken: "verify" },
      }),
    ], "ws_1");

    expect(result?.connectionId).toBe("conn_connected");
    expect(result?.config.phoneNumberId).toBe("222");
  });

  it("finds a connection by verify token", () => {
    const result = findWhatsAppConnectionByVerifyToken([
      makeConnection({ configJson: { phoneNumberId: "123", accessToken: "token", verifyToken: "alpha" } }),
    ], "alpha");

    expect(result?.config.verifyToken).toBe("alpha");
  });

  it("finds a connection by phone number id", () => {
    const result = findWhatsAppConnectionByPhoneNumberId([
      makeConnection({ configJson: { phoneNumberId: "phone-123", accessToken: "token", verifyToken: "verify" } }),
    ], "phone-123");

    expect(result?.config.phoneNumberId).toBe("phone-123");
  });

  it("accepts a paired openclaw connection as transport-ready", () => {
    const result = findWorkspaceWhatsAppConnection([
      makeConnection({
        configJson: {
          transportMode: "openclaw_pairing",
          pairingStatus: "paired",
          pairedIdentityRef: "whatsapp-main",
        },
      }),
    ], "ws_1");

    expect(result?.config.transportMode).toBe("openclaw_pairing");
    expect(result?.config.pairedIdentityRef).toBe("whatsapp-main");
  });
});
