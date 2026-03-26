import { describe, expect, it, vi } from "vitest";
import { WhatsAppSetupService } from "./whatsapp-setup-service.js";
import type { StoredConnection } from "../../connections/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConnection(configOverrides?: Record<string, unknown>): StoredConnection {
  return {
    id: "conn_1",
    workspaceId: "ws_1",
    provider: "whatsapp",
    accessMode: "write_capable",
    status: "not_connected",
    label: "WhatsApp",
    capabilities: [],
    attachedWorkerIds: [],
    configJson: configOverrides ?? {},
    createdAt: new Date("2026-03-22T00:00:00Z"),
    updatedAt: new Date("2026-03-22T00:00:00Z"),
  };
}

function makeService(
  connection?: StoredConnection,
  options?: {
    appSecretConfigured?: boolean;
  },
) {
  const conn = connection ?? makeConnection();
  const mockConnectionService = {
    getStoredById: vi.fn().mockResolvedValue(conn),
    update: vi.fn().mockImplementation(async (_ws: string, _id: string, input: any) => {
      // Merge configJson so subsequent reads see the update
      if (input.configJson) {
        conn.configJson = { ...conn.configJson, ...input.configJson };
      }
      if (input.status) {
        conn.status = input.status;
      }
      return conn;
    }),
  };
  const mockPairingAdapter = {
    validate: vi.fn((config: any) => {
      const issues = [];
      if (!config.pairingStatus || config.pairingStatus === "unpaired") {
        issues.push({
          severity: "error",
          code: "pairing_required",
          summary: "OpenClaw pairing has not been completed.",
        });
      }
      if (config.pairingStatus === "error") {
        issues.push({
          severity: "error",
          code: "pairing_error",
          summary: "OpenClaw pairing is in an error state.",
        });
      }
      if (config.pairingStatus === "paired" && !config.pairedIdentityRef) {
        issues.push({
          severity: "warn",
          code: "missing_paired_identity_ref",
          summary: "Pairing status is paired but no identity reference is stored.",
        });
      }
      return { ok: issues.every((issue) => issue.severity !== "error"), issues };
    }),
    status: vi.fn((config: any) => {
      if (!config.pairingStatus || config.pairingStatus === "unpaired") return "setup_required";
      if (config.pairingStatus === "error") return "error";
      if (!config.lastProbeAt) return "configured";
      if (config.lastProbeError) return "degraded";
      return "ready";
    }),
    recoveryHints: vi.fn(() => []),
  };

  const service = new WhatsAppSetupService({
    connectionService: mockConnectionService as any,
    appSecretConfigured: options?.appSecretConfigured ?? true,
    pairingAdapter: mockPairingAdapter as any,
    now: () => new Date("2026-03-22T12:00:00Z"),
  });

  return { service, mockConnectionService, connection: conn, mockPairingAdapter };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WhatsApp transport mode selection", () => {
  it("sets transport mode to openclaw_pairing", async () => {
    const { service, mockConnectionService } = makeService();

    const result = await service.setTransportMode("ws_1", "conn_1", "openclaw_pairing");

    expect(mockConnectionService.update).toHaveBeenCalledWith(
      "ws_1",
      "conn_1",
      expect.objectContaining({
        configJson: expect.objectContaining({
          transportMode: "openclaw_pairing",
          pairingStatus: "unpaired",
          pairedIdentityRef: null,
        }),
      }),
    );

    // Status response should reflect the new mode
    expect(result.connection_id).toBe("conn_1");
  });

  it("sets transport mode to meta_cloud_api", async () => {
    const { service, mockConnectionService } = makeService();

    const result = await service.setTransportMode("ws_1", "conn_1", "meta_cloud_api");

    expect(mockConnectionService.update).toHaveBeenCalledWith(
      "ws_1",
      "conn_1",
      expect.objectContaining({
        configJson: expect.objectContaining({
          transportMode: "meta_cloud_api",
        }),
      }),
    );

    expect(result.connection_id).toBe("conn_1");
  });

  it("resets pairing state when switching to openclaw_pairing", async () => {
    const conn = makeConnection({
      transportMode: "meta_cloud_api",
      phoneNumberId: "12345",
      accessToken: "token",
      verifyToken: "verify",
    });
    const { service, mockConnectionService } = makeService(conn);

    await service.setTransportMode("ws_1", "conn_1", "openclaw_pairing");

    const updateCall = mockConnectionService.update.mock.calls[0]![2];
    expect(updateCall.configJson.pairingStatus).toBe("unpaired");
    expect(updateCall.configJson.pairedIdentityRef).toBeNull();
  });

  it("preserves existing config fields when switching mode", async () => {
    const conn = makeConnection({
      transportMode: "meta_cloud_api",
      phoneNumberId: "12345",
      accessToken: "token",
      verifyToken: "verify",
      lastProbeAt: "2026-03-22T00:00:00Z",
    });
    const { service, mockConnectionService } = makeService(conn);

    await service.setTransportMode("ws_1", "conn_1", "openclaw_pairing");

    const updateCall = mockConnectionService.update.mock.calls[0]![2];
    // Existing meta fields should still be present (not destroyed)
    expect(updateCall.configJson.phoneNumberId).toBe("12345");
    expect(updateCall.configJson.transportMode).toBe("openclaw_pairing");
  });

  it("rejects non-whatsapp connections", async () => {
    const conn = makeConnection();
    conn.provider = "github" as any;
    const { service } = makeService(conn);

    await expect(
      service.setTransportMode("ws_1", "conn_1", "openclaw_pairing"),
    ).rejects.toThrow("Transport mode selection is only supported for WhatsApp connections.");
  });
});

describe("WhatsApp validate with transport modes", () => {
  it("validates openclaw_pairing: fails when unpaired", () => {
    const { service } = makeService();
    const result = service.validate({
      transportMode: "openclaw_pairing",
      phoneNumberId: "",
      accessToken: "",
      verifyToken: "",
      validatedDisplayName: null,
      pairingStatus: "unpaired",
      pairedIdentityRef: null,
      lastProbeAt: null,
      lastProbeError: null,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "pairing_required")).toBe(true);
  });

  it("validates openclaw_pairing: passes when paired", () => {
    const { service } = makeService();
    const result = service.validate({
      transportMode: "openclaw_pairing",
      phoneNumberId: "",
      accessToken: "",
      verifyToken: "",
      validatedDisplayName: null,
      pairingStatus: "paired",
      pairedIdentityRef: "ref-123",
      lastProbeAt: null,
      lastProbeError: null,
    });

    expect(result.ok).toBe(true);
  });

  it("validates meta_cloud_api: fails without credentials", () => {
    const { service } = makeService();
    const result = service.validate({
      transportMode: "meta_cloud_api",
      phoneNumberId: "",
      accessToken: "",
      verifyToken: "",
      validatedDisplayName: null,
      pairingStatus: null,
      pairedIdentityRef: null,
      lastProbeAt: null,
      lastProbeError: null,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "missing_phone_number_id")).toBe(true);
    expect(result.issues.some((i) => i.code === "missing_access_token")).toBe(true);
    expect(result.issues.some((i) => i.code === "missing_verify_token")).toBe(true);
  });

  it("validates meta_cloud_api: fails without app secret", () => {
    const { service } = makeService(undefined, { appSecretConfigured: false });
    const result = service.validate({
      transportMode: "meta_cloud_api",
      phoneNumberId: "12345",
      accessToken: "token",
      verifyToken: "verify",
      validatedDisplayName: null,
      pairingStatus: null,
      pairedIdentityRef: null,
      lastProbeAt: null,
      lastProbeError: null,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "missing_app_secret" }),
    ]));
  });

  it("validates meta_cloud_api: passes with credentials", () => {
    const { service } = makeService();
    const result = service.validate({
      transportMode: "meta_cloud_api",
      phoneNumberId: "12345",
      accessToken: "token",
      verifyToken: "verify",
      validatedDisplayName: null,
      pairingStatus: null,
      pairedIdentityRef: null,
      lastProbeAt: null,
      lastProbeError: null,
    });

    expect(result.ok).toBe(true);
  });
});
