/**
 * Builds the binary test fixtures (Excel workbooks) that can't be committed as text.
 *
 * Run from the repo root:  node tools/make-fixtures.mjs
 *
 * These exist to exercise specific bugs:
 *  - products.xlsx has THREE sheets, so the import must say it only read the first
 *    (the old server silently used SheetNames[0] and mentioned nothing).
 *  - Its customer_id column is a real NUMBER, while customers.csv holds strings —
 *    joining the two is the cross-format key regression.
 *  - sparse.xlsx omits a cell in row 1 that appears later, which used to make the
 *    whole column vanish because columns were read from Object.keys(rows[0]).
 */
import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "tests", "fixtures");
mkdirSync(out, { recursive: true });

// ---- products.xlsx: multi-sheet, numeric keys ----
const products = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  products,
  XLSX.utils.json_to_sheet([
    { customer_id: 1, product: "Analytical Engine", price: 2400.5, in_stock: true },
    { customer_id: 2, product: "Compiler License", price: 899.99, in_stock: true },
    { customer_id: 3, product: "Orbital Calculator", price: 1250, in_stock: false },
    { customer_id: 4, product: "Wind Tunnel Pass", price: 75, in_stock: true },
  ]),
  "Products",
);
XLSX.utils.book_append_sheet(
  products,
  XLSX.utils.json_to_sheet([{ region: "EMEA", target: 100 }]),
  "Targets",
);
XLSX.utils.book_append_sheet(
  products,
  XLSX.utils.json_to_sheet([{ note: "internal only" }]),
  "Scratch",
);
XLSX.writeFile(products, join(out, "products.xlsx"));

// ---- sparse.xlsx: a column that is empty in the first row ----
const sparse = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet([
  ["id", "name", "late_column"],
  [1, "first", null],
  [2, "second", "appears here"],
  [3, "third", "and here"],
]);
XLSX.utils.book_append_sheet(sparse, sheet, "Sheet1");
XLSX.writeFile(sparse, join(out, "sparse.xlsx"));

console.log("wrote products.xlsx (3 sheets) and sparse.xlsx to tests/fixtures");
