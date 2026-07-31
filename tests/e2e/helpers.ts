import { expect, type Page } from "@playwright/test";
import { join } from "node:path";

export const fixture = (name: string) => join(process.cwd(), "tests", "fixtures", name);

/**
 * Opens the app on a clean slate.
 *
 * Both the welcome modal and the boot loader key off storage, so without clearing it
 * tests would pass or fail depending on what a previous test left behind. IndexedDB is
 * wiped too — it is now the app's entire database, so a leftover project from an
 * earlier test would show up in the Open dialog and break row counts.
 */
export async function openApp(page: Page) {
  // Clear ONCE, after the first load — not via addInitScript. An init script re-runs on
  // every navigation, so `page.reload()` would wipe IndexedDB and destroy exactly what
  // the persistence tests are meant to verify survives a reload.
  await page.goto("/");
  await resetStorage(page);
  await page.reload();
  await dismissWelcome(page);
}

/** Empties localStorage, sessionStorage and the app's IndexedDB database. */
export async function resetStorage(page: Page) {
  await page.evaluate(async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* storage can be blocked; the app must still boot */
    }
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("elegant-joins");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

/** Closes the welcome modal if it appeared, leaving an empty canvas. */
export async function dismissWelcome(page: Page) {
  const modal = page.getByTestId("welcome-modal");
  // The modal is shown on a 500ms delay, so a plain isVisible() races it.
  await modal.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (await modal.isVisible().catch(() => false)) {
    await page.getByTestId("button-skip-welcome").click();
    await modal.waitFor({ state: "hidden" });
  }
}

/** Loads the bundled sample dataset via the welcome modal instead of skipping it. */
export async function startWithSampleData(page: Page) {
  await page.goto("/");
  await resetStorage(page);
  await page.reload();
  const modal = page.getByTestId("welcome-modal");
  await modal.waitFor({ state: "visible", timeout: 8000 });
  await page.getByTestId("button-get-started").click();
  await modal.waitFor({ state: "hidden" });
}

/**
 * Imports a fixture file through the real Add Data flow and drops it on the canvas.
 * Returns once the new node is on the canvas.
 */
export async function importFile(page: Page, fileName: string, opts: { smartScan?: boolean } = {}) {
  const before = await page.locator(".react-flow__node").count();

  await page.getByTestId("button-add-source").click();
  await page.getByTestId("file-upload-input").setInputFiles(fixture(fileName));

  // The parse is real now, so wait for the preview rather than a fixed delay.
  await expect(page.getByTestId("preview-columns")).toBeVisible({ timeout: 15000 });

  if (opts.smartScan && (await page.getByTestId("button-smart-scan").isVisible().catch(() => false))) {
    await page.getByTestId("button-smart-scan").click();
    await page.getByTestId("button-add-with-connections").click();
  } else {
    await page.getByTestId("button-add-table").click();
  }

  await expect(page.locator(".react-flow__node")).toHaveCount(before + 1, { timeout: 15000 });
}

/** Saves the current canvas as a named project and waits for confirmation. */
export async function saveProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const input = page.getByTestId("project-name-input");
  await expect(input).toBeVisible();
  await input.fill(name);
  await page.getByTestId("confirm-save-project").click();
  await expect(page.getByText("Project Saved")).toBeVisible({ timeout: 15000 });
}

/** Opens the project list. */
export async function openProjectDialog(page: Page) {
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByTestId("search-projects")).toBeVisible();
}

/**
 * A project's row in the Open dialog, matched by its heading.
 *
 * Plain `getByText(name)` also matches the "saved successfully" toast and the toast's
 * aria-live announcement, which trips Playwright's strict mode. The heading is the row.
 */
export function projectRow(page: Page, name: string) {
  return page.getByRole("heading", { name, exact: true });
}
