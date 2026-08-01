/**
 * Filtering and sorting over a join result — the WHERE and ORDER BY of the app.
 *
 * Pure functions over the rows `executeJoin` produced, so they're testable without a
 * browser and there is one definition of "matches" shared by the preview, the View
 * Builder and every export.
 *
 * Comparisons go by the column's declared type, not by string. "9" > "10" is true
 * alphabetically and false for anyone actually looking at numbers, and a date column
 * sorted as text puts 2024-1-5 after 2024-11-02. The type is carried through the join
 * on JoinResultColumn.dataType precisely so this layer can honour it.
 */
import type { DataType } from "@shared/schema";
import type { JoinResultColumn } from "./engine";

export type FilterOperator =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "before"
  | "after"
  | "is_empty"
  | "is_not_empty"
  | "is_true"
  | "is_false";

export interface Filter {
  /** Qualified column key, e.g. "customers.city". */
  key: string;
  operator: FilterOperator;
  value?: string;
  /** Upper bound for `between`. */
  value2?: string;
}

export type SortDirection = "asc" | "desc";

export interface Sort {
  key: string;
  direction: SortDirection;
}

/** Operators worth offering for each column type — drives the UI's dropdown. */
export const OPERATORS_BY_TYPE: Record<DataType, FilterOperator[]> = {
  text: ["is", "is_not", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  number: ["is", "is_not", "gt", "gte", "lt", "lte", "between", "is_empty", "is_not_empty"],
  date: ["is", "is_not", "before", "after", "between", "is_empty", "is_not_empty"],
  boolean: ["is_true", "is_false", "is_empty", "is_not_empty"],
};

/** Human wording for each operator, so the UI and any explanation agree. */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  gt: "more than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  between: "between",
  before: "before",
  after: "after",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  is_true: "is yes",
  is_false: "is no",
};

/** Operators that need no value at all. */
export const VALUELESS_OPERATORS: ReadonlySet<FilterOperator> = new Set([
  "is_empty",
  "is_not_empty",
  "is_true",
  "is_false",
]);

const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (isBlank(v)) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function asTime(v: unknown): number | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (isBlank(v)) return null;
  const t = new Date(String(v).trim()).getTime();
  return Number.isNaN(t) ? null : t;
}

function asBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (isBlank(v)) return null;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "y", "1", "t"].includes(s)) return true;
  if (["false", "no", "n", "0", "f"].includes(s)) return false;
  return null;
}

const asText = (v: unknown) => (isBlank(v) ? "" : String(v).trim().toLowerCase());

/** Does one row satisfy one filter? */
export function matchesFilter(
  row: Record<string, unknown>,
  filter: Filter,
  dataType: DataType = "text",
): boolean {
  const cell = row[filter.key];

  // Emptiness is type-independent and has to be checked before any coercion, or a
  // null in a number column would be compared as 0.
  if (filter.operator === "is_empty") return isBlank(cell);
  if (filter.operator === "is_not_empty") return !isBlank(cell);
  if (filter.operator === "is_true") return asBoolean(cell) === true;
  if (filter.operator === "is_false") return asBoolean(cell) === false;

  // A filter with nothing typed in it yet shouldn't hide every row while you're still
  // filling it in.
  const needle = filter.value ?? "";
  if (needle.trim() === "") return true;

  if (dataType === "number") {
    const a = asNumber(cell);
    const b = asNumber(needle);
    if (a === null || b === null) return false;
    switch (filter.operator) {
      case "is": return a === b;
      case "is_not": return a !== b;
      case "gt": return a > b;
      case "gte": return a >= b;
      case "lt": return a < b;
      case "lte": return a <= b;
      case "between": {
        const c = asNumber(filter.value2 ?? "");
        return c !== null && a >= Math.min(b, c) && a <= Math.max(b, c);
      }
      default: return true;
    }
  }

  if (dataType === "date") {
    const a = asTime(cell);
    const b = asTime(needle);
    if (a === null || b === null) return false;
    switch (filter.operator) {
      case "is": return a === b;
      case "is_not": return a !== b;
      case "before": return a < b;
      case "after": return a > b;
      case "between": {
        const c = asTime(filter.value2 ?? "");
        return c !== null && a >= Math.min(b, c) && a <= Math.max(b, c);
      }
      default: return true;
    }
  }

  // Text (and anything unrecognised). Case-insensitive throughout: nobody filtering a
  // spreadsheet means "Hampton but not hampton".
  const a = asText(cell);
  const b = asText(needle);
  switch (filter.operator) {
    case "is": return a === b;
    case "is_not": return a !== b;
    case "contains": return a.includes(b);
    case "not_contains": return !a.includes(b);
    case "starts_with": return a.startsWith(b);
    case "ends_with": return a.endsWith(b);
    default: return true;
  }
}

/** Keeps only the rows satisfying EVERY filter (AND, as Access's query grid does). */
export function applyFilters(
  rows: Record<string, unknown>[],
  columns: JoinResultColumn[],
  filters: Filter[],
): Record<string, unknown>[] {
  const active = filters.filter(
    (f) => f.key && (VALUELESS_OPERATORS.has(f.operator) || (f.value ?? "").trim() !== ""),
  );
  if (active.length === 0) return rows;

  const typeOf = new Map(columns.map((c) => [c.key, c.dataType ?? "text"]));
  return rows.filter((row) => active.every((f) => matchesFilter(row, f, typeOf.get(f.key))));
}

/**
 * Sorts by each key in turn, first key most significant.
 *
 * Blanks always sort last regardless of direction — a column of dates with a few gaps
 * should show you the dates, not lead with the gaps.
 */
export function applySort(
  rows: Record<string, unknown>[],
  columns: JoinResultColumn[],
  sorts: Sort[],
): Record<string, unknown>[] {
  const active = sorts.filter((s) => s.key);
  if (active.length === 0) return rows;

  const typeOf = new Map(columns.map((c) => [c.key, c.dataType ?? "text"]));

  // Copy: callers hold onto the join result, and sorting it underneath them would make
  // the same "unsorted" result render differently on a re-render.
  return [...rows].sort((rowA, rowB) => {
    for (const sort of active) {
      const a = rowA[sort.key];
      const b = rowB[sort.key];

      const aBlank = isBlank(a);
      const bBlank = isBlank(b);
      if (aBlank && bBlank) continue;
      if (aBlank) return 1;
      if (bBlank) return -1;

      let cmp = 0;
      switch (typeOf.get(sort.key)) {
        case "number": {
          const x = asNumber(a) ?? 0;
          const y = asNumber(b) ?? 0;
          cmp = x === y ? 0 : x < y ? -1 : 1;
          break;
        }
        case "date": {
          const x = asTime(a) ?? 0;
          const y = asTime(b) ?? 0;
          cmp = x === y ? 0 : x < y ? -1 : 1;
          break;
        }
        case "boolean": {
          const x = asBoolean(a) === true ? 1 : 0;
          const y = asBoolean(b) === true ? 1 : 0;
          cmp = x - y;
          break;
        }
        default:
          // numeric:true so "item 2" precedes "item 10", which is what a person means.
          cmp = String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
      }

      if (cmp !== 0) return sort.direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

/** One plain-English line per filter and sort, for the "show your work" panel. */
export function describeQuery(
  columns: JoinResultColumn[],
  filters: Filter[],
  sorts: Sort[],
): string[] {
  const label = (key: string) => columns.find((c) => c.key === key)?.column ?? key;
  const out: string[] = [];

  for (const f of filters) {
    if (!f.key) continue;
    if (!VALUELESS_OPERATORS.has(f.operator) && (f.value ?? "").trim() === "") continue;
    const op = OPERATOR_LABELS[f.operator];
    if (VALUELESS_OPERATORS.has(f.operator)) out.push(`Keep rows where ${label(f.key)} ${op}`);
    else if (f.operator === "between") out.push(`Keep rows where ${label(f.key)} is between ${f.value} and ${f.value2 ?? ""}`);
    else out.push(`Keep rows where ${label(f.key)} ${op} ${f.value}`);
  }

  for (const s of sorts) {
    if (!s.key) continue;
    out.push(`Sort by ${label(s.key)} (${s.direction === "desc" ? "Z to A / newest first" : "A to Z / oldest first"})`);
  }

  return out;
}
