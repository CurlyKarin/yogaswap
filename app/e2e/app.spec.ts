import { test, expect } from "@playwright/test";

test.describe("YogaSwap App", () => {
  test("Startseite lädt und zeigt Login oder App mit YogaSwap", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /YogaSwap/i })).toBeVisible();
  });

  test("Impressum ist erreichbar und zeigt rechtliche Angaben", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Impressum/i }).click();
    await expect(page).toHaveURL(/\/impressum/);
    await expect(page.getByRole("heading", { name: "Impressum" })).toBeVisible();
  });
});
