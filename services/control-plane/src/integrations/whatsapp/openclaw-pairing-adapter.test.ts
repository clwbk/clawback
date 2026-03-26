import { describe, expect, it, vi } from "vitest";
import { OpenClawPairingAdapter } from "./openclaw-pairing-adapter.js";
import type { WhatsAppConnectionConfig } from "./types.js";
import type { StoredConnection } from "../../connections/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<WhatsAppConnectionConfig>): WhatsAppConnectionConfig {
  return {
    transportMode: "openclaw_pairing",
    phoneNumberId: "",
    accessToken: "",
    verifyToken: "",
    validatedDisplayName: null,
    pairingStatus: overrides?.pairingStatus ?? "paired",
    pairedIdentityRef: overrides?.pairedIdentityRef ?? "work-identity-ref-123",
    lastProbeAt: overrides?.lastProbeAt ?? null,
    lastProbeError: overrides?.lastProbeError ?? null,
    ...overrides,
  };
}

function makeConnection(configOverrides?: Partial<WhatsAppConnectionConfig>): StoredConnection {
  return {
    id: "conn_1",
    workspaceId: "ws_1",
    provider: "whatsapp",
    accessMode: "write_capable",
    status: "connected",
    label: "WhatsApp",
    capabilities: [],
    attachedWorkerIds: [],
    configJson: makeConfig(configOverrides) as unknown as Record<string, unknown>,
    createdAt: new Date("2026-03-22T00:00:00Z"),
    updatedAt: new Date("2026-03-22T00:00:00Z"),
  };
}

function makeAdapter(connection?: StoredConnection) {
  const mockConnectionService = {
    getStoredById: vi.fn().mockResolvedValue(connection ?? makeConnection()),
    update: vi.fn().mockResolvedValue(connection ?? makeConnection()),
  };
  const mockGatewayService = {
    startWhatsAppLogin: vi.fn().mockResolvedValue({
      qrDataUrl: "data:image/png;base64,qr",
      message: "OpenClaw pairing started.",
      accountId: "ref-123",
    }),
    waitForWhatsAppLogin: vi.fn().mockResolvedValue({
      connected: true,
      message: "OpenClaw pairing finished.",
      accountId: "ref-123",
    }),
    probeWhatsAppAccount: vi.fn().mockResolvedValue({
      account: {
        accountId: "ref-123",
        linked: true,
        connected: true,
        running: true,
        displayName: "Work Pairing",
        lastError: null,
      },
    }),
  };

  const adapter = new OpenClawPairingAdapter({
    connectionService: mockConnectionService as any,
    gatewayService: mockGatewayService as any,
    now: () => new Date("2026-03-22T12:00:00Z"),
  });

  return { adapter, mockConnectionService, mockGatewayService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenClawPairingAdapter", () => {
  describe("validate", () => {
    it("passes when pairing is complete", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "paired", pairedIdentityRef: "ref-123" });
      const result = adapter.validate(config);

      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("fails when transport mode is not openclaw_pairing", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ transportMode: "meta_cloud_api" } as any);
      const result = adapter.validate(config);

      expect(result.ok).toBe(false);
      expect(result.issues[0]!.code).toBe("wrong_transport_mode");
    });

    it("fails when pairing is not completed", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "unpaired" });
      const result = adapter.validate(config);

      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === "pairing_required")).toBe(true);
    });

    it("fails when pairing is in error state", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "error" });
      const result = adapter.validate(config);

      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === "pairing_error")).toBe(true);
    });

    it("warns when paired but no identity ref", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "paired", pairedIdentityRef: null });
      const result = adapter.validate(config);

      // warning does not make ok=false
      expect(result.ok).toBe(true);
      expect(result.issues.some((i) => i.code === "missing_paired_identity_ref")).toBe(true);
    });
  });

  describe("probe", () => {
    it("returns healthy probe when pairing is active", async () => {
      const conn = makeConnection({ pairingStatus: "paired", pairedIdentityRef: "ref-123" });
      const { adapter, mockConnectionService } = makeAdapter(conn);

      const result = await adapter.probe("ws_1", "conn_1");

      expect(result.ok).toBe(true);
      expect(result.summary).toContain("OpenClaw pairing active");
      expect(mockConnectionService.update).toHaveBeenCalledWith("ws_1", "conn_1", expect.objectContaining({
        status: "connected",
      }));
    });

    it("returns unhealthy probe when not paired", async () => {
      const conn = makeConnection({ pairingStatus: "unpaired" });
      const { adapter, mockConnectionService } = makeAdapter(conn);

      const result = await adapter.probe("ws_1", "conn_1");

      expect(result.ok).toBe(false);
      expect(result.summary).toContain("incomplete");
    });

    it("rejects wrong transport mode", async () => {
      const conn = makeConnection();
      conn.configJson = { ...makeConfig(), transportMode: "meta_cloud_api" } as any;
      const { adapter } = makeAdapter(conn);

      await expect(adapter.probe("ws_1", "conn_1")).rejects.toThrow("only for openclaw_pairing");
    });

    it("rejects non-whatsapp connection", async () => {
      const conn = makeConnection();
      conn.provider = "github" as any;
      const { adapter } = makeAdapter(conn);

      await expect(adapter.probe("ws_1", "conn_1")).rejects.toThrow("only supported for WhatsApp");
    });
  });

  describe("status", () => {
    it("returns setup_required when unpaired", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "unpaired" });
      expect(adapter.status(config)).toBe("setup_required");
    });

    it("returns error when pairing is in error state", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "error" });
      expect(adapter.status(config)).toBe("error");
    });

    it("returns configured when paired but not probed", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "paired", lastProbeAt: null });
      expect(adapter.status(config)).toBe("configured");
    });

    it("returns degraded when paired but last probe had error", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({
        pairingStatus: "paired",
        lastProbeAt: "2026-03-22T00:00:00Z",
        lastProbeError: "runtime unreachable",
      });
      expect(adapter.status(config)).toBe("degraded");
    });

    it("returns ready when paired and probe passed", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({
        pairingStatus: "paired",
        lastProbeAt: "2026-03-22T00:00:00Z",
        lastProbeError: null,
      });
      expect(adapter.status(config)).toBe("ready");
    });

    it("returns error for wrong transport mode", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ transportMode: "meta_cloud_api" } as any);
      expect(adapter.status(config)).toBe("error");
    });
  });

  describe("recoveryHints", () => {
    it("suggests completing pairing when setup_required", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "unpaired" });
      const hints = adapter.recoveryHints(config);

      expect(hints.some((h) => h.code === "complete_pairing")).toBe(true);
    });

    it("suggests re-pairing when in error state", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({ pairingStatus: "error" });
      const hints = adapter.recoveryHints(config);

      expect(hints.some((h) => h.code === "repair_pairing")).toBe(true);
    });

    it("suggests checking runtime and approver mapping when degraded", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({
        pairingStatus: "paired",
        lastProbeAt: "2026-03-22T00:00:00Z",
        lastProbeError: "runtime down",
      });
      const hints = adapter.recoveryHints(config);

      expect(hints.some((h) => h.code === "check_openclaw_runtime")).toBe(true);
      expect(hints.some((h) => h.code === "verify_approver_mapping")).toBe(true);
    });

    it("returns no hints when ready", () => {
      const { adapter } = makeAdapter();
      const config = makeConfig({
        pairingStatus: "paired",
        lastProbeAt: "2026-03-22T00:00:00Z",
        lastProbeError: null,
      });
      const hints = adapter.recoveryHints(config);

      expect(hints).toHaveLength(0);
    });
  });
});
