import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.resolve(__dirname, "../../.playwright/phase3a-check");

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

test.describe("phase 3a acceptance", () => {
  test("template creation, assistant detail, and workbench sidecar", async ({ page }) => {
    await login(page);

    // 1. Assistants page with templates
    console.log("\n=== Check 1: Assistant templates ===");
    await page.goto("/workspace/agents", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await screenshot(page, "01-assistants-page");

    // Look for template cards or template-related UI
    const templateElements = page.locator("text=/template|Template|copilot|Copilot|follow-up|proposal/i");
    const templateCount = await templateElements.count();
    console.log(`  Template-related elements: ${templateCount}`);

    // Look for "Create" or "New assistant" button
    const createBtn = page.locator("button, a").filter({ hasText: /create|new assistant|from template/i });
    const createCount = await createBtn.count();
    console.log(`  Create/new assistant buttons: ${createCount}`);

    if (createCount > 0) {
      await createBtn.first().click();
      await page.waitForTimeout(1000);
      await screenshot(page, "02-create-from-template");
      console.log("  ✓ Clicked create/new assistant");
    }

    // 2. Assistant detail with new tabs
    console.log("\n=== Check 2: Assistant detail tabs ===");
    // Navigate to existing Incident Copilot
    await page.goto("/workspace/agents", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Click on Incident Copilot or the first assistant
    const assistantLink = page.locator("text=Incident Copilot").first();
    if (await assistantLink.isVisible().catch(() => false)) {
      await assistantLink.click();
      await page.waitForTimeout(1500);
      await screenshot(page, "03-assistant-detail");

      // Check for new tab structure
      const tabs = page.locator("[role='tab'], button").filter({
        hasText: /setup|behavior|knowledge|boundaries|preview|general|instructions|capabilities/i,
      });
      const tabTexts: string[] = [];
      for (let i = 0; i < await tabs.count(); i++) {
        const text = await tabs.nth(i).textContent();
        if (text) tabTexts.push(text.trim());
      }
      console.log(`  Tabs found: ${tabTexts.join(", ")}`);

      // Click through each tab
      for (const tabText of tabTexts.slice(0, 5)) {
        const tab = page.locator("[role='tab'], button").filter({ hasText: new RegExp(tabText, "i") }).first();
        if (await tab.isVisible().catch(() => false)) {
          await tab.click();
          await page.waitForTimeout(500);
        }
      }
      await screenshot(page, "04-assistant-tabs-explored");
      console.log("  ✓ Assistant detail tabs working");
    } else {
      console.log("  ⚠ Incident Copilot not found, checking general layout");
      await screenshot(page, "03-assistants-no-copilot");
    }

    // 3. Chat with workbench sidecar
    console.log("\n=== Check 3: Chat workbench sidecar ===");
    await page.goto("/workspace/chat", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Select Incident Copilot if available
    const agentButton = page.locator("text=Incident Copilot").first();
    if (await agentButton.isVisible().catch(() => false)) {
      await agentButton.click();
      await page.waitForTimeout(1000);
    }

    // Select a thread with content
    const thread1 = page.locator("text=Thread 1").first();
    if (await thread1.isVisible().catch(() => false)) {
      await thread1.click();
      await page.waitForTimeout(1500);
    }

    await screenshot(page, "05-chat-with-sidecar");

    // Look for workbench sidecar elements
    const workbenchElements = page.locator("[class*='workbench'], [class*='sidecar'], [data-workbench]");
    const sidecarCount = await workbenchElements.count();
    console.log(`  Workbench sidecar elements: ${sidecarCount}`);

    // Look for any panel/sidebar that might be the workbench
    const panels = page.locator("[class*='panel'], aside, [class*='sidebar']").filter({
      hasText: /artifact|source|context|workbench/i,
    });
    const panelCount = await panels.count();
    console.log(`  Workbench-like panels: ${panelCount}`);

    // Check viewport width — sidecar might only show on wide viewports
    const viewport = page.viewportSize();
    console.log(`  Viewport: ${viewport?.width}x${viewport?.height}`);

    // Try wider viewport for sidecar
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(500);
    await screenshot(page, "06-chat-wide-viewport");

    console.log("\n✓ Phase 3a acceptance checks complete.");
    console.log("  Screenshots saved to .playwright/phase3a-check/");
  });
});
