import type { FastifyInstance, FastifyRequest } from "fastify";

import type { SessionContext } from "@clawback/auth";

import { GitHubSetupError, type GitHubConnectionService } from "./integrations/github/index.js";

type WorkspaceGitHubRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureAdmin: (request: FastifyRequest) => SessionContext;
  githubConnectionService: GitHubConnectionService | undefined;
};

export function registerWorkspaceGitHubRoutes(
  app: FastifyInstance,
  options: WorkspaceGitHubRoutesOptions,
) {
  const {
    ensureSession,
    ensureAdmin,
    githubConnectionService,
  } = options;

  // -------------------------------------------------------------------------
  // POST /api/workspace/connections/:id/github-setup
  // -------------------------------------------------------------------------

  app.post("/api/workspace/connections/:id/github-setup", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!githubConnectionService) {
      return reply.code(501).send({
        error: "GitHub connection service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      personal_access_token?: string;
      org?: string;
      repos?: string[];
    };

    if (!body.personal_access_token) {
      return reply.status(400).send({
        error: "personal_access_token is required.",
        code: "missing_github_token",
      });
    }

    try {
      const result = await githubConnectionService.setup(session.workspace.id, id, {
        personal_access_token: body.personal_access_token,
        ...(body.org ? { org: body.org } : {}),
        ...(body.repos ? { repos: body.repos } : {}),
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof GitHubSetupError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/workspace/connections/:id/github-status
  // -------------------------------------------------------------------------

  app.get("/api/workspace/connections/:id/github-status", async (request, reply) => {
    if (!githubConnectionService) {
      return reply.code(501).send({
        error: "GitHub connection service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };

    try {
      const result = await githubConnectionService.getStatus(session.workspace.id, id);
      return reply.send(result);
    } catch (error) {
      if (error instanceof GitHubSetupError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/workspace/connections/:id/github-probe
  // -------------------------------------------------------------------------

  app.post("/api/workspace/connections/:id/github-probe", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!githubConnectionService) {
      return reply.code(501).send({
        error: "GitHub connection service is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };

    try {
      const result = await githubConnectionService.probe(session.workspace.id, id);
      return reply.send(result);
    } catch (error) {
      if (error instanceof GitHubSetupError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });
}
