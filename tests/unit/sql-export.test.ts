import { describe, expect, it } from "vitest";
import { generateSql, quoteIdent, sqlTypeFor, type TableWithColumns } from "@/lib/export/sql";
import type { Relationship } from "@shared/schema";

const col = (id: number, name: string, dataType = "text", isKey = 0, order = 0) => ({
  id,
  tableId: 1,
  columnId: `c${id}`,
  name,
  displayName: null,
  dataType,
  isKey,
  columnOrder: order,
});

const table = (id: number, name: string, columns: ReturnType<typeof col>[]): TableWithColumns => ({
  id,
  projectId: 1,
  nodeId: `n${id}`,
  name,
  displayName: null,
  fileName: `${name}.csv`,
  positionX: 0,
  positionY: 0,
  iconColor: null,
  rawData: null,
  createdAt: new Date(),
  columns,
});

const rel = (over: Partial<Relationship> = {}): Relationship => ({
  id: 1,
  projectId: 1,
  edgeId: "e1",
  sourceTableId: 1,
  targetTableId: 2,
  sourceColumnId: "c1",
  targetColumnId: "c3",
  sourceHandle: null,
  targetHandle: null,
  relationshipType: "one-to-many",
  joinType: "left",
  cardinalityType: "one-to-many",
  label: "",
  createdAt: new Date(),
  ...over,
});

describe("quoteIdent", () => {
  it("quotes names containing spaces", () => {
    // `CREATE TABLE sales data (` was a syntax error; this is the whole point.
    expect(quoteIdent("sales data")).toBe('"sales data"');
  });

  it("quotes reserved words", () => {
    expect(quoteIdent("order")).toBe('"order"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });

  it("substitutes a placeholder for an empty name rather than emitting \"\"", () => {
    expect(quoteIdent("   ")).toBe('"unnamed"');
  });
});

describe("sqlTypeFor", () => {
  it("maps the four logical types", () => {
    expect(sqlTypeFor("number")).toBe("DECIMAL(18,4)");
    expect(sqlTypeFor("date")).toBe("DATE");
    expect(sqlTypeFor("boolean")).toBe("BOOLEAN");
    expect(sqlTypeFor("text")).toBe("VARCHAR(255)");
  });

  it("falls back to text for anything unrecognised", () => {
    expect(sqlTypeFor("mystery")).toBe("VARCHAR(255)");
  });
});

describe("generateSql", () => {
  it("quotes table and column identifiers", () => {
    const sql = generateSql([table(1, "sales data", [col(1, "order", "text", 1)])], []);
    expect(sql).toContain('CREATE TABLE "sales data"');
    expect(sql).toContain('"order" VARCHAR(255)');
  });

  it("emits ONE composite primary key, not one clause per key column", () => {
    // Two `PRIMARY KEY` clauses in a single CREATE TABLE is rejected by every engine.
    const sql = generateSql(
      [table(1, "t", [col(1, "a", "text", 1, 0), col(2, "b", "text", 1, 1)])],
      [],
    );
    expect(sql.match(/PRIMARY KEY/g)).toHaveLength(1);
    expect(sql).toContain('PRIMARY KEY ("a", "b")');
  });

  it("omits the primary key clause when no column is a key", () => {
    const sql = generateSql([table(1, "t", [col(1, "a")])], []);
    expect(sql).not.toContain("PRIMARY KEY");
  });

  it("gives every foreign key a unique constraint name", () => {
    const customers = table(1, "customers", [col(1, "id", "number", 1)]);
    const orders = table(2, "orders", [col(3, "customer_id", "number"), col(4, "alt_id", "number")]);
    // Two relationships between the SAME pair used to produce the same constraint name.
    const sql = generateSql([customers, orders], [
      rel({ id: 1, sourceColumnId: "c1", targetColumnId: "c3" }),
      rel({ id: 2, edgeId: "e2", sourceColumnId: "c1", targetColumnId: "c4" }),
    ]);
    const names = [...sql.matchAll(/ADD CONSTRAINT "([^"]+)"/g)].map((m) => m[1]);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
  });

  it("refuses to reference a non-key column and explains why", () => {
    const customers = table(1, "customers", [col(1, "id", "number", 0)]); // not a key
    const orders = table(2, "orders", [col(3, "customer_id", "number")]);
    const sql = generateSql([customers, orders], [rel()]);
    expect(sql).not.toContain("ADD CONSTRAINT");
    expect(sql).toMatch(/not marked as a key/i);
  });

  it("skips a relationship whose columns no longer exist", () => {
    const sql = generateSql(
      [table(1, "a", [col(1, "id", "number", 1)]), table(2, "b", [col(3, "x")])],
      [rel({ targetColumnId: "gone" })],
    );
    expect(sql).not.toContain("ADD CONSTRAINT");
  });

  it("says so plainly when the canvas is empty", () => {
    expect(generateSql([], [])).toMatch(/no tables/i);
  });

  it("notes a table that has no columns instead of emitting empty parentheses", () => {
    const sql = generateSql([table(1, "t", [])], []);
    expect(sql).toMatch(/no columns defined/i);
    expect(sql).not.toMatch(/\(\s*\)/);
  });

  it("emits columns in columnOrder", () => {
    const sql = generateSql(
      [table(1, "t", [col(2, "second", "text", 0, 1), col(1, "first", "text", 0, 0)])],
      [],
    );
    expect(sql.indexOf('"first"')).toBeLessThan(sql.indexOf('"second"'));
  });
});
