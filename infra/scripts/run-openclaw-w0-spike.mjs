import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const clawbackRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultOpenClawRoot = path.resolve(clawbackRoot, "..", "openclaw");
const openClawRoot = process.env.OPENCLAW_REPO_DIR
  ? path.resolve(process.env.OPENCLAW_REPO_DIR)
  : defaultOpenClawRoot;

const tempTestPath = path.join(openClawRoot, "src", "gateway", "clawback-w0-spike.temp.test.ts");
const spikeModuleHref = pathToFileURL(
  path.join(clawbackRoot, "spikes", "openclaw-runtime", "w0-spike.ts"),
).href;

const tempTestSource = `
import { expect, test } from "vitest";
import { runW0Spike } from ${JSON.stringify(spikeModuleHref)};

test("Clawback W0 spike", async () => {
  const summary = await runW0Spike();
  console.log(JSON.stringify(summary, null, 2));
  expect(summary.publication.publishedAgentId).toBe("cb_agentv_01w0");
  expect(summary.dispatch.accepted.status).toBeTruthy();
  expect(summary.transcriptOwnership.finalizedAssistantMessage).toBeTruthy();
  expect(summary.recovery.recoveredAssistantTextFromHistory).toBeTruthy();
  expect(summary.approvals.requestedApprovalId).toBeTruthy();
}, 60_000);
`.trimStart();

let exitCode = 1;

try {
  await writeFile(tempTestPath, tempTestSource, "utf8");

  const child = spawn(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--config",
      "vitest.gateway.config.ts",
      tempTestPath,
    ],
    {
      cwd: openClawRoot,
      stdio: "inherit",
    },
  );

  exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await rm(tempTestPath, { force: true });
}

process.exit(exitCode);
