import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  connectors,
  createDb,
  createPool,
  documentChunks,
  documents,
  documentVersions,
  users,
  workspaces,
} from "@clawback/db";

import { searchRetrievalCorpus } from "./search.js";

const pool = createPool();
const db = createDb(pool);

let databaseAvailable = true;
try {
  await pool.query("select 1");
} catch {
  databaseAvailable = false;
  await pool.end();
}

const describeIfDatabase = databaseAvailable ? describe : describe.skip;

const suffix = Date.now().toString(36);
const workspaceId = `ws_retrieval_it_${suffix}`;
const userId = `usr_retrieval_it_${suffix}`;
const connectorAId = `con_retrieval_a_${suffix}`;
const connectorBId = `con_retrieval_b_${suffix}`;

async function insertDocumentFixture(input: {
  connectorId: string;
  documentId: string;
  versionId: string;
  externalId: string;
  pathOrUri: string;
  title: string | null;
  chunks: string[];
}) {
  await db.insert(documents).values({
    id: input.documentId,
    workspaceId,
    connectorId: input.connectorId,
    externalId: input.externalId,
    pathOrUri: input.pathOrUri,
    title: input.title,
    mimeType: "text/markdown",
    currentVersionId: input.versionId,
    aclHash: null,
    lastSyncedAt: new Date(),
  });

  await db.insert(documentVersions).values({
    id: input.versionId,
    workspaceId,
    connectorId: input.connectorId,
    documentId: input.documentId,
    contentHash: `${input.versionId}_hash`,
    contentText: input.chunks.join("\n\n"),
    sourceUpdatedAt: new Date(),
    byteSize: input.chunks.join("").length,
    metadataJson: {},
  });

  await db.insert(documentChunks).values(
    input.chunks.map((content, index) => ({
      id: `${input.versionId}_chunk_${index}`,
      workspaceId,
      connectorId: input.connectorId,
      documentId: input.documentId,
      documentVersionId: input.versionId,
      chunkIndex: index,
      contentText: content,
      tokenCount: content.split(/\s+/).length,
      metadataJson: {},
    })),
  );
}

describeIfDatabase("searchRetrievalCorpus postgres integration", () => {
  beforeAll(async () => {
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: `retrieval-it-${suffix}`,
      name: "Retrieval Integration Test",
      status: "active",
      settingsJson: {},
    });

    await db.insert(users).values({
      id: userId,
      email: `retrieval-it-${suffix}@example.com`,
      normalizedEmail: `retrieval-it-${suffix}@example.com`,
      displayName: "Retrieval Integration",
      kind: "human",
      status: "active",
    });

    await db.insert(connectors).values([
      {
        id: connectorAId,
        workspaceId,
        type: "local_directory",
        name: "Company Docs",
        status: "active",
        configJson: {
          root_path: "./docs",
          recursive: true,
          include_extensions: [".md"],
        },
        createdBy: userId,
      },
      {
        id: connectorBId,
        workspaceId,
        type: "local_directory",
        name: "Private Pricing",
        status: "active",
        configJson: {
          root_path: "./private",
          recursive: true,
          include_extensions: [".md"],
        },
        createdBy: userId,
      },
    ]);

    await insertDocumentFixture({
      connectorId: connectorAId,
      documentId: `doc_runbook_${suffix}`,
      versionId: `ver_runbook_${suffix}`,
      externalId: "failover-runbook",
      pathOrUri: "guides/failover-runbook.md",
      title: "Failover Runbook",
      chunks: [
        "The checkout service failed after failover because the API cached a stale primary target.",
        "After failover, rotate checkout traffic to the new writer and clear the stale target cache.",
      ],
    });

    await insertDocumentFixture({
      connectorId: connectorAId,
      documentId: `doc_helper_${suffix}`,
      versionId: `ver_helper_${suffix}`,
      externalId: "demo-questions",
      pathOrUri: "demo-questions.md",
      title: "Demo Questions",
      chunks: [
        "Why did checkout fail after failover? Use the failover runbook to answer this demo question.",
      ],
    });

    await insertDocumentFixture({
      connectorId: connectorAId,
      documentId: `doc_summary_${suffix}`,
      versionId: `ver_summary_${suffix}`,
      externalId: "incident-summary",
      pathOrUri: "ops/incident-summary.md",
      title: "Incident Summary",
      chunks: [
        "Checkout failed during the database failover window and was restored after traffic rotation.",
      ],
    });

    await insertDocumentFixture({
      connectorId: connectorBId,
      documentId: `doc_pricing_${suffix}`,
      versionId: `ver_pricing_${suffix}`,
      externalId: "pricing-policy",
      pathOrUri: "finance/pricing-policy.md",
      title: "Pricing Policy",
      chunks: [
        "Enterprise pricing policy requires finance approval before discounts exceed fifteen percent.",
      ],
    });
  });

  afterAll(async () => {
    if (!databaseAvailable) {
      return;
    }

    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it("ranks real documents above helper docs and dedupes matching chunks per document", async () => {
    const result = await searchRetrievalCorpus({
      db,
      workspaceId,
      actor: {
        userId,
        membershipRole: "admin",
      },
      connectorScope: {
        enabled: true,
        connectorIds: [connectorAId],
      },
      query: "Why did checkout fail after failover?",
      limit: 3,
    });

    expect(result.results).toHaveLength(3);
    expect(result.results[0]?.path_or_uri).toBe("guides/failover-runbook.md");
    expect(result.results[0]?.title).toBe("Failover Runbook");
    expect(new Set(result.results.map((row) => row.document_id)).size).toBe(result.results.length);

    const helperIndex = result.results.findIndex((row) => row.path_or_uri === "demo-questions.md");
    expect(helperIndex).toBeGreaterThan(0);
  });

  it("respects connector scope on the SQL search path", async () => {
    const outsideScope = await searchRetrievalCorpus({
      db,
      workspaceId,
      actor: {
        userId,
        membershipRole: "admin",
      },
      connectorScope: {
        enabled: true,
        connectorIds: [connectorAId],
      },
      query: "pricing policy approval discount",
      limit: 3,
    });

    expect(outsideScope.results).toHaveLength(0);

    const insideScope = await searchRetrievalCorpus({
      db,
      workspaceId,
      actor: {
        userId,
        membershipRole: "admin",
      },
      connectorScope: {
        enabled: true,
        connectorIds: [connectorAId, connectorBId],
      },
      query: "pricing policy approval discount",
      limit: 3,
    });

    expect(insideScope.results).toHaveLength(1);
    expect(insideScope.results[0]?.path_or_uri).toBe("finance/pricing-policy.md");
    expect(insideScope.results[0]?.connector_id).toBe(connectorBId);
  });
});
