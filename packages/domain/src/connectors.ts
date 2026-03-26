import path from "node:path";

export const CONNECTOR_SYNC_JOB_NAME = "connector.sync";

export const DEFAULT_LOCAL_DIRECTORY_EXTENSIONS = [
  ".md",
  ".mdx",
  ".txt",
  ".text",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".html",
] as const;

export function normalizeConnectorRootPath(value: string, basePath?: string) {
  const trimmed = value.trim();
  return basePath ? path.resolve(basePath, trimmed) : path.resolve(trimmed);
}

export function normalizeLocalDirectoryExtension(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}
