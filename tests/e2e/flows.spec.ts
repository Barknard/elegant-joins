import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  dismissWelcome,
  fixture,
  importFile,
  openApp,
  openJoinPreview,
  openProjectDialog,
  openViewBuilder,
  projectRow,
  resetStorage,
  saveProject,
  topBarAction,
} from "./helpers";

/**
 * Believable, multi-step sessions across the whole app, each checked against the real
 * numbers the fixtures produce rather than a generic "something rendered".
 *
 * Expected values used throughout (from tests/fixtures):
 *   customers.csv  — 6 rows, customer_id 1..6 (string)
 *   orders.csv     — 6 rows, customer_id 1,1,2,3,99,2 (99 is an orphan, no such customer)
 *   products.xlsx  — 4 rows, customer_id 1..4 (number)
 *
 * customers INNER orders on customer_id = 5 rows (customers 4/5/6 have no orders; the
 * orphan order for customer 99 has no customer). customers LEFT orders = 8 rows (the
 * unmatched customers survive with null order columns). Adding products LEFT on top of
 * that LEFT join still nets 8 rows, because products has no duplicate customer_id.
 */

// ---------------------------------------------------------------------------
// Local helpers. Duplicated (not imported) from functions.spec.ts on purpose —
// each spec file is a standalone owner of its own file per the task's file split.
// ---------------------------------------------------------------------------

/** The `.react-flow__node` for a table, matched by its visible file name or display label. */
function tableNode(page: Page, label: string): Locator {
  return page.locator(".react-flow__node").filter({ hasText: label });
}

/**
 * The DOM row for one column, inside a table node. EditableLabel reuses the same
 * testids for every table/column, so every lookup here is an exact-text match scoped
 * to the row that contains it, never a bare testid.
 */
function columnRow(scope: Locator, columnName: string): Locator {
  return scope
    .getByText(columnName, { exact: true })
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]');
}

/** Marks a column as a key so it grows a connection handle — non-key columns render none. */
async function makeKey(node: Locator, columnName: string) {
  await columnRow(node, columnName).locator('[data-testid^="toggle-key-"]').click();
}

/**
 * Drags from one column's dormant source handle to another's dormant target handle.
 * Both handles are real, always-present DOM nodes once a column is a key (only their
 * decorative sibling icon is opacity/hover-driven — see TableNode.tsx), so raw mouse
 * down/move/up over their bounding boxes drives React Flow's own connection logic
 * exactly as a real drag would.
 */
async function dragConnect(fromNode: Locator, fromColumn: string, toNode: Locator, toColumn: string, page: Page) {
  const source = columnRow(fromNode, fromColumn).locator('[data-testid^="handle-source-"]');
  const target = columnRow(toNode, toColumn).locator('[data-testid^="handle-target-"]');
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error(`No connection handle for ${fromColumn} -> ${toColumn}`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** The always-visible link button on a CONNECTED column — clicking it reopens the
 * relationship modal for that edge (Home.tsx's handleEdgeClickFromNode). */
function connectionButton(node: Locator, columnName: string): Locator {
  return columnRow(node, columnName).locator('[data-testid^="connection-source-"], [data-testid^="connection-target-"]');
}

/** Cardinality/join-type cards in RelationshipModal are plain divs, not real radio
 * inputs. `cursor-pointer` scopes to just the option card — the label text alone also
 * matches every ancestor container up to the dialog. */
function optionCard(dialog: Locator, label: string): Locator {
  return dialog.locator("div.cursor-pointer", { hasText: label });
}

/**
 * Imported tables land at RANDOM positions (Home.tsx's handleAddTable uses
 * `Math.random() * 400 + 100` for both x and y). Two random tables can end up visually
 * overlapping, which makes one node intercept clicks meant for the other entirely. Drag
 * each newly-imported node into a fixed, well-separated grid slot immediately after it
 * lands — before anything else can cover it — so every later interaction targets
 * predictable on-screen coordinates.
 */
async function placeNode(page: Page, node: Locator, x: number, y: number) {
  const handle = node.locator("[data-node-drag-handle]");
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 10 });
  await page.mouse.up();
}

const GRID = [
  { x: 220, y: 240 },
  { x: 700, y: 240 },
  { x: 1080, y: 240 },
];

/**
 * Imports a fixture and immediately drags it into grid slot `slot` (0, 1, 2, ...).
 *
 * `fitView` runs the moment the FIRST table lands, zooming in tight around that one
 * card. A SECOND table's random spawn position is then rendered against that already
 * zoomed-in camera and can land far outside the visible viewport — clicking "fit view"
 * again before grabbing the drag handle brings every current node back on screen first.
 */
async function importAndPlace(page: Page, fileName: string, slot: number, opts: { smartScan?: boolean } = {}) {
  await importFile(page, fileName, opts);
  await page.locator(".react-flow__controls-fitview").click();
  await placeNode(page, tableNode(page, fileName), GRID[slot].x, GRID[slot].y);
}

/** Fills in and confirms the relationship modal (create or edit). */
async function confirmRelationship(page: Page, opts: { cardinality?: string; joinType?: string; editing?: boolean } = {}) {
  const dialog = page.getByRole("dialog");
  if (opts.cardinality) await optionCard(dialog, opts.cardinality).click();
  if (opts.joinType) await optionCard(dialog, opts.joinType).click();
  await dialog.getByRole("button", { name: opts.editing ? "Update" : "Connect Tables" }).click();
  await expect(dialog).toBeHidden();
}

/** All join preview / view builder result rows, scoped to whichever result table is
 * currently the only one in the DOM (the two panels are never open at once in these
 * flows). */
function resultRows(page: Page): Locator {
  return page.locator("tbody tr");
}

test.describe("Analyst's full journey", () => {
  test("import, connect, choose INNER, preview, refine in View Builder, export — and the export matches the preview", async ({ page }) => {
    await openApp(page);
    await importAndPlace(page, "customers.csv", 0);
    await importAndPlace(page, "orders.csv", 1);

    const customers = tableNode(page, "customers.csv");
    const orders = tableNode(page, "orders.csv");

    // orders.customer_id is column index 1, so it isn't a key (and has no handle) until
    // we make it one — customers.customer_id already is (first column, auto-keyed on import).
    await makeKey(orders, "customer_id");
    await dragConnect(customers, "customer_id", orders, "customer_id", page);
    await confirmRelationship(page, { joinType: "Only Matches" });
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toContainText("5 rows");
    await expect(resultRows(page)).toHaveCount(5);
    // Ada Lovelace (customer 1) has two real orders; both must survive the inner join.
    await expect(resultRows(page).filter({ hasText: "Ada Lovelace" }).filter({ hasText: "Analytical Engine" })).toHaveCount(1);
    await expect(resultRows(page).filter({ hasText: "Ada Lovelace" }).filter({ hasText: "Punch Cards" })).toHaveCount(1);
    // Annie Easley (customer 4) has no orders at all — INNER must drop her entirely.
    await expect(resultRows(page).filter({ hasText: "Annie Easley" })).toHaveCount(0);
    // The orphan order (customer_id 99, no such customer) must never appear either.
    await expect(page.getByText("Ghost Order")).toHaveCount(0);

    await openViewBuilder(page);
    // Deselect one field from each table — the export must reflect both removals.
    await page.getByRole("checkbox", { name: "email", exact: true }).click();
    await page.getByRole("checkbox", { name: "ordered_on", exact: true }).click();
    await page.getByTestId("button-run-preview").click();
    await expect(page.getByTestId("output-row-count")).toContainText("5 rows");
    await expect(page.locator("thead").getByText("email", { exact: true })).toHaveCount(0);
    await expect(page.locator("thead").getByText("ordered_on", { exact: true })).toHaveCount(0);

    await page.getByRole("tab", { name: "Export" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("button-export-csv").click();
    const download = await downloadPromise;
    const csv = readFileSync((await download.path())!, "utf-8");
    const lines = csv.trim().split(/\r?\n/);

    expect(lines[0]).not.toContain("email");
    expect(lines[0]).not.toContain("ordered_on");
    expect(lines.length - 1).toBe(5); // header + 5 data rows, matching the preview exactly
    expect(csv).toContain("Ada Lovelace");
    expect(csv).toContain("Analytical Engine");
    expect(csv).toContain("Punch Cards");
    expect(csv).toContain("Compiler License");
    expect(csv).toContain("Debugging Kit");
    expect(csv).toContain("Orbital Calculator");
    expect(csv).not.toContain("Annie Easley");
  });
});

test.describe("Three-table chain", () => {
  test("joining a third table extends the chain instead of stopping at two", async ({ page }) => {
    await openApp(page);
    await importAndPlace(page, "customers.csv", 0);
    await importAndPlace(page, "orders.csv", 1);
    await importAndPlace(page, "products.xlsx", 2);

    const customers = tableNode(page, "customers.csv");
    const orders = tableNode(page, "orders.csv");
    const products = tableNode(page, "products.xlsx");

    await makeKey(orders, "customer_id"); // products.customer_id is already a key (column 0)
    await dragConnect(customers, "customer_id", orders, "customer_id", page);
    await confirmRelationship(page); // defaults: many-to-one, LEFT
    await dragConnect(customers, "customer_id", products, "customer_id", page);
    await confirmRelationship(page); // defaults: many-to-one, LEFT

    await expect(page.locator(".react-flow__edge")).toHaveCount(2);

    await openJoinPreview(page);
    // Every one of customers' 6 rows survives (LEFT), and products has no duplicate
    // customer_id, so joining it on top adds no extra rows: still 8, same as the
    // two-table LEFT join.
    await expect(page.getByTestId("preview-row-count")).toContainText("8 rows");
    await expect(resultRows(page)).toHaveCount(8);

    // All three tables' columns appear together in the same row: Ada Lovelace's order
    // AND her product record both show up alongside her name.
    await expect(
      resultRows(page).filter({ hasText: "Ada Lovelace" }).filter({ hasText: "Punch Cards" }).filter({ hasText: "Analytical Engine" }),
    ).toHaveCount(1);
    // Annie Easley (customer 4) has no orders but DOES have a product record — proof
    // the third table's data reaches rows the second table never touched.
    const annieRow = resultRows(page).filter({ hasText: "Annie Easley" });
    await expect(annieRow).toHaveCount(1);
    await expect(annieRow).toContainText("Wind Tunnel Pass");
    await expect(annieRow).toContainText("null"); // her (missing) order columns
  });
});

test.describe("Changing the join type changes the results", () => {
  test("switching an existing LEFT join to INNER drops the unmatched rows", async ({ page }) => {
    await openApp(page);
    await importAndPlace(page, "customers.csv", 0);
    await importAndPlace(page, "orders.csv", 1);

    const customers = tableNode(page, "customers.csv");
    const orders = tableNode(page, "orders.csv");
    await makeKey(orders, "customer_id");
    await dragConnect(customers, "customer_id", orders, "customer_id", page);
    await confirmRelationship(page, { joinType: "Keep All From Left" });

    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toContainText("8 rows");
    await expect(resultRows(page).filter({ hasText: "Annie Easley" })).toHaveCount(1);
    await expect(resultRows(page).filter({ hasText: "Dorothy Vaughan" })).toHaveCount(1);
    await expect(resultRows(page).filter({ hasText: "Mary Jackson" })).toHaveCount(1);

    // Reopen the SAME edge (not a new connection) and flip it to INNER.
    await connectionButton(customers, "customer_id").click();
    await confirmRelationship(page, { joinType: "Only Matches", editing: true });

    // The preview recomputes automatically off the edge's new join type — no refresh needed.
    await expect(page.getByTestId("preview-row-count")).toContainText("5 rows");
    await expect(resultRows(page)).toHaveCount(5);
    await expect(resultRows(page).filter({ hasText: "Annie Easley" })).toHaveCount(0);
    await expect(resultRows(page).filter({ hasText: "Dorothy Vaughan" })).toHaveCount(0);
    await expect(resultRows(page).filter({ hasText: "Mary Jackson" })).toHaveCount(0);
  });
});

test.describe("Save, close, reopen, keep working", () => {
  test("a saved project survives reload, and a table added afterward saves too", async ({ page }) => {
    await openApp(page);
    await importAndPlace(page, "customers.csv", 0);
    await importAndPlace(page, "orders.csv", 1);

    const customers = tableNode(page, "customers.csv");
    const orders = tableNode(page, "orders.csv");
    await makeKey(orders, "customer_id");
    await dragConnect(customers, "customer_id", orders, "customer_id", page);
    await confirmRelationship(page);

    await saveProject(page, "Chain project");
    await page.reload();
    await dismissWelcome(page);
    await openProjectDialog(page);
    await projectRow(page, "Chain project").dblclick();
    await expect(page.locator(".react-flow__node")).toHaveCount(2, { timeout: 20000 });
    await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 20000 });

    // Reopening restores each table's SAVED position, not the grid slot it had before
    // reload — re-place both before adding a third table alongside them.
    await page.locator(".react-flow__controls-fitview").click();
    await placeNode(page, tableNode(page, "customers.csv"), GRID[0].x, GRID[0].y);
    await placeNode(page, tableNode(page, "orders.csv"), GRID[1].x, GRID[1].y);

    // Now extend the reopened project with a third table and re-save (same name — this
    // app has no "Save As"; saving under the current name updates the open project).
    await importAndPlace(page, "products.xlsx", 2);
    const reopenedCustomers = tableNode(page, "customers.csv");
    const products = tableNode(page, "products.xlsx");
    await dragConnect(reopenedCustomers, "customer_id", products, "customer_id", page);
    await confirmRelationship(page);
    await expect(page.locator(".react-flow__edge")).toHaveCount(2);
    await saveProject(page, "Chain project");

    await page.reload();
    await dismissWelcome(page);
    await openProjectDialog(page);
    await projectRow(page, "Chain project").dblclick();
    await expect(page.locator(".react-flow__node")).toHaveCount(3, { timeout: 20000 });
    await expect(page.locator(".react-flow__edge")).toHaveCount(2, { timeout: 20000 });

    // Same row count as the three-table chain test proves all three tables' real rawData
    // — not just their shapes — round-tripped through save/reload/reopen.
    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toContainText("8 rows");
  });
});

test.describe("Template round-trip", () => {
  test("exporting a template and importing it back restores tables, columns, relationships AND row data", async ({ page }) => {
    await openApp(page);
    await importAndPlace(page, "customers.csv", 0);
    await importAndPlace(page, "orders.csv", 1);

    const customers = tableNode(page, "customers.csv");
    const orders = tableNode(page, "orders.csv");
    await makeKey(orders, "customer_id");
    await dragConnect(customers, "customer_id", orders, "customer_id", page);
    await confirmRelationship(page, { joinType: "Only Matches" });

    await topBarAction(page, "Save", "menu-save-project");
    await expect(page.getByTestId("project-name-input")).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-template-button").click();
    const download = await downloadPromise;
    const templatePath = (await download.path())!;

    const template = JSON.parse(readFileSync(templatePath, "utf-8"));
    expect(template.tables).toHaveLength(2);
    expect(template.relationships).toHaveLength(1);
    expect(template.relationships[0].joinType).toBe("inner");
    const customersTable = template.tables.find((t: any) => t.fileName === "customers.csv");
    expect(customersTable.rawData).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Ada Lovelace" })]));

    // Wipe local storage entirely, then bring the canvas back purely from the template file.
    await resetStorage(page);
    await page.reload();
    await dismissWelcome(page);
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    await openProjectDialog(page);
    await page.getByTestId("import-template-input").setInputFiles(templatePath);
    await expect(page.locator(".react-flow__node")).toHaveCount(2, { timeout: 20000 });
    await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 20000 });

    // Columns, relationship AND row data all came back: the INNER join still produces
    // the exact same 5 rows with the exact same values.
    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toContainText("5 rows");
    await expect(resultRows(page).filter({ hasText: "Ada Lovelace" }).filter({ hasText: "Analytical Engine" })).toHaveCount(1);
  });
});

test.describe("Editing the schema changes the join", () => {
  test("renaming a column and marking a new key are reflected on the canvas and in the join output", async ({ page }) => {
    await openApp(page);
    await importAndPlace(page, "customers.csv", 0);
    await importAndPlace(page, "orders.csv", 1);

    const customers = tableNode(page, "customers.csv");
    const orders = tableNode(page, "orders.csv");
    await makeKey(orders, "customer_id");
    await dragConnect(customers, "customer_id", orders, "customer_id", page);
    await confirmRelationship(page);

    // Before editing: "email" is not a key, so it has no connection handle at all.
    await expect(columnRow(customers, "email").locator('[data-testid^="handle-source-"], [data-testid^="handle-target-"]')).toHaveCount(0);

    // Open the table editor and rename orders' "product" column via the Schema tab.
    await orders.locator("div.h-2").click(); // the plain footer bar — clicking a column row would stopPropagation instead
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("tab", { name: "Schema" })).toBeVisible();

    const productRow = columnRow(dialog, "product");
    await productRow.locator('[data-testid^="schema-column-name-"]').click();
    const renameInput = productRow.locator('[data-testid^="schema-rename-input-"]');
    await renameInput.fill("item_name");
    await renameInput.press("Enter");
    await expect(page.getByText("Column Renamed").first()).toBeVisible();

    // Change amount's declared type (a schema-level edit, independent of the join).
    const amountRow = columnRow(dialog, "amount");
    await amountRow.locator("button", { hasText: "Number" }).click();
    await page.getByRole("menuitem", { name: "Text", exact: true }).click();
    await expect(amountRow.locator("button", { hasText: "Text" })).toBeVisible();

    await page.getByTestId("dialog-close-button").click();
    await expect(dialog).toBeHidden();

    // Toggling "email" as a NEW key is a real capability change: it grows a handle that
    // did not exist before, which is the only thing that makes a column connectable.
    await makeKey(customers, "email");
    await expect(columnRow(customers, "email").locator('[data-testid^="handle-source-"], [data-testid^="handle-target-"]')).toHaveCount(2);

    // The join output reflects the rename: the renamed column's header replaces the old one.
    await openJoinPreview(page);
    await expect(page.locator("thead").getByText("item_name", { exact: true })).toBeVisible();
    await expect(page.locator("thead").getByText("product", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Analytical Engine")).toBeVisible(); // the actual values are untouched by the rename
  });
});

test.describe("Recovering from a bad connection", () => {
  test("a join on non-overlapping columns honestly reports zero rows, then real data appears after reconnecting correctly", async ({ page }) => {
    await openApp(page);
    await importAndPlace(page, "customers.csv", 0);
    await importAndPlace(page, "orders.csv", 1);

    const customers = tableNode(page, "customers.csv");
    const orders = tableNode(page, "orders.csv");

    // Connect on two columns that share no values at all: customers' city names never
    // match orders' product names.
    await makeKey(customers, "city");
    await makeKey(orders, "product");
    await dragConnect(customers, "city", orders, "product", page);
    await confirmRelationship(page, { joinType: "Only Matches" });

    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toContainText("0 rows");
    await expect(resultRows(page)).toHaveCount(0);
    // Not an error, and nothing fabricated — no fixture value should appear anywhere.
    await expect(page.getByText(/Acme Corp|Sample \d+|user\d+@example\.com/)).toHaveCount(0);
    // BUG (JoinPreviewPanel.tsx ~L317-329): the zero-rows empty state can't distinguish
    // "connected but genuinely zero matches" from "nothing connected yet" — it always
    // falls back to "Connect tables with matching fields to see joined data", which is
    // actively misleading here since the tables ARE connected. It should say something
    // like "No rows matched — city and product never had the same value" instead.
    await expect(page.getByText("Connect tables with matching fields to see joined data")).toBeVisible();
    await page.getByTestId("button-close-preview").click();

    // Delete the bad edge and reconnect on the real shared key.
    await connectionButton(customers, "city").click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);

    await makeKey(orders, "customer_id");
    await dragConnect(customers, "customer_id", orders, "customer_id", page);
    await confirmRelationship(page, { joinType: "Only Matches" });

    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toContainText("5 rows");
    await expect(page.getByText("Analytical Engine")).toBeVisible();
  });
});

test.describe("Tutorial and welcome flow", () => {
  test("stepping through every tutorial step via next/prev/dots completes it without errors", async ({ page }) => {
    await page.goto("/");
    await resetStorage(page);
    await page.reload();

    const welcome = page.getByTestId("welcome-modal");
    await expect(welcome).toBeVisible({ timeout: 8000 });

    await page.getByTestId("button-start-tutorial").click(); // "Take a quick tour"
    await expect(welcome).toBeHidden();
    // Loads the bundled sample data as a backdrop for the tour.
    await expect(page.locator(".react-flow__node")).toHaveCount(2);

    const tutorial = page.getByTestId("tutorial-overlay");
    await expect(tutorial).toBeVisible();
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
    await expect(page.getByText("Your Data Canvas")).toBeVisible();

    await page.getByTestId("button-tutorial-next").click();
    await expect(page.getByText("Step 2 of 5")).toBeVisible();
    await expect(page.getByText("Table Cards")).toBeVisible();

    await page.getByTestId("button-tutorial-next").click();
    await expect(page.getByText("Step 3 of 5")).toBeVisible();
    await expect(page.getByText("Connect Tables")).toBeVisible();

    // Back up one step via Prev, confirm it actually decrements.
    await page.getByTestId("button-tutorial-prev").click();
    await expect(page.getByText("Step 2 of 5")).toBeVisible();

    // Jump straight to the last step via its dot.
    await page.getByTestId("button-tutorial-dot-4").click();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await expect(page.getByText("Build Views")).toBeVisible();

    // Last step's Next reads "Done" and completes the tutorial.
    await page.getByTestId("button-tutorial-next").click();
    await expect(tutorial).toBeHidden();
    // The toast renders its title AND a screen-reader announcement with the same words.
    await expect(page.getByText("Tutorial Complete!").first()).toBeVisible();
  });

  test('checking "don\'t show this at startup" keeps the welcome modal from reappearing after reload', async ({ page }) => {
    await page.goto("/");
    await resetStorage(page);
    await page.reload();

    const welcome = page.getByTestId("welcome-modal");
    await expect(welcome).toBeVisible({ timeout: 8000 });
    await page.getByTestId("checkbox-dont-show-again").click();
    await page.getByTestId("button-skip-welcome").click(); // "Start with empty canvas"
    await expect(welcome).toBeHidden();

    await page.reload();
    expect(await page.evaluate(() => localStorage.getItem("elegantjoins_visited"))).toBe("true");
    await expect(page.getByTestId("welcome-modal")).not.toBeVisible({ timeout: 2000 });
  });
});
