/// <reference types="node" />
import { test, expect } from "@playwright/test";

// In CI the first load can be slow (Vite compile); allow time for app to render
const VISIBLE_TIMEOUT = 20_000;
const HAS_COGNITO_CONFIG =
  !!process.env.VITE_COGNITO_USER_POOL_ID && !!process.env.VITE_COGNITO_CLIENT_ID;

test.describe("YogaSwap App", () => {
  test("Startseite lädt und hat den YogaSwap-Titel", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/YogaSwap/i, { timeout: VISIBLE_TIMEOUT });
  });

  test("Impressum ist erreichbar und zeigt rechtliche Angaben", async ({ page }) => {
    test.skip(
      !HAS_COGNITO_CONFIG,
      "Impressum-Link erfordert Cognito-Konfiguration (Header/Footer).",
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/YogaSwap/i, { timeout: VISIBLE_TIMEOUT });

    await page.getByRole("link", { name: /Impressum/i }).click();
    await expect(page).toHaveURL(/\/impressum/);
    await expect(page.getByRole("heading", { name: "Impressum" })).toBeVisible({
      timeout: VISIBLE_TIMEOUT,
    });
  });
});
