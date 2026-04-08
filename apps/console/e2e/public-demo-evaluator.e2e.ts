import { expect, test, type Page } from "@playwright/test";

const loginEmail = process.env.CONSOLE_E2E_EMAIL ?? "evaluator@hartwell.com";
const loginPassword = process.env.CONSOLE_E2E_PASSWORD ?? "publicdemo1";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(loginEmail);
  await page.getByLabel("Password").fill(loginPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}

async function sendMessage(page: Page, message: string) {
  const input = page.locator("textarea");
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  await input.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
}

async function waitForAssistantReply(page: Page, runIndex: number, timeoutMs = 120_000) {
  const completedReplies = page.getByRole("button", { name: "Copy response" });
  const failureCallout = page.getByTestId("workbench-run-failure");
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if ((await failureCallout.count()) > 0) {
      throw new Error(
        `Run failed before producing a reply: ${(await failureCallout.textContent()) ?? "Unknown failure."}`,
      );
    }

    if ((await completedReplies.count()) > runIndex) {
      await page.waitForTimeout(1000);
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for assistant reply ${runIndex + 1}.`);
}

test.describe("Public demo evaluator path", () => {
  test.setTimeout(300_000);

  test("stops at the pending review without evaluator approval controls", async ({ page }) => {
    await login(page);

    await page.goto("/workspace/chat", { waitUntil: "networkidle" });
    const agentButton = page.locator("button").filter({ hasText: /Incident Copilot/i }).first();
    await expect(agentButton).toBeVisible({ timeout: 30_000 });
    await agentButton.click();

    const newThreadButton = page.locator("button").filter({ hasText: /New Thread/i }).first();
    await expect(newThreadButton).toBeVisible({ timeout: 10_000 });
    await expect(newThreadButton).toBeEnabled({ timeout: 10_000 });
    await newThreadButton.click();
    await page.waitForTimeout(1500);

    await sendMessage(page, "Why did checkout fail last night?");
    await waitForAssistantReply(page, 0);

    await sendMessage(page, "What should we do next?");
    await waitForAssistantReply(page, 1);

    await sendMessage(page, "Draft a follow-up ticket for the team.");
    await waitForAssistantReply(page, 2);

    await sendMessage(page, "Go ahead and create the ticket.");

    const approvalPending = page.getByText("Approval pending").first();
    const reviewLink = page.getByRole("link", { name: "Review approval" }).first();
    await expect(approvalPending).toBeVisible({ timeout: 90_000 });
    await expect(reviewLink).toBeVisible();

    await page.goto("/workspace/inbox", { waitUntil: "networkidle" });
    const pendingReviewRow = page
      .locator("a[href*='/workspace/inbox']")
      .filter({ hasText: /Needs review|Pending review|Review/i })
      .first();
    await expect(pendingReviewRow).toBeVisible({ timeout: 15_000 });
    await pendingReviewRow.click();

    await expect(
      page.getByText(
        "You can inspect this pending review, but only an assigned reviewer or workspace admin can resolve it.",
      ),
    ).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("button", { name: /Approve/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Deny/i })).toHaveCount(0);
  });
});
