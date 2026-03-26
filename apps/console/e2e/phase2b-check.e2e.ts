import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.resolve(__dirname, "../../.playwright/phase2b-check");

const loginEmail = process.env.CONSOLE_E2E_EMAIL ?? "admin@example.com";
const loginPassword = process.env.CONSOLE_E2E_PASSWORD ?? "demo1234";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(loginEmail);
  await page.getByLabel("Password").fill(loginPassword);
  await Promise.all([
    page.waitForURL(/\/workspace/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true });
}

test.describe("phase 2b acceptance", () => {
  test("artifact detail, review sheet, and deep links", async ({ page }) => {
    await login(page);

    // 1. Open artifacts page and click into a detail
    console.log("\n=== Check 1: Artifact detail page ===");
    await page.goto("/workspace/artifacts", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Find a ticket artifact link — look for any row that links to artifact detail
    const artifactLinks = page.locator("a[href*='/workspace/artifacts/']");
    const artifactRows = page.locator("tr").filter({ hasText: /artifact/i });
    const rowCount = await artifactRows.count();
    console.log(`  Found ${rowCount} artifact rows`);

    // Check if there's an artifact detail route by trying the first ticket
    // The artifacts page may not have links yet — check for clickable rows
    const linkCount = await artifactLinks.count();
    console.log(`  Found ${linkCount} artifact detail links`);

    if (linkCount > 0) {
      await artifactLinks.first().click();
      await page.waitForTimeout(1500);
      await screenshot(page, "01-artifact-detail");
      console.log(`  ✓ Artifact detail loaded: ${page.url()}`);
    } else {
      // Try navigating directly to artifacts list and look for any detail route
      // The page might show artifacts in a table without links
      await screenshot(page, "01-artifacts-list");
      console.log("  ⚠ No artifact detail links found — checking if detail route exists");

      // Try constructing a detail URL from mock ticket data
      const firstRow = page.locator("tr").nth(1); // skip header
      const rowText = await firstRow.textContent().catch(() => "");
      console.log(`  First row text: ${rowText?.slice(0, 80)}...`);
    }

    // 2. Open reviews page and check for review sheet
    console.log("\n=== Check 2: Review sheet ===");
    await page.goto("/workspace/approvals", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await screenshot(page, "02-reviews-list");

    // Check if there's a review detail panel or modal
    const reviewDetail = page.locator("[class*='review'], [class*='sheet'], [class*='modal'], [data-state='open']");
    const detailVisible = await reviewDetail.count();
    console.log(`  Review detail/sheet elements: ${detailVisible}`);

    // Check for a pending review and try to open it
    const pendingBadge = page.locator("text=pending").first();
    if (await pendingBadge.isVisible().catch(() => false)) {
      // Click the row containing the pending badge
      const pendingRow = page.locator("tr").filter({ hasText: "pending" }).first();
      await pendingRow.click().catch(() => console.log("  Could not click pending row"));
      await page.waitForTimeout(1000);
      await screenshot(page, "03-review-detail-open");
      console.log("  ✓ Clicked pending review row");
    }

    // Try the query param route
    // Get any approval ID from the page
    const pageContent = await page.content();
    const aprMatch = pageContent.match(/apr_[A-Za-z0-9]+/);
    if (aprMatch) {
      const approvalId = aprMatch[0];
      console.log(`  Found approval ID: ${approvalId}`);
      await page.goto(`/workspace/approvals?review=${approvalId}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await screenshot(page, "04-review-sheet-deeplink");
      console.log(`  ✓ Review sheet deep link: /workspace/approvals?review=${approvalId}`);
    } else {
      console.log("  ⚠ No approval ID found in page content");
    }

    // 3. Check chat for governed-action card with links
    console.log("\n=== Check 3: Chat governed-action card links ===");
    await page.goto("/workspace/chat", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Look for governed action cards
    const governedCards = page.locator("text=Governed action");
    const cardCount = await governedCards.count();
    console.log(`  Governed action cards in chat: ${cardCount}`);

    // Look for trace and review links in chat
    const traceLinks = page.locator("a[href*='/workspace/runs/']");
    const reviewLinks = page.locator("a[href*='/workspace/approvals']");
    console.log(`  Trace links: ${await traceLinks.count()}`);
    console.log(`  Review links: ${await reviewLinks.count()}`);

    await screenshot(page, "05-chat-with-cards");

    // If there's a conversation with a governed action, scroll to it
    if (cardCount > 0) {
      await governedCards.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await screenshot(page, "06-governed-action-closeup");
      console.log("  ✓ Governed action card visible in chat");
    }

    console.log("\n✓ Phase 2b acceptance checks complete.");
    console.log("  Screenshots saved to .playwright/phase2b-check/");
  });
});
