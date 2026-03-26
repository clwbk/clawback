import {
  createInvitationRequestSchema,
  claimInvitationRequestSchema,
  loginRequestSchema,
} from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import { AuthServiceError } from "./errors.js";
import { hashPassword, verifyPasswordHash } from "./password.js";
import { hashOpaqueToken, normalizeEmail, createOpaqueToken } from "./tokens.js";
import type {
  AuthResult,
  AuthServiceContract,
  AuthStore,
  BootstrapAdminInput,
  ClaimInvitationInput,
  CreateInvitationInputDto,
  InvitationView,
  LoginInput,
  SessionContext,
  SessionView,
  UserMembershipContext,
} from "./types.js";

type AuthServiceOptions = {
  store: AuthStore;
  now?: () => Date;
  inviteTtlMs?: number;
  sessionTtlMs?: number;
};

export class AuthService implements AuthServiceContract {
  private readonly now: () => Date;
  private readonly inviteTtlMs: number;
  private readonly sessionTtlMs: number;

  constructor(private readonly options: AuthServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.inviteTtlMs = options.inviteTtlMs ?? 1000 * 60 * 60 * 24 * 7;
    this.sessionTtlMs = options.sessionTtlMs ?? 1000 * 60 * 60 * 24 * 7;
  }

  async getSetupStatus() {
    return {
      bootstrapped: (await this.options.store.countWorkspaces()) > 0,
    };
  }

  async bootstrapAdmin(input: BootstrapAdminInput) {
    if ((await this.options.store.countWorkspaces()) > 0) {
      throw new AuthServiceError({
        code: "already_bootstrapped",
        message: "The workspace has already been bootstrapped.",
        statusCode: 409,
      });
    }

    const normalizedEmail = normalizeEmail(input.email);
    const now = this.now();
    const passwordHash = await hashPassword(input.password);

    return await this.options.store.runInTransaction(async (store) => {
      const workspace = await store.createWorkspace({
        id: createClawbackId("ws"),
        slug: input.workspaceSlug,
        name: input.workspaceName,
        status: "active",
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      });

      const user = await store.createUser({
        id: createClawbackId("usr"),
        email: normalizedEmail,
        normalizedEmail,
        displayName: input.displayName,
        kind: "human",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await store.createIdentity({
        id: createClawbackId("ident"),
        userId: user.id,
        provider: "local-password",
        subject: normalizedEmail,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      const membership = await store.createMembership({
        workspaceId: workspace.id,
        userId: user.id,
        role: "admin",
        createdAt: now,
      });

      await store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: workspace.id,
        actorType: "user",
        actorId: user.id,
        eventType: "workspace.bootstrap_admin",
        targetType: "workspace",
        targetId: workspace.id,
        summary: "Bootstrap admin created the workspace",
        payloadJson: {
          workspace_slug: workspace.slug,
          email: user.email,
        },
        occurredAt: now,
      });

      return await this.createSessionForContext(store, {
        user,
        workspace,
        membership,
      });
    });
  }

  async login(input: LoginInput) {
    const parsed = loginRequestSchema.safeParse({
      email: input.email,
      password: input.password,
    });

    if (!parsed.success) {
      throw new AuthServiceError({
        code: "invalid_login",
        message: "Invalid login payload.",
        statusCode: 400,
      });
    }

    const normalizedEmail = normalizeEmail(input.email);
    const identityRow = await this.options.store.findLocalIdentityWithUserByEmail(normalizedEmail);
    if (!identityRow?.identity.passwordHash) {
      throw new AuthServiceError({
        code: "invalid_credentials",
        message: "Invalid email or password.",
        statusCode: 401,
      });
    }

    const verified = await verifyPasswordHash(identityRow.identity.passwordHash, input.password);
    if (!verified) {
      throw new AuthServiceError({
        code: "invalid_credentials",
        message: "Invalid email or password.",
        statusCode: 401,
      });
    }

    const context = await this.getPrimaryMembershipContext(identityRow.user.id);
    return await this.createSessionForContext(this.options.store, context);
  }

  async getSessionFromToken(sessionToken: string) {
    const tokenHash = hashOpaqueToken(sessionToken);
    const context = await this.options.store.findSessionByTokenHash(tokenHash);
    if (!context) {
      return null;
    }

    await this.options.store.touchSession(context.session.id, this.now());
    return context;
  }

  async logout(sessionToken: string) {
    const context = await this.getSessionFromToken(sessionToken);
    if (!context) {
      return;
    }

    await this.options.store.revokeSession(context.session.id, this.now());
  }

  async createInvitation(actor: SessionContext, input: CreateInvitationInputDto) {
    const parsed = createInvitationRequestSchema.safeParse({
      email: input.email,
      role: input.role,
      expires_at: input.expiresAt?.toISOString(),
    });

    if (!parsed.success) {
      throw new AuthServiceError({
        code: "invalid_invitation",
        message: "Invalid invitation payload.",
        statusCode: 400,
      });
    }

    if (actor.membership.role !== "admin") {
      throw new AuthServiceError({
        code: "forbidden",
        message: "Only admins can create invitations.",
        statusCode: 403,
      });
    }

    const now = this.now();
    const token = createOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    const invitation = await this.options.store.createInvitation({
      id: createClawbackId("inv"),
      workspaceId: actor.workspace.id,
      email: normalizeEmail(input.email),
      role: input.role,
      tokenHash,
      invitedBy: actor.user.id,
      expiresAt: input.expiresAt ?? new Date(now.getTime() + this.inviteTtlMs),
      acceptedAt: null,
      createdAt: now,
    });

    await this.options.store.appendAuditEvent({
      id: createClawbackId("aud"),
      workspaceId: actor.workspace.id,
      actorType: "user",
      actorId: actor.user.id,
      eventType: "invitation.created",
      targetType: "invitation",
      targetId: invitation.id,
      summary: "Invitation created",
      payloadJson: {
        email: invitation.email,
        role: invitation.role,
      },
      occurredAt: now,
    });

    return {
      invitation: this.toInvitationView(invitation),
      token,
    };
  }

  async claimInvitation(input: ClaimInvitationInput) {
    const parsed = claimInvitationRequestSchema.safeParse({
      token: input.token,
      display_name: input.displayName,
      password: input.password,
    });
    if (!parsed.success) {
      throw new AuthServiceError({
        code: "invalid_claim",
        message: "Invalid invitation claim payload.",
        statusCode: 400,
      });
    }

    const now = this.now();
    const tokenHash = hashOpaqueToken(parsed.data.token);
    const invitation = await this.options.store.findActiveInvitationByTokenHash(tokenHash, now);
    if (!invitation) {
      throw new AuthServiceError({
        code: "invalid_invite",
        message: "Invalid or expired invite link.",
        statusCode: 410,
      });
    }

    const normalizedEmail = normalizeEmail(invitation.email);
    if (await this.options.store.findUserByNormalizedEmail(normalizedEmail)) {
      throw new AuthServiceError({
        code: "email_taken",
        message: "A user with this email already exists.",
        statusCode: 409,
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);

    return await this.options.store.runInTransaction(async (store) => {
      const user = await store.createUser({
        id: createClawbackId("usr"),
        email: normalizedEmail,
        normalizedEmail,
        displayName: parsed.data.display_name,
        kind: "human",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      await store.createIdentity({
        id: createClawbackId("ident"),
        userId: user.id,
        provider: "local-password",
        subject: normalizedEmail,
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      const membership = await store.createMembership({
        workspaceId: invitation.workspaceId,
        userId: user.id,
        role: invitation.role,
        createdAt: now,
      });

      await store.markInvitationAccepted(invitation.id, now);
      const context = await this.getPrimaryMembershipContext(user.id, store);

      await store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: invitation.workspaceId,
        actorType: "user",
        actorId: user.id,
        eventType: "invitation.claimed",
        targetType: "invitation",
        targetId: invitation.id,
        summary: "Invitation claimed",
        payloadJson: {
          role: membership.role,
          email: user.email,
        },
        occurredAt: now,
      });

      return await this.createSessionForContext(store, context);
    });
  }

  private async getPrimaryMembershipContext(
    userId: string,
    store: AuthStore = this.options.store,
  ): Promise<UserMembershipContext> {
    const memberships = await store.findMembershipsForUser(userId);
    const context = memberships[0];

    if (!context) {
      throw new AuthServiceError({
        code: "no_membership",
        message: "No workspace membership exists for this user.",
        statusCode: 403,
      });
    }

    return context;
  }

  private async createSessionForContext(store: AuthStore, context: UserMembershipContext): Promise<AuthResult> {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs);
    const sessionToken = createOpaqueToken();

    await store.createSession({
      id: createClawbackId("ses"),
      workspaceId: context.workspace.id,
      userId: context.user.id,
      tokenHash: hashOpaqueToken(sessionToken),
      expiresAt,
      revokedAt: null,
      lastSeenAt: now,
      createdAt: now,
    });

    return {
      sessionToken,
      session: this.toSessionView(context),
    };
  }

  private toSessionView(context: UserMembershipContext): SessionView {
    return {
      user: {
        id: context.user.id,
        email: context.user.email,
        display_name: context.user.displayName,
      },
      workspace: {
        id: context.workspace.id,
        slug: context.workspace.slug,
        name: context.workspace.name,
      },
      membership: {
        role: context.membership.role,
      },
    };
  }

  private toInvitationView(invitation: {
    id: string;
    email: string;
    role: "admin" | "user";
    expiresAt: Date;
    acceptedAt: Date | null;
    createdAt: Date;
  }): InvitationView {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expires_at: invitation.expiresAt.toISOString(),
      accepted_at: invitation.acceptedAt ? invitation.acceptedAt.toISOString() : null,
      created_at: invitation.createdAt.toISOString(),
    };
  }
}
