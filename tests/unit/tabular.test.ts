import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectColumns,
  extensionOf,
  inferColumnTypes,
  inferDataType,
  normalizeJoinValue,
  parseDelimited,
  parseWorkbook,
} from "@/lib/parse/tabular";

const fixture = (name: string) => join(process.cwd(), "tests", "fixtures", name);
const readText = (name: string) => readFileSync(fixture(name), "utf-8");
const readBytes = (name: string) => new Uint8Array(readFileSync(fixture(name)));

describe("inferDataType", () => {
  it("detects booleans — the branch that used to be unreachable", () => {
    // The server tested numbers first, and Number(true) === 1, so a boolean column
    // always came back as "number" and the boolean branch was dead code.
    expect(inferDataType([true, false, true])).toBe("boolean");
    expect(inferDataType(["true", "false"])).toBe("boolean");
    expect(inferDataType(["yes", "no"])).toBe("boolean");
  });

  it("detects numbers", () => {
    expect(inferDataType([1, 2, 3])).toBe("number");
    expect(inferDataType(["1.5", "2.25"])).toBe("number");
    expect(inferDataType([-4, 0, 12])).toBe("number");
  });

  it("detects dates by shape, not by whatever new Date() will swallow", () => {
    expect(inferDataType(["2024-01-15", "2024-02-03"])).toBe("date");
    expect(inferDataType(["01/15/2024", "02/03/2024"])).toBe("date");
    // `new Date("5")` parses to a real date in V8; the old code called this a date.
    expect(inferDataType(["5", "6", "7"])).toBe("number");
  });

  it("falls back to text", () => {
    expect(inferDataType(["London", "New York"])).toBe("text");
    expect(inferDataType(["abc", 123])).toBe("text");
  });

  it("treats an all-empty column as text rather than guessing", () => {
    expect(inferDataType([null, undefined, ""])).toBe("text");
  });

  it("ignores blanks when judging the rest of the column", () => {
    expect(inferDataType([1, null, 3, ""])).toBe("number");
  });
});

describe("collectColumns", () => {
  it("unions keys across all rows, not just the first", () => {
    // Reading Object.keys(rows[0]) dropped any column missing from row 0 — which for
    // Excel is every column whose first cell is blank.
    const rows = [{ a: 1 }, { a: 2, b: 3 }, { c: 4 }];
    expect(collectColumns(rows)).toEqual(["a", "b", "c"]);
  });

  it("preserves first-seen order", () => {
    expect(collectColumns([{ z: 1, a: 2 }, { m: 3 }])).toEqual(["z", "a", "m"]);
  });

  it("returns an empty list for no rows", () => {
    expect(collectColumns([])).toEqual([]);
  });
});

describe("normalizeJoinValue", () => {
  it("makes numeric strings and numbers comparable", () => {
    expect(normalizeJoinValue("42")).toBe(normalizeJoinValue(42));
    expect(normalizeJoinValue("42.0")).toBe(normalizeJoinValue(42));
    expect(normalizeJoinValue(" 42 ")).toBe(normalizeJoinValue(42));
  });

  it("keeps zero-padded codes distinct from their numeric value", () => {
    expect(normalizeJoinValue("007")).not.toBe(normalizeJoinValue(7));
    expect(normalizeJoinValue("0800")).not.toBe(normalizeJoinValue(800));
  });

  it("still treats a plain zero as a number", () => {
    expect(normalizeJoinValue("0")).toBe(normalizeJoinValue(0));
  });

  it("is case-insensitive for text", () => {
    expect(normalizeJoinValue("ACME")).toBe(normalizeJoinValue("acme"));
  });

  it("maps blanks to null so they never match", () => {
    expect(normalizeJoinValue("")).toBeNull();
    expect(normalizeJoinValue("   ")).toBeNull();
    expect(normalizeJoinValue(null)).toBeNull();
    expect(normalizeJoinValue(undefined)).toBeNull();
  });

  it("normalises booleans consistently", () => {
    expect(normalizeJoinValue(true)).toBe("true");
    expect(normalizeJoinValue(false)).toBe("false");
  });
});

describe("parseDelimited", () => {
  it("reads a well-formed CSV completely", () => {
    const r = parseDelimited(readText("customers.csv"));
    expect(r.columns).toEqual(["customer_id", "name", "email", "city", "signup_date", "active"]);
    expect(r.rows).toHaveLength(6);
    expect(r.totalRows).toBe(6);
    expect(r.truncated).toBe(false);
    expect(r.rows[0].name).toBe("Ada Lovelace");
  });

  it("handles quoted commas, escaped quotes and embedded newlines", () => {
    const r = parseDelimited(readText("messy.csv"));
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0].description).toBe("Bond, James");
    expect(r.rows[0].notes).toBe('He said "hello"');
    expect(String(r.rows[1].description)).toContain("\n");
  });

  it("keeps zero-padded codes as written", () => {
    const r = parseDelimited(readText("messy.csv"));
    expect(r.rows[0].code).toBe("007");
  });

  it("trims whitespace from headers", () => {
    const r = parseDelimited("a , b\n1,2\n");
    expect(r.columns).toEqual(["a", "b"]);
  });

  it("infers types across a real file", () => {
    const r = parseDelimited(readText("customers.csv"));
    const types = inferColumnTypes(r.columns, r.rows);
    expect(types.customer_id).toBe("number");
    expect(types.name).toBe("text");
    expect(types.signup_date).toBe("date");
    expect(types.active).toBe("boolean");
  });

  it("returns an empty result for empty input rather than throwing", () => {
    const r = parseDelimited("");
    expect(r.rows).toEqual([]);
    expect(r.columns).toEqual([]);
  });
});

describe("parseWorkbook", () => {
  it("reads the first sheet and names the ones it skipped", () => {
    const r = parseWorkbook(readBytes("products.xlsx"));
    expect(r.rows).toHaveLength(4);
    expect(r.ignoredSheets).toEqual(["Targets", "Scratch"]);
  });

  it("can be pointed at a specific sheet", () => {
    const r = parseWorkbook(readBytes("products.xlsx"), "Targets");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].region).toBe("EMEA");
    expect(r.ignoredSheets).toEqual(["Products", "Scratch"]);
  });

  it("keeps a column that is blank in the first row", () => {
    // sparse.xlsx has `late_column` empty in row 1. Reading columns from row 0 alone
    // made the column disappear from the table entirely.
    const r = parseWorkbook(readBytes("sparse.xlsx"));
    expect(r.columns).toContain("late_column");
    expect(r.rows[1].late_column).toBe("appears here");
  });

  it("reads Excel numbers as numbers, so they can join CSV strings", () => {
    const r = parseWorkbook(readBytes("products.xlsx"));
    expect(typeof r.rows[0].customer_id).toBe("number");
  });
});

describe("extensionOf", () => {
  it("lowercases and handles dotted names", () => {
    expect(extensionOf("Report.FINAL.CSV")).toBe("csv");
    expect(extensionOf("data.xlsx")).toBe("xlsx");
  });

  it("returns empty string when there is no extension", () => {
    expect(extensionOf("README")).toBe("");
  });
});
