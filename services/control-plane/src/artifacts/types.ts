import type { z } from "zod";

import type { artifactListResponseSchema, getArtifactResponseSchema } from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

export type ArtifactListView = z.infer<typeof artifactListResponseSchema>;
export type ArtifactDetailView = z.infer<typeof getArtifactResponseSchema>;

export interface ArtifactServiceContract {
  listArtifacts(actor: SessionContext): Promise<ArtifactListView>;
  getArtifact(actor: SessionContext, artifactId: string): Promise<ArtifactDetailView>;
}
