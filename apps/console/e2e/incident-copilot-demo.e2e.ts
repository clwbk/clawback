import { expect, test, type Page } from "@playwright/test";

const loginEmail = process.env.CONSOLE_E2E_EMAIL ?? "admin@example.com";
const loginPassword = process.env.CONSOLE_E2E_PASSWORD ?? "demo1234";
const demoConnectorName = "Incident Copilot Demo";
const demoRootPath = "testdata/connectors/incident-copilot-demo";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(loginEmail);
  await page.getByLabel("Password").fill(loginPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}

async function ensureDemoConnector(page: Page) {
  await page.goto("/workspace/connectors", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/workspace\/connectors$/);
  await expect(page.getByRole("heading", { name: "Connectors" })).toBeVisible();
  await expect(page.getByText("Incident Copilot demo setup")).toBeVisible();
  await expect(page.getByText(demoRootPath, { exact: true })).toBeVisible();

  const selectExistingButton = page.getByRole("button", {
    name: "Select existing demo connector",
  });
  if ((await selectExistingButton.count()) > 0) {
    await selectExistingButton.click();
    return;
  }

  await page.getByRole("button", { name: "Use demo values" }).click();
  await expect(page.getByLabel("Name")).toHaveValue(demoConnectorName);
  await expect(page.getByLabel("Root path")).toHaveValue(demoRootPath);
  await page.getByRole("button", { name: "Create Connector" }).click();
  await expect(
    page.getByText(`Connector "${demoConnectorName}" created.`),
  ).toBeVisible();
}

async function ensureCompletedSync(page: Page) {
  await expect(
    page.getByText(/Indexed from .*incident-copilot-demo/),
  ).toBeVisible();

  const syncTable = page.locator("table");
  const completedStatus = syncTable
    .getByText("completed", { exact: true })
    .first();
  if ((await completedStatus.count()) === 0) {
    const queuedStatus = syncTable.getByText("queued", { exact: true }).first();
    const runningStatus = syncTable
      .getByText("running", { exact: true })
      .first();

    if (
      (await queuedStatus.count()) === 0 &&
      (await runningStatus.count()) === 0
    ) {
      await page.getByRole("button", { name: "Sync Now" }).click();
      await expect(page.getByText(/Sync queued for "/)).toBeVisible();
    }

    await expect(completedStatus).toBeVisible({ timeout: 60_000 });
  }
}

async function expectChatShell(page: Page) {
  await page.goto("/workspace/chat", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/workspace\/chat/);
  await expect(page.getByText("Agents", { exact: true })).toBeVisible();
  await expect(page.getByText("Threads", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Start a conversation", { exact: true }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Send a message…")).toBeVisible();
}

test.describe("Incident Copilot demo setup", () => {
  test("creates or reuses the demo connector and reaches the chat shell", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await login(page);
    await ensureDemoConnector(page);
    await ensureCompletedSync(page);
    await expectChatShell(page);
  });
});
