import type { FastifyInstance, FastifyRequest } from "fastify";

import type { SessionContext } from "@clawback/auth";

import { SlackSetupError, type SlackSetupService } from "./integrations/slack/index.js";

type WorkspaceSlackRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureAdmin: (request: FastifyRequest) => SessionContext;
  slackSetupService: SlackSetupService | undefined;
};

export function registerWorkspaceSlackRoutes(
  app: FastifyInstance,
  options: WorkspaceSlackRoutesOptions,
) {
  const {
    ensureSession,
    ensureAdmin,
    slackSetupService,
  } = options;

  // -------------------------------------------------------------------------
  // POST /api/workspace/connections/:id/slack-setup
  // -------------------------------------------------------------------------

  app.post("/api/workspace/connections/:id/slack-setup", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!slackSetupService) {
      return reply.code(501).send({
        error: "Slack setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      bot_token?: string;
      signing_secret?: string;
      default_channel?: string;
    };

    if (!body.bot_token || !body.signing_secret || !body.default_channel) {
      return reply.status(400).send({
        error: "bot_token, signing_secret, and default_channel are required.",
        code: "missing_slack_credentials",
      });
    }

    try {
      const result = await slackSetupService.setup(session.workspace.id, id, {
        bot_token: body.bot_token,
        signing_secret: body.signing_secret,
        default_channel: body.default_channel,
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof SlackSetupError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/workspace/connections/:id/slack-status
  // -------------------------------------------------------------------------

  app.get("/api/workspace/connections/:id/slack-status", async (request, reply) => {
    if (!slackSetupService) {
      return reply.code(501).send({
        error: "Slack setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };

    try {
      const result = await slackSetupService.getStatus(session.workspace.id, id);
      return reply.send(result);
    } catch (error) {
      if (error instanceof SlackSetupError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/workspace/connections/:id/slack-probe
  // -------------------------------------------------------------------------

  app.post("/api/workspace/connections/:id/slack-probe", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!slackSetupService) {
      return reply.code(501).send({
        error: "Slack setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };

    try {
      const result = await slackSetupService.probe(session.workspace.id, id);
      return reply.send(result);
    } catch (error) {
      if (error instanceof SlackSetupError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/workspace/connections/:id/slack-test-send
  // -------------------------------------------------------------------------

  app.post("/api/workspace/connections/:id/slack-test-send", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!slackSetupService) {
      return reply.code(501).send({
        error: "Slack setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };

    try {
      const config = await slackSetupService.getValidatedConfig(session.workspace.id, id);
      const { SlackTransportService } = await import("./integrations/slack/slack-transport-service.js");
      const transport = new SlackTransportService({
        botToken: config.botToken,
        defaultChannel: config.defaultChannel,
      });
      const result = await transport.sendTestMessage();
      return reply.send(result);
    } catch (error) {
      if (error instanceof SlackSetupError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });
}
