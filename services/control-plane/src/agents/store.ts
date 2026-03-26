import { and, desc, eq, inArray } from "drizzle-orm";

import { createDb } from "@clawback/db";
import { agentVersions, agents, auditEvents } from "@clawback/db";

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

type ControlPlaneDb = ReturnType<typeof createDb>;

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

function mapAgent(row: typeof agents.$inferSelect): StoredAgent {
  return row;
}

function mapAgentVersion(row: typeof agentVersions.$inferSelect): StoredAgentVersion {
  return {
    ...row,
    personaJson: toRecord(row.personaJson),
    modelRoutingJson: toRecord(row.modelRoutingJson),
    toolPolicyJson: toRecord(row.toolPolicyJson),
    connectorPolicyJson: toRecord(row.connectorPolicyJson),
  };
}

function buildAggregates(
  agentRows: typeof agents.$inferSelect[],
  versionRows: typeof agentVersions.$inferSelect[],
) {
  const versionsByAgentId = new Map<string, { draft: StoredAgentVersion | null; published: StoredAgentVersion | null }>();

  for (const row of versionRows) {
    const mapped = mapAgentVersion(row);
    const entry = versionsByAgentId.get(mapped.agentId) ?? {
      draft: null,
      published: null,
    };

    if (mapped.status === "draft" && !entry.draft) {
      entry.draft = mapped;
    }

    if (mapped.status === "published" && !entry.published) {
      entry.published = mapped;
    }

    versionsByAgentId.set(mapped.agentId, entry);
  }

  return agentRows.map((row) => {
    const versions = versionsByAgentId.get(row.id) ?? {
      draft: null,
      published: null,
    };

    return {
      agent: mapAgent(row),
      draftVersion: versions.draft,
      publishedVersion: versions.published,
    } satisfies AgentAggregate;
  });
}

export class DrizzleAgentStore implements AgentStore {
  constructor(private readonly db: ControlPlaneDb) {}

  async runInTransaction<T>(callback: (store: AgentStore) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (tx) => {
      const store = new DrizzleAgentStore(tx as unknown as ControlPlaneDb);
      return await callback(store);
    });
  }

  async listAgentSlugs(workspaceId: string) {
    const rows = await this.db
      .select({ slug: agents.slug })
      .from(agents)
      .where(eq(agents.workspaceId, workspaceId));

    return rows.map((row) => row.slug);
  }

  async listAgentAggregates(workspaceId: string) {
    const agentRows = await this.db
      .select()
      .from(agents)
      .where(eq(agents.workspaceId, workspaceId))
      .orderBy(desc(agents.updatedAt), desc(agents.createdAt));

    if (agentRows.length === 0) {
      return [];
    }

    const agentIds = agentRows.map((row) => row.id);
    const versionRows = await this.db
      .select()
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.workspaceId, workspaceId),
          inArray(agentVersions.agentId, agentIds),
        ),
      )
      .orderBy(desc(agentVersions.versionNumber), desc(agentVersions.createdAt));

    return buildAggregates(agentRows, versionRows);
  }

  async findAgentAggregate(workspaceId: string, agentId: string) {
    const agentRow = await this.db.query.agents.findFirst({
      where: and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)),
    });

    if (!agentRow) {
      return null;
    }

    const versionRows = await this.db
      .select()
      .from(agentVersions)
      .where(
        and(eq(agentVersions.workspaceId, workspaceId), eq(agentVersions.agentId, agentId)),
      )
      .orderBy(desc(agentVersions.versionNumber), desc(agentVersions.createdAt));

    return buildAggregates([agentRow], versionRows)[0] ?? null;
  }

  async createAgent(input: CreateAgentInput) {
    const [row] = await this.db.insert(agents).values(input).returning();
    return mapAgent(expectRow(row, "agent"));
  }

  async createAgentVersion(input: CreateAgentVersionInput) {
    const [row] = await this.db.insert(agentVersions).values(input).returning();
    return mapAgentVersion(expectRow(row, "agent version"));
  }

  async updateAgent(agentId: string, input: UpdateAgentInput) {
    const [row] = await this.db.update(agents).set(input).where(eq(agents.id, agentId)).returning();
    return mapAgent(expectRow(row, "agent"));
  }

  async updateAgentVersion(versionId: string, input: UpdateAgentVersionInput) {
    const [row] = await this.db
      .update(agentVersions)
      .set(input)
      .where(eq(agentVersions.id, versionId))
      .returning();

    return mapAgentVersion(expectRow(row, "agent version"));
  }

  async supersedePublishedVersions(agentId: string) {
    await this.db
      .update(agentVersions)
      .set({ status: "superseded" })
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.status, "published")));
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
