import { z } from "zod";

export const clawbackIdSchema = z.string().min(1).max(64);
export const isoTimestampSchema = z.string().datetime({ offset: true });

export const workspaceRoleSchema = z.enum(["admin", "user"]);
export const channelSchema = z.enum(["web"]);

export const userRefSchema = z.object({
  id: clawbackIdSchema,
  email: z.email(),
  display_name: z.string().min(1),
});

export const workspaceRefSchema = z.object({
  id: clawbackIdSchema,
  slug: z.string().min(1),
  name: z.string().min(1),
});
