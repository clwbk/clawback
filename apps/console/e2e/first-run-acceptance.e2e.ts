import { expect, test, type Page } from "@playwright/test";

/**
 * First-run acceptance test for the no-Google knowledge path.
 *
 * Proves that a first-time user (seeded as dave@hartwell.com) can:
 * 1. Log in with seeded credentials
 * 2. Reach the workspace (Today page)
 * 3. Discover the Knowledge link in the icon rail — no hidden URLs required
 * 4. Navigate to the connectors/knowledge page via that link
 * 5. See the seeded "Company Docs" connector with a non-zero sync status
 *
 * Assumptions:
 * - The stack is running (console on :3000, control-plane on :3001)
 * - The database has been seeded (dave@hartwell.com / demo1234 exists)
 * - The Company Docs connector has been seeded and synced at least once
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

test("no-google first-run: login, discover knowledge path, see seeded connector", async ({
  page,
}) => {
  // 1. Log in as the seeded demo user
  await login(page);

  // 2. Verify the workspace loads (Today page with the "Dashboard" heading
  //    or the personalized "For <name>" heading)
  await expect(page).toHaveURL(/\/workspace$/);
  const todayHeading = page.locator("h1").first();
  await expect(todayHeading).toBeVisible();

  // 3. Discover the Knowledge link in the icon rail (no hidden URLs)
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();
  const knowledgeButton = nav.getByRole("button", { name: "Knowledge" });
  await expect(knowledgeButton).toBeVisible();

  // 4. Click the Knowledge button to navigate to connectors page
  await knowledgeButton.click();
  await expect(page).toHaveURL(/\/workspace\/connectors/);

  // 5. Verify the connectors page renders with the Knowledge heading
  await expect(
    page.getByRole("heading", { name: "Knowledge sources" }),
  ).toBeVisible();

  // 6. Verify the seeded "Company Docs" connector is visible
  await expect(page.getByText("Company Docs")).toBeVisible();

  // 7. Verify sync status shows indexed documents (not zero)
  //    The sync stats render as "<N> indexed" where N > 0
  const indexedBadge = page.getByText(/\d+ indexed/);
  await expect(indexedBadge.first()).toBeVisible();

  // Confirm the indexed count is non-zero
  const indexedText = await indexedBadge.first().textContent();
  const match = indexedText?.match(/(\d+) indexed/);
  expect(match).not.toBeNull();
  const indexedCount = parseInt(match![1], 10);
  expect(indexedCount).toBeGreaterThan(0);
});
