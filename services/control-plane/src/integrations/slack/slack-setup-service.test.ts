import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlackSetupService } from "./slack-setup-service.js";
import { SlackSetupError } from "./slack-errors.js";
import type { SlackConnectionConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock the transport service to avoid real HTTP calls
vi.mock("./slack-transport-service.js", () => ({
  SlackTransportService: class MockSlackTransportService {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
    async testConnection() {
      return {
        ok: true,
        botName: "clawback-bot",
        teamName: "Test Workspace",
      };
    }
    async sendTestMessage() {
      return { ok: true };
    }
  },
}));

function makeFakeConnectionService() {
  const connections = new Map<string, any>();
  return {
    getStoredById: vi.fn().mockImplementation(async (_workspaceId: string, id: string) => {
      const conn = connections.get(id);
      if (!conn) {
        throw new Error(`Connection ${id} not found`);
      }
      return conn;
    }),
    update: vi.fn().mockImplementation(async (_workspaceId: string, id: string, updates: any) => {
      const conn = connections.get(id);
      if (conn) {
        Object.assign(conn, updates);
      }
    }),
    _set(id: string, data: any) {
      connections.set(id, data);
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SlackSetupService", () => {
  const fixedNow = new Date("2025-01-15T12:00:00Z");
  let connectionService: ReturnType<typeof makeFakeConnectionService>;
  let setupService: SlackSetupService;

  beforeEach(() => {
    connectionService = makeFakeConnectionService();
    setupService = new SlackSetupService({
      connectionService: connectionService as any,
      now: () => fixedNow,
    });
  });

  describe("validate", () => {
    it("returns ok for valid config", () => {
      const config: SlackConnectionConfig = {
        botToken: "xoxb-test-token-123",
        signingSecret: "abc123secret",
        defaultChannel: "C01234ABC",
        validatedBotName: null,
        validatedTeamName: null,
        lastProbeAt: null,
        lastProbeError: null,
      };

      const result = setupService.validate(config);
      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("reports missing bot token", () => {
      const config: SlackConnectionConfig = {
        botToken: "",
        signingSecret: "abc123",
        defaultChannel: "C01234ABC",
        validatedBotName: null,
        validatedTeamName: null,
        lastProbeAt: null,
        lastProbeError: null,
      };

      const result = setupService.validate(config);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === "missing_bot_token")).toBe(true);
    });

    it("reports invalid bot token format", () => {
      const config: SlackConnectionConfig = {
        botToken: "not-xoxb-token",
        signingSecret: "abc123",
        defaultChannel: "C01234ABC",
        validatedBotName: null,
        validatedTeamName: null,
        lastProbeAt: null,
        lastProbeError: null,
      };

      const result = setupService.validate(config);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === "invalid_bot_token_format")).toBe(true);
    });

    it("reports missing signing secret", () => {
      const config: SlackConnectionConfig = {
        botToken: "xoxb-test-token",
        signingSecret: "",
        defaultChannel: "C01234ABC",
        validatedBotName: null,
        validatedTeamName: null,
        lastProbeAt: null,
        lastProbeError: null,
      };

      const result = setupService.validate(config);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === "missing_signing_secret")).toBe(true);
    });

    it("reports missing default channel", () => {
      const config: SlackConnectionConfig = {
        botToken: "xoxb-test-token",
        signingSecret: "abc123",
        defaultChannel: "",
        validatedBotName: null,
        validatedTeamName: null,
        lastProbeAt: null,
        lastProbeError: null,
      };

      const result = setupService.validate(config);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === "missing_default_channel")).toBe(true);
    });
  });

  describe("setup", () => {
    it("stores config and returns connected status on success", async () => {
      connectionService._set("conn_slack_01", {
        id: "conn_slack_01",
        provider: "slack",
        status: "not_connected",
        configJson: {},
      });

      const result = await setupService.setup("ws_01", "conn_slack_01", {
        bot_token: "xoxb-test-bot-token",
        signing_secret: "test-signing-secret",
        default_channel: "C01234ABC",
      });

      expect(result.connection_status).toBe("connected");
      expect(result.operational.state).toBe("ready");
      expect(result.probe?.ok).toBe(true);
      expect(result.probe?.botName).toBe("clawback-bot");
      expect(result.probe?.teamName).toBe("Test Workspace");
    });

    it("rejects non-slack connections", async () => {
      connectionService._set("conn_gmail_01", {
        id: "conn_gmail_01",
        provider: "gmail",
        status: "connected",
        configJson: {},
      });

      await expect(
        setupService.setup("ws_01", "conn_gmail_01", {
          bot_token: "xoxb-test",
          signing_secret: "abc",
          default_channel: "C01",
        }),
      ).rejects.toThrow(SlackSetupError);
    });
  });

  describe("getStatus", () => {
    it("returns setup_required for unconfigured connection", async () => {
      connectionService._set("conn_slack_02", {
        id: "conn_slack_02",
        provider: "slack",
        status: "not_connected",
        configJson: {},
      });

      const result = await setupService.getStatus("ws_01", "conn_slack_02");
      expect(result.operational.state).toBe("setup_required");
    });

    it("returns ready for properly configured connection", async () => {
      connectionService._set("conn_slack_03", {
        id: "conn_slack_03",
        provider: "slack",
        status: "connected",
        configJson: {
          botToken: "xoxb-test",
          signingSecret: "secret",
          defaultChannel: "C01234ABC",
          validatedBotName: "bot",
          validatedTeamName: "workspace",
          lastProbeAt: "2025-01-15T11:00:00Z",
          lastProbeError: null,
        },
      });

      const result = await setupService.getStatus("ws_01", "conn_slack_03");
      expect(result.operational.state).toBe("ready");
      expect(result.recovery_hints).toHaveLength(0);
    });

    it("returns error state with recovery hints when probe failed", async () => {
      connectionService._set("conn_slack_04", {
        id: "conn_slack_04",
        provider: "slack",
        status: "error",
        configJson: {
          botToken: "xoxb-test",
          signingSecret: "secret",
          defaultChannel: "C01234ABC",
          validatedBotName: null,
          validatedTeamName: null,
          lastProbeAt: "2025-01-15T11:00:00Z",
          lastProbeError: "Slack auth.test failed: invalid_auth",
        },
      });

      const result = await setupService.getStatus("ws_01", "conn_slack_04");
      expect(result.operational.state).toBe("error");
      expect(result.recovery_hints.some((h) => h.code === "check_credentials")).toBe(true);
    });
  });

  describe("probe", () => {
    it("probes successfully and updates connection", async () => {
      connectionService._set("conn_slack_05", {
        id: "conn_slack_05",
        provider: "slack",
        status: "connected",
        configJson: {
          botToken: "xoxb-test",
          signingSecret: "secret",
          defaultChannel: "C01234ABC",
          validatedBotName: null,
          validatedTeamName: null,
          lastProbeAt: null,
          lastProbeError: null,
        },
      });

      const result = await setupService.probe("ws_01", "conn_slack_05");
      expect(result.ok).toBe(true);
      expect(result.botName).toBe("clawback-bot");
      expect(connectionService.update).toHaveBeenCalled();
    });

    it("returns error for incomplete config", async () => {
      connectionService._set("conn_slack_06", {
        id: "conn_slack_06",
        provider: "slack",
        status: "not_connected",
        configJson: {
          botToken: "",
          signingSecret: "",
          defaultChannel: "",
        },
      });

      const result = await setupService.probe("ws_01", "conn_slack_06");
      expect(result.ok).toBe(false);
      expect(result.summary).toBe("Configuration is incomplete.");
    });
  });
});
