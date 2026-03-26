import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./src/env.ts";

const connectionString = resolveDatabaseUrl();

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
