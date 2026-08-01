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

  await openAddSource(page);
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

/**
 * Opens the Add Data dialog.
 *
 * The floating canvas button is collapsed on touch devices and expands on first tap,
 * so a single click opens the dialog on desktop but only reveals the button on a phone.
 * Clicking again when the dialog hasn't appeared covers both.
 */
export async function openAddSource(page: Page) {
  // The file input itself is permanently `class="hidden"` (a button triggers it), so
  // the dialog's own visible control is the signal that it actually opened.
  const dialogOpen = page.getByTestId("button-csv-upload");

  await page.getByTestId("button-add-source").click();

  // Wait GENEROUSLY before concluding a second tap is needed. The floating button uses a
  // two-step reveal on touch, but "the dialog hasn't appeared yet" looks identical to
  // "the button only expanded" — and on a slow CI runner a dialog that is merely taking
  // its time got a second click, which closed it again. Every mobile import failure on
  // CI traced back to this. The wait only costs anything when the dialog genuinely
  // never opens.
  try {
    await dialogOpen.waitFor({ state: "visible", timeout: 15000 });
    return;
  } catch {
    /* genuinely still collapsed — take the second tap */
  }

  await page.getByTestId("button-add-source").click();
  await dialogOpen.waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Triggers a top-bar action.
 *
 * The bar collapses into the hamburger menu on narrow screens, so the visible control
 * differs by viewport. Prefer the bar button; fall back to the menu item.
 */
export async function topBarAction(page: Page, label: string, menuTestId: string) {
  const barButton = page.getByRole("button", { name: label, exact: true });
  if (await barButton.isVisible().catch(() => false)) {
    await barButton.click();
    return;
  }
  await page.getByTestId("hamburger-button").click();
  await page.getByTestId(menuTestId).click();
}

/** Saves the current canvas as a named project and waits for confirmation. */
export async function saveProject(page: Page, name: string) {
  await topBarAction(page, "Save", "menu-save-project");
  const input = page.getByTestId("project-name-input");
  await expect(input).toBeVisible();
  await input.fill(name);
  await page.getByTestId("confirm-save-project").click();
  // The toast renders its title AND a screen-reader announcement containing the same
  // words, so an unscoped text match is ambiguous under strict mode. Take the first.
  await expect(page.getByText("Project Saved").first()).toBeVisible({ timeout: 15000 });
}

/** Opens the project list. */
export async function openProjectDialog(page: Page) {
  await topBarAction(page, "Open", "menu-open-project");
  await expect(page.getByTestId("search-projects")).toBeVisible();
}

/**
 * Taps a floating canvas toggle until the thing it opens appears.
 *
 * On touch devices these buttons use a two-step reveal: the first tap expands the
 * collapsed pill to show its label, and only the second tap performs the action. One
 * click is therefore enough on desktop and a no-op on a phone.
 */
async function tapToggle(page: Page, toggleTestId: string, revealTestId: string) {
  const reveal = page.getByTestId(revealTestId);
  const toggle = page.getByTestId(toggleTestId);

  await toggle.click();

  // Wait properly rather than checking visibility immediately: these panels animate in,
  // so an instant check races the transition and reports "not open" for a panel that is
  // opening — and the second tap would then toggle it straight back closed. Generous,
  // because on a slow runner "still animating" and "needs another tap" look the same.
  try {
    await reveal.waitFor({ state: "visible", timeout: 15000 });
    return;
  } catch {
    // Genuinely still collapsed (the touch two-step reveal): tap again.
  }

  await toggle.click();
  await expect(reveal).toBeVisible({ timeout: 10000 });
}

/** Opens the View Builder panel, via the hamburger menu when the toggle is collapsed. */
export async function openViewBuilder(page: Page) {
  if (await page.getByTestId("button-open-view-builder").isVisible().catch(() => false)) {
    await tapToggle(page, "button-open-view-builder", "button-run-preview");
    return;
  }
  await page.getByTestId("hamburger-button").click();
  await page.getByTestId("menu-view-builder").click();
  await expect(page.getByTestId("button-run-preview")).toBeVisible({ timeout: 10000 });
}

/** Opens the join preview panel. */
export async function openJoinPreview(page: Page) {
  await tapToggle(page, "button-open-join-preview", "preview-row-count");
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
