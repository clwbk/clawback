import type { FastifyInstance, FastifyRequest } from "fastify";

import type { SessionContext } from "@clawback/auth";

import type { ConnectionService } from "./connections/index.js";
import { lookupProvider } from "./plugins/registry-lookup.js";

type WorkspaceSmtpRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureAdmin: (request: FastifyRequest) => SessionContext;
  connectionService: ConnectionService;
};

export function registerWorkspaceSmtpRoutes(
  app: FastifyInstance,
  options: WorkspaceSmtpRoutesOptions,
) {
  const {
    ensureSession,
    ensureAdmin,
    connectionService,
  } = options;

  app.get("/api/workspace/connections/:id/smtp-status", async (request, reply) => {
    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const connection = await connectionService.getById(session.workspace.id, id);

    const providerManifest = lookupProvider(connection.provider);
    if (!providerManifest || connection.provider !== "smtp_relay") {
      return reply.status(400).send({
        error: "SMTP status is only available for smtp_relay connections.",
        code: "invalid_connection_provider",
      });
    }

    const env = process.env;
    const hostPresent = Boolean(env.CLAWBACK_SMTP_HOST);
    const portPresent = Boolean(env.CLAWBACK_SMTP_PORT);
    const usernamePresent = Boolean(env.CLAWBACK_SMTP_USERNAME);
    const passwordPresent = Boolean(env.CLAWBACK_SMTP_PASSWORD);
    const fromAddressPresent = Boolean(env.CLAWBACK_SMTP_FROM_ADDRESS);
    const allRequired = hostPresent && portPresent && fromAddressPresent;

    return reply.send({
      connection_id: id,
      status: connection.status,
      env_configured: allRequired,
      host_present: hostPresent,
      port_present: portPresent,
      username_present: usernamePresent,
      password_present: passwordPresent,
      from_address_present: fromAddressPresent,
      from_address: fromAddressPresent ? env.CLAWBACK_SMTP_FROM_ADDRESS : null,
      host: hostPresent ? env.CLAWBACK_SMTP_HOST : null,
      port: portPresent ? Number(env.CLAWBACK_SMTP_PORT) : null,
    });
  });

  app.post("/api/workspace/connections/:id/smtp-configure", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const connection = await connectionService.getById(session.workspace.id, id);

    const smtpManifest = lookupProvider(connection.provider);
    if (!smtpManifest || connection.provider !== "smtp_relay") {
      return reply.status(400).send({
        error: "SMTP configure is only available for smtp_relay connections.",
        code: "invalid_connection_provider",
      });
    }

    const env = process.env;
    const hostPresent = Boolean(env.CLAWBACK_SMTP_HOST);
    const portPresent = Boolean(env.CLAWBACK_SMTP_PORT);
    const fromAddressPresent = Boolean(env.CLAWBACK_SMTP_FROM_ADDRESS);
    const allRequired = hostPresent && portPresent && fromAddressPresent;

    if (!allRequired) {
      return reply.status(400).send({
        error: "SMTP environment variables are not fully configured. Set CLAWBACK_SMTP_HOST, CLAWBACK_SMTP_PORT, and CLAWBACK_SMTP_FROM_ADDRESS.",
        code: "smtp_env_not_configured",
      });
    }

    const configJson: Record<string, unknown> = {
      host: env.CLAWBACK_SMTP_HOST,
      port: Number(env.CLAWBACK_SMTP_PORT),
      from: env.CLAWBACK_SMTP_FROM_ADDRESS,
      configuredAt: new Date().toISOString(),
    };

    const updated = await connectionService.update(session.workspace.id, id, {
      status: "connected",
      configJson,
    });

    return reply.send(updated);
  });
}
