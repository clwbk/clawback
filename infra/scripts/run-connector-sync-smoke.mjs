import path from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = process.env.CONTROL_PLANE_BASE_URL ?? process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3011";
const loginEmail = process.env.SMOKE_ADMIN_EMAIL ?? "dave@hartwell.com";
const loginPassword = process.env.SMOKE_ADMIN_PASSWORD ?? "demo1234";
const timeoutMs = Number(process.env.SMOKE_CONNECTOR_TIMEOUT_MS ?? "60000");

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function getSmokeRootPath() {
  return path.join(
    getRepoRoot(),
    "testdata",
    "connectors",
    "smoke-knowledge-base",
  );
}

function getRepoRelativeSmokePath() {
  return path.join("testdata", "connectors", "smoke-knowledge-base");
}

function cookieHeaderFrom(setCookieHeaders) {
  return setCookieHeaders
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function main() {
  const login = await requestJson("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: loginEmail,
      password: loginPassword,
    }),
  });

  if (!login.response.ok) {
    throw new Error(
      `Login failed: ${login.response.status} ${JSON.stringify(login.body)}`,
    );
  }

  const cookies = cookieHeaderFrom(login.response.headers.getSetCookie());
  const csrfToken = login.body.csrf_token;
  if (!cookies || !csrfToken) {
    throw new Error(
      "Login did not return the expected session cookies and CSRF token.",
    );
  }

  const connectorName = `smoke-kb-${Date.now()}`;
  const createConnector = await requestJson("/api/connectors", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookies,
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({
      name: connectorName,
      type: "local_directory",
      config: {
        root_path: getRepoRelativeSmokePath(),
        recursive: true,
        include_extensions: [".md", ".txt", ".json", ".yaml", ".yml"],
      },
    }),
  });

  if (!createConnector.response.ok) {
    throw new Error(
      `Connector creation failed: ${createConnector.response.status} ${JSON.stringify(createConnector.body)}`,
    );
  }

  const connector = createConnector.body;
  const expectedRootPath = getSmokeRootPath();
  if (connector.config?.root_path !== expectedRootPath) {
    throw new Error(
      `Connector root path mismatch. Expected ${expectedRootPath}, received ${connector.config?.root_path ?? "<missing>"}.`,
    );
  }

  const requestSync = await requestJson(
    `/api/connectors/${connector.id}/sync`,
    {
      method: "POST",
      headers: {
        cookie: cookies,
        "x-csrf-token": csrfToken,
      },
    },
  );

  if (!requestSync.response.ok) {
    throw new Error(
      `Sync request failed: ${requestSync.response.status} ${JSON.stringify(requestSync.body)}`,
    );
  }

  const syncJobId = requestSync.body.sync_job?.id;
  if (!syncJobId) {
    throw new Error("Sync request did not return a sync job id.");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const syncJobs = await requestJson(
      `/api/connectors/${connector.id}/sync-jobs`,
      {
        headers: {
          cookie: cookies,
        },
      },
    );

    if (!syncJobs.response.ok) {
      throw new Error(
        `Sync polling failed: ${syncJobs.response.status} ${JSON.stringify(syncJobs.body)}`,
      );
    }

    const current = syncJobs.body.sync_jobs?.find(
      (job) => job.id === syncJobId,
    );
    if (!current) {
      throw new Error(`Sync job ${syncJobId} disappeared during polling.`);
    }

    if (current.status === "completed") {
      console.log(
        JSON.stringify(
          {
            ok: true,
            connector_id: connector.id,
            connector_name: connector.name,
            root_path: connector.config.root_path,
            sync_job_id: syncJobId,
            stats: current.stats,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (current.status === "failed") {
      throw new Error(
        `Sync failed: ${current.error_summary ?? "unknown error"}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for sync job ${syncJobId} to complete.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
