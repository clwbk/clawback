import { expect, test, type Page } from "@playwright/test";

const loginEmail = process.env.CONSOLE_E2E_EMAIL ?? "admin@example.com";
const loginPassword = process.env.CONSOLE_E2E_PASSWORD ?? "demo1234";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(loginEmail);
  await page.getByLabel("Password").fill(loginPassword);
  await Promise.all([
    page.waitForURL(/\/workspace$/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test.describe("console smoke", () => {
  test("redirects unauthenticated workspace access to login", async ({
    page,
  }) => {
    await page.goto("/workspace", { waitUntil: "networkidle" });

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Sign in to Clawback" }),
    ).toBeVisible();

    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(background).not.toBe("rgb(255, 255, 255)");
  });

  test("renders the authenticated dashboard with a left rail", async ({
    page,
  }) => {
    await login(page);

    await expect(page).toHaveURL(/\/workspace$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav).toBeVisible();

    const navBox = await nav.boundingBox();
    const headingBox = await page
      .getByRole("heading", { name: "Dashboard" })
      .boundingBox();

    expect(navBox).not.toBeNull();
    expect(headingBox).not.toBeNull();

    if (!navBox || !headingBox) {
      throw new Error(
        "Expected navigation rail and dashboard heading to be rendered.",
      );
    }

    expect(navBox.x).toBeLessThan(80);
    expect(navBox.width).toBeLessThan(80);
    expect(navBox.height).toBeGreaterThan(500);
    expect(headingBox.x).toBeGreaterThan(navBox.width + 80);

    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(background).not.toBe("rgb(255, 255, 255)");
  });

  test("loads the approvals inbox for an authenticated admin", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/workspace/approvals", { waitUntil: "networkidle" });

    await expect(page).toHaveURL(/\/workspace\/approvals$/);
    await expect(
      page.getByRole("heading", { name: "Approvals" }),
    ).toBeVisible();
    await expect(page.getByText("Approval inbox")).toBeVisible();
  });
});
