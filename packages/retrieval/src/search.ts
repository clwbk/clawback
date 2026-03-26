import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  retrievalSearchRequestSchema,
  retrievalSearchResponseSchema,
} from "@clawback/contracts";
import { connectors, createDb, documentChunks, documents } from "@clawback/db";

type RetrievalDb = ReturnType<typeof createDb>;
export type RetrievalPromptStatus = "applied" | "no_results" | "failed";

const citationSnippetLength = 280;
const helperDocumentPenaltyPatterns = [
  "%/demo-questions.md",
  "%/test-questions.md",
  "%/readme.md",
  "demo-questions.md",
  "test-questions.md",
  "readme.md",
] as const;

const queryStopwords = new Set([
  "a",
  "about",
  "after",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "just",
  "last",
  "me",
  "my",
  "night",
  "of",
  "on",
  "or",
  "our",
  "please",
  "that",
  "the",
  "this",
  "to",
  "us",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "would",
  "why",
  "with",
  "you",
  "your",
]);

export function buildRetrievalQueryTokens(input: string) {
  return [...new Set(
    (input.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
      (token) => token.length >= 2 && !queryStopwords.has(token),
    ),
  )];
}

function buildRetrievalTsQuery(input: string) {
  const relaxedTokens = buildRetrievalQueryTokens(input);
  if (relaxedTokens.length > 0) {
    return relaxedTokens.join(" | ");
  }

  return input
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" | ");
}

export function buildCitationSnippet(
  content: string,
  query: string,
  maxLength = citationSnippetLength,
) {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) {
    return "";
  }

  if (normalizedContent.length <= maxLength) {
    return normalizedContent;
  }

  const queryTokens = buildRetrievalQueryTokens(query);
  const loweredContent = normalizedContent.toLowerCase();
  const anchorIndex = queryTokens
    .map((token) => loweredContent.indexOf(token))
    .find((index) => index >= 0);

  if (anchorIndex === undefined) {
    return `${normalizedContent.slice(0, maxLength).trimEnd()}...`;
  }

  const preferredLead = Math.floor(maxLength * 0.35);
  const start = Math.max(0, anchorIndex - preferredLead);
  const end = Math.min(normalizedContent.length, start + maxLength);
  const adjustedStart = Math.max(0, end - maxLength);
  const snippet = normalizedContent.slice(adjustedStart, end).trim();
  const prefix = adjustedStart > 0 ? "..." : "";
  const suffix = end < normalizedContent.length ? "..." : "";

  return `${prefix}${snippet}${suffix}`;
}

export async function searchRetrievalCorpus(params: {
  db: RetrievalDb;
  workspaceId: string;
  actor: {
    userId: string;
    membershipRole: "admin" | "user";
  };
  connectorScope: {
    enabled: boolean;
    connectorIds: string[];
  };
  query: string;
  limit?: number;
}) {
  const parsed = retrievalSearchRequestSchema.parse({
    workspace_id: params.workspaceId,
    actor: {
      user_id: params.actor.userId,
      membership_role: params.actor.membershipRole,
    },
    connector_scope: {
      enabled: params.connectorScope.enabled,
      connector_ids: params.connectorScope.connectorIds,
    },
    query: params.query,
    limit: params.limit,
  });

  if (!parsed.connector_scope.enabled || parsed.connector_scope.connector_ids.length === 0) {
    return retrievalSearchResponseSchema.parse({
      query: parsed.query,
      results: [],
    });
  }

  const queryText = buildRetrievalTsQuery(parsed.query);
  if (!queryText) {
    return retrievalSearchResponseSchema.parse({
      query: parsed.query,
      results: [],
    });
  }

  const queryVector = sql`to_tsquery('english', ${queryText})`;
  const textVector = sql`
    setweight(to_tsvector('simple', coalesce(${documents.title}, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(${documents.pathOrUri}, '')), 'B') ||
    setweight(to_tsvector('english', ${documentChunks.contentText}), 'C')
  `;
  const helperPenalty = sql<number>`
    case
      when ${sql.join(
        helperDocumentPenaltyPatterns.map(
          (pattern) => sql`lower(${documents.pathOrUri}) like ${pattern}`,
        ),
        sql` or `,
      )}
      then 100.0
      else 0
    end
  `;
  const ranking = sql<number>`ts_rank(${textVector}, ${queryVector}) - ${helperPenalty}`;

  const rows = await params.db
    .select({
      connectorId: documentChunks.connectorId,
      connectorName: connectors.name,
      documentId: documentChunks.documentId,
      documentVersionId: documentChunks.documentVersionId,
      chunkId: documentChunks.id,
      title: documents.title,
      pathOrUri: documents.pathOrUri,
      content: documentChunks.contentText,
      score: ranking,
    })
    .from(documentChunks)
    .innerJoin(
      documents,
      and(
        eq(documents.id, documentChunks.documentId),
        eq(documents.currentVersionId, documentChunks.documentVersionId),
      ),
    )
    .innerJoin(
      connectors,
      and(
        eq(connectors.id, documentChunks.connectorId),
        eq(connectors.status, "active"),
      ),
    )
    .where(
      and(
        eq(documentChunks.workspaceId, parsed.workspace_id),
        inArray(documentChunks.connectorId, parsed.connector_scope.connector_ids),
        sql`${textVector} @@ ${queryVector}`,
      ),
    )
    .orderBy(desc(ranking), documentChunks.chunkIndex)
    .limit(parsed.limit * 5);

  const dedupedRows = rows.filter((row, index) => {
    return rows.findIndex((candidate) => candidate.documentId === row.documentId) === index;
  }).slice(0, parsed.limit);

  return retrievalSearchResponseSchema.parse({
    query: parsed.query,
    results: dedupedRows.map((row) => ({
      connector_id: row.connectorId,
      connector_name: row.connectorName,
      document_id: row.documentId,
      document_version_id: row.documentVersionId,
      chunk_id: row.chunkId,
      title: row.title,
      path_or_uri: row.pathOrUri,
      snippet: buildCitationSnippet(row.content, parsed.query),
      score: Number(row.score ?? 0),
      content: row.content,
    })),
  });
}

export function buildRetrievalAugmentedPrompt(params: {
  question: string;
  results: Array<{
    title: string | null;
    path_or_uri: string;
    content: string;
  }>;
  status?: RetrievalPromptStatus;
}) {
  const status = params.status ?? (params.results.length > 0 ? "applied" : "no_results");

  if (status === "failed") {
    return [
      "Workspace retrieval was unavailable for this turn.",
      "Do not claim you checked workspace documents or imply citations that were not provided.",
      "Answer from general knowledge only when it is safe, and say plainly when workspace-specific facts could not be verified.",
      "",
      "User question:",
      params.question,
    ].join("\n");
  }

  if (status === "no_results") {
    return [
      "No matching workspace documents were found in the selected connector scope for this turn.",
      "Do not imply workspace grounding or citations unless they are provided below.",
      "Answer from general knowledge only when it is safe, and say plainly when the workspace context is insufficient.",
      "",
      "User question:",
      params.question,
    ].join("\n");
  }

  if (params.results.length === 0) {
    return params.question;
  }

  const context = params.results
    .map((result, index) => {
      const header = result.title ? `${result.title} (${result.path_or_uri})` : result.path_or_uri;
      return [`[${index + 1}] ${header}`, result.content].join("\n");
    })
    .join("\n\n");

  return [
    "Answer the user using the workspace context when it is relevant.",
    "If the context is insufficient, say so plainly instead of inventing facts.",
    "Only cite source numbers when you rely on the provided workspace context.",
    "If you add general knowledge that is not grounded in the workspace context, separate it clearly from the cited material.",
    "",
    "Workspace context:",
    context,
    "",
    "User question:",
    params.question,
  ].join("\n");
}
