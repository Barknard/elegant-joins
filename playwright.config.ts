import { defineConfig, devices } from "@playwright/test";

/**
 * The suite runs against a production build served at the root, not the dev server:
 * `vite preview` exercises the same bundling, chunk-splitting and asset paths that
 * GitHub Pages will serve, so a path bug can't hide behind dev-server rewrites.
 *
 * BASE_PATH=/ makes the build root-relative for local serving; the deployed build uses
 * the default /elegant-joins/ base.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Importing and joining real files on a React Flow canvas is genuinely slow at a phone
  // viewport, and a shared CI runner is slower again — 60s there produced timeouts on
  // work that passes locally. This is runner speed, not a defect, so give CI the room
  // rather than dropping the coverage or leaving a permanently-red step nobody reads.
  timeout: process.env.CI ? 150_000 : 60_000,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4173" }, testIgnore: /pages-base\.spec\.ts/ },
    {
      // Runs against a build made with the REAL Pages base and served at that sub-path.
      // Everything else is served from the root, which cannot catch base-path bugs.
      name: "pages-base",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4174" },
      testMatch: /pages-base\.spec\.ts/,
    },
    {
      // A narrow touch viewport catches layout regressions the desktop project never
      // would. Deliberately NOT a full phone descriptor: those lay the page out at a
      // larger CSS viewport and scale it down, which makes click targeting unreliable
      // and tests the emulator rather than the stylesheet.
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false, baseURL: "http://127.0.0.1:4173" },
      testIgnore: /pages-base\.spec\.ts/,
    },
  ],

  webServer: [
    {
      // VITE_BASE must be set for BOTH commands: the build bakes it into asset URLs and
      // `vite preview` reads it again to decide which path to serve from. Setting it on
      // only one produces a blank page with 404s on every chunk.
      // The chain lives in an npm script rather than inline: Playwright spawns this
      // through the platform shell, and a `&&` chain with env prefixes did not hand off
      // to the preview step on Windows.
      command: "npm run e2e:serve",
      url: "http://127.0.0.1:4173",
      // NEVER reuse a server. This suite tests a production BUILD, so reusing whatever is
      // already on :4173 silently tests a stale bundle — which happened, and produced a
      // full green-looking run against code that no longer existed. Always rebuild.
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // The same app built for GitHub Pages and served at /elegant-joins/, so base-path
      // bugs are caught before a deploy rather than by a visitor.
      command: "npm run e2e:serve:pages",
      url: "http://127.0.0.1:4174/elegant-joins/",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
