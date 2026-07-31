import { expect, test } from "@playwright/test";
import { fixture, importFile, openAddSource, openApp } from "./helpers";

test.describe("File import — real parsing", () => {
  test("reads the actual columns and rows out of a CSV", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("customers.csv"));

    await expect(page.getByTestId("preview-columns")).toBeVisible();
    // The old build fabricated id/name/customer_id/created_at for EVERY file.
    await expect(page.getByTestId("preview-column-email")).toBeVisible();
    await expect(page.getByTestId("preview-column-city")).toBeVisible();
    await expect(page.getByTestId("preview-column-signup_date")).toBeVisible();
    await expect(page.getByText("6 columns and 6 rows")).toBeVisible();
  });

  test("infers a type per column, including booleans", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("customers.csv"));

    await expect(page.getByTestId("preview-column-customer_id")).toContainText("number");
    await expect(page.getByTestId("preview-column-city")).toContainText("text");
    await expect(page.getByTestId("preview-column-signup_date")).toContainText("date");
    // Numbers were tested before booleans, so this branch was unreachable.
    await expect(page.getByTestId("preview-column-active")).toContainText("boolean");
  });

  test("shows real values from the file, not placeholders", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("customers.csv"));

    const rows = page.getByTestId("preview-rows");
    await expect(rows).toContainText("Ada Lovelace");
    await expect(rows).toContainText("ada@example.com");
    await expect(rows).toContainText("London");
  });

  test("reads an Excel workbook", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("products.xlsx"));

    await expect(page.getByTestId("preview-column-product")).toBeVisible();
    await expect(page.getByTestId("preview-rows")).toContainText("Analytical Engine");
  });

  test("says which Excel sheets it did NOT import", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("products.xlsx"));

    // Previously the server read SheetNames[0] and mentioned nothing.
    const warnings = page.getByTestId("import-warnings");
    await expect(warnings).toBeVisible();
    await expect(warnings).toContainText("Targets");
    await expect(warnings).toContainText("Scratch");
  });

  test("keeps a column that is blank in the first row", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("sparse.xlsx"));

    // Reading Object.keys(rows[0]) used to drop this column entirely.
    await expect(page.getByTestId("preview-column-late_column")).toBeVisible();
  });

  test("handles quoted commas, escaped quotes and multi-line cells", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("messy.csv"));

    const rows = page.getByTestId("preview-rows");
    await expect(rows).toContainText("Bond, James");
    await expect(rows).toContainText('He said "hello"');
  });

  test("preserves zero-padded codes as text rather than numbers", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("messy.csv"));

    await expect(page.getByTestId("preview-rows")).toContainText("007");
  });

  test("refuses an unsupported file with a clear message", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    // package.json is definitely not a spreadsheet.
    await page.getByTestId("file-upload-input").setInputFiles(fixture("../../package.json"));

    const error = page.getByTestId("import-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText(/\.csv/);
    // It must NOT have proceeded to a confident preview of invented data.
    await expect(page.getByTestId("preview-columns")).toBeHidden();
  });

  test("puts the table on the canvas with its real name", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
    await expect(page.locator(".react-flow__node").first()).toContainText("customers.csv");
  });

  test("imports several files onto one canvas", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await importFile(page, "orders.csv");
    await importFile(page, "products.xlsx");
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
  });

  test("back returns to the upload step without adding anything", async ({ page }) => {
    await openApp(page);
    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("customers.csv"));
    await expect(page.getByTestId("preview-columns")).toBeVisible();

    await page.getByTestId("button-back").click();
    await expect(page.getByTestId("file-upload-input")).toBeAttached();
    await page.keyboard.press("Escape");
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
  });
});

test.describe("Smart scan", () => {
  test("matches real column names across two imported files", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");

    await openAddSource(page);
    await page.getByTestId("file-upload-input").setInputFiles(fixture("products.xlsx"));
    await expect(page.getByTestId("preview-columns")).toBeVisible();
    await page.getByTestId("button-smart-scan").click();

    // customer_id exists in both files for real — not because a mock said so.
    await expect(page.getByText(/potential connection/i)).toBeVisible();
    await expect(page.getByText("Exact name match")).toBeVisible();
  });

  test("creates a working edge from the accepted match", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await importFile(page, "products.xlsx", { smartScan: true });

    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  });
});
