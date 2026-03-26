import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const composeEnvPath = path.join(repoRoot, "infra", "compose", ".env");
const composeEnvExamplePath = path.join(repoRoot, "infra", "compose", ".env.example");
const runtimeRoot = path.join(repoRoot, ".runtime", "openclaw");
const configRoot = path.join(runtimeRoot, "config");
const workspaceRoot = path.join(runtimeRoot, "workspace");
const extensionsRoot = path.join(configRoot, "extensions");
const pluginSourceRoot = path.join(repoRoot, "openclaw-plugins");
const openClawConfigPath = path.join(configRoot, "openclaw.json");

async function ensureFile(targetPath, fallbackPath) {
  try {
    await fs.access(targetPath);
  } catch {
    await fs.copyFile(fallbackPath, targetPath);
  }
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

function toObjectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function syncDirectory(sourceRoot, targetRoot) {
  await ensureDir(targetRoot);
  const sourceEntries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const sourceNames = new Set(sourceEntries.map((entry) => entry.name));

  for (const entry of sourceEntries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);

    if (entry.isDirectory()) {
      await syncDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }

  const targetEntries = await fs.readdir(targetRoot, { withFileTypes: true });
  for (const entry of targetEntries) {
    if (sourceNames.has(entry.name)) {
      continue;
    }

    await fs.rm(path.join(targetRoot, entry.name), { recursive: true, force: true });
  }
}

async function ensureOpenClawBootstrapConfig() {
  const gatewayPort = process.env.OPENCLAW_GATEWAY_PORT ?? "18789";
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN ?? "clawback-local-token";
  const gatewayAuthMode = process.env.OPENCLAW_LOCAL_AUTH_MODE ?? "token";
  const controlPlanePort = process.env.CONTROL_PLANE_PORT ?? "3011";
  const runtimeApiToken = process.env.CLAWBACK_RUNTIME_API_TOKEN ?? "clawback-local-runtime-api-token";
  const localOpenClawMode = process.env.CLAWBACK_LOCAL_OPENCLAW_MODE ?? "docker";
  const controlPlaneBaseUrl =
    localOpenClawMode === "host"
      ? `http://127.0.0.1:${controlPlanePort}`
      : `http://host.docker.internal:${controlPlanePort}`;

  let existingConfig = {};
  try {
    existingConfig = JSON.parse(await fs.readFile(openClawConfigPath, "utf8"));
  } catch {
    existingConfig = {};
  }

  const existingPlugins = toObjectRecord(existingConfig.plugins);
  const existingEntries = toObjectRecord(existingPlugins.entries);
  const existingPluginEntry = toObjectRecord(existingEntries["clawback-tools"]);

  const config = {
    ...existingConfig,
    gateway: {
      ...toObjectRecord(existingConfig.gateway),
      mode: "local",
      bind: "lan",
      auth: {
        ...toObjectRecord(toObjectRecord(existingConfig.gateway).auth),
        mode: gatewayAuthMode,
        token: gatewayToken,
      },
      controlUi: {
        ...toObjectRecord(toObjectRecord(existingConfig.gateway).controlUi),
        allowedOrigins: [`http://127.0.0.1:${gatewayPort}`, `http://localhost:${gatewayPort}`],
      },
    },
    plugins: {
      ...existingPlugins,
      entries: {
        ...existingEntries,
        "clawback-tools": {
          ...existingPluginEntry,
          enabled: true,
          config: {
            ...toObjectRecord(existingPluginEntry.config),
            controlPlaneBaseUrl,
            runtimeApiToken,
          },
        },
      },
    },
  };

  await fs.writeFile(openClawConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return "updated";
}

async function main() {
  const explicitEnv = {
    CLAWBACK_RUNTIME_API_TOKEN: process.env.CLAWBACK_RUNTIME_API_TOKEN,
    CONTROL_PLANE_PORT: process.env.CONTROL_PLANE_PORT,
    CLAWBACK_LOCAL_OPENCLAW_MODE: process.env.CLAWBACK_LOCAL_OPENCLAW_MODE,
    OPENCLAW_GATEWAY_PORT: process.env.OPENCLAW_GATEWAY_PORT,
    OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN,
    OPENCLAW_LOCAL_AUTH_MODE: process.env.OPENCLAW_LOCAL_AUTH_MODE,
  };

  await ensureDir(path.dirname(composeEnvPath));
  await ensureFile(composeEnvPath, composeEnvExamplePath);
  process.loadEnvFile(composeEnvPath);
  for (const [key, value] of Object.entries(explicitEnv)) {
    if (typeof value === "string" && value.length > 0) {
      process.env[key] = value;
    }
  }

  await ensureDir(configRoot);
  await ensureDir(workspaceRoot);
  await ensureDir(extensionsRoot);
  await syncDirectory(pluginSourceRoot, extensionsRoot);

  const configState = await ensureOpenClawBootstrapConfig();
  process.stdout.write(`infra/compose/.env ready; OpenClaw bootstrap config ${configState}; plugins synced.\n`);
}

await main();
