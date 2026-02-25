import { test, expect } from "@playwright/test";

// In CI the first load can be slow (Vite compile); allow time for app to render
const VISIBLE_TIMEOUT = 20_000;

test.describe("YogaSwap App", () => {
  test("Startseite lädt und zeigt Login oder App mit YogaSwap", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /YogaSwap/i })).toBeVisible({
      timeout: VISIBLE_TIMEOUT,
    });
  });

  test("Impressum ist erreichbar und zeigt rechtliche Angaben", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /YogaSwap/i })).toBeVisible({
      timeout: VISIBLE_TIMEOUT,
    });
    await page.getByRole("link", { name: /Impressum/i }).click();
    await expect(page).toHaveURL(/\/impressum/);
    await expect(page.getByRole("heading", { name: "Impressum" })).toBeVisible({
      timeout: VISIBLE_TIMEOUT,
    });
  });
});
