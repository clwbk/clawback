import type { z } from "zod";

import type {
  authenticatedSessionResponseSchema,
  invitationSchema,
  sessionResponseSchema,
} from "@clawback/contracts";

export const SESSION_COOKIE_NAME = "clawback_session";
export const LOCAL_PASSWORD_PROVIDER = "local-password";

export type MembershipRole = "admin" | "user";
export type SessionView = z.infer<typeof sessionResponseSchema>;
export type AuthenticatedSessionView = z.infer<typeof authenticatedSessionResponseSchema>;
export type InvitationView = z.infer<typeof invitationSchema>;

export type StoredWorkspace = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  settingsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredUser = {
  id: string;
  email: string;
  normalizedEmail: string;
  displayName: string;
  kind: "human" | "service";
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
};

export type StoredIdentity = {
  id: string;
  userId: string;
  provider: "local-password" | "oidc" | "service-token";
  subject: string;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredMembership = {
  workspaceId: string;
  userId: string;
  role: MembershipRole;
  createdAt: Date;
};

export type StoredSession = {
  id: string;
  workspaceId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
  createdAt: Date;
};

export type StoredInvitation = {
  id: string;
  workspaceId: string;
  email: string;
  role: MembershipRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

export type StoredAuditEvent = {
  id: string;
  workspaceId: string;
  actorType: "user" | "service" | "system";
  actorId: string;
  eventType: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  payloadJson: Record<string, unknown>;
  occurredAt: Date;
};

export type SessionContext = {
  session: StoredSession;
  user: StoredUser;
  workspace: StoredWorkspace;
  membership: StoredMembership;
};

export type UserMembershipContext = {
  user: StoredUser;
  workspace: StoredWorkspace;
  membership: StoredMembership;
};

export type CreateWorkspaceInput = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  settingsJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  id: string;
  email: string;
  normalizedEmail: string;
  displayName: string;
  kind: "human" | "service";
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
};

export type CreateIdentityInput = {
  id: string;
  userId: string;
  provider: "local-password" | "oidc" | "service-token";
  subject: string;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMembershipInput = StoredMembership;
export type CreateSessionInput = StoredSession;
export type CreateInvitationInput = StoredInvitation;

export interface AuthStore {
  runInTransaction<T>(callback: (store: AuthStore) => Promise<T>): Promise<T>;
  countWorkspaces(): Promise<number>;
  findUserByNormalizedEmail(normalizedEmail: string): Promise<StoredUser | null>;
  findIdentityByProviderSubject(
    provider: StoredIdentity["provider"],
    subject: string,
  ): Promise<StoredIdentity | null>;
  findLocalIdentityWithUserByEmail(
    normalizedEmail: string,
  ): Promise<{ identity: StoredIdentity; user: StoredUser } | null>;
  findMembershipsForUser(userId: string): Promise<UserMembershipContext[]>;
  createWorkspace(input: CreateWorkspaceInput): Promise<StoredWorkspace>;
  createUser(input: CreateUserInput): Promise<StoredUser>;
  createIdentity(input: CreateIdentityInput): Promise<StoredIdentity>;
  createMembership(input: CreateMembershipInput): Promise<StoredMembership>;
  createSession(input: CreateSessionInput): Promise<StoredSession>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionContext | null>;
  touchSession(sessionId: string, lastSeenAt: Date): Promise<void>;
  revokeSession(sessionId: string, revokedAt: Date): Promise<void>;
  createInvitation(input: CreateInvitationInput): Promise<StoredInvitation>;
  findActiveInvitationByTokenHash(tokenHash: string, now: Date): Promise<StoredInvitation | null>;
  markInvitationAccepted(invitationId: string, acceptedAt: Date): Promise<void>;
  appendAuditEvent(event: StoredAuditEvent): Promise<void>;
}

export type BootstrapAdminInput = {
  workspaceName: string;
  workspaceSlug: string;
  email: string;
  displayName: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type CreateInvitationInputDto = {
  email: string;
  role: MembershipRole;
  expiresAt?: Date;
};

export type ClaimInvitationInput = {
  token: string;
  displayName: string;
  password: string;
};

export type AuthResult = {
  sessionToken: string;
  session: SessionView;
};

export interface AuthServiceContract {
  getSetupStatus(): Promise<{ bootstrapped: boolean }>;
  bootstrapAdmin(input: BootstrapAdminInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  getSessionFromToken(sessionToken: string): Promise<SessionContext | null>;
  logout(sessionToken: string): Promise<void>;
  createInvitation(
    actor: SessionContext,
    input: CreateInvitationInputDto,
  ): Promise<{ invitation: InvitationView; token: string }>;
  claimInvitation(input: ClaimInvitationInput): Promise<AuthResult>;
}
