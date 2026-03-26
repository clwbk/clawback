import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  gmailPilotPollResponseSchema,
  gmailPilotScopeKindSchema,
  gmailPilotSetupResponseSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";
import { z } from "zod";

import type {
  ConnectionService,
  GmailPilotSetupService,
} from "./connections/index.js";
import type { InputRouteService } from "./input-routes/index.js";
import {
  GmailPollingError,
  type GmailPollingServiceContract,
} from "./integrations/watched-inbox/index.js";

type WorkspaceGmailRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureAdmin: (request: FastifyRequest) => SessionContext;
  gmailPilotSetupService: GmailPilotSetupService | undefined;
  gmailPollingService: GmailPollingServiceContract | undefined;
  connectionService: ConnectionService;
  inputRouteService: InputRouteService | undefined;
};

export function registerWorkspaceGmailRoutes(
  app: FastifyInstance,
  options: WorkspaceGmailRoutesOptions,
) {
  const {
    ensureSession,
    ensureAdmin,
    gmailPilotSetupService,
    gmailPollingService,
    connectionService,
    inputRouteService,
  } = options;

  const syncConfiguredGmailWatchedInboxRoutes = async (workspaceId: string, connectionId: string) => {
    const connection = await connectionService.getById(workspaceId, connectionId);
    if (
      inputRouteService
      && connection.provider === "gmail"
      && connection.access_mode === "read_only"
      && connection.attached_worker_ids.length > 0
    ) {
      await inputRouteService.syncWatchedInboxStatusForWorkers(
        workspaceId,
        connection.attached_worker_ids,
        "active",
      );
    }
  };

  app.get("/api/workspace/connections/:id/gmail-setup", async (request, reply) => {
    if (!gmailPilotSetupService) {
      return reply.code(501).send({
        error: "Gmail pilot setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const setup = await gmailPilotSetupService.getSummary(session.workspace.id, id);
    return reply.send(gmailPilotSetupResponseSchema.parse({ setup }));
  });

  app.post("/api/workspace/connections/:id/gmail-poll", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!gmailPollingService) {
      return reply.code(501).send({
        error: "Gmail polling is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };

    try {
      const poll = await gmailPollingService.pollConnection(session.workspace.id, id, "manual");
      return reply.send(gmailPilotPollResponseSchema.parse({ poll }));
    } catch (error) {
      if (error instanceof GmailPollingError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  app.post("/api/workspace/connections/:id/gmail-setup", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!gmailPilotSetupService) {
      return reply.code(501).send({
        error: "Gmail pilot setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      scope_kind?: string;
      mailbox_addresses?: string[];
      client_id?: string;
      client_secret?: string;
      refresh_token?: string;
    };

    const scopeResult = gmailPilotScopeKindSchema.safeParse(body.scope_kind);
    if (!scopeResult.success) {
      return reply.status(400).send({
        error: "Invalid Gmail scope kind.",
        code: "invalid_scope_kind",
      });
    }

    if (!body.client_id || !body.client_secret || !body.refresh_token) {
      return reply.status(400).send({
        error: "client_id, client_secret, and refresh_token are required.",
        code: "missing_google_credentials",
      });
    }

    const mailboxResult = z.array(z.string().email()).safeParse(body.mailbox_addresses ?? []);
    if (!mailboxResult.success) {
      return reply.status(400).send({
        error: "mailbox_addresses must contain valid email addresses.",
        code: "invalid_mailbox_addresses",
      });
    }

    const setup = await gmailPilotSetupService.setup(session.workspace.id, id, {
      scopeKind: scopeResult.data,
      mailboxAddresses: mailboxResult.data,
      clientId: body.client_id,
      clientSecret: body.client_secret,
      refreshToken: body.refresh_token,
    });

    await syncConfiguredGmailWatchedInboxRoutes(session.workspace.id, id);
    return reply.send(gmailPilotSetupResponseSchema.parse({ setup }));
  });

  app.post("/api/workspace/connections/:id/gmail-service-account-setup", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!gmailPilotSetupService) {
      return reply.code(501).send({
        error: "Gmail pilot setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      service_account_json?: string;
      target_mailbox?: string;
    };

    if (!body.service_account_json || !body.target_mailbox) {
      return reply.status(400).send({
        error: "service_account_json and target_mailbox are required.",
        code: "missing_service_account_credentials",
      });
    }

    const setup = await gmailPilotSetupService.setupServiceAccount(session.workspace.id, id, {
      serviceAccountJson: body.service_account_json,
      targetMailbox: body.target_mailbox,
    });

    await syncConfiguredGmailWatchedInboxRoutes(session.workspace.id, id);
    return reply.send(gmailPilotSetupResponseSchema.parse({ setup }));
  });

  app.get("/api/workspace/connections/:id/gmail-oauth-credentials", async (request, reply) => {
    if (!gmailPilotSetupService) {
      return reply.code(501).send({
        error: "Gmail pilot setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const result = await gmailPilotSetupService.getOAuthAppCredentials(session.workspace.id, id);
    return reply.send(result);
  });

  app.post("/api/workspace/connections/:id/gmail-oauth-credentials", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!gmailPilotSetupService) {
      return reply.code(501).send({
        error: "Gmail pilot setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      client_id?: string;
      client_secret?: string;
    };

    if (!body.client_id || !body.client_secret) {
      return reply.status(400).send({
        error: "client_id and client_secret are required.",
        code: "missing_oauth_credentials",
      });
    }

    const result = await gmailPilotSetupService.saveOAuthAppCredentials(
      session.workspace.id,
      id,
      { clientId: body.client_id, clientSecret: body.client_secret },
    );

    return reply.send(result);
  });

  app.post("/api/workspace/connections/:id/gmail-oauth-callback", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!gmailPilotSetupService) {
      return reply.code(501).send({
        error: "Gmail pilot setup is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      code?: string;
      redirect_uri?: string;
    };

    if (!body.code || !body.redirect_uri) {
      return reply.status(400).send({
        error: "code and redirect_uri are required.",
        code: "missing_oauth_callback_params",
      });
    }

    const creds = await gmailPilotSetupService.getStoredOAuthAppSecrets(session.workspace.id, id);

    if (!creds) {
      const envClientId = process.env.GOOGLE_CLIENT_ID;
      const envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (!envClientId || !envClientSecret) {
        return reply.status(400).send({
          error: "No Google OAuth credentials configured. Save your Client ID and Client Secret first.",
          code: "oauth_credentials_not_configured",
        });
      }

      const setup = await gmailPilotSetupService.completeOAuthFlow(session.workspace.id, id, {
        clientId: envClientId,
        clientSecret: envClientSecret,
        authCode: body.code,
        redirectUri: body.redirect_uri,
      });

      await syncConfiguredGmailWatchedInboxRoutes(session.workspace.id, id);
      return reply.send(gmailPilotSetupResponseSchema.parse({ setup }));
    }

    const setup = await gmailPilotSetupService.completeOAuthFlow(session.workspace.id, id, {
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      authCode: body.code,
      redirectUri: body.redirect_uri,
    });

    await syncConfiguredGmailWatchedInboxRoutes(session.workspace.id, id);
    return reply.send(gmailPilotSetupResponseSchema.parse({ setup }));
  });
}
