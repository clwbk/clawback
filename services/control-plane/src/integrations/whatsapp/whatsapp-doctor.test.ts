import { describe, expect, it } from "vitest";
import { runWhatsAppDoctorChecks } from "./whatsapp-doctor.js";
import type { WhatsAppConnectionConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<WhatsAppConnectionConfig>): WhatsAppConnectionConfig {
  return {
    transportMode: "meta_cloud_api",
    phoneNumberId: "12345",
    accessToken: "token-abc",
    verifyToken: "verify-xyz",
    validatedDisplayName: "Test Business",
    pairingStatus: null,
    pairedIdentityRef: null,
    lastProbeAt: "2026-03-22T00:00:00Z",
    lastProbeError: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WhatsApp doctor checks", () => {
  describe("transport mode selection", () => {
    it("reports healthy when meta_cloud_api is selected with valid config", () => {
      const report = runWhatsAppDoctorChecks(makeConfig());

      expect(report.healthy).toBe(true);
      expect(report.transportMode).toBe("meta_cloud_api");
      expect(report.checks.find((c) => c.check === "transport_mode_selected")?.ok).toBe(true);
    });

    it("defaults to meta_cloud_api when no transport mode is explicitly set", () => {
      // normalizeWhatsAppConfig defaults empty config to meta_cloud_api
      // This means the doctor will run meta checks, and they will fail
      // because no credentials are present
      const report = runWhatsAppDoctorChecks({});

      expect(report.healthy).toBe(false);
      expect(report.transportMode).toBe("meta_cloud_api");
      expect(report.checks.find((c) => c.check === "transport_mode_selected")?.ok).toBe(true);
      // Meta checks should fail due to missing credentials
      expect(report.checks.find((c) => c.check === "meta_phone_number_id")?.ok).toBe(false);
    });
  });

  describe("openclaw_pairing checks", () => {
    it("reports healthy when paired with successful probe", () => {
      const report = runWhatsAppDoctorChecks(makeConfig({
        transportMode: "openclaw_pairing",
        pairingStatus: "paired",
        pairedIdentityRef: "ref-123",
        lastProbeAt: "2026-03-22T12:00:00Z",
        lastProbeError: null,
      }));

      expect(report.healthy).toBe(true);
      expect(report.transportMode).toBe("openclaw_pairing");
    });

    it("reports unhealthy when unpaired", () => {
      const report = runWhatsAppDoctorChecks(makeConfig({
        transportMode: "openclaw_pairing",
        pairingStatus: "unpaired",
      }));

      expect(report.healthy).toBe(false);
      expect(report.checks.find((c) => c.check === "openclaw_pairing_status")?.ok).toBe(false);
    });

    it("reports unhealthy when pairing is in error state", () => {
      const report = runWhatsAppDoctorChecks(makeConfig({
        transportMode: "openclaw_pairing",
        pairingStatus: "error",
      }));

      expect(report.healthy).toBe(false);
      expect(report.checks.find((c) => c.check === "openclaw_pairing_status")?.ok).toBe(false);
    });

    it("reports warning when last probe had error", () => {
      const report = runWhatsAppDoctorChecks(makeConfig({
        transportMode: "openclaw_pairing",
        pairingStatus: "paired",
        pairedIdentityRef: "ref-123",
        lastProbeAt: "2026-03-22T12:00:00Z",
        lastProbeError: "runtime unreachable",
      }));

      const probeCheck = report.checks.find((c) => c.check === "openclaw_last_probe");
      expect(probeCheck?.ok).toBe(false);
      expect(probeCheck?.severity).toBe("warn");
    });
  });

  describe("meta_cloud_api checks", () => {
    it("reports unhealthy when phone number id is missing", () => {
      const report = runWhatsAppDoctorChecks(makeConfig({
        phoneNumberId: "",
      }));

      expect(report.healthy).toBe(false);
      expect(report.checks.find((c) => c.check === "meta_phone_number_id")?.ok).toBe(false);
    });

    it("reports unhealthy when access token is missing", () => {
      const report = runWhatsAppDoctorChecks(makeConfig({
        accessToken: "",
      }));

      expect(report.healthy).toBe(false);
      expect(report.checks.find((c) => c.check === "meta_access_token")?.ok).toBe(false);
    });

    it("reports unhealthy when verify token is missing", () => {
      const report = runWhatsAppDoctorChecks(makeConfig({
        verifyToken: "",
      }));

      expect(report.healthy).toBe(false);
      expect(report.checks.find((c) => c.check === "meta_verify_token")?.ok).toBe(false);
    });

    it("reports warning when last probe had error", () => {
      const report = runWhatsAppDoctorChecks(makeConfig({
        lastProbeAt: "2026-03-22T12:00:00Z",
        lastProbeError: "API returned 401",
      }));

      const probeCheck = report.checks.find((c) => c.check === "meta_last_probe");
      expect(probeCheck?.ok).toBe(false);
      expect(probeCheck?.severity).toBe("warn");
    });

    it("reports healthy with all credentials and successful probe", () => {
      const report = runWhatsAppDoctorChecks(makeConfig());

      expect(report.healthy).toBe(true);
      expect(report.checks.every((c) => c.ok)).toBe(true);
    });
  });
});
