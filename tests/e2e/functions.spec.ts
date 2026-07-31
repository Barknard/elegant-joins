import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  importFile,
  openApp,
  openJoinPreview,
  openProjectDialog,
  openViewBuilder,
  projectRow,
  saveProject,
  startWithSampleData,
} from "./helpers";

/**
 * Exhaustive, per-control coverage of everything NOT already exercised by import.spec.ts,
 * join-and-persistence.spec.ts or flows.spec.ts: every hamburger menu item, the theme
 * toggle, the minimap, React Flow's own zoom/fit/lock controls, every context menu, both
 * TableEditModal tabs, the relationship modal's full matrix, node dragging, column
 * scrolling, the join preview's resize/expand/refresh controls, the View Builder's reset
 * button, project-delete confirmation, and every welcome-modal button.
 */

// These tests do real drag gestures and repeated canvas re-layout against a live React
// Flow instance, which is CPU-bound: running them concurrently starves whichever land on
// a busy core badly enough to blow the timeout on an otherwise-healthy run. Run this file
// with `--workers=1`.
//
// That is deliberately NOT done with `describe.configure({ mode: "serial" })`, which also
// gives the isolation but marks every test after a failure as "did not run" — one
// cosmetic failure then hides twenty real results, which is how this file was read wrong
// once already. `--workers=1` buys the isolation without the skip cascade.

// ---------------------------------------------------------------------------
// Local helpers — duplicated from flows.spec.ts rather than imported, since each spec
// file stands on its own per the task's file split.
// ---------------------------------------------------------------------------

/**
 * Right-clicks after making sure the pointer has hovered the target first.
 *
 * Same root cause as dragFrom(): a synthetic pointer event on an element the mouse has
 * never been over is ignored. The FIRST right-click in a test tends to work by accident
 * (the pointer is already there from a previous click) and later ones silently open
 * nothing, so the menu item is waited for until the test times out.
 */
/**
 * Opens a table node's context menu.
 *
 * Right-clicking the thin footer strip (div.h-2) opens nothing — verified directly. The
 * menu comes from React Flow's onNodeContextMenu, so the press has to land on the node
 * itself; the header area is used because column rows have their own separate menu.
 */
async function openNodeMenu(node: Locator) {
  await node.hover({ position: { x: 20, y: 8 } }).catch(() => {});
  await node.click({ button: "right", position: { x: 20, y: 8 } });
}

async function rightClick(target: Locator) {
  await primePointer(target);
  await target.click({ button: "right", force: true });
}

/**
 * Moves the real pointer onto an element before a synthetic press.
 *
 * Playwright's own hover() is preferred because it waits for actionability, but several
 * targets here are legitimately awkward for it — an 8px-tall footer strip, a 4px resize
 * handle, a connection dot partly covered by an edge — and it simply times out on them.
 * Falling back to a raw move to the element's centre still delivers the pointerover that
 * React Flow requires, without demanding the element pass every actionability check.
 */
async function primePointer(target: Locator) {
  try {
    await target.hover({ timeout: 2000 });
    return;
  } catch {
    /* fall through to the raw move below */
  }
  const box = await target.boundingBox();
  if (!box) return;
  const page = target.page();
  await page.mouse.move(box.x + box.width / 2 - 3, box.y + box.height / 2 - 3);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

function tableNode(page: Page, label: string): Locator {
  return page.locator(".react-flow__node").filter({ hasText: label });
}

/**
 * The stable column id behind a schema row.
 *
 * Row locators anchored on the column's TEXT break the moment you click to rename it:
 * the name <p> is swapped for an input, the text disappears, and the locator that was
 * supposed to contain that input no longer resolves. The id doesn't move.
 */
async function schemaColumnId(dialog: Locator, columnName: string): Promise<string> {
  const cell = dialog
    .locator('[data-testid^="schema-column-name-"]')
    .filter({ hasText: new RegExp(`^${columnName}$`) })
    .first();
  const testId = await cell.getAttribute("data-testid");
  return testId!.replace("schema-column-name-", "");
}

function columnRow(scope: Locator, columnName: string): Locator {
  return scope
    .getByText(columnName, { exact: true })
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]');
}

async function makeKey(node: Locator, columnName: string) {
  await columnRow(node, columnName).locator('[data-testid^="toggle-key-"]').click();
}

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

function connectionButton(node: Locator, columnName: string): Locator {
  return columnRow(node, columnName).locator('[data-testid^="connection-source-"], [data-testid^="connection-target-"]');
}

function optionCard(dialog: Locator, label: string): Locator {
  return dialog.locator("div.cursor-pointer", { hasText: label });
}

/**
 * Imported tables land at RANDOM positions (Home.tsx's handleAddTable uses
 * `Math.random() * 400 + 100` for both x and y), which can visually overlap and make one
 * node intercept clicks meant for another.
 *
 * A single scripted mouse gesture doesn't reliably land the node exactly on (x, y) — the
 * observed miss varies between runs, so one-shot placement can't be trusted. Treat it as
 * a control loop instead: measure the handle's actual center, drag it the remaining
 * distance, and repeat until it's within a few pixels — comfortably inside the 28px
 * handle hit targets later code needs to click.
 */
/**
 * Drags from a point by (dx, dy) in a way React Flow actually honours.
 *
 * The canvas sets `nodeDragThreshold={10}`. A smoothly interpolated `mouse.move(...,
 * {steps: N})` never registers as a drag at all — measured: 0px of movement — because no
 * single move event clears the threshold from the drag origin. One discrete hop past it
 * first, THEN the smooth move, works every time. Without this, node drags silently did
 * nothing, which also made the "locked canvas" test pass for entirely the wrong reason.
 */
async function dragElement(page: Page, target: Locator, dx: number, dy: number) {
  // The pointer must genuinely visit the element first, or React Flow ignores the
  // pointerdown that follows. See primePointer for why this isn't a bare hover().
  await primePointer(target);
  const box = (await target.boundingBox())!;
  await dragFrom(page, box.x + box.width / 2, box.y + box.height / 2, dx, dy);
}

async function dragFrom(page: Page, x: number, y: number, dx: number, dy: number) {
  // Two separate quirks, both needed:
  //  1. React Flow only starts a drag if the pointer has ALREADY hovered the element
  //     before pointerdown — a synthetic move+down from cold is ignored entirely.
  //  2. The canvas sets nodeDragThreshold={10}, and a smoothly interpolated move never
  //     clears it from the drag origin, so one discrete hop past it is required first.
  // Miss either and the drag silently does nothing, which is how the "locked canvas"
  // test came to pass for entirely the wrong reason.
  await page.mouse.move(x - 5, y - 5);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + Math.sign(dx || 1) * 15, y + Math.sign(dy || 1) * 15);
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

async function placeNode(page: Page, node: Locator, x: number, y: number) {
  const handle = node.locator("[data-node-drag-handle]");
  for (let attempt = 0; attempt < 16; attempt++) {
    // Every few attempts, re-fit the view first: on rare occasions the drag ends up
    // panning the canvas instead of moving the node, which no amount of further
    // dragging from a wrong starting assumption corrects — a fresh fit-view
    // re-establishes a sane camera to retry from.
    if (attempt > 0 && attempt % 4 === 0) {
      await page.locator(".react-flow__controls-fitview").click();
    }
    const box = (await handle.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // The tolerance is generous on purpose: this only needs to get tables far enough
    // apart to stop overlapping. Anything that later clicks a specific handle or row
    // re-reads its LIVE position at that moment, never this cached target.
    if (Math.abs(cx - x) < 20 && Math.abs(cy - y) < 20) return;
    await dragElement(page, handle, x - cx, y - cy);
  }
  // Best-effort, deliberately not fatal. This only spreads tables out so they don't
  // overlap; nothing asserts on these coordinates, and everything that later clicks a
  // handle or a row re-reads its LIVE position at that moment. Throwing here failed
  // tests over cosmetic layout — and because this file runs in serial mode, one such
  // failure skipped every test after it.
  const final = (await handle.boundingBox())!;
  console.warn(
    `placeNode: settled at (${Math.round(final.x + final.width / 2)}, ${Math.round(final.y + final.height / 2)}) ` +
      `rather than (${x}, ${y}); continuing since layout is cosmetic here.`,
  );
}

const GRID = [
  { x: 220, y: 240 },
  { x: 700, y: 240 },
  { x: 1080, y: 240 },
];

/**
 * Fits every current node into view, then drags each named table into its own
 * well-separated grid slot so later interactions target predictable coordinates.
 *
 * Call this ONCE per batch of imports, after all of them have landed — `fitView`
 * recomputes pan/zoom from every node's real flow-space position, so calling it again
 * later silently re-shifts where a table already placed now renders on screen,
 * invalidating that placement.
 */
async function layoutGrid(page: Page, placements: Array<{ label: string; slot: number }>) {
  await page.locator(".react-flow__controls-fitview").click();
  for (const { label, slot } of placements) {
    await placeNode(page, tableNode(page, label), GRID[slot].x, GRID[slot].y);
  }
}

async function confirmRelationship(page: Page, opts: { cardinality?: string; joinType?: string; editing?: boolean } = {}) {
  const dialog = page.getByRole("dialog");
  if (opts.cardinality) await optionCard(dialog, opts.cardinality).click();
  if (opts.joinType) await optionCard(dialog, opts.joinType).click();
  await dialog.getByRole("button", { name: opts.editing ? "Update" : "Connect Tables" }).click();
  await expect(dialog).toBeHidden();
}

/** Finds the screen-space midpoint of an edge's path — its bounding-box center is often
 * off the path itself on a bent route, so a plain click/right-click can miss it. */
async function edgeMidpoint(page: Page, edgeIndex = 0): Promise<{ x: number; y: number }> {
  const path = page.locator(".react-flow__edge").nth(edgeIndex).locator("path").first();
  return path.evaluate((el: SVGPathElement) => {
    const len = el.getTotalLength();
    const pt = el.getPointAtLength(len / 2);
    const ctm = el.getScreenCTM()!;
    return { x: pt.x * ctm.a + pt.y * ctm.c + ctm.e, y: pt.x * ctm.b + pt.y * ctm.d + ctm.f };
  });
}

/** Reads React Flow's `translate(Xpx, Ypx)` node position out of its inline style. */
async function nodePosition(node: Locator): Promise<{ x: number; y: number }> {
  const style = (await node.getAttribute("style")) ?? "";
  const match = style.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  if (!match) throw new Error(`no transform in node style: ${style}`);
  return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
}

/** Reads React Flow's viewport zoom out of its inline `scale(Z)` style. */
async function viewportScale(page: Page): Promise<number> {
  const style = (await page.locator(".react-flow__viewport").getAttribute("style")) ?? "";
  const match = style.match(/scale\(([\d.]+)\)/);
  if (!match) throw new Error(`no scale in viewport style: ${style}`);
  return parseFloat(match[1]);
}

/** Builds a customers+orders canvas joined via Smart Scan (LEFT, default) — reused as
 * setup by controls that need SOME real join to operate on. */
async function twoJoinedTables(page: Page) {
  await openApp(page);
  await importFile(page, "customers.csv");
  await importFile(page, "orders.csv", { smartScan: true });
  await layoutGrid(page, [
    { label: "customers.csv", slot: 0 },
    { label: "orders.csv", slot: 1 },
  ]);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
}

// ---------------------------------------------------------------------------

test.describe("TopBar hamburger menu — functional items", () => {
  test('"Add Data Source" opens the same dialog as the floating + button', async ({ page }) => {
    await openApp(page);
    await page.getByTestId("hamburger-button").click();
    await page.getByTestId("menu-add-data-source").click();
    await expect(page.getByTestId("button-csv-upload")).toBeVisible();
  });

  test('"Save Project" opens the save dialog', async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await page.getByTestId("hamburger-button").click();
    await page.getByTestId("menu-save-project").click();
    await expect(page.getByTestId("project-name-input")).toBeVisible();
  });

  test('"Open Project" opens the project list', async ({ page }) => {
    await openApp(page);
    await page.getByTestId("hamburger-button").click();
    await page.getByTestId("menu-open-project").click();
    await expect(page.getByTestId("search-projects")).toBeVisible();
  });

  test('"Clear Canvas" removes every table and edge', async ({ page }) => {
    await twoJoinedTables(page);
    await page.getByTestId("hamburger-button").click();
    await page.getByTestId("menu-clear-canvas").click();
    await expect(page.getByText("Canvas Cleared").first()).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  });

  test('"View Builder" opens the panel', async ({ page }) => {
    await openApp(page);
    await page.getByTestId("hamburger-button").click();
    await page.getByTestId("menu-view-builder").click();
    await expect(page.getByTestId("button-run-preview")).toBeVisible();
  });

  test('"Run Query" opens View Builder AND actually runs the join', async ({ page }) => {
    await twoJoinedTables(page);
    await page.getByTestId("hamburger-button").click();
    await page.getByTestId("menu-run-query").click();

    // 6, not 8. Smart scan makes the NEWLY ADDED table the edge's source, so orders is
    // the left side here: a LEFT join keeps all 6 orders (including the orphan whose
    // customer_id is 99) rather than all 6 customers plus the fan-out. Which table is
    // "left" follows the edge direction, and the panel says so in as many words —
    // "Start with orders.csv (6 rows) LEFT JOIN customers.csv".
    await expect(page.getByTestId("output-row-count")).toContainText("6 rows");
  });

  test('"Replay Tutorial" loads sample data and reopens the tour', async ({ page }) => {
    await openApp(page);
    await page.getByTestId("hamburger-button").click();
    await page.getByTestId("menu-replay-tutorial").click();
    await expect(page.getByTestId("tutorial-overlay")).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
  });
});

const STUB_MENU_ITEMS: Array<{ testId: string; label: string; toastText: string; shouldInstead: string }> = [
  {
    testId: "menu-export-results",
    label: "Export Results",
    toastText: "Run your query first, then export from View Builder.",
    shouldInstead: "jump straight to View Builder's Export tab (or export directly) instead of just explaining where to go",
  },
  {
    testId: "menu-refresh-all",
    label: "Refresh All",
    toastText: "All data has been refreshed.",
    shouldInstead: "actually recompute the open preview/output, the way the preview panel's own refresh button does",
  },
  {
    testId: "menu-fit-to-screen",
    label: "Fit to Screen",
    toastText: "Press Ctrl+0 on the canvas.",
    shouldInstead: "call the same fitView the Controls widget's fit-view button already performs — Ctrl+0 is not wired up anywhere",
  },
  {
    testId: "menu-auto-detect-links",
    label: "Auto-Detect Links",
    toastText: "Right-click a table and select 'Smart Scan' to find matching fields.",
    shouldInstead: "run the match-finding scan itself across every table pair on the canvas",
  },
  {
    testId: "menu-join-tables",
    label: "Join Tables",
    toastText: "Click a table, then go to 'Prep Join' tab to combine tables.",
    shouldInstead: "open the currently selected table's Prep Join tab directly",
  },
  {
    testId: "menu-keyboard-shortcuts",
    label: "Keyboard Shortcuts",
    toastText: "Ctrl+S: Save | Ctrl+O: Open | Ctrl+Enter: Run | Delete: Remove selected",
    shouldInstead: "list shortcuts that actually work — none of Ctrl+S/Ctrl+O/Ctrl+Enter/Delete are wired up anywhere in the app",
  },
  {
    testId: "menu-getting-started",
    label: "Getting Started",
    toastText: "1. Add data files 2. Connect matching fields 3. Run to see results 4. Export your data",
    shouldInstead: "open the real tutorial (Replay Tutorial already does this) instead of restating its steps as static text",
  },
  {
    testId: "menu-about-elegant-joins",
    label: "About Elegant Joins",
    toastText: "A local-first data tool. Your data never leaves your computer.",
    shouldInstead: "open a real About panel — a toast that vanishes is a poor home for version/attribution info",
  },
  {
    testId: "menu-privacy-info",
    label: "Privacy Info",
    toastText: "All your data is processed on your computer. Nothing is sent to any server.",
    shouldInstead: "open a real Privacy panel for the same reason",
  },
];

test.describe("TopBar hamburger menu — stub actions", () => {
  for (const item of STUB_MENU_ITEMS) {
    test(`"${item.label}" only shows a toast`, async ({ page }) => {
      await openApp(page);
      await page.getByTestId("hamburger-button").click();
      await page.getByTestId(item.testId).click();
      // BUG: stub — this menu item should ${item.shouldInstead}.
      await expect(page.getByText(item.toastText).first()).toBeVisible();
      await expect(page.locator(".react-flow__node")).toHaveCount(0);
      await expect(page.getByTestId("hamburger-menu")).toBeHidden();
    });
  }

  test("the shortcuts advertised in menu labels and the Keyboard Shortcuts toast do not exist", async ({ page }) => {
    await openApp(page);
    // BUG: TopBar.tsx labels items with "Ctrl+S" / "Ctrl+O" / "Ctrl+Enter" / "Ctrl+0",
    // and the toast repeats the same claim, but there is no keydown listener anywhere in
    // Home.tsx or App.tsx — pressing any of them does nothing at all.
    await page.keyboard.press("Control+s");
    await expect(page.getByTestId("project-name-input")).toBeHidden();
    await page.keyboard.press("Control+o");
    await expect(page.getByTestId("search-projects")).toBeHidden();
  });
});

test.describe("Theme toggle", () => {
  test("switches the document's dark/light class and persists it across reload", async ({ page }) => {
    await openApp(page);
    // Default theme is "dark" (App.tsx ThemeProvider defaultTheme="dark").
    await expect(page.locator("html")).toHaveClass(/dark/);

    const toggle = page.locator("button.cursor-theme-light, button.cursor-theme-dark");
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/light/);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("vite-ui-theme"))).toBe("light");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/light/);
  });
});

test.describe("Minimap", () => {
  test("shows and hides on demand", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");

    await expect(page.locator(".react-flow__minimap")).toHaveCount(0);
    await page.getByTestId("button-show-minimap").click();
    await expect(page.locator(".react-flow__minimap")).toBeVisible();

    await page.getByTestId("button-hide-minimap").click();
    await expect(page.locator(".react-flow__minimap")).toHaveCount(0);
    await expect(page.getByTestId("button-show-minimap")).toBeVisible();
  });
});

test.describe("React Flow zoom / fit / lock controls", () => {
  test("zoom in and out change the viewport scale", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    const initial = await viewportScale(page);

    await page.locator(".react-flow__controls-zoomin").click();
    await page.locator(".react-flow__controls-zoomin").click();
    const zoomedIn = await viewportScale(page);
    expect(zoomedIn).toBeGreaterThan(initial);

    await page.locator(".react-flow__controls-zoomout").click();
    await page.locator(".react-flow__controls-zoomout").click();
    await page.locator(".react-flow__controls-zoomout").click();
    const zoomedOut = await viewportScale(page);
    expect(zoomedOut).toBeLessThan(zoomedIn);
  });

  test("fit view recenters after a manual zoom", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");

    // Asserting on the zoom NUMBER turned out to be a poor proxy: fitting a single node
    // can legitimately land on the scale you were already at, and the zoom buttons
    // disable at their limits. Dragging the node off screen first isn't reliable either
    // — React Flow keeps the canvas within bounds. So assert the promise that always
    // holds: after Fit View, the content is on screen at a sane zoom.
    const node = tableNode(page, "customers.csv");
    const zoomIn = page.locator(".react-flow__controls-zoomin");
    for (let i = 0; i < 3 && (await zoomIn.isEnabled()); i++) await zoomIn.click();

    await page.locator(".react-flow__controls-fitview").click();

    await expect(node).toBeInViewport();
    const fitted = await viewportScale(page);
    expect(fitted).toBeGreaterThan(0);
    expect(fitted).toBeLessThanOrEqual(2);
  });

  test("the interactivity lock disables node dragging until toggled back", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    const node = tableNode(page, "customers.csv");
    const handle = node.locator("[data-node-drag-handle]");

    await page.locator(".react-flow__controls-interactive").click(); // lock
    const before = await nodePosition(node);
    await dragElement(page, handle, 150, 100);
    expect(await nodePosition(node)).toEqual(before);

    await page.locator(".react-flow__controls-interactive").click(); // unlock
    await dragElement(page, handle, 150, 100);
    const after = await nodePosition(node);
    expect(after).not.toEqual(before);
  });
});

test.describe("Node dragging", () => {
  test("dragging a table's header moves it on the canvas", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    const node = tableNode(page, "customers.csv");
    const handle = node.locator("[data-node-drag-handle]");

    const before = await nodePosition(node);
    // Ask for more than we assert on: React Flow's drag threshold swallows part of the
    // gesture, so the node lands short of the requested delta.
    await dragElement(page, handle, 220, 160);

    const after = await nodePosition(node);
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(50);
    expect(Math.abs(after.y - before.y)).toBeGreaterThan(50);
  });
});

test.describe("Column scrolling", () => {
  test("the mouse wheel scrolls a table's column list without moving the node", async ({ page }) => {
    // The bundled sample data has 15 columns per table — comfortably more than fit in
    // the 320px column list, unlike any fixture file.
    await startWithSampleData(page);
    const node = tableNode(page, "Sample Customers");
    const columnsList = node.locator("div.overflow-y-auto");

    expect(await columnsList.evaluate((el) => el.scrollTop)).toBe(0);
    const before = await nodePosition(node);

    await node.hover();
    await page.mouse.wheel(0, 400);

    expect(await columnsList.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await nodePosition(node)).toEqual(before); // scrolling must not drag the card
  });
});

test.describe("Node context menu", () => {
  test("edit, duplicate and delete all act on the right table", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    const node = tableNode(page, "customers.csv");

    await openNodeMenu(node);
    await page.getByRole("button", { name: "Edit Table", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("tab", { name: "Schema" })).toBeVisible();
    await page.getByTestId("dialog-close-button").click();

    await openNodeMenu(node);
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    await expect(page.getByText("Table Duplicated").first()).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(page.getByText("customers.csv (Copy)")).toBeVisible();

    // The duplicate lands only 20px offset from the original (Home.tsx's 'duplicate'
    // case), so it visually covers the original almost entirely and is the only one of
    // the two reliably clickable — delete IT to prove the action works.
    const copy = tableNode(page, "customers.csv (Copy)");
    await openNodeMenu(copy);
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("Table Deleted").first()).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(1);
  });
});

test.describe("Edge context menu", () => {
  test("edit join type opens the relationship editor; remove link deletes the edge", async ({ page }) => {
    await openApp(page);
    // Smart Scan (not a manual toggle-key-then-drag) so the edge is connected on a
    // column that was already a key when its table first mounted — see the BUG note in
    // flows.spec.ts's "Analyst's full journey": a column key-toggled AFTER mount never
    // gets an SVG edge drawn to it at all, which would leave nothing for a real mouse
    // click to land on here.
    await importFile(page, "customers.csv");
    await importFile(page, "orders.csv", { smartScan: true });
    await layoutGrid(page, [
      { label: "customers.csv", slot: 0 },
      { label: "orders.csv", slot: 1 },
    ]);
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);

    const point = await edgeMidpoint(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.click(point.x, point.y, { button: "right" });
    await page.getByRole("button", { name: "Edit Join Type", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("Edit Connection")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();

    const point2 = await edgeMidpoint(page);
    await page.mouse.move(point2.x, point2.y);
    await page.mouse.click(point2.x, point2.y, { button: "right" });
    await page.getByRole("button", { name: "Remove Link", exact: true }).click();
    await expect(page.getByText("Link Removed").first()).toBeVisible();
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  });
});

test.describe("Pane context menu", () => {
  test("Add Data Source opens the import dialog; Reset View is a stub toast", async ({ page }) => {
    await openApp(page); // blank canvas — the pane's whole area is empty
    await rightClick(page.locator(".react-flow__pane"));
    await page.getByRole("button", { name: "Add Data Source", exact: true }).click();
    await expect(page.getByTestId("button-csv-upload")).toBeVisible();
    await page.keyboard.press("Escape");

    await rightClick(page.locator(".react-flow__pane"));
    await page.getByRole("button", { name: "Reset View", exact: true }).click();
    // BUG: stub — the toast claims the viewport was reset, but no fitView/setViewport
    // call happens (see Home.tsx handleMenuAction's 'reset_view' case); it's text only.
    await expect(page.getByText("View Reset").first()).toBeVisible();
  });
});

test.describe("TableEditModal — Schema tab", () => {
  test("rename, change type, and toggle a key", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    const node = tableNode(page, "customers.csv");
    await node.locator("div.h-2").click();
    const dialog = page.getByRole("dialog");

    const nameId = await schemaColumnId(dialog, "name");
    await dialog.locator(`[data-testid="schema-column-name-${nameId}"]`).click();
    const renameInput = dialog.locator(`[data-testid="schema-rename-input-${nameId}"]`);
    await renameInput.fill("full_name");
    await renameInput.press("Enter");
    await expect(page.getByText("Column Renamed").first()).toBeVisible();
    await expect(columnRow(dialog, "full_name")).toBeVisible();

    const cityRow = columnRow(dialog, "city");
    await cityRow.locator("button", { hasText: "Text" }).click();
    await page.getByRole("menuitem", { name: "Number", exact: true }).click();
    await expect(page.getByText("Data Type Updated").first()).toBeVisible();
    await expect(cityRow.locator("button", { hasText: "Number" })).toBeVisible();

    // Assert on the row's own description rather than an icon class. In the Schema tab
    // a key is shown by styling the toggle BUTTON amber (text-amber-600), not by an
    // `svg.text-amber-500` — so that selector matched nothing either before or after,
    // and the "not a key yet" half of this check was passing for free.
    const emailRow = columnRow(dialog, "email");
    await expect(emailRow).toContainText("Regular field");
    await emailRow.locator('[data-testid^="schema-toggle-key-"]').click();
    await expect(page.getByText("Key Status Updated").first()).toBeVisible();
    await expect(emailRow).toContainText("Key field");
  });

  test("reorder up/down and duplicate via the right-click menu", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    const node = tableNode(page, "customers.csv");
    await node.locator("div.h-2").click();
    const dialog = page.getByRole("dialog");
    const names = () => dialog.locator('[data-testid^="schema-column-name-"]').allTextContents();

    expect(await names()).toEqual(["customer_id", "name", "email", "city", "signup_date", "active"]);

    await rightClick(columnRow(dialog, "name"));
    await page.getByTestId("menu-item-move-down").click();
    expect(await names()).toEqual(["customer_id", "email", "name", "city", "signup_date", "active"]);

    await rightClick(columnRow(dialog, "name"));
    await page.getByTestId("menu-item-move-up").click();
    expect(await names()).toEqual(["customer_id", "name", "email", "city", "signup_date", "active"]);

    await rightClick(columnRow(dialog, "city"));
    await page.getByTestId("menu-item-duplicate").click();
    await expect(page.getByText("Column Duplicated").first()).toBeVisible();
    expect(await names()).toContain("city_copy");
  });

  test("deleting a column is blocked once it is the table's last one", async ({ page }) => {
    await openApp(page);
    await importFile(page, "products.xlsx"); // 4 columns: customer_id, product, price, in_stock
    const node = tableNode(page, "products.xlsx");
    await node.locator("div.h-2").click();
    const dialog = page.getByRole("dialog");
    const rows = () => dialog.locator("div.divide-y > div");

    await expect(rows()).toHaveCount(4);
    for (let i = 0; i < 3; i++) {
      await rightClick(rows().first());
      await page.getByTestId("menu-item-delete").click();
    }
    await expect(page.getByText("Column Deleted").first()).toBeVisible();
    await expect(rows()).toHaveCount(1);

    await rightClick(rows().first());
    await page.getByTestId("menu-item-delete").click();
    await expect(page.getByText("Cannot Delete").first()).toBeVisible();
    await expect(page.getByText("A table must have at least one column").first()).toBeVisible();
    await expect(rows()).toHaveCount(1); // the last column survives
  });
});

test.describe("TableEditModal — Prep Join tab", () => {
  test("all three combine modes update the live preview explanation", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await importFile(page, "orders.csv");
    await layoutGrid(page, [
      { label: "customers.csv", slot: 0 },
      { label: "orders.csv", slot: 1 },
    ]);
    const node = tableNode(page, "customers.csv");
    await node.locator("div.h-2").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Prep Join" }).click();

    await dialog.getByTestId("select-join-table").click();
    await page.getByRole("option", { name: /orders\.csv/ }).click();
    await expect(dialog.getByTestId("mode-join")).toHaveClass(/border-primary/);

    await dialog.getByTestId("mode-append").click();
    await expect(dialog.getByText(/All rows from both tables will be stacked together/)).toBeVisible();

    await dialog.getByTestId("mode-auto-align").click();
    await expect(dialog.getByText(/Found 1 matching column\(s\): customer_id/)).toBeVisible();

    await dialog.getByTestId("mode-join").click();
    await dialog.getByTestId("button-auto-detect").click();
    await expect(page.getByText("Fields Matched!").first()).toBeVisible();
    await expect(dialog.getByText(/Linking on: customer_id ↔ customer_id/)).toBeVisible();

    await optionCard(dialog, "Only Matches").click();
    await expect(dialog.getByText("Only rows with matches in both tables will be kept.")).toBeVisible();
  });

  test("Create Combined Table produces a schema-only node with no real data or working join edge", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await importFile(page, "orders.csv");
    await layoutGrid(page, [
      { label: "customers.csv", slot: 0 },
      { label: "orders.csv", slot: 1 },
    ]);
    const node = tableNode(page, "customers.csv");
    await node.locator("div.h-2").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Prep Join" }).click();
    await dialog.getByTestId("select-join-table").click();
    await page.getByRole("option", { name: /orders\.csv/ }).click();
    await dialog.getByTestId("button-auto-detect").click();
    await dialog.getByTestId("button-create-combined").click();

    await expect(page.getByText("Tables Combined!").first()).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(3);
    await expect(page.getByText("Enriched_customers")).toBeVisible();

    // BUG (Home.tsx handleJoinTable, ~L1130-1162): "Create Combined Table" shows an
    // elaborate live preview of merged columns and sample rows, and a success toast,
    // but the node it actually creates carries NO rawData at all, and the edge it draws
    // has no sourceHandle/targetHandle — so buildJoinInputs() silently drops it and the
    // real join engine treats "Enriched_customers" as completely disconnected. The
    // feature is decorative: it never participates in an actual join.
    await openJoinPreview(page);
    await expect(page.getByTestId("preview-warnings")).toContainText("Enriched_customers");
    await expect(page.getByTestId("preview-row-count")).toContainText("6 rows"); // just customers.csv, alone
  });
});

test.describe("RelationshipModal", () => {
  test("every cardinality and join type is selectable, the recommendation applies, editing persists it, and delete works", async ({
    page,
  }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await importFile(page, "orders.csv");
    await layoutGrid(page, [
      { label: "customers.csv", slot: 0 },
      { label: "orders.csv", slot: 1 },
    ]);
    const customers = tableNode(page, "customers.csv");
    const orders = tableNode(page, "orders.csv");
    await makeKey(orders, "customer_id");
    await dragConnect(customers, "customer_id", orders, "customer_id", page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Create Connection")).toBeVisible();

    for (const label of ["One-to-One", "One-to-Many", "Many-to-One", "Many-to-Many"]) {
      await optionCard(dialog, label).click();
      await expect(optionCard(dialog, label)).toHaveClass(/border-primary\/30/);
    }
    for (const label of ["Keep All From Left", "Only Matches", "Keep All From Right", "Keep Everything"]) {
      await optionCard(dialog, label).click();
      await expect(optionCard(dialog, label)).toHaveClass(/border-primary\/30/);
    }

    // customers.customer_id is all-unique (6/6); orders.customer_id has duplicates
    // (1,1,2,3,99,2 -> 4 distinct of 6) -> the honest recommendation is One-to-Many.
    await dialog.getByTestId("button-apply-recommendation").click();
    await expect(optionCard(dialog, "One-to-Many")).toHaveClass(/border-primary\/30/);
    await expect(optionCard(dialog, "Many-to-Many")).not.toHaveClass(/border-primary\/30/);

    await optionCard(dialog, "Only Matches").click();
    await dialog.getByRole("button", { name: "Connect Tables" }).click();
    await expect(dialog).toBeHidden();

    // Reopen the same edge: both choices must have persisted.
    await connectionButton(customers, "customer_id").click();
    await expect(dialog.getByText("Edit Connection")).toBeVisible();
    await expect(optionCard(dialog, "One-to-Many")).toHaveClass(/border-primary\/30/);
    await expect(optionCard(dialog, "Only Matches")).toHaveClass(/border-primary\/30/);

    await dialog.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Relationship Removed").first()).toBeVisible();
    await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  });
});

test.describe("Join preview panel controls", () => {
  test("refresh keeps the same result; expand grows the panel; the resize handle widens it", async ({ page }) => {
    await twoJoinedTables(page);
    await openJoinPreview(page);
    await expect(page.getByTestId("preview-row-count")).toContainText("8 rows");

    await page.getByTestId("button-refresh-preview").click();
    await expect(page.getByTestId("preview-row-count")).toContainText("8 rows");

    const panel = page.getByTestId("preview-row-count").locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    const collapsedHeight = (await panel.boundingBox())!.height;
    await page.getByTestId("button-expand-preview").click();
    const expandedHeight = (await panel.boundingBox())!.height;
    expect(expandedHeight).toBeGreaterThan(collapsedHeight * 1.5);
    await page.getByTestId("button-expand-preview").click();
    const collapsedAgain = (await panel.boundingBox())!.height;
    expect(collapsedAgain).toBeLessThan(expandedHeight);

    const handle = page.locator(".cursor-ew-resize");
    const before = (await panel.boundingBox())!;
    const handleBox = (await handle.boundingBox())!;
    await dragFrom(page, handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2, 150, 0);
    const after = (await panel.boundingBox())!;
    expect(after.width).toBeGreaterThan(before.width + 100);
    const storedWidth = await page.evaluate(() => localStorage.getItem("elegantjoins_preview_width"));
    expect(Number(storedWidth)).toBeGreaterThan(before.width + 100);
  });
});

test.describe("View Builder — reset and tabs", () => {
  test("reset clears the run output and re-selects every field", async ({ page }) => {
    await twoJoinedTables(page);
    await openViewBuilder(page);

    await page.getByRole("checkbox", { name: "email", exact: true }).click();
    await page.getByTestId("button-run-preview").click();
    await expect(page.getByTestId("output-row-count")).toBeVisible();

    await page.getByRole("tab", { name: "Export" }).click();
    await expect(page.getByTestId("button-export-csv")).toBeEnabled();

    await page.getByTestId("button-reset-view-builder").click();
    await expect(page.getByText("View Builder Reset").first()).toBeVisible();

    await expect(page.getByRole("tab", { name: "Fields" })).toHaveAttribute("data-state", "active");
    await expect(page.getByRole("checkbox", { name: "email", exact: true })).toBeChecked();

    await page.getByRole("tab", { name: "Output" }).click();
    await expect(page.getByText("No Output Yet")).toBeVisible();

    await page.getByRole("tab", { name: "Export" }).click();
    await expect(page.getByTestId("button-export-csv")).toBeDisabled();
  });
});

test.describe("Project delete confirmation", () => {
  test("dismissing the browser confirm keeps the project; accepting deletes it", async ({ page }) => {
    await openApp(page);
    await importFile(page, "customers.csv");
    await saveProject(page, "Deletable project");
    await openProjectDialog(page);

    page.once("dialog", (d) => d.dismiss());
    await page.locator('[data-testid^="delete-project-"]').first().click();
    await expect(projectRow(page, "Deletable project")).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.locator('[data-testid^="delete-project-"]').first().click();
    await expect(projectRow(page, "Deletable project")).toHaveCount(0);
  });
});

test.describe("Welcome modal — every button", () => {
  test('"Get Started" loads sample data and closes the modal', async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      localStorage.clear();
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("elegant-joins");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    });
    await page.reload();
    await expect(page.getByTestId("welcome-modal")).toBeVisible({ timeout: 8000 });
    await page.getByTestId("button-get-started").click();
    await expect(page.getByTestId("welcome-modal")).toBeHidden();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
    await expect(page.getByText("Sample Data Loaded").first()).toBeVisible();
  });

  test('"Start with empty canvas" closes the modal without loading anything', async ({ page }) => {
    await openApp(page); // helper's own dismissal path IS this button
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
  });

  test("the X close button dismisses the modal without loading sample data", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      localStorage.clear();
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("elegant-joins");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    });
    await page.reload();
    const modal = page.getByTestId("welcome-modal");
    await expect(modal).toBeVisible({ timeout: 8000 });
    await page.getByTestId("button-close-welcome").click();
    await expect(modal).toBeHidden();
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
  });

  test('"Take a quick tour" loads sample data and opens the tutorial', async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      localStorage.clear();
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("elegant-joins");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    });
    await page.reload();
    await expect(page.getByTestId("welcome-modal")).toBeVisible({ timeout: 8000 });
    await page.getByTestId("button-start-tutorial").click();
    await expect(page.getByTestId("welcome-modal")).toBeHidden();
    await expect(page.getByTestId("tutorial-overlay")).toBeVisible();
    await expect(page.locator(".react-flow__node")).toHaveCount(2);
  });

  test('"don\'t show again" checkbox toggles on click', async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      localStorage.clear();
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("elegant-joins");
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    });
    await page.reload();
    await expect(page.getByTestId("welcome-modal")).toBeVisible({ timeout: 8000 });

    const checkbox = page.getByTestId("checkbox-dont-show-again");
    await expect(checkbox).toHaveAttribute("data-state", "unchecked");
    await checkbox.click();
    await expect(checkbox).toHaveAttribute("data-state", "checked");
    await checkbox.click();
    await expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });
});
