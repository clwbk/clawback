import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { and, eq, inArray } from "drizzle-orm";

import {
  connectorSyncStatsSchema,
  localDirectoryConnectorConfigSchema,
} from "@clawback/contracts";
import {
  connectorSyncJobs,
  connectors,
  createDb,
  documentAclBindings,
  documentChunks,
  documents,
  documentVersions,
} from "@clawback/db";
import {
  createClawbackId,
  normalizeConnectorRootPath,
  normalizeLocalDirectoryExtension,
} from "@clawback/domain";

type DirectoryEntry = {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
};

type ReadDirectory = (targetPath: string) => Promise<DirectoryEntry[]>;

type RetrievalDb = ReturnType<typeof createDb>;

const textMimeTypes: Record<string, string> = {
  ".csv": "text/csv",
  ".html": "text/html",
  ".json": "application/json",
  ".md": "text/markdown",
  ".mdx": "text/markdown",
  ".text": "text/plain",
  ".txt": "text/plain",
  ".yaml": "application/yaml",
  ".yml": "application/yaml",
};

const defaultExcludedDirectoryNames = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-output",
  "test-results",
]);

const staleDocumentDeleteBatchSize = 250;

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function toPosixRelative(rootPath: string, filePath: string) {
  return path.relative(rootPath, filePath).split(path.sep).join("/");
}

function chunkText(input: string, maxChunkLength = 1_200, overlap = 200) {
  const source = input.trim();
  if (!source) {
    return [];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const nextCursor = Math.min(source.length, cursor + maxChunkLength);
    let boundary = source.lastIndexOf("\n", nextCursor);
    if (boundary <= cursor + Math.floor(maxChunkLength * 0.5)) {
      boundary = source.lastIndexOf(" ", nextCursor);
    }
    if (boundary <= cursor) {
      boundary = nextCursor;
    }

    const segment = source.slice(cursor, boundary).trim();
    if (segment) {
      chunks.push(segment);
    }

    if (boundary >= source.length) {
      break;
    }

    cursor = Math.max(boundary - overlap, cursor + 1);
  }

  return chunks;
}

async function defaultReadDirectory(targetPath: string): Promise<DirectoryEntry[]> {
  return await fs.readdir(targetPath, { withFileTypes: true });
}

export async function* walkLocalDirectoryFiles(
  rootPath: string,
  recursive: boolean,
  readDirectory: ReadDirectory = defaultReadDirectory,
): AsyncGenerator<string> {
  const pendingDirectories = [rootPath];

  while (pendingDirectories.length > 0) {
    const currentPath = pendingDirectories.pop();
    if (!currentPath) {
      continue;
    }

    const entries = await readDirectory(currentPath);

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (recursive && !defaultExcludedDirectoryNames.has(entry.name)) {
          pendingDirectories.push(fullPath);
        }
        continue;
      }

      if (entry.isFile()) {
        yield fullPath;
      }
    }
  }
}

export async function listLocalDirectoryFiles(
  rootPath: string,
  recursive: boolean,
  readDirectory: ReadDirectory = defaultReadDirectory,
) {
  const files: string[] = [];

  for await (const filePath of walkLocalDirectoryFiles(rootPath, recursive, readDirectory)) {
    files.push(filePath);
  }

  return files;
}

export function splitIntoBatches<T>(items: T[], batchSize: number) {
  if (batchSize <= 0) {
    throw new Error("batchSize must be greater than zero.");
  }

  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }

  return batches;
}

function tokenEstimate(input: string) {
  return Math.max(1, Math.ceil(input.length / 4));
}

export async function syncLocalDirectoryConnector(params: {
  db: RetrievalDb;
  workspaceId: string;
  connectorId: string;
  now?: Date;
  pathBase?: string;
}) {
  const now = params.now ?? new Date();
  const connector = await params.db.query.connectors.findFirst({
    where: and(
      eq(connectors.workspaceId, params.workspaceId),
      eq(connectors.id, params.connectorId),
    ),
  });

  if (!connector) {
    throw new Error(`Connector ${params.connectorId} was not found.`);
  }

  if (connector.type !== "local_directory") {
    throw new Error(`Unsupported connector type ${connector.type}.`);
  }

  const parsedConfig = localDirectoryConnectorConfigSchema.parse(connector.configJson);
  const rootPath = normalizeConnectorRootPath(parsedConfig.root_path, params.pathBase);
  const includeExtensions = new Set(
    parsedConfig.include_extensions.map((value) => normalizeLocalDirectoryExtension(value)).filter(Boolean),
  );

  const stats = {
    scanned_file_count: 0,
    indexed_document_count: 0,
    updated_document_count: 0,
    deleted_document_count: 0,
    skipped_file_count: 0,
    error_count: 0,
  };

  const existingDocuments = await params.db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, params.workspaceId),
        eq(documents.connectorId, params.connectorId),
      ),
    );

  const existingByExternalId = new Map(existingDocuments.map((row) => [row.externalId, row]));
  const currentVersionIds = existingDocuments
    .map((row) => row.currentVersionId)
    .filter((value): value is string => Boolean(value));
  const currentVersions = currentVersionIds.length
    ? await params.db
        .select()
        .from(documentVersions)
        .where(inArray(documentVersions.id, currentVersionIds))
    : [];
  const currentVersionById = new Map(currentVersions.map((row) => [row.id, row]));
  const seenExternalIds = new Set<string>();

  for await (const filePath of walkLocalDirectoryFiles(rootPath, parsedConfig.recursive)) {
    stats.scanned_file_count += 1;
    const extension = normalizeLocalDirectoryExtension(path.extname(filePath));
    if (!includeExtensions.has(extension)) {
      stats.skipped_file_count += 1;
      continue;
    }

    try {
      const content = await fs.readFile(filePath, "utf8");
      const relativePath = toPosixRelative(rootPath, filePath);
      const title = path.basename(filePath);
      const fileStats = await fs.stat(filePath);
      const contentHash = sha256(content);
      const existingDocument = existingByExternalId.get(relativePath);
      const existingVersion = existingDocument?.currentVersionId
        ? currentVersionById.get(existingDocument.currentVersionId)
        : null;

      seenExternalIds.add(relativePath);

      let documentId = existingDocument?.id ?? createClawbackId("doc");
      let changed = !existingDocument || !existingVersion || existingVersion.contentHash !== contentHash;

      if (!existingDocument) {
        await params.db.insert(documents).values({
          id: documentId,
          workspaceId: params.workspaceId,
          connectorId: params.connectorId,
          externalId: relativePath,
          pathOrUri: relativePath,
          title,
          mimeType: textMimeTypes[extension] ?? "text/plain",
          currentVersionId: null,
          aclHash: null,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        documentId = existingDocument.id;
      }

      if (!changed) {
        await params.db
          .update(documents)
          .set({
            pathOrUri: relativePath,
            title,
            mimeType: textMimeTypes[extension] ?? "text/plain",
            lastSyncedAt: now,
            updatedAt: now,
          })
          .where(eq(documents.id, documentId));
        continue;
      }

      const versionId = createClawbackId("docv");
      await params.db.insert(documentVersions).values({
        id: versionId,
        workspaceId: params.workspaceId,
        connectorId: params.connectorId,
        documentId,
        contentHash,
        contentText: content,
        sourceUpdatedAt: fileStats.mtime,
        byteSize: fileStats.size,
        metadataJson: {
          relative_path: relativePath,
        },
        createdAt: now,
      });

      const chunks = chunkText(content);
      if (chunks.length > 0) {
        await params.db.insert(documentChunks).values(
          chunks.map((chunk, index) => ({
            id: createClawbackId("chk"),
            workspaceId: params.workspaceId,
            connectorId: params.connectorId,
            documentId,
            documentVersionId: versionId,
            chunkIndex: index,
            contentText: chunk,
            tokenCount: tokenEstimate(chunk),
            metadataJson: {
              relative_path: relativePath,
            },
            createdAt: now,
          })),
        );
      }

      await params.db
        .update(documents)
        .set({
          pathOrUri: relativePath,
          title,
          mimeType: textMimeTypes[extension] ?? "text/plain",
          currentVersionId: versionId,
          aclHash: null,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(eq(documents.id, documentId));

      if (existingDocument) {
        stats.updated_document_count += 1;
      } else {
        stats.indexed_document_count += 1;
      }
    } catch (_error) {
      stats.error_count += 1;
    }
  }

  const deletedDocumentIds = existingDocuments
    .filter((row) => !seenExternalIds.has(row.externalId))
    .map((row) => row.id);

  if (deletedDocumentIds.length > 0) {
    for (const documentIdBatch of splitIntoBatches(
      deletedDocumentIds,
      staleDocumentDeleteBatchSize,
    )) {
      await params.db
        .delete(documentAclBindings)
        .where(inArray(documentAclBindings.documentId, documentIdBatch));
      await params.db.delete(documents).where(inArray(documents.id, documentIdBatch));
    }
    stats.deleted_document_count = deletedDocumentIds.length;
  }

  return connectorSyncStatsSchema.parse(stats);
}

export async function markConnectorSyncJobCompleted(params: {
  db: RetrievalDb;
  workspaceId: string;
  syncJobId: string;
  status: "completed" | "failed";
  stats?: ReturnType<typeof connectorSyncStatsSchema.parse> | null;
  errorSummary?: string | null;
  completedAt?: Date;
}) {
  const completedAt = params.completedAt ?? new Date();
  await params.db
    .update(connectorSyncJobs)
    .set({
      status: params.status,
      completedAt,
      errorSummary: params.errorSummary ?? null,
      statsJson: params.stats ?? null,
      updatedAt: completedAt,
    })
    .where(
      and(
        eq(connectorSyncJobs.workspaceId, params.workspaceId),
        eq(connectorSyncJobs.id, params.syncJobId),
      ),
    );
}
