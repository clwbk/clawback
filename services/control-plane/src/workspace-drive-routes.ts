import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SessionContext } from "@clawback/auth";

import {
  DriveSetupError,
  type DriveContextService,
  type DriveSetupService,
} from "./connections/index.js";

type WorkspaceDriveRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureAdmin: (request: FastifyRequest) => SessionContext;
  driveSetupService: DriveSetupService | undefined;
  driveContextService: DriveContextService | undefined;
};

function sendDriveSetupError(reply: FastifyReply, error: DriveSetupError) {
  return reply.status(error.statusCode).send({
    error: error.message,
    code: error.code,
  });
}

export function registerWorkspaceDriveRoutes(
  app: FastifyInstance,
  options: WorkspaceDriveRoutesOptions,
) {
  const {
    ensureSession,
    ensureAdmin,
    driveSetupService,
    driveContextService,
  } = options;

  app.post("/api/workspace/connections/:id/drive-setup", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!driveSetupService) {
      return reply.code(501).send({
        error: "Drive setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      client_id?: string;
      client_secret?: string;
      refresh_token?: string;
    };

    if (!body.client_id || !body.client_secret || !body.refresh_token) {
      return reply.status(400).send({
        error: "client_id, client_secret, and refresh_token are required.",
        code: "missing_google_credentials",
      });
    }

    try {
      const summary = await driveSetupService.setup(session.workspace.id, id, {
        clientId: body.client_id,
        clientSecret: body.client_secret,
        refreshToken: body.refresh_token,
      });
      return reply.send({ setup: summary });
    } catch (error) {
      if (error instanceof DriveSetupError) {
        return sendDriveSetupError(reply, error);
      }
      throw error;
    }
  });

  app.get("/api/workspace/connections/:id/drive-status", async (request, reply) => {
    if (!driveSetupService) {
      return reply.code(501).send({
        error: "Drive setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };

    const summary = await driveSetupService.getSummary(session.workspace.id, id);
    return reply.send({ setup: summary });
  });

  app.post("/api/workspace/connections/:id/drive-probe", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!driveSetupService) {
      return reply.code(501).send({
        error: "Drive setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };

    const probe = await driveSetupService.probe(session.workspace.id, id);
    const status = await driveSetupService.status(session.workspace.id, id);
    const recoveryHints = probe.ok ? [] : driveSetupService.recoveryHints(probe.issues.map((issue) => issue.code));

    return reply.send({ probe, status, recovery_hints: recoveryHints });
  });

  app.get("/api/workspace/connections/:id/drive-oauth-credentials", async (request, reply) => {
    if (!driveSetupService) {
      return reply.code(501).send({
        error: "Drive setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const result = await driveSetupService.getOAuthAppCredentials(session.workspace.id, id);
    return reply.send(result);
  });

  app.post("/api/workspace/connections/:id/drive-oauth-credentials", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!driveSetupService) {
      return reply.code(501).send({
        error: "Drive setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as { client_id?: string; client_secret?: string };

    if (!body.client_id || !body.client_secret) {
      return reply.status(400).send({
        error: "client_id and client_secret are required.",
        code: "missing_oauth_credentials",
      });
    }

    const result = await driveSetupService.saveOAuthAppCredentials(
      session.workspace.id,
      id,
      { clientId: body.client_id, clientSecret: body.client_secret },
    );
    return reply.send(result);
  });

  app.post("/api/workspace/connections/:id/drive-oauth-callback", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!driveSetupService) {
      return reply.code(501).send({
        error: "Drive setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as { code?: string; redirect_uri?: string };

    if (!body.code || !body.redirect_uri) {
      return reply.status(400).send({
        error: "code and redirect_uri are required.",
        code: "missing_oauth_callback_params",
      });
    }

    const creds = await driveSetupService.getStoredOAuthAppSecrets(session.workspace.id, id);
    if (!creds) {
      return reply.status(400).send({
        error: "OAuth app credentials must be configured before completing the OAuth flow.",
        code: "oauth_app_not_configured",
      });
    }

    try {
      const summary = await driveSetupService.completeOAuthFlow(session.workspace.id, id, {
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        authCode: body.code,
        redirectUri: body.redirect_uri,
      });
      return reply.send({ setup: summary });
    } catch (error) {
      if (error instanceof DriveSetupError) {
        return sendDriveSetupError(reply, error);
      }
      throw error;
    }
  });

  app.get("/api/workspace/connections/:id/drive-files", async (request, reply) => {
    if (!driveContextService) {
      return reply.code(501).send({
        error: "Drive context service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const query = request.query as { folder_id?: string; page_size?: string; page_token?: string };

    try {
      const opts: { folderId?: string; pageSize?: number; pageToken?: string } = {};
      if (query.folder_id) opts.folderId = query.folder_id;
      if (query.page_size) opts.pageSize = Number(query.page_size);
      if (query.page_token) opts.pageToken = query.page_token;
      const result = await driveContextService.listFiles(session.workspace.id, id, opts);
      return reply.send(result);
    } catch (error) {
      if (error instanceof DriveSetupError) {
        return sendDriveSetupError(reply, error);
      }
      throw error;
    }
  });

  app.get("/api/workspace/connections/:id/drive-search", async (request, reply) => {
    if (!driveContextService) {
      return reply.code(501).send({
        error: "Drive context service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const query = request.query as { q?: string; page_size?: string; page_token?: string };

    if (!query.q) {
      return reply.status(400).send({
        error: "Search query parameter 'q' is required.",
        code: "missing_search_query",
      });
    }

    try {
      const searchOpts: { pageSize?: number; pageToken?: string } = {};
      if (query.page_size) searchOpts.pageSize = Number(query.page_size);
      if (query.page_token) searchOpts.pageToken = query.page_token;
      const result = await driveContextService.searchFiles(session.workspace.id, id, query.q, searchOpts);
      return reply.send(result);
    } catch (error) {
      if (error instanceof DriveSetupError) {
        return sendDriveSetupError(reply, error);
      }
      throw error;
    }
  });

  app.get("/api/workspace/connections/:id/drive-file/:fileId", async (request, reply) => {
    if (!driveContextService) {
      return reply.code(501).send({
        error: "Drive context service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const { id, fileId } = request.params as { id: string; fileId: string };

    try {
      const result = await driveContextService.getFileContent(session.workspace.id, id, fileId);
      return reply.send(result);
    } catch (error) {
      if (error instanceof DriveSetupError) {
        return sendDriveSetupError(reply, error);
      }
      throw error;
    }
  });
}
