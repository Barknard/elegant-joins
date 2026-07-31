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
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The canvas and panels are touch-reachable; a phone viewport catches layout
    // regressions the desktop project never would.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    // VITE_BASE must be set for BOTH commands: the build bakes it into asset URLs and
    // `vite preview` reads it again to decide which path to serve from. Setting it on
    // only one produces a blank page with 404s on every chunk.
    // The build+serve chain lives in an npm script rather than inline here: Playwright
    // spawns this through the platform shell, and a `&&` chain with env prefixes did not
    // hand off to the preview step on Windows.
    command: "npm run e2e:serve",
    url: "http://127.0.0.1:4173",
    // NEVER reuse a server. This suite tests a production BUILD, so reusing whatever is
    // already on :4173 silently tests a stale bundle — which happened, and produced a
    // full green-looking run against code that no longer existed. Always rebuild.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
