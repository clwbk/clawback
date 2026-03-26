import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type ApprovalSurfaceIdentityRow = typeof schema.approvalSurfaceIdentities.$inferSelect;
export type ApprovalSurfaceIdentityInsert = typeof schema.approvalSurfaceIdentities.$inferInsert;
export type ApprovalSurfaceIdentityUpdate = Partial<
  Pick<
    ApprovalSurfaceIdentityInsert,
    "externalIdentity" | "label" | "status" | "updatedAt"
  >
>;

export function createApprovalSurfaceIdentityQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<ApprovalSurfaceIdentityRow[]> {
      return db
        .select()
        .from(schema.approvalSurfaceIdentities)
        .where(eq(schema.approvalSurfaceIdentities.workspaceId, workspaceId))
        .orderBy(
          asc(schema.approvalSurfaceIdentities.channel),
          asc(schema.approvalSurfaceIdentities.label),
          asc(schema.approvalSurfaceIdentities.createdAt),
        );
    },

    async findById(workspaceId: string, id: string): Promise<ApprovalSurfaceIdentityRow | null> {
      const row = await db.query.approvalSurfaceIdentities.findFirst({
        where: and(
          eq(schema.approvalSurfaceIdentities.workspaceId, workspaceId),
          eq(schema.approvalSurfaceIdentities.id, id),
        ),
      });
      return row ?? null;
    },

    async findByChannelAndUser(
      workspaceId: string,
      channel: ApprovalSurfaceIdentityRow["channel"],
      userId: string,
    ): Promise<ApprovalSurfaceIdentityRow | null> {
      const row = await db.query.approvalSurfaceIdentities.findFirst({
        where: and(
          eq(schema.approvalSurfaceIdentities.workspaceId, workspaceId),
          eq(schema.approvalSurfaceIdentities.channel, channel),
          eq(schema.approvalSurfaceIdentities.userId, userId),
        ),
      });
      return row ?? null;
    },

    async findByChannelAndIdentity(
      workspaceId: string,
      channel: ApprovalSurfaceIdentityRow["channel"],
      externalIdentity: string,
    ): Promise<ApprovalSurfaceIdentityRow | null> {
      const row = await db.query.approvalSurfaceIdentities.findFirst({
        where: and(
          eq(schema.approvalSurfaceIdentities.workspaceId, workspaceId),
          eq(schema.approvalSurfaceIdentities.channel, channel),
          eq(schema.approvalSurfaceIdentities.externalIdentity, externalIdentity),
        ),
      });
      return row ?? null;
    },

    async create(input: ApprovalSurfaceIdentityInsert): Promise<ApprovalSurfaceIdentityRow> {
      const [row] = await db.insert(schema.approvalSurfaceIdentities).values(input).returning();
      if (!row) throw new Error("Expected approval surface identity row to be returned.");
      return row;
    },

    async update(id: string, input: ApprovalSurfaceIdentityUpdate): Promise<ApprovalSurfaceIdentityRow> {
      const [row] = await db
        .update(schema.approvalSurfaceIdentities)
        .set(input)
        .where(eq(schema.approvalSurfaceIdentities.id, id))
        .returning();
      if (!row) throw new Error("Expected approval surface identity row to be returned.");
      return row;
    },

    async remove(id: string): Promise<void> {
      await db.delete(schema.approvalSurfaceIdentities).where(eq(schema.approvalSurfaceIdentities.id, id));
    },
  };
}
