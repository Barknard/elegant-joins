/**
 * CSV / Excel parsing and column type inference.
 *
 * Pure functions over already-read file contents so the whole thing is unit-testable
 * without a DOM, a server, or a real file.
 *
 * Four bugs from the server version are fixed here; each is marked FIX below.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { DataType } from "@shared/schema";

/**
 * Hard ceiling on retained rows. The server silently kept 100 (see FIX 1) — this keeps
 * three orders of magnitude more and, crucially, TELLS the user when it truncates.
 * The cap exists because the join preview is synchronous: a multi-million-row cross
 * product locks the tab.
 */
export const MAX_ROWS = 100_000;

export interface ParsedTable {
  /** Column names in file order. */
  columns: string[];
  /** Row objects keyed by column name. */
  rows: Record<string, unknown>[];
  /** Rows present in the file, before any truncation. */
  totalRows: number;
  /** True when `rows.length < totalRows` — callers MUST surface this. */
  truncated: boolean;
  /** Names of sheets not imported (Excel only); empty for CSV. */
  ignoredSheets: string[];
  /** Non-fatal problems worth showing the user (malformed rows, etc). */
  warnings: string[];
}

export class UnsupportedFileError extends Error {
  constructor(ext: string) {
    super(`Elegant Joins can read .csv, .tsv, .xlsx and .xls files — not ".${ext}".`);
    this.name = "UnsupportedFileError";
  }
}

/**
 * FIX 2 — column discovery.
 * The server did `Object.keys(parsedData[0])`, so any column absent or empty in the
 * FIRST row vanished from the whole table. Excel's sheet_to_json omits empty cells
 * entirely, which made this fire constantly on real spreadsheets. Union the keys of
 * every row instead, preserving first-seen order.
 */
export function collectColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  }
  return ordered;
}

const BOOLEAN_WORDS = new Set(["true", "false", "yes", "no", "y", "n", "t", "f"]);
// Matches ISO dates, and the common US/EU slash and dash formats — but NOT a bare
// integer, which `new Date()` happily and uselessly accepts.
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}([T ]|$)|^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

/**
 * FIX 3 — type inference order and reachability.
 * The server tested numbers BEFORE booleans, so a column of 0/1 (or real JS booleans,
 * since Number(true) === 1) always returned "number" and the boolean branch was dead
 * code. It also called any numeric string a date, because `new Date("5")` parses.
 * Order here is: boolean, then number, then date-by-shape, then text.
 */
export function inferDataType(values: unknown[]): DataType {
  const present = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (present.length === 0) return "text";

  const allBooleans = present.every(
    (v) => typeof v === "boolean" || BOOLEAN_WORDS.has(String(v).trim().toLowerCase()),
  );
  if (allBooleans) return "boolean";

  const allNumbers = present.every((v) => {
    if (typeof v === "number") return Number.isFinite(v);
    const s = String(v).trim();
    // Number("") is 0 and Number(" ") is 0 — reject blanks explicitly.
    return s !== "" && Number.isFinite(Number(s));
  });
  if (allNumbers) return "number";

  const allDates = present.every((v) => {
    if (v instanceof Date) return !Number.isNaN(v.getTime());
    const s = String(v).trim();
    return DATE_SHAPE.test(s) && !Number.isNaN(new Date(s).getTime());
  });
  if (allDates) return "date";

  return "text";
}

/** Infers a type per column, sampling up to `sampleSize` rows. */
export function inferColumnTypes(
  columns: string[],
  rows: Record<string, unknown>[],
  sampleSize = 200,
): Record<string, DataType> {
  const sample = rows.slice(0, sampleSize);
  const out: Record<string, DataType> = {};
  for (const col of columns) {
    out[col] = inferDataType(sample.map((r) => r[col]));
  }
  return out;
}

/**
 * FIX 4 — cross-format join keys.
 * CSV parsing yields strings ("42"); Excel yields numbers (42). Joining a CSV against
 * an XLSX on the same logical id therefore matched nothing, with no error shown.
 * Every comparison in the join engine and the preview panel goes through this, so both
 * sources normalise to one comparable form.
 */
export function normalizeJoinValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();

  const s = String(value).trim();
  if (s === "") return null;

  // "42", "42.0" and 42 must all collide, but "007" must NOT become "7" — a zero-padded
  // code is an identifier, not a quantity, and collapsing it would join the wrong rows.
  // The signal is shape, not value: a leading zero on a plain integer means "identifier";
  // a decimal point or exponent means "number".
  if (/^[+-]?\d+$/.test(s)) {
    const digits = s.replace(/^[+-]/, "");
    // "0" is a genuine number; "007" and "0800" are codes.
    if (digits.length > 1 && digits.startsWith("0")) return s.toLowerCase();
    return String(Number(s));
  }
  if (/^[+-]?(\d+\.\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(n);
  }

  return s.toLowerCase();
}

function truncate(rows: Record<string, unknown>[]): Pick<ParsedTable, "rows" | "totalRows" | "truncated"> {
  const totalRows = rows.length;
  return {
    rows: totalRows > MAX_ROWS ? rows.slice(0, MAX_ROWS) : rows,
    totalRows,
    truncated: totalRows > MAX_ROWS,
  };
}

/** Parses delimited text. Papa sniffs the delimiter, so .tsv works for free. */
export function parseDelimited(text: string): ParsedTable {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    // Trailing whitespace in a header silently breaks every later key lookup.
    transformHeader: (h) => h.trim(),
  });

  const warnings: string[] = [];
  if (parsed.errors?.length) {
    // Papa reports one error per bad row; collapse to a single honest sentence.
    const rowsAffected = new Set(parsed.errors.map((e) => e.row)).size;
    warnings.push(
      `${rowsAffected} row${rowsAffected === 1 ? "" : "s"} had a formatting problem and may be incomplete (${parsed.errors[0].message}).`,
    );
  }

  const rows = (parsed.data ?? []).filter((r) => r && Object.keys(r).length > 0);
  return { columns: collectColumns(rows), ...truncate(rows), ignoredSheets: [], warnings };
}

/**
 * Parses an Excel workbook from raw bytes.
 *
 * Accepts a Uint8Array as well as an ArrayBuffer, and normalises to the former: an
 * ArrayBuffer created in one realm (a jsdom test, an iframe, a worker) fails SheetJS's
 * internal `instanceof ArrayBuffer` check and silently parses as garbage. A typed-array
 * view sidesteps the realm question entirely.
 */
export function parseWorkbook(data: ArrayBuffer | Uint8Array, sheetName?: string): ParsedTable {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  if (!workbook.SheetNames.length) {
    return { columns: [], rows: [], totalRows: 0, truncated: false, ignoredSheets: [], warnings: ["This workbook has no sheets."] };
  }

  const chosen = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const sheet = workbook.Sheets[chosen];
  // defval: null keeps empty cells as explicit nulls so a column that is blank in early
  // rows still shows up in collectColumns.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  // FIX 5 — the server read SheetNames[0] and never mentioned the others existed.
  const ignoredSheets = workbook.SheetNames.filter((n) => n !== chosen);

  return { columns: collectColumns(rows), ...truncate(rows), ignoredSheets, warnings: [] };
}

export function extensionOf(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

/** Reads and parses a browser File. The only impure function in this module. */
export async function parseFile(file: File, sheetName?: string): Promise<ParsedTable> {
  const ext = extensionOf(file.name);

  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    return parseDelimited(await file.text());
  }
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    return parseWorkbook(new Uint8Array(await file.arrayBuffer()), sheetName);
  }
  throw new UnsupportedFileError(ext || "unknown");
}

/** Lists sheet names without importing, so the UI can offer a choice. */
export async function listSheets(file: File): Promise<string[]> {
  const ext = extensionOf(file.name);
  if (!["xlsx", "xls", "xlsm"].includes(ext)) return [];
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", bookSheets: true });
  return wb.SheetNames;
}
