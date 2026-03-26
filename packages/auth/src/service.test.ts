import { describe, expect, it } from "vitest";

import { AuthService } from "./service.js";
import type {
  AuthStore,
  CreateIdentityInput,
  CreateInvitationInput,
  CreateMembershipInput,
  CreateSessionInput,
  CreateUserInput,
  CreateWorkspaceInput,
  SessionContext,
  StoredAuditEvent,
  StoredIdentity,
  StoredInvitation,
  StoredMembership,
  StoredSession,
  StoredUser,
  StoredWorkspace,
  UserMembershipContext,
} from "./types.js";

class MemoryAuthStore implements AuthStore {
  workspaces: StoredWorkspace[] = [];
  users: StoredUser[] = [];
  identities: StoredIdentity[] = [];
  memberships: StoredMembership[] = [];
  sessions: StoredSession[] = [];
  invitations: StoredInvitation[] = [];
  auditEvents: StoredAuditEvent[] = [];

  async runInTransaction<T>(callback: (store: AuthStore) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async countWorkspaces() {
    return this.workspaces.length;
  }

  async findUserByNormalizedEmail(normalizedEmail: string) {
    return this.users.find((user) => user.normalizedEmail === normalizedEmail) ?? null;
  }

  async findIdentityByProviderSubject(provider: StoredIdentity["provider"], subject: string) {
    return this.identities.find((identity) => identity.provider === provider && identity.subject === subject) ?? null;
  }

  async findLocalIdentityWithUserByEmail(normalizedEmail: string) {
    const identity = this.identities.find(
      (entry) => entry.provider === "local-password" && entry.subject === normalizedEmail,
    );
    if (!identity) {
      return null;
    }

    const user = this.users.find((entry) => entry.id === identity.userId);
    if (!user) {
      return null;
    }

    return { identity, user };
  }

  async findMembershipsForUser(userId: string) {
    return this.memberships
      .filter((membership) => membership.userId === userId)
      .map((membership) => {
        const user = this.users.find((entry) => entry.id === membership.userId);
        const workspace = this.workspaces.find((entry) => entry.id === membership.workspaceId);
        if (!user || !workspace) {
          throw new Error("broken memory store");
        }
        return { user, workspace, membership };
      }) satisfies UserMembershipContext[];
  }

  async createWorkspace(input: CreateWorkspaceInput) {
    this.workspaces.push(input);
    return input;
  }

  async createUser(input: CreateUserInput) {
    this.users.push(input);
    return input;
  }

  async createIdentity(input: CreateIdentityInput) {
    this.identities.push(input);
    return input;
  }

  async createMembership(input: CreateMembershipInput) {
    this.memberships.push(input);
    return input;
  }

  async createSession(input: CreateSessionInput) {
    this.sessions.push(input);
    return input;
  }

  async findSessionByTokenHash(tokenHash: string) {
    const session = this.sessions.find(
      (entry) => entry.tokenHash === tokenHash && !entry.revokedAt && entry.expiresAt > new Date(),
    );
    if (!session) {
      return null;
    }

    const user = this.users.find((entry) => entry.id === session.userId);
    const workspace = this.workspaces.find((entry) => entry.id === session.workspaceId);
    const membership = this.memberships.find(
      (entry) => entry.workspaceId === session.workspaceId && entry.userId === session.userId,
    );
    if (!user || !workspace || !membership) {
      return null;
    }

    return { session, user, workspace, membership } satisfies SessionContext;
  }

  async touchSession(sessionId: string, lastSeenAt: Date) {
    const session = this.sessions.find((entry) => entry.id === sessionId);
    if (session) {
      session.lastSeenAt = lastSeenAt;
    }
  }

  async revokeSession(sessionId: string, revokedAt: Date) {
    const session = this.sessions.find((entry) => entry.id === sessionId);
    if (session) {
      session.revokedAt = revokedAt;
    }
  }

  async createInvitation(input: CreateInvitationInput) {
    this.invitations.push(input);
    return input;
  }

  async findActiveInvitationByTokenHash(tokenHash: string, now: Date) {
    return (
      this.invitations.find(
        (entry) => entry.tokenHash === tokenHash && !entry.acceptedAt && entry.expiresAt > now,
      ) ?? null
    );
  }

  async markInvitationAccepted(invitationId: string, acceptedAt: Date) {
    const invitation = this.invitations.find((entry) => entry.id === invitationId);
    if (invitation) {
      invitation.acceptedAt = acceptedAt;
    }
  }

  async appendAuditEvent(event: StoredAuditEvent) {
    this.auditEvents.push(event);
  }
}

describe("AuthService", () => {
  it("bootstraps the first admin and then allows login", async () => {
    const store = new MemoryAuthStore();
    const service = new AuthService({ store });

    const bootstrap = await service.bootstrapAdmin({
      workspaceName: "Acme",
      workspaceSlug: "acme",
      email: "admin@example.com",
      displayName: "Admin",
      password: "password123",
    });

    expect(bootstrap.session.membership.role).toBe("admin");
    expect(store.workspaces).toHaveLength(1);
    expect(store.identities[0]?.provider).toBe("local-password");

    const login = await service.login({
      email: "admin@example.com",
      password: "password123",
    });

    expect(login.session.user.email).toBe("admin@example.com");
    expect(store.sessions).toHaveLength(2);
  });

  it("creates an invitation and lets the invited user claim it", async () => {
    const store = new MemoryAuthStore();
    const service = new AuthService({ store });

    const bootstrap = await service.bootstrapAdmin({
      workspaceName: "Acme",
      workspaceSlug: "acme",
      email: "admin@example.com",
      displayName: "Admin",
      password: "password123",
    });

    const adminSession = await service.getSessionFromToken(bootstrap.sessionToken);
    expect(adminSession).not.toBeNull();

    const invite = await service.createInvitation(adminSession!, {
      email: "user@example.com",
      role: "user",
    });

    const claimed = await service.claimInvitation({
      token: invite.token,
      displayName: "User",
      password: "password123",
    });

    expect(claimed.session.user.email).toBe("user@example.com");
    expect(claimed.session.membership.role).toBe("user");
    expect(store.invitations[0]?.acceptedAt).not.toBeNull();
    expect(store.auditEvents.map((event) => event.eventType)).toEqual([
      "workspace.bootstrap_admin",
      "invitation.created",
      "invitation.claimed",
    ]);
  });
});
