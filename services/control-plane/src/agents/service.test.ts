import { beforeEach, describe, expect, it } from "vitest";

import type { SessionContext } from "@clawback/auth";

import { AgentService } from "./service.js";
import type {
  AgentAggregate,
  AgentStore,
  CreateAgentInput,
  CreateAgentVersionInput,
  StoredAgent,
  StoredAgentVersion,
  StoredAuditEvent,
  UpdateAgentInput,
  UpdateAgentVersionInput,
} from "./types.js";

class MemoryAgentStore implements AgentStore {
  agents: StoredAgent[] = [];
  versions: StoredAgentVersion[] = [];
  auditEvents: StoredAuditEvent[] = [];

  async runInTransaction<T>(callback: (store: AgentStore) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async listAgentSlugs(workspaceId: string) {
    return this.agents
      .filter((agent) => agent.workspaceId === workspaceId)
      .map((agent) => agent.slug);
  }

  async listAgentAggregates(workspaceId: string) {
    return this.agents
      .filter((agent) => agent.workspaceId === workspaceId)
      .map((agent) => this.buildAggregate(agent))
      .sort((left, right) => right.agent.updatedAt.getTime() - left.agent.updatedAt.getTime());
  }

  async findAgentAggregate(workspaceId: string, agentId: string) {
    const agent = this.agents.find(
      (entry) => entry.workspaceId === workspaceId && entry.id === agentId,
    );
    return agent ? this.buildAggregate(agent) : null;
  }

  async createAgent(input: CreateAgentInput) {
    this.agents.push({ ...input });
    return { ...input };
  }

  async createAgentVersion(input: CreateAgentVersionInput) {
    this.versions.push({ ...input });
    return { ...input };
  }

  async updateAgent(agentId: string, input: UpdateAgentInput) {
    const agent = this.agents.find((entry) => entry.id === agentId);
    if (!agent) {
      throw new Error("agent not found");
    }

    Object.assign(agent, input);
    return { ...agent };
  }

  async updateAgentVersion(versionId: string, input: UpdateAgentVersionInput) {
    const version = this.versions.find((entry) => entry.id === versionId);
    if (!version) {
      throw new Error("version not found");
    }

    Object.assign(version, input);
    return { ...version };
  }

  async supersedePublishedVersions(agentId: string) {
    for (const version of this.versions) {
      if (version.agentId === agentId && version.status === "published") {
        version.status = "superseded";
      }
    }
  }

  async appendAuditEvent(event: StoredAuditEvent) {
    this.auditEvents.push(event);
  }

  private buildAggregate(agent: StoredAgent): AgentAggregate {
    const agentVersions = this.versions
      .filter((version) => version.agentId === agent.id)
      .sort((left, right) => right.versionNumber - left.versionNumber);

    return {
      agent: { ...agent },
      draftVersion:
        agentVersions.find((version) => version.status === "draft") ?? null,
      publishedVersion:
        agentVersions.find((version) => version.status === "published") ?? null,
    };
  }
}

function createSessionContext(params: {
  userId: string;
  email: string;
  displayName: string;
  role: "admin" | "user";
}): SessionContext {
  return {
    session: {
      id: `ses_${params.userId}`,
      workspaceId: "ws_1",
      userId: params.userId,
      tokenHash: `tok_${params.userId}`,
      expiresAt: new Date("2026-03-20T12:00:00Z"),
      revokedAt: null,
      lastSeenAt: new Date("2026-03-10T12:00:00Z"),
      createdAt: new Date("2026-03-10T12:00:00Z"),
    },
    user: {
      id: params.userId,
      email: params.email,
      normalizedEmail: params.email,
      displayName: params.displayName,
      kind: "human",
      status: "active",
      createdAt: new Date("2026-03-10T12:00:00Z"),
      updatedAt: new Date("2026-03-10T12:00:00Z"),
    },
    workspace: {
      id: "ws_1",
      slug: "acme",
      name: "Acme",
      status: "active",
      settingsJson: {},
      createdAt: new Date("2026-03-10T12:00:00Z"),
      updatedAt: new Date("2026-03-10T12:00:00Z"),
    },
    membership: {
      workspaceId: "ws_1",
      userId: params.userId,
      role: params.role,
      createdAt: new Date("2026-03-10T12:00:00Z"),
    },
  };
}

describe("AgentService", () => {
  let store: MemoryAgentStore;
  let service: AgentService;
  let admin: SessionContext;
  let user: SessionContext;
  let otherUser: SessionContext;

  beforeEach(() => {
    store = new MemoryAgentStore();
    service = new AgentService({
      store,
      now: () => new Date("2026-03-10T12:00:00Z"),
    });
    admin = createSessionContext({
      userId: "usr_admin",
      email: "admin@example.com",
      displayName: "Admin",
      role: "admin",
    });
    user = createSessionContext({
      userId: "usr_user",
      email: "user@example.com",
      displayName: "User",
      role: "user",
    });
    otherUser = createSessionContext({
      userId: "usr_other",
      email: "other@example.com",
      displayName: "Other",
      role: "user",
    });
  });

  it("lets an admin create and publish a shared agent, then exposes only the published view to standard users", async () => {
    const created = await service.createAgent(admin, {
      name: "Support Assistant",
      scope: "shared",
    });

    expect(created.scope).toBe("shared");
    expect(created.draft_version?.version_number).toBe(1);
    expect(created.published_version).toBeNull();

    const updatedDraft = await service.updateDraft(admin, created.id, {
      instructions_markdown: "Answer support questions clearly.",
    });
    expect(updatedDraft.draft.instructions_markdown).toBe("Answer support questions clearly.");

    const published = await service.publishAgent(admin, created.id, {
      expected_draft_version_id: created.draft_version!.id,
    });

    expect(published.published_version.id).toBe(created.draft_version?.id);
    expect(published.published_version.status).toBe("published");
    expect(published.draft_version.version_number).toBe(2);
    expect(published.runtime_publication.runtime_agent_id).toBe(
      `cb_${published.published_version.id}`.toLowerCase(),
    );

    const visibleToUser = await service.listAgents(user);
    expect(visibleToUser.agents).toHaveLength(1);
    expect(visibleToUser.agents[0]?.published_version?.id).toBe(published.published_version.id);
    expect(visibleToUser.agents[0]?.draft_version).toBeNull();

    expect(store.auditEvents.map((event) => event.eventType)).toEqual([
      "agent.created",
      "agent.published",
    ]);
  });

  it("lets a user manage only their own personal agents", async () => {
    const created = await service.createAgent(user, {
      name: "My Research Agent",
      scope: "personal",
    });

    expect(created.scope).toBe("personal");
    expect(created.owner_user_id).toBe(user.user.id);

    const listForOwner = await service.listAgents(user);
    expect(listForOwner.agents).toHaveLength(1);

    const listForOtherUser = await service.listAgents(otherUser);
    expect(listForOtherUser.agents).toHaveLength(0);

    await expect(
      service.createAgent(user, {
        name: "Company Assistant",
        scope: "shared",
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });

    await expect(service.getAgent(otherUser, created.id)).rejects.toMatchObject({
      code: "agent_not_found",
      statusCode: 404,
    });

    await expect(
      service.updateDraft(otherUser, created.id, {
        instructions_markdown: "Steal ownership.",
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
      statusCode: 403,
    });

    const published = await service.publishAgent(user, created.id, {
      expected_draft_version_id: created.draft_version!.id,
    });

    expect(published.published_version.status).toBe("published");
    expect(published.draft_version.version_number).toBe(2);
  });
});
