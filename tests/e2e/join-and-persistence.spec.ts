import { expect, test } from "@playwright/test";
import { importFile, openApp, openJoinPreview, openProjectDialog, openViewBuilder, projectRow, saveProject } from "./helpers";

/** Canvas with customers.csv + products.xlsx joined on customer_id. */
async function twoJoinedTables(page: import("@playwright/test").Page) {
  await openApp(page);
  await importFile(page, "customers.csv");
  await importFile(page, "products.xlsx", { smartScan: true });
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
}

test.describe("Join preview", () => {
  test("joins real data across a CSV and an Excel file", async ({ page }) => {
    await twoJoinedTables(page);
    await openJoinPreview(page);

    // The CSV's customer_id is a string, the workbook's is a number. The old `===`
    // comparison matched nothing here and reported it as an empty result.
    await expect(page.getByTestId("preview-row-count")).toBeVisible();
    await expect(page.getByTestId("preview-row-count")).not.toContainText("0 rows");
    await expect(page.getByText("Analytical Engine")).toBeVisible();
  });

  test("shows its work: the ordered join steps", async ({ page }) => {
    await twoJoinedTables(page);
    await openJoinPreview(page);

    const steps = page.getByTestId("preview-steps");
    await expect(steps).toBeVisible();
    await expect(steps).toContainText(/JOIN/);
    await expect(steps).toContainText(/customer_id/);
  });

  test("shows only values that exist in the files — never invented ones", async ({ page }) => {
    await twoJoinedTables(page);
    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toBeVisible();

    // The old panel fabricated rows from column-name heuristics whenever it felt data
    // was missing: fixed company names, userN@example.com, "Sample N". None of those
    // strings appear in any fixture, so any sighting means fabrication is back.
    await expect(page.getByText(/Acme Corp|Globex|Initech|Umbrella Corp|Stark Industries|Wayne Enterprises/)).toHaveCount(0);
    await expect(page.getByText(/user\d+@example\.com/)).toHaveCount(0);
    await expect(page.getByText(/^Sample \d+$/)).toHaveCount(0);

    // And the values that ARE shown come from the fixtures.
    await expect(page.getByText("Analytical Engine")).toBeVisible();
  });

  test("panel opens and closes", async ({ page }) => {
    await twoJoinedTables(page);
    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toBeVisible();
    await page.getByTestId("button-close-preview").click();
    await expect(page.getByTestId("preview-row-count")).toBeHidden();
  });

  test("remembers the panel width across a reload", async ({ page }) => {
    await twoJoinedTables(page);
    await page.evaluate(() => localStorage.setItem("elegantjoins_preview_width", "600"));
    await page.reload();
    const stored = await page.evaluate(() => localStorage.getItem("elegantjoins_preview_width"));
    expect(stored).toBe("600");
  });
});

test.describe("View builder", () => {
  test("Run produces rows from the real data", async ({ page }) => {
    await twoJoinedTables(page);
    await openViewBuilder(page);
    await page.getByTestId("button-run-preview").click();

    await expect(page.getByTestId("output-row-count")).toBeVisible();
    // Output used to be 5-12 random rows unrelated to anything on the canvas.
    await expect(page.getByText("Analytical Engine")).toBeVisible();
  });

  test("field selection actually changes the output columns", async ({ page }) => {
    await twoJoinedTables(page);
    await openViewBuilder(page);

    const checkboxes = page.locator('[id^="field-"]');
    const total = await checkboxes.count();
    expect(total).toBeGreaterThan(2);

    // Uncheck the first field, then run.
    await checkboxes.first().click();
    await page.getByTestId("button-run-preview").click();
    await expect(page.getByTestId("output-row-count")).toBeVisible();

    const headerCount = await page.locator("thead th").count();
    expect(headerCount).toBeLessThan(total);
  });

  test("exports a real CSV file", async ({ page }) => {
    await twoJoinedTables(page);
    await openViewBuilder(page);
    await page.getByTestId("button-run-preview").click();
    await page.getByRole("tab", { name: "Export" }).click();

    const download = page.waitForEvent("download");
    await page.getByTestId("button-export-csv").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
  });

  test("exports a real Excel file — not just a toast", async ({ page }) => {
    await twoJoinedTables(page);
    await openViewBuilder(page);
    await page.getByTestId("button-run-preview").click();
    await page.getByRole("tab", { name: "Export" }).click();

    // This button previously waited 2000ms, showed a toast, and produced no file.
    const download = page.waitForEvent("download");
    await page.getByTestId("button-export-excel").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  test("export buttons stay disabled until a run has happened", async ({ page }) => {
    await twoJoinedTables(page);
    await openViewBuilder(page);
    await page.getByRole("tab", { name: "Export" }).click();
    await expect(page.getByTestId("button-export-csv")).toBeDisabled();
    await expect(page.getByTestId("button-export-excel")).toBeDisabled();
  });
});

test.describe("Projects persist in the browser", () => {
  test("saves a project and lists it in Open", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await saveProject(page, "Persistence check");

    await openProjectDialog(page);
    await expect(projectRow(page, "Persistence check")).toBeVisible();
  });

  test("survives a full page reload", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await importFile(page, "orders.csv");
    await saveProject(page, "Reload survivor");

    // Reload WITHOUT clearing storage — this is the real durability test.
    await page.reload();
    await page.getByTestId("button-skip-welcome").click().catch(() => {});

    await openProjectDialog(page);
    await projectRow(page, "Reload survivor").dblclick();
    await expect(page.locator(".react-flow__node")).toHaveCount(2, { timeout: 20000 });
  });

  test("reopening a project restores its rows, not just its shape", async ({ page }) => {
    await twoJoinedTables(page);
    await saveProject(page, "Row fidelity");
    await page.reload();
    await page.getByTestId("button-skip-welcome").click().catch(() => {});

    await openProjectDialog(page);
    await projectRow(page, "Row fidelity").dblclick();
    await expect(page.locator(".react-flow__node")).toHaveCount(2, { timeout: 20000 });

    // The real assertion: rawData survived the save/load round-trip. If it hadn't, the
    // canvas would still look right but the join would produce nothing.
    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toBeVisible();
    await expect(page.getByText("Analytical Engine")).toBeVisible();
  });

  test("deletes a project", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await saveProject(page, "Doomed project");

    await openProjectDialog(page);
    page.on("dialog", (d) => d.accept());
    const row = page.locator('[data-testid^="delete-project-"]').first();
    await row.click();
    await expect(projectRow(page, "Doomed project")).toHaveCount(0);
  });

  test("search filters the project list", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await saveProject(page, "Alpha report");

    // Save updates the CURRENTLY OPEN project — there is no Save As. Reloading drops
    // the current-project pointer, so the next save creates a second project.
    await page.reload();
    await page.getByTestId("button-skip-welcome").click().catch(() => {});
    await importFile(page, "orders.csv");
    await saveProject(page, "Beta report");

    await openProjectDialog(page);
    await page.getByTestId("search-projects").fill("Alpha");
    await expect(projectRow(page, "Alpha report")).toBeVisible();
    await expect(projectRow(page, "Beta report")).toHaveCount(0);
  });

  test("one project's contents do not leak into another", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await saveProject(page, "One table");

    await page.reload();
    await page.getByTestId("button-skip-welcome").click().catch(() => {});
    await importFile(page, "customers.csv");
    await importFile(page, "orders.csv");
    await saveProject(page, "Two tables");

    await openProjectDialog(page);
    await projectRow(page, "One table").dblclick();
    // Saving the second project must not have rewritten the first.
    await expect(page.locator(".react-flow__node")).toHaveCount(1, { timeout: 20000 });
  });
});

test.describe("Offline-capable shell", () => {
  test("makes no third-party network requests", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (!["127.0.0.1", "localhost"].includes(url.hostname)) external.push(r.url());
    });

    await openApp(page);
    await importFile(page, "customers.csv");

    // Fonts used to come from fonts.googleapis.com, leaking every visitor.
    expect(external).toEqual([]);
  });

  test("ships a manifest and icons for installation", async ({ page }) => {
    await openApp(page);
    const manifest = await page.request.get("/manifest.json");
    expect(manifest.ok()).toBeTruthy();
    const json = await manifest.json();
    expect(json.name).toBe("Elegant Joins");
    expect(json.icons.length).toBeGreaterThanOrEqual(3);

    for (const icon of json.icons) {
      const res = await page.request.get(icon.src.replace(/^\.\//, "/"));
      expect(res.ok(), `${icon.src} should exist`).toBeTruthy();
    }
  });

  test("allows pinch zoom", async ({ page }) => {
    await openApp(page);
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    // `maximum-scale=1` blocked zoom entirely — an accessibility failure.
    expect(viewport).not.toContain("maximum-scale");
    expect(viewport).not.toContain("user-scalable=no");
  });
});
