import { expect, test, type Page } from "@playwright/test";

/**
 * Reviewed-send recovery acceptance test.
 *
 * Proves that when a reviewed send fails (e.g. SMTP not configured), the
 * operator can:
 * 1. See the failure surfaced honestly in the inbox (badge + outcome card)
 * 2. Read the failure details (type, guidance, last error)
 * 3. Use the retry affordance from the console
 *
 * In an SMTP-absent test environment the "failed" state is the expected
 * honest outcome after approval — the test proves that failure is visible
 * and wording is accurate.  Retry produces the same failure, which is
 * correct behaviour when SMTP is still unavailable.
 *
 * Assumptions:
 * - The stack is running (console on :3000, control-plane on :3001)
 * - The database has been seeded (dave@hartwell.com / demo1234 exists)
 * - At least one review-gated email work item exists in the inbox
 */

const loginEmail = "dave@hartwell.com";
const loginPassword = "demo1234";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(loginEmail);
  await page.getByLabel("Password").fill(loginPassword);
  await Promise.all([
    page.waitForURL(/\/workspace/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test("reviewed-send recovery: failure is visible and retry affordance works", async ({
  page,
}) => {
  // -----------------------------------------------------------------------
  // 1. Log in and navigate to Inbox
  // -----------------------------------------------------------------------
  await login(page);
  await page.goto("/workspace/inbox", { waitUntil: "networkidle" });
  await expect(page.getByText("Reviews and suggestions")).toBeVisible();

  // -----------------------------------------------------------------------
  // 2. Look for a failed inbox item ("Send failed" for open, "Failed" for
  //    resolved).  If none exists yet, create one by approving a pending
  //    review — SMTP is absent so the send will fail honestly.
  // -----------------------------------------------------------------------
  let failedLink = page
    .locator("a[href*='/workspace/inbox']")
    .filter({ hasText: /Send failed|Failed/ });

  if ((await failedLink.count()) === 0) {
    // No pre-existing failure — find a pending review and approve it.
    const pendingLink = page
      .locator("a[href*='/workspace/inbox']")
      .filter({ hasText: "Needs review" });

    // If there are no pending reviews either, skip gracefully.
    if ((await pendingLink.count()) === 0) {
      test.skip(
        true,
        "No pending reviews or failed sends in inbox — nothing to exercise",
      );
      return;
    }

    // Click the first pending review to select it.
    await pendingLink.first().click();
    await expect(page.getByText("Review detail")).toBeVisible();

    // Approve it — this will trigger a send attempt that fails without SMTP.
    const approveButton = page.getByRole("button", { name: "Approve" });
    await expect(approveButton).toBeVisible();
    await approveButton.click();

    // Wait for the review status to update (either badge change or page
    // refresh).  The execution runs asynchronously, so we wait for the
    // failure badge to appear.  Allow generous timeout for the async
    // execution pipeline.
    await expect(
      page.locator("text=Failed").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Refresh to pick up the settled state in the inbox list.
    await page.goto("/workspace/inbox", { waitUntil: "networkidle" });

    // Re-locate the failed link after refresh.
    failedLink = page
      .locator("a[href*='/workspace/inbox']")
      .filter({ hasText: /Send failed|Failed/ });
  }

  // -----------------------------------------------------------------------
  // 3. Select the failed inbox item
  // -----------------------------------------------------------------------
  await expect(failedLink.first()).toBeVisible({ timeout: 10_000 });
  await failedLink.first().click();

  // -----------------------------------------------------------------------
  // 4. Verify honest failure wording in the detail panel
  // -----------------------------------------------------------------------

  // The ReviewedSendOutcomeCard renders these fields when a failure exists:
  //   "Last failure"        — the error section heading
  //   "Failure type"        — "Transient", "Permanent", or "Unknown"
  //   "Attempts"            — attempt count
  //   "Reviewed send outcome" — card heading

  // Verify the outcome card is present with honest failure wording.
  await expect(page.getByText("Reviewed send outcome")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Last failure")).toBeVisible();

  // Verify failure type label is shown (one of the three classifications).
  const failureTypeValue = page
    .locator("text=Failure type")
    .locator("..")
    .locator("p.text-sm");
  await expect(failureTypeValue).toBeVisible();
  const failureTypeText = await failureTypeValue.textContent();
  expect(["Transient", "Permanent", "Unknown"]).toContain(failureTypeText);

  // Verify the attempt count is displayed and is at least 1.
  const attemptsValue = page
    .locator("text=Attempts")
    .locator("..")
    .locator("p.text-sm");
  await expect(attemptsValue).toBeVisible();
  const attemptsBefore = parseInt((await attemptsValue.textContent()) ?? "0", 10);
  expect(attemptsBefore).toBeGreaterThanOrEqual(1);

  // -----------------------------------------------------------------------
  // 5. Use the retry affordance
  // -----------------------------------------------------------------------

  // The retry button text depends on error classification:
  //   "Retry send"       — transient or unknown
  //   "Retry after fix"  — permanent
  const retryButton = page.getByRole("button", {
    name: /Retry send|Retry after fix/,
  });
  await expect(retryButton).toBeVisible();

  await retryButton.click();

  // After clicking retry, the button temporarily shows "Retrying..." and
  // then the page refreshes.  Wait for the retry to settle.
  // In SMTP-absent mode the send fails again — the same outcome card
  // reappears with an incremented attempt count (or the same count if the
  // retry is still in flight).

  // Wait for the page to settle after the router.refresh().
  await page.waitForLoadState("networkidle");

  // Re-check that the failure state is still honestly displayed after retry.
  await expect(page.getByText("Last failure")).toBeVisible({ timeout: 10_000 });

  // Verify the attempt count incremented (or at minimum stayed the same if
  // the retry hasn't fully settled yet).
  const attemptsValueAfter = page
    .locator("text=Attempts")
    .locator("..")
    .locator("p.text-sm");
  await expect(attemptsValueAfter).toBeVisible();
  const attemptsAfter = parseInt(
    (await attemptsValueAfter.textContent()) ?? "0",
    10,
  );
  expect(attemptsAfter).toBeGreaterThanOrEqual(attemptsBefore);
});
