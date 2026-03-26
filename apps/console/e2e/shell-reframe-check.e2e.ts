import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.resolve(__dirname, "../../.playwright/shell-check");

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

test.describe("shell reframe acceptance check", () => {
  test("check all pages", async ({ page }) => {
    // 1. Login and check Home/Dashboard
    await login(page);
    await page.waitForTimeout(1500);
    await screenshot(page, "01-home");
    console.log("✓ Home: http://localhost:3000/workspace");

    // 2. Chat page
    await page.goto("/workspace/chat", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    await screenshot(page, "02-chat");
    console.log("✓ Chat: http://localhost:3000/workspace/chat");

    // 3. Assistants (formerly Agents)
    await page.goto("/workspace/agents", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    // Check for renamed terminology
    const assistantsHeading = page.locator("h1, h2").filter({ hasText: /assistant/i });
    const agentsHeading = page.locator("h1, h2").filter({ hasText: /agent/i });
    const assistantsCount = await assistantsHeading.count();
    const agentsCount = await agentsHeading.count();
    console.log(`  Assistants headings: ${assistantsCount}, Agents headings: ${agentsCount}`);
    await screenshot(page, "03-assistants");
    console.log("✓ Assistants: http://localhost:3000/workspace/agents");

    // 4. Knowledge (formerly Connectors)
    await page.goto("/workspace/connectors", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const knowledgeHeading = page.locator("h1, h2").filter({ hasText: /knowledge/i });
    const connectorsHeading = page.locator("h1, h2").filter({ hasText: /connector/i });
    console.log(`  Knowledge headings: ${await knowledgeHeading.count()}, Connectors headings: ${await connectorsHeading.count()}`);
    await screenshot(page, "04-knowledge");
    console.log("✓ Knowledge: http://localhost:3000/workspace/connectors");

    // 5. Reviews (formerly Approvals)
    await page.goto("/workspace/approvals", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const reviewsHeading = page.locator("h1, h2").filter({ hasText: /review/i });
    const approvalsHeading = page.locator("h1, h2").filter({ hasText: /approval/i });
    console.log(`  Reviews headings: ${await reviewsHeading.count()}, Approvals headings: ${await approvalsHeading.count()}`);
    await screenshot(page, "05-reviews");
    console.log("✓ Reviews: http://localhost:3000/workspace/approvals");

    // 6. Artifacts (new page)
    await page.goto("/workspace/artifacts", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const artifactsHeading = page.locator("h1").filter({ hasText: /artifact/i });
    expect(await artifactsHeading.count()).toBeGreaterThan(0);
    await screenshot(page, "06-artifacts");
    console.log("✓ Artifacts: http://localhost:3000/workspace/artifacts");

    // 7. Boundaries (new page)
    await page.goto("/workspace/boundaries", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const boundariesHeading = page.locator("h1").filter({ hasText: /boundar/i });
    expect(await boundariesHeading.count()).toBeGreaterThan(0);
    await screenshot(page, "07-boundaries");
    console.log("✓ Boundaries: http://localhost:3000/workspace/boundaries");

    // 8. Check navigation rail has new labels
    await page.goto("/workspace", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const bodyText = await page.locator("body").textContent();

    // Check for new nav labels
    const hasAssistants = /assistant/i.test(bodyText ?? "");
    const hasKnowledge = /knowledge/i.test(bodyText ?? "");
    const hasReviews = /review/i.test(bodyText ?? "");
    const hasArtifacts = /artifact/i.test(bodyText ?? "");
    const hasBoundaries = /boundar/i.test(bodyText ?? "");

    console.log("\nNavigation check:");
    console.log(`  Assistants label: ${hasAssistants ? "✓" : "✗"}`);
    console.log(`  Knowledge label: ${hasKnowledge ? "✓" : "✗"}`);
    console.log(`  Reviews label: ${hasReviews ? "✓" : "✗"}`);
    console.log(`  Artifacts label: ${hasArtifacts ? "✓" : "✗"}`);
    console.log(`  Boundaries label: ${hasBoundaries ? "✓" : "✗"}`);

    console.log("\n✓ All pages checked. Screenshots saved to .playwright/shell-check/");
  });
});
