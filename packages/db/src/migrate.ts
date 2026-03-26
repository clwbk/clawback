import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDb, createPool } from "./client.js";

async function main() {
  const pool = createPool();
  const db = createDb(pool);
  const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

  await migrate(db, { migrationsFolder });
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
