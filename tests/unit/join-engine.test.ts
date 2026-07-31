import { describe, expect, it } from "vitest";
import { DEFAULT_ROW_LIMIT, executeJoin, planJoin, type JoinEdge, type JoinTable } from "@/lib/join/engine";

/** customers: 3 rows, ids 1-3. */
const customers: JoinTable = {
  nodeId: "n1",
  name: "customers",
  columns: [{ columnId: "c0", name: "id" }, { columnId: "c1", name: "name" }],
  rows: [
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
    { id: 3, name: "Katherine" },
  ],
};

/** orders: 3 rows. customer 1 has two orders, customer 2 has one, customer 3 none.
 *  Order o3 belongs to customer 9, who does not exist in `customers`. */
const orders: JoinTable = {
  nodeId: "n2",
  name: "orders",
  columns: [{ columnId: "o0", name: "order_id" }, { columnId: "o1", name: "customer_id" }],
  rows: [
    { order_id: "o1", customer_id: 1 },
    { order_id: "o2", customer_id: 1 },
    { order_id: "o3", customer_id: 9 },
    { order_id: "o4", customer_id: 2 },
  ],
};

const edge = (joinType: JoinEdge["joinType"]): JoinEdge => ({
  edgeId: "e1",
  sourceNodeId: "n1",
  targetNodeId: "n2",
  sourceColumn: "id",
  targetColumn: "customer_id",
  joinType,
});

describe("executeJoin — two-table semantics", () => {
  it("inner join keeps only matched rows on both sides", () => {
    const r = executeJoin([customers, orders], [edge("inner")]);
    expect(r.rows).toHaveLength(3); // Ada×2 + Grace×1; Katherine and order o3 excluded
    expect(r.rows.every((row) => row["orders.order_id"] !== null)).toBe(true);
    expect(r.rows.map((row) => row["orders.order_id"]).sort()).toEqual(["o1", "o2", "o4"]);
  });

  it("left join keeps unmatched left rows with nulls on the right", () => {
    const r = executeJoin([customers, orders], [edge("left")]);
    expect(r.rows).toHaveLength(4); // 3 matched + Katherine unmatched
    const katherine = r.rows.find((row) => row["customers.name"] === "Katherine");
    expect(katherine).toBeDefined();
    expect(katherine!["orders.order_id"]).toBeNull();
  });

  it("right join keeps unmatched right rows — NOT the same as inner", () => {
    const r = executeJoin([customers, orders], [edge("right")]);
    // This is the regression: the old panel treated `right` as `inner` and returned 3.
    expect(r.rows).toHaveLength(4); // 3 matched + orphan order o3
    const orphan = r.rows.find((row) => row["orders.order_id"] === "o3");
    expect(orphan).toBeDefined();
    expect(orphan!["customers.name"]).toBeNull();
    expect(r.rows).not.toHaveLength(executeJoin([customers, orders], [edge("inner")]).rows.length);
  });

  it("full join keeps unmatched rows from both sides", () => {
    const r = executeJoin([customers, orders], [edge("full")]);
    expect(r.rows).toHaveLength(5); // 3 matched + Katherine + orphan o3
    expect(r.rows.some((row) => row["orders.order_id"] === null)).toBe(true);
    expect(r.rows.some((row) => row["customers.name"] === null)).toBe(true);
  });

  it("produces one row per match, not per left row (one-to-many fan-out)", () => {
    const r = executeJoin([customers, orders], [edge("inner")]);
    const adaRows = r.rows.filter((row) => row["customers.name"] === "Ada");
    expect(adaRows).toHaveLength(2);
  });
});

describe("executeJoin — key normalisation across file formats", () => {
  it("matches a CSV string key against an Excel numeric key", () => {
    // CSV parsing yields strings; XLSX yields numbers. The old `===` comparison meant
    // these two tables joined to zero rows with no error shown.
    const csvSide: JoinTable = {
      ...customers,
      rows: [{ id: "1", name: "Ada" }, { id: "2", name: "Grace" }],
    };
    const r = executeJoin([csvSide, orders], [edge("inner")]);
    expect(r.rows).toHaveLength(3);
  });

  it("treats 42 and '42.0' as the same key", () => {
    const a: JoinTable = { nodeId: "a", name: "a", columns: [{ columnId: "k", name: "k" }], rows: [{ k: 42 }] };
    const b: JoinTable = { nodeId: "b", name: "b", columns: [{ columnId: "k", name: "k" }], rows: [{ k: "42.0" }] };
    const r = executeJoin([a, b], [{ edgeId: "e", sourceNodeId: "a", targetNodeId: "b", sourceColumn: "k", targetColumn: "k", joinType: "inner" }]);
    expect(r.rows).toHaveLength(1);
  });

  it("does NOT collapse a zero-padded code into a number", () => {
    // "007" is an identifier, not the number 7 — collapsing it would join wrong rows.
    const a: JoinTable = { nodeId: "a", name: "a", columns: [{ columnId: "k", name: "k" }], rows: [{ k: "007" }] };
    const b: JoinTable = { nodeId: "b", name: "b", columns: [{ columnId: "k", name: "k" }], rows: [{ k: 7 }] };
    const r = executeJoin([a, b], [{ edgeId: "e", sourceNodeId: "a", targetNodeId: "b", sourceColumn: "k", targetColumn: "k", joinType: "inner" }]);
    expect(r.rows).toHaveLength(0);
  });

  it("is case-insensitive for text keys", () => {
    const a: JoinTable = { nodeId: "a", name: "a", columns: [{ columnId: "k", name: "k" }], rows: [{ k: "ACME" }] };
    const b: JoinTable = { nodeId: "b", name: "b", columns: [{ columnId: "k", name: "k" }], rows: [{ k: "acme" }] };
    const r = executeJoin([a, b], [{ edgeId: "e", sourceNodeId: "a", targetNodeId: "b", sourceColumn: "k", targetColumn: "k", joinType: "inner" }]);
    expect(r.rows).toHaveLength(1);
  });

  it("never matches NULL to NULL, following SQL semantics", () => {
    const a: JoinTable = { nodeId: "a", name: "a", columns: [{ columnId: "k", name: "k" }], rows: [{ k: null }, { k: "" }] };
    const b: JoinTable = { nodeId: "b", name: "b", columns: [{ columnId: "k", name: "k" }], rows: [{ k: null }] };
    const r = executeJoin([a, b], [{ edgeId: "e", sourceNodeId: "a", targetNodeId: "b", sourceColumn: "k", targetColumn: "k", joinType: "inner" }]);
    expect(r.rows).toHaveLength(0);
  });
});

describe("executeJoin — more than two tables", () => {
  const items: JoinTable = {
    nodeId: "n3",
    name: "items",
    columns: [{ columnId: "i0", name: "order_id" }, { columnId: "i1", name: "sku" }],
    rows: [
      { order_id: "o1", sku: "A" },
      { order_id: "o1", sku: "B" },
      { order_id: "o4", sku: "C" },
    ],
  };

  const chain: JoinEdge[] = [
    edge("inner"),
    { edgeId: "e2", sourceNodeId: "n2", targetNodeId: "n3", sourceColumn: "order_id", targetColumn: "order_id", joinType: "inner" },
  ];

  it("joins a three-table chain (the old panel stopped at two)", () => {
    const r = executeJoin([customers, orders, items], chain);
    // Ada/o1 × 2 items + Grace/o4 × 1 item
    expect(r.rows).toHaveLength(3);
    expect(r.columns.map((c) => c.key)).toContain("items.sku");
    expect(r.columns.map((c) => c.key)).toContain("customers.name");
  });

  it("reports each join step so the UI can show its work", () => {
    const r = executeJoin([customers, orders, items], chain);
    expect(r.steps).toHaveLength(3); // seed + 2 joins
    expect(r.steps[0]).toMatch(/Start with customers/);
    expect(r.steps[1]).toMatch(/INNER JOIN orders/);
  });

  it("qualifies identically-named columns from different tables", () => {
    const r = executeJoin([customers, orders, items], chain);
    // `order_id` exists on both orders and items and must not collide.
    expect(r.columns.map((c) => c.key)).toContain("orders.order_id");
    expect(r.columns.map((c) => c.key)).toContain("items.order_id");
  });

  it("warns when a table is not reachable from the others", () => {
    const island: JoinTable = { nodeId: "n9", name: "island", columns: [{ columnId: "x", name: "x" }], rows: [{ x: 1 }] };
    const islandEdge: JoinEdge = { edgeId: "e9", sourceNodeId: "n9", targetNodeId: "n8", sourceColumn: "x", targetColumn: "x", joinType: "inner" };
    const r = executeJoin([customers, orders, island], [edge("inner"), islandEdge]);
    expect(r.warnings.join(" ")).toMatch(/not all connected/i);
  });
});

describe("executeJoin — join direction", () => {
  it("flips left/right when the graph is traversed against the edge direction", () => {
    // Seeded from n2 (orders), the edge n1->n2 is traversed backwards, so a `left`
    // join declared from customers' side must behave as `right` from orders' side.
    const r = executeJoin([customers, orders], [edge("left")], { seedNodeId: "n2" });
    const orphan = r.rows.find((row) => row["orders.order_id"] === "o3");
    // o3 has no customer. Traversed from orders, a customers-side LEFT join means
    // "keep all customers" — so o3 must NOT appear, and Katherine must.
    expect(orphan).toBeUndefined();
    expect(r.rows.some((row) => row["customers.name"] === "Katherine")).toBe(true);
  });
});

describe("executeJoin — field selection and limits", () => {
  it("returns only the selected columns", () => {
    const r = executeJoin([customers, orders], [edge("inner")], {
      selectedKeys: ["customers.name", "orders.order_id"],
    });
    expect(r.columns.map((c) => c.key)).toEqual(["customers.name", "orders.order_id"]);
    expect(Object.keys(r.rows[0])).toEqual(["customers.name", "orders.order_id"]);
  });

  it("returns all columns when no selection is given", () => {
    const r = executeJoin([customers, orders], [edge("inner")]);
    expect(r.columns).toHaveLength(4);
  });

  it("caps output rows and reports the true total", () => {
    const many: JoinTable = {
      nodeId: "m",
      name: "m",
      columns: [{ columnId: "k", name: "k" }],
      rows: Array.from({ length: 50 }, () => ({ k: 1 })),
    };
    const other: JoinTable = {
      nodeId: "m2",
      name: "m2",
      columns: [{ columnId: "k", name: "k" }],
      rows: Array.from({ length: 50 }, () => ({ k: 1 })),
    };
    const r = executeJoin([many, other], [{ edgeId: "e", sourceNodeId: "m", targetNodeId: "m2", sourceColumn: "k", targetColumn: "k", joinType: "inner" }], { rowLimit: 100 });
    expect(r.totalRows).toBe(2500); // full 50×50 cross product
    expect(r.rows).toHaveLength(100);
    expect(r.truncated).toBe(true);
  });

  it("defaults to a row limit rather than running unbounded", () => {
    expect(DEFAULT_ROW_LIMIT).toBeGreaterThan(0);
  });
});

describe("executeJoin — degenerate inputs", () => {
  it("returns an empty result for no tables", () => {
    const r = executeJoin([], []);
    expect(r.rows).toHaveLength(0);
    expect(r.columns).toHaveLength(0);
  });

  it("returns the single table unchanged when there are no links", () => {
    const r = executeJoin([customers], []);
    expect(r.rows).toHaveLength(3);
    expect(r.columns.map((c) => c.key)).toEqual(["customers.id", "customers.name"]);
  });

  it("handles a table with zero rows", () => {
    const empty: JoinTable = { ...orders, rows: [] };
    expect(executeJoin([customers, empty], [edge("inner")]).rows).toHaveLength(0);
    expect(executeJoin([customers, empty], [edge("left")]).rows).toHaveLength(3);
  });

  it("ignores an edge pointing at a table that is not on the canvas", () => {
    const ghost: JoinEdge = { edgeId: "eX", sourceNodeId: "n1", targetNodeId: "gone", sourceColumn: "id", targetColumn: "id", joinType: "inner" };
    const r = executeJoin([customers], [ghost]);
    expect(r.rows).toHaveLength(3);
  });
});

describe("planJoin", () => {
  it("orders edges so every step attaches to an already-visited table", () => {
    const items: JoinTable = { nodeId: "n3", name: "items", columns: [], rows: [] };
    const reversed: JoinEdge[] = [
      { edgeId: "e2", sourceNodeId: "n2", targetNodeId: "n3", sourceColumn: "order_id", targetColumn: "order_id", joinType: "inner" },
      edge("inner"),
    ];
    const { order } = planJoin([customers, orders, items], reversed, "n1");
    expect(order[0].edgeId).toBe("e1");
    expect(order[1].edgeId).toBe("e2");
  });

  it("drops a redundant cycle edge rather than joining the same table twice", () => {
    const cycle: JoinEdge = { edgeId: "eDup", sourceNodeId: "n1", targetNodeId: "n2", sourceColumn: "id", targetColumn: "customer_id", joinType: "inner" };
    const { order } = planJoin([customers, orders], [edge("inner"), cycle], "n1");
    expect(order).toHaveLength(1);
  });
});
