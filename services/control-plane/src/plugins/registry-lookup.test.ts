import { describe, expect, it } from "vitest";

import {
  isRegisteredProvider,
  lookupProvider,
  listRegisteredProviderNames,
  isRegisteredActionKind,
  lookupExecutor,
  listRegisteredActionKinds,
  lookupWorkerPack,
  listRegisteredWorkerPackIds,
} from "./registry-lookup.js";

describe("registry lookup helpers", () => {
  describe("provider lookup", () => {
    it("recognizes registered providers", () => {
      expect(isRegisteredProvider("gmail")).toBe(true);
      expect(isRegisteredProvider("n8n")).toBe(true);
      expect(isRegisteredProvider("smtp_relay")).toBe(true);
      expect(isRegisteredProvider("calendar")).toBe(true);
      expect(isRegisteredProvider("drive")).toBe(true);
    });

    it("returns false for unknown providers", () => {
      expect(isRegisteredProvider("unknown_provider")).toBe(false);
    });

    it("returns manifest for known provider", () => {
      const manifest = lookupProvider("gmail");
      expect(manifest).not.toBeNull();
      expect(manifest?.displayName).toBe("Gmail Read-Only");
    });

    it("lists all registered provider names", () => {
      const names = listRegisteredProviderNames();
      expect(names).toContain("gmail");
      expect(names).toContain("n8n");
      expect(names).toContain("smtp_relay");
      expect(names).toContain("calendar");
      expect(names).toContain("drive");
    });
  });

  describe("executor lookup", () => {
    it("recognizes registered action kinds", () => {
      expect(isRegisteredActionKind("send_email")).toBe(true);
      expect(isRegisteredActionKind("run_external_workflow")).toBe(true);
    });

    it("returns false for unknown action kinds", () => {
      expect(isRegisteredActionKind("unknown_action")).toBe(false);
    });

    it("returns executor manifest for known action kind", () => {
      const manifest = lookupExecutor("send_email");
      expect(manifest).not.toBeNull();
      expect(manifest?.displayName).toBe("SMTP Reviewed Send");
    });

    it("lists all registered action kinds", () => {
      const kinds = listRegisteredActionKinds();
      expect(kinds).toContain("send_email");
      expect(kinds).toContain("run_external_workflow");
    });
  });

  describe("worker pack lookup", () => {
    it("finds worker packs by pack id", () => {
      const manifest = lookupWorkerPack("follow_up_v1");
      expect(manifest).not.toBeNull();
      expect(manifest?.workerKind).toBe("follow_up");
    });

    it("returns null for unknown pack id", () => {
      expect(lookupWorkerPack("nonexistent_pack")).toBeNull();
    });

    it("lists all registered pack ids", () => {
      const ids = listRegisteredWorkerPackIds();
      expect(ids).toContain("follow_up_v1");
      expect(ids).toContain("proposal_v1");
    });
  });
});
