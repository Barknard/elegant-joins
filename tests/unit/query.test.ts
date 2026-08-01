import { describe, expect, it } from "vitest";
import { applyFilters, applySort, describeQuery, matchesFilter, type Filter } from "@/lib/join/query";
import type { JoinResultColumn } from "@/lib/join/engine";

const columns: JoinResultColumn[] = [
  { key: "c.name", table: "c", column: "name", dataType: "text" },
  { key: "c.city", table: "c", column: "city", dataType: "text" },
  { key: "o.amount", table: "o", column: "amount", dataType: "number" },
  { key: "c.signup", table: "c", column: "signup", dataType: "date" },
  { key: "c.active", table: "c", column: "active", dataType: "boolean" },
];

const rows: Record<string, unknown>[] = [
  { "c.name": "Ada", "c.city": "London", "o.amount": 2400.5, "c.signup": "2024-01-15", "c.active": true },
  { "c.name": "Grace", "c.city": "New York", "o.amount": 899.99, "c.signup": "2024-02-03", "c.active": true },
  { "c.name": "Katherine", "c.city": "Hampton", "o.amount": 9, "c.signup": "2024-02-19", "c.active": false },
  { "c.name": "Annie", "c.city": "Hampton", "o.amount": 75, "c.signup": "2024-03-07", "c.active": true },
  { "c.name": "Mary", "c.city": null, "o.amount": null, "c.signup": null, "c.active": null },
];

const f = (key: string, operator: Filter["operator"], value?: string, value2?: string): Filter =>
  ({ key, operator, value, value2 });

const names = (rs: Record<string, unknown>[]) => rs.map((r) => r["c.name"]);

describe("text filters", () => {
  it("matches exactly, ignoring case", () => {
    expect(names(applyFilters(rows, columns, [f("c.city", "is", "hampton")]))).toEqual(["Katherine", "Annie"]);
  });

  it("is_not keeps blanks — a missing city genuinely is not Hampton", () => {
    // A deliberate departure from SQL, where `city <> 'Hampton'` drops NULLs. This is a
    // spreadsheet tool for non-technical users: hiding the blank rows when you ask for
    // "not Hampton" surprises people and quietly loses data from the result. Anyone who
    // specifically wants the blanks has is_empty.
    expect(names(applyFilters(rows, columns, [f("c.city", "is_not", "Hampton")]))).toEqual(["Ada", "Grace", "Mary"]);
  });

  it("contains / starts with / ends with", () => {
    // "New York" contains "or"; "London" does not.
    expect(names(applyFilters(rows, columns, [f("c.city", "contains", "or")]))).toEqual(["Grace"]);
    expect(names(applyFilters(rows, columns, [f("c.name", "starts_with", "A")]))).toEqual(["Ada", "Annie"]);
    expect(names(applyFilters(rows, columns, [f("c.name", "ends_with", "e")]))).toEqual(["Grace", "Katherine", "Annie"]);
  });

  it("finds blanks without treating them as the empty string", () => {
    expect(names(applyFilters(rows, columns, [f("c.city", "is_empty")]))).toEqual(["Mary"]);
    expect(names(applyFilters(rows, columns, [f("c.city", "is_not_empty")]))).toHaveLength(4);
  });
});

describe("number filters", () => {
  it("compares numerically, not alphabetically", () => {
    // The whole point: "9" > "10" as text, and that is not what anyone means.
    expect(names(applyFilters(rows, columns, [f("o.amount", "gt", "10")]))).toEqual(["Ada", "Grace", "Annie"]);
    expect(names(applyFilters(rows, columns, [f("o.amount", "lt", "100")]))).toEqual(["Katherine", "Annie"]);
  });

  it("handles inclusive bounds", () => {
    expect(names(applyFilters(rows, columns, [f("o.amount", "gte", "75")]))).toEqual(["Ada", "Grace", "Annie"]);
    expect(names(applyFilters(rows, columns, [f("o.amount", "lte", "9")]))).toEqual(["Katherine"]);
  });

  it("between is inclusive and order-insensitive", () => {
    expect(names(applyFilters(rows, columns, [f("o.amount", "between", "9", "100")]))).toEqual(["Katherine", "Annie"]);
    expect(names(applyFilters(rows, columns, [f("o.amount", "between", "100", "9")]))).toEqual(["Katherine", "Annie"]);
  });

  it("never matches a blank cell", () => {
    expect(names(applyFilters(rows, columns, [f("o.amount", "gt", "-99999")]))).not.toContain("Mary");
  });
});

describe("date filters", () => {
  it("compares chronologically, not as strings", () => {
    expect(names(applyFilters(rows, columns, [f("c.signup", "before", "2024-02-10")]))).toEqual(["Ada", "Grace"]);
    expect(names(applyFilters(rows, columns, [f("c.signup", "after", "2024-02-10")]))).toEqual(["Katherine", "Annie"]);
  });

  it("supports a range", () => {
    expect(names(applyFilters(rows, columns, [f("c.signup", "between", "2024-02-01", "2024-02-28")])))
      .toEqual(["Grace", "Katherine"]);
  });
});

describe("boolean filters", () => {
  it("splits yes from no and ignores blanks", () => {
    expect(names(applyFilters(rows, columns, [f("c.active", "is_true")]))).toEqual(["Ada", "Grace", "Annie"]);
    expect(names(applyFilters(rows, columns, [f("c.active", "is_false")]))).toEqual(["Katherine"]);
  });
});

describe("combining filters", () => {
  it("requires every filter to pass", () => {
    const out = applyFilters(rows, columns, [f("c.city", "is", "Hampton"), f("o.amount", "gt", "10")]);
    expect(names(out)).toEqual(["Annie"]);
  });

  it("ignores a filter that has no value typed yet", () => {
    // Otherwise the table empties the moment you add a filter row.
    expect(applyFilters(rows, columns, [f("c.city", "is", "")])).toHaveLength(rows.length);
  });

  it("returns everything when there are no filters", () => {
    expect(applyFilters(rows, columns, [])).toHaveLength(rows.length);
  });
});

describe("sorting", () => {
  it("sorts numbers by value", () => {
    const asc = applySort(rows, columns, [{ key: "o.amount", direction: "asc" }]);
    expect(names(asc).slice(0, 3)).toEqual(["Katherine", "Annie", "Grace"]);
  });

  it("sorts dates chronologically", () => {
    const desc = applySort(rows, columns, [{ key: "c.signup", direction: "desc" }]);
    expect(names(desc).slice(0, 2)).toEqual(["Annie", "Katherine"]);
  });

  it("sorts text naturally, so item 2 precedes item 10", () => {
    const natural: Record<string, unknown>[] = [
      { "c.name": "item 10" }, { "c.name": "item 2" }, { "c.name": "item 1" },
    ];
    const out = applySort(natural, columns, [{ key: "c.name", direction: "asc" }]);
    expect(out.map((r) => r["c.name"])).toEqual(["item 1", "item 2", "item 10"]);
  });

  it("puts blanks last in BOTH directions", () => {
    expect(names(applySort(rows, columns, [{ key: "o.amount", direction: "asc" }])).at(-1)).toBe("Mary");
    expect(names(applySort(rows, columns, [{ key: "o.amount", direction: "desc" }])).at(-1)).toBe("Mary");
  });

  it("uses later keys only to break ties", () => {
    const out = applySort(rows, columns, [
      { key: "c.city", direction: "asc" },
      { key: "o.amount", direction: "desc" },
    ]);
    // Both Hampton rows together, higher amount first within them.
    expect(names(out).slice(0, 2)).toEqual(["Annie", "Katherine"]);
  });

  it("does not mutate the input", () => {
    const before = names(rows);
    applySort(rows, columns, [{ key: "o.amount", direction: "desc" }]);
    expect(names(rows)).toEqual(before);
  });
});

describe("describeQuery", () => {
  it("explains filters and sorts in plain words", () => {
    const lines = describeQuery(
      columns,
      [f("c.city", "is", "Hampton"), f("o.amount", "gt", "10")],
      [{ key: "c.signup", direction: "desc" }],
    );
    expect(lines[0]).toBe("Keep rows where city is Hampton");
    expect(lines[1]).toBe("Keep rows where amount more than 10");
    expect(lines[2]).toMatch(/^Sort by signup/);
  });

  it("says nothing about a filter still being filled in", () => {
    expect(describeQuery(columns, [f("c.city", "is", "")], [])).toEqual([]);
  });
});

describe("matchesFilter defaults", () => {
  it("treats an unknown column type as text", () => {
    expect(matchesFilter({ x: "Hello" }, { key: "x", operator: "contains", value: "ell" })).toBe(true);
  });
});
