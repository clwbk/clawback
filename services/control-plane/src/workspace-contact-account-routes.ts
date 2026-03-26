import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  type RelationshipClass,
  accountListResponseSchema,
  accountRecordSchema,
  contactListResponseSchema,
  contactRecordSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

import type { AccountService, UpdateAccountInput } from "./accounts/index.js";
import { AccountNotFoundError } from "./accounts/index.js";
import type { ContactService, UpdateContactInput } from "./contacts/index.js";
import { ContactNotFoundError } from "./contacts/index.js";

type WorkspaceContactAccountRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  contactService: ContactService | undefined;
  accountService: AccountService | undefined;
};

function sendFeatureNotConfigured(reply: FastifyReply, feature: string) {
  return reply.code(501).send({
    error: `${feature} service is not configured.`,
    code: "feature_not_configured",
  });
}

export function registerWorkspaceContactAccountRoutes(
  app: FastifyInstance,
  options: WorkspaceContactAccountRoutesOptions,
) {
  const { ensureSession, contactService, accountService } = options;

  app.get("/api/workspace/contacts", async (request, reply) => {
    if (!contactService) {
      return sendFeatureNotConfigured(reply, "Contact");
    }

    const session = ensureSession(request);
    const result = await contactService.list(session.workspace.id);
    return reply.send(contactListResponseSchema.parse(result));
  });

  app.post("/api/workspace/contacts", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!contactService) {
      return sendFeatureNotConfigured(reply, "Contact");
    }

    const session = ensureSession(request);
    const body = request.body as Record<string, unknown>;
    const result = await contactService.create(session.workspace.id, {
      primaryEmail: body.primary_email as string,
      displayName: body.display_name as string,
      accountId: (body.account_id as string | null) ?? null,
      relationshipClass: (body.relationship_class as RelationshipClass | null) ?? null,
      ownerUserId: (body.owner_user_id as string | null) ?? null,
      handlingNote: (body.handling_note as string | null) ?? null,
      doNotAutoReply: typeof body.do_not_auto_reply === "boolean" ? body.do_not_auto_reply : false,
    });
    return reply.status(201).send(contactRecordSchema.parse(result));
  });

  app.patch("/api/workspace/contacts/:id", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!contactService) {
      return sendFeatureNotConfigured(reply, "Contact");
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    try {
      const input: UpdateContactInput = {};
      if (body.primary_email !== undefined) input.primaryEmail = body.primary_email as string;
      if (body.display_name !== undefined) input.displayName = body.display_name as string;
      if ("account_id" in body) input.accountId = body.account_id as string | null;
      if (body.relationship_class !== undefined) {
        input.relationshipClass = body.relationship_class as RelationshipClass | null;
      }
      if ("owner_user_id" in body) input.ownerUserId = body.owner_user_id as string | null;
      if ("handling_note" in body) input.handlingNote = body.handling_note as string | null;
      if (body.do_not_auto_reply !== undefined) input.doNotAutoReply = body.do_not_auto_reply as boolean;

      const result = await contactService.update(session.workspace.id, id, input);
      return reply.send(contactRecordSchema.parse(result));
    } catch (error) {
      if (error instanceof ContactNotFoundError) {
        return reply.status(404).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.get("/api/workspace/accounts", async (request, reply) => {
    if (!accountService) {
      return sendFeatureNotConfigured(reply, "Account");
    }

    const session = ensureSession(request);
    const result = await accountService.list(session.workspace.id);
    return reply.send(accountListResponseSchema.parse(result));
  });

  app.post("/api/workspace/accounts", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!accountService) {
      return sendFeatureNotConfigured(reply, "Account");
    }

    const session = ensureSession(request);
    const body = request.body as Record<string, unknown>;
    const result = await accountService.create(session.workspace.id, {
      name: body.name as string,
      primaryDomain: (body.primary_domain as string | null) ?? null,
      relationshipClass: (body.relationship_class as RelationshipClass | null) ?? null,
      ownerUserId: (body.owner_user_id as string | null) ?? null,
      handlingNote: (body.handling_note as string | null) ?? null,
    });
    return reply.status(201).send(accountRecordSchema.parse(result));
  });

  app.patch("/api/workspace/accounts/:id", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!accountService) {
      return sendFeatureNotConfigured(reply, "Account");
    }

    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    try {
      const input: UpdateAccountInput = {};
      if (body.name !== undefined) input.name = body.name as string;
      if ("primary_domain" in body) input.primaryDomain = body.primary_domain as string | null;
      if (body.relationship_class !== undefined) {
        input.relationshipClass = body.relationship_class as RelationshipClass | null;
      }
      if ("owner_user_id" in body) input.ownerUserId = body.owner_user_id as string | null;
      if ("handling_note" in body) input.handlingNote = body.handling_note as string | null;

      const result = await accountService.update(session.workspace.id, id, input);
      return reply.send(accountRecordSchema.parse(result));
    } catch (error) {
      if (error instanceof AccountNotFoundError) {
        return reply.status(404).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });
}
