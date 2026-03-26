import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { GitHubConnectionService, GitHubSetupError, normalizeGitHubConfig } from "./github-connection-service.js";

// ---------------------------------------------------------------------------
// Fake ConnectionService
// ---------------------------------------------------------------------------

function makeFakeConnectionService(initialConfig: Record<string, unknown> = {}) {
  const store: Record<string, any> = {
    "conn-1": {
      id: "conn-1",
      workspaceId: "ws-1",
      provider: "github",
      accessMode: "read_only",
      status: "not_connected",
      label: "GitHub",
      capabilities: [],
      attachedWorkerIds: [],
      configJson: initialConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  return {
    getStoredById: vi.fn(async (_wsId: string, id: string) => {
      const conn = store[id];
      if (!conn) throw new Error(`Connection not found: ${id}`);
      return conn;
    }),
    update: vi.fn(async (_wsId: string, id: string, input: Record<string, any>) => {
      const conn = store[id];
      if (!conn) throw new Error(`Connection not found: ${id}`);
      if (input.status !== undefined) conn.status = input.status;
      if (input.configJson !== undefined) conn.configJson = input.configJson;
      if (input.capabilities !== undefined) conn.capabilities = input.capabilities;
      conn.updatedAt = new Date();
      return conn;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GitHubConnectionService", () => {
  const fixedDate = new Date("2025-06-01T12:00:00.000Z");

  describe("validate", () => {
    it("returns ok when PAT is present", () => {
      const service = new GitHubConnectionService({
        connectionService: makeFakeConnectionService() as any,
        now: () => fixedDate,
      });

      const result = service.validate({
        personalAccessToken: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        validatedLogin: null,
        validatedName: null,
        tokenScopes: [],
        org: null,
        repos: [],
        lastProbeAt: null,
        lastProbeError: null,
      });

      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("reports missing PAT", () => {
      const service = new GitHubConnectionService({
        connectionService: makeFakeConnectionService() as any,
        now: () => fixedDate,
      });

      const result = service.validate({
        personalAccessToken: "",
        validatedLogin: null,
        validatedName: null,
        tokenScopes: [],
        org: null,
        repos: [],
        lastProbeAt: null,
        lastProbeError: null,
      });

      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.code).toBe("missing_pat");
    });

    it("reports suspiciously short PAT", () => {
      const service = new GitHubConnectionService({
        connectionService: makeFakeConnectionService() as any,
        now: () => fixedDate,
      });

      const result = service.validate({
        personalAccessToken: "short",
        validatedLogin: null,
        validatedName: null,
        tokenScopes: [],
        org: null,
        repos: [],
        lastProbeAt: null,
        lastProbeError: null,
      });

      expect(result.ok).toBe(false);
      expect(result.issues[0]!.code).toBe("invalid_pat_format");
    });
  });

  describe("normalizeGitHubConfig", () => {
    it("handles null/undefined rawConfig", () => {
      const config = normalizeGitHubConfig(null);
      expect(config.personalAccessToken).toBe("");
      expect(config.validatedLogin).toBeNull();
      expect(config.repos).toEqual([]);
    });

    it("normalizes a partial config", () => {
      const config = normalizeGitHubConfig({
        personalAccessToken: "ghp_test",
        org: "myorg",
      });
      expect(config.personalAccessToken).toBe("ghp_test");
      expect(config.org).toBe("myorg");
      expect(config.repos).toEqual([]);
      expect(config.tokenScopes).toEqual([]);
    });
  });

  describe("setup", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("validates token and stores config on success", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo, read:org" }),
        json: async () => ({ login: "testuser", name: "Test User" }),
      });

      const fakeConn = makeFakeConnectionService();
      const service = new GitHubConnectionService({
        connectionService: fakeConn as any,
        now: () => fixedDate,
      });

      const result = await service.setup("ws-1", "conn-1", {
        personal_access_token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        org: "myorg",
      });

      expect(result.connection_status).toBe("connected");
      expect(result.operational.state).toBe("ready");
      expect(result.operational.summary).toContain("testuser");
      expect(result.recovery_hints).toHaveLength(0);

      // Verify the connection was updated
      expect(fakeConn.update).toHaveBeenCalledWith("ws-1", "conn-1", expect.objectContaining({
        status: "connected",
      }));
    });

    it("stores error when token is invalid", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers(),
        json: async () => ({ message: "Bad credentials" }),
      });

      const fakeConn = makeFakeConnectionService();
      const service = new GitHubConnectionService({
        connectionService: fakeConn as any,
        now: () => fixedDate,
      });

      const result = await service.setup("ws-1", "conn-1", {
        personal_access_token: "ghp_invalid",
      });

      expect(result.connection_status).toBe("error");
      expect(result.operational.state).toBe("error");
      expect(result.recovery_hints.length).toBeGreaterThan(0);
    });

    it("throws for non-github connection", async () => {
      const fakeConn = makeFakeConnectionService();
      (fakeConn.getStoredById as any).mockResolvedValueOnce({
        id: "conn-1",
        workspaceId: "ws-1",
        provider: "gmail",
        accessMode: "read_only",
        status: "not_connected",
        label: "Gmail",
        capabilities: [],
        attachedWorkerIds: [],
        configJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const service = new GitHubConnectionService({
        connectionService: fakeConn as any,
        now: () => fixedDate,
      });

      await expect(
        service.setup("ws-1", "conn-1", {
          personal_access_token: "ghp_test",
        }),
      ).rejects.toThrow(GitHubSetupError);
    });
  });

  describe("getStatus", () => {
    it("returns setup_required for unconfigured connection", async () => {
      const fakeConn = makeFakeConnectionService();
      const service = new GitHubConnectionService({
        connectionService: fakeConn as any,
        now: () => fixedDate,
      });

      const result = await service.getStatus("ws-1", "conn-1");

      expect(result.operational.state).toBe("setup_required");
      expect(result.recovery_hints.length).toBeGreaterThan(0);
      expect(result.recovery_hints[0]!.code).toBe("create_pat");
    });

    it("returns ready for connected connection", async () => {
      const fakeConn = makeFakeConnectionService({
        personalAccessToken: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        validatedLogin: "testuser",
        validatedName: "Test User",
        tokenScopes: ["repo"],
        org: null,
        repos: [],
        lastProbeAt: "2025-06-01T12:00:00.000Z",
        lastProbeError: null,
      });

      const service = new GitHubConnectionService({
        connectionService: fakeConn as any,
        now: () => fixedDate,
      });

      const result = await service.getStatus("ws-1", "conn-1");

      expect(result.operational.state).toBe("ready");
      expect(result.operational.summary).toContain("testuser");
    });

    it("returns error when last probe failed", async () => {
      const fakeConn = makeFakeConnectionService({
        personalAccessToken: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        validatedLogin: null,
        validatedName: null,
        tokenScopes: [],
        org: null,
        repos: [],
        lastProbeAt: "2025-06-01T12:00:00.000Z",
        lastProbeError: "GitHub rejected the personal access token.",
      });

      const service = new GitHubConnectionService({
        connectionService: fakeConn as any,
        now: () => fixedDate,
      });

      const result = await service.getStatus("ws-1", "conn-1");

      expect(result.operational.state).toBe("error");
      expect(result.recovery_hints.length).toBeGreaterThan(0);
    });
  });

  describe("probe", () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("probes and updates connection status on success", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo" }),
        json: async () => ({ login: "testuser", name: "Test User" }),
      });

      const fakeConn = makeFakeConnectionService({
        personalAccessToken: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        validatedLogin: null,
        validatedName: null,
        tokenScopes: [],
        org: null,
        repos: [],
        lastProbeAt: null,
        lastProbeError: null,
      });

      const service = new GitHubConnectionService({
        connectionService: fakeConn as any,
        now: () => fixedDate,
      });

      const result = await service.probe("ws-1", "conn-1");

      expect(result.ok).toBe(true);
      expect(result.user?.login).toBe("testuser");
      expect(fakeConn.update).toHaveBeenCalledWith("ws-1", "conn-1", expect.objectContaining({
        status: "connected",
      }));
    });

    it("returns validation errors when config is incomplete", async () => {
      const fakeConn = makeFakeConnectionService({});

      const service = new GitHubConnectionService({
        connectionService: fakeConn as any,
        now: () => fixedDate,
      });

      const result = await service.probe("ws-1", "conn-1");

      expect(result.ok).toBe(false);
      expect(result.issues[0]!.code).toBe("missing_pat");
    });
  });
});
