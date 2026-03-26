import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const loginEmail = process.env.CONSOLE_E2E_EMAIL ?? "admin@example.com";
const loginPassword = process.env.CONSOLE_E2E_PASSWORD ?? "demo1234";
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.resolve(thisDir, "..", "..", "..", ".playwright", "demo-rehearsal");

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(loginEmail);
  await page.getByLabel("Password").fill(loginPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({
    path: `${screenshotDir}/${name}.png`,
    fullPage: true,
  });
}

async function sendMessage(page: Page, message: string) {
  const input = page.locator("textarea");
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  await input.fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
}

async function waitForAssistantReply(page: Page, runIndex: number, timeoutMs = 120_000) {
  // Wait for the run metadata to appear (shows "Run: run_..." and duration),
  // which indicates the assistant finished replying.
  // Each run produces a "View trace" link — wait for the Nth one.
  const viewTraceLinks = page.getByText("View trace");
  await expect(viewTraceLinks.nth(runIndex)).toBeVisible({ timeout: timeoutMs });

  // Small extra wait for final render
  await page.waitForTimeout(1000);
}

test.describe("Demo rehearsal with screenshots", () => {
  test.setTimeout(300_000); // 5 minutes total

  test("full Incident Copilot demo flow", async ({ page }) => {
    // --- Login ---
    await login(page);
    await screenshot(page, "01-dashboard");

    // --- Navigate to chat ---
    await page.goto("/workspace/chat", { waitUntil: "networkidle" });
    await expect(page.locator("text=AGENTS").first()).toBeVisible();
    await screenshot(page, "02-chat-shell");

    // --- Wait for agents to load and select the Incident Copilot ---
    // The agent list loads asynchronously after the session is established
    const agentButton = page.locator("button").filter({ hasText: /Incident Copilot/i }).first();
    await expect(agentButton).toBeVisible({ timeout: 30_000 });
    await agentButton.click();
    await page.waitForTimeout(500);
    await screenshot(page, "03-agent-selected");

    // --- Create a new thread ---
    // The button may say "New Thread" or have an aria-label
    const newThreadButton = page.locator("button").filter({ hasText: /New Thread/i }).first();
    await expect(newThreadButton).toBeVisible({ timeout: 10_000 });
    await expect(newThreadButton).toBeEnabled({ timeout: 10_000 });
    await newThreadButton.click();
    await page.waitForTimeout(2000);
    await screenshot(page, "04-new-thread");

    // === Prompt 1: "Why did checkout fail last night?" ===
    await sendMessage(page, "Why did checkout fail last night?");
    await screenshot(page, "05-prompt1-sent");

    await waitForAssistantReply(page, 0);
    await screenshot(page, "06-prompt1-reply");

    // Verify the response has relevant content
    const chatArea = page.locator("body");
    const responseText = await chatArea.textContent();
    console.log("\n=== Prompt 1 Response Check ===");
    console.log("Contains 'failover':", responseText?.toLowerCase().includes("failover"));
    console.log("Contains 'payments' or 'checkout':", responseText?.toLowerCase().includes("payments") || responseText?.toLowerCase().includes("checkout"));
    console.log("Contains citation [1] or [2]:", responseText?.includes("[1]") || responseText?.includes("[2]"));

    // === Prompt 2: "What should we do next?" ===
    await sendMessage(page, "What should we do next?");
    await screenshot(page, "07-prompt2-sent");

    await waitForAssistantReply(page, 1);
    await screenshot(page, "08-prompt2-reply");

    const responseText2 = await chatArea.textContent();
    console.log("\n=== Prompt 2 Response Check ===");
    console.log("Contains 'remediat' or 'follow-up' or 'ticket':",
      responseText2?.toLowerCase().includes("remediat") ||
      responseText2?.toLowerCase().includes("follow-up") ||
      responseText2?.toLowerCase().includes("ticket"));

    // === Prompt 3: "Draft a follow-up ticket for the team." ===
    await sendMessage(page, "Draft a follow-up ticket for the team.");
    await screenshot(page, "09-prompt3-sent");

    await waitForAssistantReply(page, 2);
    await screenshot(page, "10-prompt3-reply");

    const responseText3 = await chatArea.textContent();
    console.log("\n=== Prompt 3 Response Check ===");
    console.log("Contains 'title' or 'impact' or 'description':",
      responseText3?.toLowerCase().includes("title") ||
      responseText3?.toLowerCase().includes("impact") ||
      responseText3?.toLowerCase().includes("description"));

    // Check for tool events (draft_ticket tool call)
    const hasDraftTool = responseText3?.toLowerCase().includes("draft_ticket") ||
      responseText3?.toLowerCase().includes("tool");
    console.log("Shows tool activity:", hasDraftTool);

    // === Prompt 4: "Go ahead and create the ticket." ===
    await sendMessage(page, "Go ahead and create the ticket.");
    await screenshot(page, "11-prompt4-sent");

    // This should trigger the approval gate - the run will pause.
    // Wait a bit for the run to process, then scroll down and check state.
    // The LLM may need time to process the tool call.
    await page.waitForTimeout(15_000);

    // Scroll chat to bottom to see latest state
    await page.evaluate(() => {
      const scrollable = document.querySelector("[class*='overflow-y-auto']");
      if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
    });
    await page.waitForTimeout(2000);

    // Check for approval pending — look for the badge text or "Approval pending"
    // Also check the approvals nav badge (shows count of pending approvals)
    const approvalPending = page.getByText("Approval pending");
    const reviewLink = page.getByText("Review approval");

    // Wait for either approval indicator with a long timeout
    let hasApproval = false;
    try {
      await expect(
        approvalPending.or(reviewLink),
      ).toBeVisible({ timeout: 90_000 });
      hasApproval = true;
    } catch {
      // Scroll again in case content loaded below the fold
      await page.evaluate(() => {
        const scrollable = document.querySelector("[class*='overflow-y-auto']");
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      });
      await page.waitForTimeout(1000);
      hasApproval = await approvalPending.isVisible().catch(() => false);
    }

    if (hasApproval) {
      await screenshot(page, "12-approval-pending");
      console.log("\n=== Prompt 4: Approval Gate ===");
      console.log("Approval pending badge: VISIBLE");

      // Click "Review approval" link to go to approvals page
      const reviewLink = page.getByText("Review approval");
      await expect(reviewLink).toBeVisible({ timeout: 5_000 });
      await reviewLink.click();
      await expect(page).toHaveURL(/\/workspace\/approvals/);
      await page.waitForTimeout(1000);
      await screenshot(page, "13-approvals-inbox");

      // Select the pending approval
      const pendingRow = page.locator("tr").filter({ hasText: "pending" }).first();
      await expect(pendingRow).toBeVisible({ timeout: 10_000 });
      await pendingRow.click();
      await page.waitForTimeout(500);
      await screenshot(page, "14-approval-detail");

      // Approve it
      const approveButton = page.getByRole("button", { name: /Approve/i }).first();
      await expect(approveButton).toBeVisible();
      await approveButton.click();
      await page.waitForTimeout(2000);
      await screenshot(page, "15-approval-approved");
      console.log("Approval approved: YES");

      // Navigate back to chat to see the completed run
      await page.goto("/workspace/chat", { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      await screenshot(page, "16-final-chat-state");
    } else {
      // The run completed without approval gate (LLM didn't call create_ticket)
      await screenshot(page, "12-prompt4-completed");
      console.log("\n=== Prompt 4: No Approval Gate ===");
      console.log("Run completed without triggering create_ticket tool");
      console.log("This may happen if the LLM doesn't invoke the tool autonomously.");
    }

    // Final scroll-to-bottom screenshot of full conversation
    await page.evaluate(() => {
      const scrollable = document.querySelector("[class*='overflow-y-auto']");
      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight;
      }
    });
    await page.waitForTimeout(500);
    await screenshot(page, "17-final-scroll-bottom");

    console.log("\n=== Demo Rehearsal Complete ===");
    console.log(`Screenshots saved to ${screenshotDir}/`);
  });
});
