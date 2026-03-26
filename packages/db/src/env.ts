import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFileIfPresent } from "@clawback/env";

let envLoaded = false;

export function loadDatabaseEnv() {
  if (envLoaded) {
    return;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  loadEnvFileIfPresent(path.join(repoRoot, ".env.local"));
  loadEnvFileIfPresent(path.join(repoRoot, ".env"));
  loadEnvFileIfPresent(path.join(repoRoot, "infra", "compose", ".env"));
  envLoaded = true;
}

export function resolveDatabaseUrl() {
  loadDatabaseEnv();

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const username = process.env.POSTGRES_USER ?? "clawback";
  const password = process.env.POSTGRES_PASSWORD ?? "clawback";
  const host = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const port = process.env.POSTGRES_PORT ?? "5433";
  const database = process.env.POSTGRES_DB ?? "clawback";

  return `postgres://${username}:${password}@${host}:${port}/${database}`;
}
