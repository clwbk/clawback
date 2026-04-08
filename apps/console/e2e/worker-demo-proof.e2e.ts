import { expect, test, type Locator, type Page } from "@playwright/test";

const loginEmail =
  process.env.CONSOLE_E2E_ADMIN_EMAIL ?? "dave@hartwell.com";
const loginPassword =
  process.env.CONSOLE_E2E_ADMIN_PASSWORD ?? "demo1234";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(loginEmail);
  await page.getByLabel("Password").fill(loginPassword);
  await Promise.all([
    page.waitForURL(/\/workspace/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function recoverWorkspaceShellIfNeeded(page: Page) {
  const workspaceError = page.getByRole("heading", {
    name: "The console could not load.",
  });

  if (!(await workspaceError.isVisible().catch(() => false))) {
    return;
  }

  await page.reload({ waitUntil: "networkidle" });

  if (await workspaceError.isVisible().catch(() => false)) {
    throw new Error(
      "Workspace shell stayed in the known local-dev error state after one reload.",
    );
  }
}

async function ensureVisibleWithSingleReload(page: Page, locator: Locator) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await recoverWorkspaceShellIfNeeded(page);

    if (await locator.isVisible().catch(() => false)) {
      return;
    }

    if (attempt === 0) {
      await page.reload({ waitUntil: "networkidle" });
    }
  }

  await expect(locator).toBeVisible();
}

async function openWorkerProofFromSetup(page: Page) {
  await page.goto("/workspace/setup", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/workspace\/setup/);
  await ensureVisibleWithSingleReload(
    page,
    page.getByRole("heading", { name: "Workspace setup" }),
  );
  const proofStepButton = page
    .locator('a[href*="focus=proof"]')
    .getByRole("button", { name: "Run sample activity" })
    .first();
  await ensureVisibleWithSingleReload(page, proofStepButton);

  await Promise.all([
    page.waitForURL(/\/workspace\/workers\/[^?]+\?.*focus=proof/),
    proofStepButton.click(),
  ]);

  const proofRail = page.locator('[data-worker-focus="proof"]:visible').first();
  await expect(page.getByRole("link", { name: "Back to setup" })).toBeVisible();
  await ensureVisibleWithSingleReload(
    page,
    proofRail.getByText("Bring This Worker Live"),
  );
  await ensureVisibleWithSingleReload(page, proofRail.getByText("Inspect recent work"));
}

async function openProofDestination(page: Page) {
  const proofRail = page.locator('[data-worker-focus="proof"]:visible').first();
  const openInboxItemLink = proofRail.getByRole("link", {
    name: "Open inbox item",
  });
  if ((await openInboxItemLink.count()) > 0) {
    await Promise.all([
      page.waitForURL(/\/workspace\/inbox\?item=/),
      openInboxItemLink.click(),
    ]);
    return;
  }

  const openWorkItemLink = proofRail.getByRole("link", {
    name: "Open work item",
  });
  if ((await openWorkItemLink.count()) > 0) {
    await Promise.all([
      page.waitForURL(/\/workspace\/work\//),
      openWorkItemLink.click(),
    ]);
    return;
  }

  const openActivityLink = proofRail.getByRole("link", {
    name: "Open activity",
  });
  if ((await openActivityLink.count()) > 0) {
    await Promise.all([
      page.waitForURL(/\/workspace\/activity/),
      openActivityLink.click(),
    ]);
    return;
  }

  const runSampleButton = proofRail.getByRole("button", {
    name: "Run sample activity",
  });
  if ((await runSampleButton.count()) > 0) {
    await expect(runSampleButton).toBeEnabled({ timeout: 15_000 });
    await Promise.all([
      page.waitForURL(/\/workspace\/(inbox\?item=|work\/|activity)/, {
        timeout: 30_000,
      }),
      runSampleButton.click(),
    ]);
    return;
  }

  throw new Error("Expected a proof CTA in the worker activation rail.");
}

test.describe("Worker demo proof flow", () => {
  test("reaches the worker proof step from setup and opens real product state", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await login(page);
    await openWorkerProofFromSetup(page);
    await openProofDestination(page);

    const url = page.url();
    if (url.includes("/workspace/inbox")) {
      await ensureVisibleWithSingleReload(
        page,
        page.getByRole("heading", { name: "Reviews and suggestions" }),
      );
      await ensureVisibleWithSingleReload(page, page.getByText("Review detail"));
      return;
    }

    if (url.includes("/workspace/work/")) {
      await ensureVisibleWithSingleReload(
        page,
        page.getByText("Summary", { exact: true }),
      );
      return;
    }

    if (url.includes("/workspace/activity")) {
      await ensureVisibleWithSingleReload(
        page,
        page.getByRole("heading", { name: "Activity" }),
      );
      return;
    }

    throw new Error(`Unexpected proof destination: ${url}`);
  });
});
