import { z } from "zod";

import { userRefSchema, workspaceRoleSchema } from "./common.js";

export const workspacePersonRecordSchema = userRefSchema.extend({
  role: workspaceRoleSchema,
});

export type WorkspacePersonRecord = z.infer<typeof workspacePersonRecordSchema>;

export const workspacePeopleListResponseSchema = z.object({
  people: z.array(workspacePersonRecordSchema),
});

export type WorkspacePeopleListResponse = z.infer<typeof workspacePeopleListResponseSchema>;
