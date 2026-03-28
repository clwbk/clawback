import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFileIfPresent } from "@clawback/env";

import { createControlPlaneApp } from "./app.js";
import { registerGracefulShutdown } from "./graceful-shutdown.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
loadEnvFileIfPresent(path.join(repoRoot, ".env.local"));
loadEnvFileIfPresent(path.join(repoRoot, ".env"));
loadEnvFileIfPresent(path.join(repoRoot, "infra", "compose", ".env"));

const port = Number(process.env.CONTROL_PLANE_PORT ?? "3011");

async function main() {
  const app = await createControlPlaneApp();
  await app.listen({ port, host: "0.0.0.0" });
  registerGracefulShutdown({ app });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
