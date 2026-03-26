import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { createDb } from "@clawback/db";
import {
  auditEvents,
  identities,
  invitations,
  memberships,
  sessions,
  users,
  workspaces,
} from "@clawback/db";

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

type AuthDb = ReturnType<typeof createDb>;

function mapWorkspace(row: typeof workspaces.$inferSelect): StoredWorkspace {
  return {
    ...row,
    settingsJson: toRecord(row.settingsJson),
  };
}

function mapUser(row: typeof users.$inferSelect): StoredUser {
  return row;
}

function mapIdentity(row: typeof identities.$inferSelect): StoredIdentity {
  return row;
}

function mapMembership(row: typeof memberships.$inferSelect): StoredMembership {
  return row;
}

function mapSession(row: typeof sessions.$inferSelect): StoredSession {
  return row;
}

function mapInvitation(row: typeof invitations.$inferSelect): StoredInvitation {
  return row;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function expectRow<T>(row: T | undefined, entity: string): T {
  if (!row) {
    throw new Error(`Expected ${entity} row to be returned.`);
  }

  return row;
}

export class DrizzleAuthStore implements AuthStore {
  constructor(private readonly db: AuthDb) {}

  async runInTransaction<T>(callback: (store: AuthStore) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (tx) => {
      const store = new DrizzleAuthStore(tx as unknown as AuthDb);
      return await callback(store);
    });
  }

  async countWorkspaces() {
    const rows = await this.db.select({ id: workspaces.id }).from(workspaces).limit(1);
    return rows.length;
  }

  async findUserByNormalizedEmail(normalizedEmail: string) {
    const row = await this.db.query.users.findFirst({
      where: eq(users.normalizedEmail, normalizedEmail),
    });
    return row ? mapUser(row) : null;
  }

  async findIdentityByProviderSubject(provider: StoredIdentity["provider"], subject: string) {
    const row = await this.db.query.identities.findFirst({
      where: and(eq(identities.provider, provider), eq(identities.subject, subject)),
    });
    return row ? mapIdentity(row) : null;
  }

  async findLocalIdentityWithUserByEmail(normalizedEmail: string) {
    const rows = await this.db
      .select({
        identity: identities,
        user: users,
      })
      .from(identities)
      .innerJoin(users, eq(identities.userId, users.id))
      .where(
        and(eq(identities.provider, "local-password"), eq(identities.subject, normalizedEmail)),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      identity: mapIdentity(row.identity),
      user: mapUser(row.user),
    };
  }

  async findMembershipsForUser(userId: string) {
    const rows = await this.db
      .select({
        membership: memberships,
        workspace: workspaces,
        user: users,
      })
      .from(memberships)
      .innerJoin(workspaces, eq(memberships.workspaceId, workspaces.id))
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(memberships.createdAt));

    return rows.map((row) => ({
      membership: mapMembership(row.membership),
      workspace: mapWorkspace(row.workspace),
      user: mapUser(row.user),
    })) satisfies UserMembershipContext[];
  }

  async createWorkspace(input: CreateWorkspaceInput) {
    const [row] = await this.db.insert(workspaces).values(input).returning();
    return mapWorkspace(expectRow(row, "workspace"));
  }

  async createUser(input: CreateUserInput) {
    const [row] = await this.db.insert(users).values(input).returning();
    return mapUser(expectRow(row, "user"));
  }

  async createIdentity(input: CreateIdentityInput) {
    const [row] = await this.db.insert(identities).values(input).returning();
    return mapIdentity(expectRow(row, "identity"));
  }

  async createMembership(input: CreateMembershipInput) {
    const [row] = await this.db.insert(memberships).values(input).returning();
    return mapMembership(expectRow(row, "membership"));
  }

  async createSession(input: CreateSessionInput) {
    const [row] = await this.db.insert(sessions).values(input).returning();
    return mapSession(expectRow(row, "session"));
  }

  async findSessionByTokenHash(tokenHash: string) {
    const rows = await this.db
      .select({
        session: sessions,
        user: users,
        workspace: workspaces,
        membership: memberships,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .innerJoin(workspaces, eq(sessions.workspaceId, workspaces.id))
      .innerJoin(
        memberships,
        and(
          eq(memberships.workspaceId, sessions.workspaceId),
          eq(memberships.userId, sessions.userId),
        ),
      )
      .where(
        and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      session: mapSession(row.session),
      user: mapUser(row.user),
      workspace: mapWorkspace(row.workspace),
      membership: mapMembership(row.membership),
    } satisfies SessionContext;
  }

  async touchSession(sessionId: string, lastSeenAt: Date) {
    await this.db.update(sessions).set({ lastSeenAt }).where(eq(sessions.id, sessionId));
  }

  async revokeSession(sessionId: string, revokedAt: Date) {
    await this.db.update(sessions).set({ revokedAt }).where(eq(sessions.id, sessionId));
  }

  async createInvitation(input: CreateInvitationInput) {
    const [row] = await this.db.insert(invitations).values(input).returning();
    return mapInvitation(expectRow(row, "invitation"));
  }

  async findActiveInvitationByTokenHash(tokenHash: string, now: Date) {
    const row = await this.db.query.invitations.findFirst({
      where: and(
        eq(invitations.tokenHash, tokenHash),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, now),
      ),
    });

    return row ? mapInvitation(row) : null;
  }

  async markInvitationAccepted(invitationId: string, acceptedAt: Date) {
    await this.db
      .update(invitations)
      .set({ acceptedAt })
      .where(eq(invitations.id, invitationId));
  }

  async appendAuditEvent(event: StoredAuditEvent) {
    await this.db.insert(auditEvents).values({
      id: event.id,
      workspaceId: event.workspaceId,
      actorType: event.actorType,
      actorId: event.actorId,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.targetId,
      summary: event.summary,
      payloadJson: event.payloadJson,
      occurredAt: event.occurredAt,
    });
  }
}
