import type { FastifyInstance, FastifyRequest } from "fastify";

import { n8nConnectionConfigSchema } from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

import type { ConnectionService } from "./connections/index.js";
import { lookupProvider } from "./plugins/registry-lookup.js";

type WorkspaceN8nRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureAdmin: (request: FastifyRequest) => SessionContext;
  connectionService: ConnectionService;
};

export function registerWorkspaceN8nRoutes(
  app: FastifyInstance,
  options: WorkspaceN8nRoutesOptions,
) {
  const {
    ensureSession,
    ensureAdmin,
    connectionService,
  } = options;

  app.post("/api/workspace/connections/:id/n8n-configure", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const connection = await connectionService.getById(session.workspace.id, id);

    const manifest = lookupProvider(connection.provider);
    if (!manifest || connection.provider !== "n8n") {
      return reply.status(400).send({
        error: "n8n configure is only available for n8n connections.",
        code: "invalid_connection_provider",
      });
    }

    const parsed = n8nConnectionConfigSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "base_url and auth_token are required for n8n configuration.",
        code: "invalid_n8n_configuration",
      });
    }

    const updated = await connectionService.update(session.workspace.id, id, {
      status: "connected",
      configJson: {
        ...parsed.data,
        configured_at: new Date().toISOString(),
      },
    });

    return reply.send(updated);
  });

  app.get("/api/workspace/connections/:id/n8n-status", async (request, reply) => {
    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const connection = await connectionService.getStoredById(session.workspace.id, id);

    if (connection.provider !== "n8n") {
      return reply.status(400).send({
        error: "n8n status is only available for n8n connections.",
        code: "invalid_connection_provider",
      });
    }

    const config = (connection.configJson ?? {}) as Record<string, unknown>;
    const baseUrl = typeof config?.base_url === "string" ? config.base_url : null;
    const hasAuthToken = typeof config?.auth_token === "string" && config.auth_token.length > 0;
    const webhookPathPrefix = typeof config?.webhook_path_prefix === "string"
      ? config.webhook_path_prefix
      : "webhook";
    const configuredAt = typeof config?.configured_at === "string" ? config.configured_at : null;

    return reply.send({
      status: connection.status,
      base_url: baseUrl,
      has_auth_token: hasAuthToken,
      webhook_path_prefix: webhookPathPrefix,
      configured_at: configuredAt,
      configured: !!baseUrl && hasAuthToken,
    });
  });

  app.post("/api/workspace/connections/:id/n8n-verify", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const connection = await connectionService.getStoredById(session.workspace.id, id);

    if (connection.provider !== "n8n") {
      return reply.status(400).send({
        error: "n8n verify is only available for n8n connections.",
        code: "invalid_connection_provider",
      });
    }

    const config = (connection.configJson ?? {}) as Record<string, unknown>;
    const baseUrl = typeof config?.base_url === "string" ? config.base_url : null;
    const authToken = typeof config?.auth_token === "string" ? config.auth_token : null;

    if (!baseUrl || !authToken) {
      return reply.send({
        reachable: false,
        authenticated: false,
        error: "n8n is not configured. Save the base URL and API key first.",
      });
    }

    try {
      const url = new URL("/api/v1/workflows?limit=1", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${authToken}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status === 401 || response.status === 403) {
        return reply.send({
          reachable: true,
          authenticated: false,
          status_code: response.status,
          error: "n8n responded but rejected the API key. Check your credentials.",
        });
      }

      if (!response.ok) {
        return reply.send({
          reachable: true,
          authenticated: false,
          status_code: response.status,
          error: `n8n responded with status ${response.status}. Check the base URL and API key.`,
        });
      }

      return reply.send({
        reachable: true,
        authenticated: true,
        status_code: response.status,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reach n8n.";
      return reply.send({
        reachable: false,
        authenticated: false,
        error: `Cannot reach n8n at ${baseUrl}: ${message}`,
      });
    }
  });
}
