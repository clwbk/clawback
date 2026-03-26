import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SessionContext } from "@clawback/auth";

import { WhatsAppSetupError, type WhatsAppSetupService } from "./integrations/whatsapp/index.js";

type WorkspaceWhatsAppRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureAdmin: (request: FastifyRequest) => SessionContext;
  whatsappSetupService: WhatsAppSetupService | undefined;
};

function sendWhatsAppSetupError(reply: FastifyReply, error: WhatsAppSetupError) {
  return reply.status(error.statusCode).send({
    error: error.message,
    code: error.code,
  });
}

export function registerWorkspaceWhatsAppRoutes(
  app: FastifyInstance,
  options: WorkspaceWhatsAppRoutesOptions,
) {
  const {
    ensureSession,
    ensureAdmin,
    whatsappSetupService,
  } = options;

  app.post("/api/workspace/connections/:id/whatsapp-setup", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!whatsappSetupService) {
      return reply.code(501).send({
        error: "WhatsApp setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      phone_number_id?: string;
      access_token?: string;
      verify_token?: string;
    };

    if (!body.phone_number_id || !body.access_token || !body.verify_token) {
      return reply.status(400).send({
        error: "phone_number_id, access_token, and verify_token are required.",
        code: "missing_whatsapp_credentials",
      });
    }

    try {
      const result = await whatsappSetupService.setup(session.workspace.id, id, {
        phone_number_id: body.phone_number_id,
        access_token: body.access_token,
        verify_token: body.verify_token,
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof WhatsAppSetupError) {
        return sendWhatsAppSetupError(reply, error);
      }
      throw error;
    }
  });

  app.get("/api/workspace/connections/:id/whatsapp-status", async (request, reply) => {
    if (!whatsappSetupService) {
      return reply.code(501).send({
        error: "WhatsApp setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };

    try {
      const result = await whatsappSetupService.getStatus(session.workspace.id, id);
      return reply.send(result);
    } catch (error) {
      if (error instanceof WhatsAppSetupError) {
        return sendWhatsAppSetupError(reply, error);
      }
      throw error;
    }
  });

  app.post("/api/workspace/connections/:id/whatsapp-probe", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!whatsappSetupService) {
      return reply.code(501).send({
        error: "WhatsApp setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };

    try {
      const result = await whatsappSetupService.probe(session.workspace.id, id);
      return reply.send(result);
    } catch (error) {
      if (error instanceof WhatsAppSetupError) {
        return sendWhatsAppSetupError(reply, error);
      }
      throw error;
    }
  });

  app.post("/api/workspace/connections/:id/whatsapp-transport-mode", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!whatsappSetupService) {
      return reply.code(501).send({
        error: "WhatsApp setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as { transport_mode?: string };

    if (body.transport_mode !== "openclaw_pairing" && body.transport_mode !== "meta_cloud_api") {
      return reply.status(400).send({
        error: "transport_mode must be 'openclaw_pairing' or 'meta_cloud_api'.",
        code: "invalid_transport_mode",
      });
    }

    try {
      const result = await whatsappSetupService.setTransportMode(session.workspace.id, id, body.transport_mode);
      return reply.send(result);
    } catch (error) {
      if (error instanceof WhatsAppSetupError) {
        return sendWhatsAppSetupError(reply, error);
      }
      throw error;
    }
  });

  app.post("/api/workspace/connections/:id/whatsapp-pairing/start", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!whatsappSetupService) {
      return reply.code(501).send({
        error: "WhatsApp setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as { force?: boolean; timeout_ms?: number };

    try {
      const result = await whatsappSetupService.startPairing(session.workspace.id, id, {
        force: body.force === true,
        ...(typeof body.timeout_ms === "number" ? { timeoutMs: body.timeout_ms } : {}),
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof WhatsAppSetupError) {
        return sendWhatsAppSetupError(reply, error);
      }
      throw error;
    }
  });

  app.post("/api/workspace/connections/:id/whatsapp-pairing/wait", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!whatsappSetupService) {
      return reply.code(501).send({
        error: "WhatsApp setup service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as { timeout_ms?: number };

    try {
      const result = await whatsappSetupService.waitForPairing(session.workspace.id, id, {
        ...(typeof body.timeout_ms === "number" ? { timeoutMs: body.timeout_ms } : {}),
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof WhatsAppSetupError) {
        return sendWhatsAppSetupError(reply, error);
      }
      throw error;
    }
  });
}
