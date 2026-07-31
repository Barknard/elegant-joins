import { expect, test } from "@playwright/test";

/**
 * Guards the deployed URL shape.
 *
 * These tests run against a build made with the real Pages base (/elegant-joins/) and
 * served at that sub-path, because a root-served build cannot detect base-path bugs.
 * The first deploy of this app was fully broken — a 404 screen for every visitor —
 * while all 33 root-served tests passed.
 */
test.describe("Served from the /elegant-joins/ sub-path", () => {
  test("boots the app, not the 404 screen", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await page.goto("/elegant-joins/");

    await expect(page.getByText("404 Page Not Found")).toHaveCount(0);
    // The welcome modal is the first thing a real visitor sees.
    await expect(page.getByTestId("welcome-modal")).toBeVisible({ timeout: 15000 });
    expect(consoleErrors).toEqual([]);
  });

  test("resolves every asset under the base path", async ({ page }) => {
    const failed: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });

    await page.goto("/elegant-joins/");
    await expect(page.getByTestId("welcome-modal")).toBeVisible({ timeout: 15000 });

    // Catches an icon, font or manifest referenced with a root-absolute path.
    expect(failed).toEqual([]);
  });

  test("serves the manifest and its icons from the sub-path", async ({ request }) => {
    const manifest = await request.get("/elegant-joins/manifest.json");
    expect(manifest.ok()).toBeTruthy();

    for (const icon of (await manifest.json()).icons) {
      const res = await request.get(`/elegant-joins/${icon.src.replace(/^\.\//, "")}`);
      expect(res.ok(), `${icon.src} should resolve under the base path`).toBeTruthy();
    }
  });

  test("registers a service worker scoped to the base path", async ({ page }) => {
    await page.goto("/elegant-joins/");
    const sw = await page.request.get("/elegant-joins/sw.js");
    expect(sw.ok()).toBeTruthy();
  });
});
