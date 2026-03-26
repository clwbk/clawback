import { test, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "../../.playwright/seeded-check");

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("dave@hartwell.com");
  await page.getByLabel("Password").fill("demo1234");
  await Promise.all([
    page.waitForURL(/\/workspace/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test("screenshot seeded workspace", async ({ page }) => {
  await login(page);
  const pages = ["workspace", "workspace/workers", "workspace/inbox", "workspace/work", "workspace/connections", "workspace/activity"];
  for (const p of pages) {
    await page.goto(`/${p}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(dir, `${p.replace(/\//g, "-")}.png`), fullPage: true });
    console.log(`✓ ${p}`);
  }
});
