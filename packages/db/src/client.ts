import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema.js";
import { resolveDatabaseUrl } from "./env.js";

export function getDatabaseUrl() {
  return resolveDatabaseUrl();
}

export function createPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
  });
}

export function createDb(pool = createPool()) {
  return drizzle(pool, { schema });
}
