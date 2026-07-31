import { beforeEach, describe, expect, it } from "vitest";
import * as repo from "@/lib/db/repository";
import { deleteDatabase } from "@/lib/db/idb";
import type { ProjectSnapshot } from "@/lib/db/repository";

beforeEach(async () => {
  await deleteDatabase();
});

const snapshot = (over: Partial<ProjectSnapshot> = {}): ProjectSnapshot => ({
  project: { name: "Test project", description: "desc", viewport: { x: 0, y: 0, zoom: 1 } },
  tables: [
    {
      nodeId: "n1",
      name: "customers",
      fileName: "customers.csv",
      positionX: 10,
      positionY: 20,
      rawData: [{ id: 1, name: "Ada" }],
      columns: [
        { columnId: "n1-0", name: "id", dataType: "number", isKey: true, columnOrder: 0 },
        { columnId: "n1-1", name: "name", dataType: "text", isKey: false, columnOrder: 1 },
      ],
    },
    {
      nodeId: "n2",
      name: "orders",
      fileName: "orders.csv",
      positionX: 300,
      positionY: 20,
      rawData: [{ order_id: "o1", customer_id: 1 }],
      columns: [
        { columnId: "n2-0", name: "order_id", dataType: "text", isKey: true, columnOrder: 0 },
        { columnId: "n2-1", name: "customer_id", dataType: "number", isKey: false, columnOrder: 1 },
      ],
    },
  ],
  relationships: [
    {
      edgeId: "e1",
      sourceNodeId: "n1",
      targetNodeId: "n2",
      sourceColumnId: "n1-0",
      targetColumnId: "n2-1",
      relationshipType: "one-to-many",
      joinType: "left",
      label: "",
    },
  ],
  ...over,
});

describe("projects", () => {
  it("creates and reads back a project", async () => {
    const p = await repo.createProject({ name: "My project" });
    expect(p.id).toBeGreaterThan(0);
    expect((await repo.getProject(p.id))?.name).toBe("My project");
  });

  it("lists most-recently-updated first", async () => {
    const a = await repo.createProject({ name: "A" });
    await repo.createProject({ name: "B" });
    await repo.updateProject(a.id, { name: "A again" });
    const list = await repo.getAllProjects();
    expect(list[0].name).toBe("A again");
  });

  it("returns undefined for an unknown id rather than throwing", async () => {
    expect(await repo.getProject(9999)).toBeUndefined();
  });

  it("advances updatedAt on update", async () => {
    const p = await repo.createProject({ name: "X" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await repo.updateProject(p.id, { name: "Y" });
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(p.updatedAt).getTime(),
    );
  });
});

describe("cascading deletes", () => {
  it("removes tables, columns and relationships with the project", async () => {
    const p = await repo.createFromSnapshot(snapshot());
    expect(await repo.getTablesByProject(p.id)).toHaveLength(2);

    await repo.deleteProject(p.id);

    expect(await repo.getProject(p.id)).toBeUndefined();
    expect(await repo.getTablesByProject(p.id)).toHaveLength(0);
    expect(await repo.getRelationshipsByProject(p.id)).toHaveLength(0);
    // IndexedDB has no foreign keys, so orphaned columns are a real failure mode.
    const full = await repo.loadFullProject(p.id);
    expect(full).toBeUndefined();
  });

  it("removes a table's columns and any relationship touching it", async () => {
    const p = await repo.createFromSnapshot(snapshot());
    const tables = await repo.getTablesByProject(p.id);
    const customers = tables.find((t) => t.nodeId === "n1")!;

    await repo.deleteTable(customers.id);

    expect(await repo.getColumnsByTable(customers.id)).toHaveLength(0);
    // The edge pointed at the deleted table; leaving it would render a dangling link.
    expect(await repo.getRelationshipsByProject(p.id)).toHaveLength(0);
    expect(await repo.getTablesByProject(p.id)).toHaveLength(1);
  });
});

describe("snapshots", () => {
  it("round-trips a whole project", async () => {
    const p = await repo.createFromSnapshot(snapshot());
    const full = await repo.loadFullProject(p.id);

    expect(full!.tables).toHaveLength(2);
    expect(full!.relationships).toHaveLength(1);
    expect(full!.tables[0].columns).toHaveLength(2);
    expect(full!.tables[0].rawData).toEqual([{ id: 1, name: "Ada" }]);
  });

  it("resolves relationship endpoints from nodeId to the new table ids", async () => {
    const p = await repo.createFromSnapshot(snapshot());
    const full = await repo.loadFullProject(p.id);
    const ids = full!.tables.map((t) => t.id);
    expect(ids).toContain(full!.relationships[0].sourceTableId);
    expect(ids).toContain(full!.relationships[0].targetTableId);
  });

  it("converts isKey booleans to the stored 0/1 form", async () => {
    const p = await repo.createFromSnapshot(snapshot());
    const full = await repo.loadFullProject(p.id);
    const idCol = full!.tables.find((t) => t.nodeId === "n1")!.columns.find((c) => c.name === "id")!;
    expect(idCol.isKey).toBe(1);
  });

  it("drops an edge whose endpoints are not in the snapshot", async () => {
    const s = snapshot();
    s.relationships.push({
      edgeId: "ghost",
      sourceNodeId: "n1",
      targetNodeId: "does-not-exist",
      relationshipType: "one-to-many",
      label: "",
    });
    const p = await repo.createFromSnapshot(s);
    expect(await repo.getRelationshipsByProject(p.id)).toHaveLength(1);
  });

  it("replaces the canvas on save rather than appending to it", async () => {
    const p = await repo.createFromSnapshot(snapshot());
    const smaller = snapshot({ tables: [snapshot().tables[0]], relationships: [] });
    await repo.saveSnapshot(p.id, smaller);

    const full = await repo.loadFullProject(p.id);
    expect(full!.tables).toHaveLength(1);
    expect(full!.relationships).toHaveLength(0);
  });

  it("keeps the existing name when the snapshot's name is blank", async () => {
    // Autosave fires before the name field is ever touched; blanking the project name
    // on every autosave would be a nasty surprise.
    const p = await repo.createFromSnapshot(snapshot());
    await repo.saveSnapshot(p.id, snapshot({ project: { name: "   " } }));
    expect((await repo.getProject(p.id))!.name).toBe("Test project");
  });

  it("applies a non-blank name", async () => {
    const p = await repo.createFromSnapshot(snapshot());
    await repo.saveSnapshot(p.id, snapshot({ project: { name: "Renamed" } }));
    expect((await repo.getProject(p.id))!.name).toBe("Renamed");
  });

  it("rejects a save against a project that does not exist", async () => {
    await expect(repo.saveSnapshot(4242, snapshot())).rejects.toThrow(/not found/i);
  });

  it("leaves the previous canvas intact when a save fails part-way", async () => {
    // The server ran delete-then-insert as separate statements, so a mid-save failure
    // permanently gutted the project. One transaction means this rolls back instead.
    const p = await repo.createFromSnapshot(snapshot());
    const poisoned = snapshot();
    // A structured-clone-hostile value aborts the transaction mid-write.
    (poisoned.tables[1] as unknown as { rawData: unknown }).rawData = [{ bad: () => {} }];

    await expect(repo.saveSnapshot(p.id, poisoned)).rejects.toBeTruthy();

    const full = await repo.loadFullProject(p.id);
    expect(full!.tables).toHaveLength(2);
    expect(full!.relationships).toHaveLength(1);
  });
});

describe("columns", () => {
  it("returns columns in columnOrder regardless of insertion order", async () => {
    const p = await repo.createProject({ name: "p" });
    const t = await repo.createTable({
      projectId: p.id,
      nodeId: "n1",
      name: "t",
      fileName: "t.csv",
      positionX: 0,
      positionY: 0,
    });
    await repo.createColumn({ tableId: t.id, columnId: "b", name: "b", dataType: "text", isKey: 0, columnOrder: 1 });
    await repo.createColumn({ tableId: t.id, columnId: "a", name: "a", dataType: "text", isKey: 0, columnOrder: 0 });

    expect((await repo.getColumnsByTable(t.id)).map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("updates a column in place", async () => {
    const p = await repo.createFromSnapshot(snapshot());
    const t = (await repo.getTablesByProject(p.id))[0];
    const c = (await repo.getColumnsByTable(t.id))[0];
    const updated = await repo.updateColumn(c.id, { dataType: "text" });
    expect(updated!.dataType).toBe("text");
  });

  it("returns undefined when updating a column that is gone", async () => {
    expect(await repo.updateColumn(9999, { name: "x" })).toBeUndefined();
  });
});
