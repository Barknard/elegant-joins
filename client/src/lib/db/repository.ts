/**
 * Project persistence — the browser replacement for the old Express + Drizzle server.
 *
 * Two things this does that the server did NOT, both deliberate:
 *
 *  1. ATOMIC SAVES. `saveSnapshot` on the server ran delete-relationships,
 *     delete-tables, then re-insert as separate statements. A failure part-way through
 *     left the project permanently gutted — the user's canvas wiped with nothing to
 *     restore. Here the whole replace runs in ONE IndexedDB transaction, so a failure
 *     rolls back to the previous good state.
 *
 *  2. REAL CASCADES. Postgres enforced `ON DELETE CASCADE`. IndexedDB has no foreign
 *     keys, so every delete path below removes dependents explicitly. Miss one and the
 *     store slowly fills with orphaned columns pointing at tables that no longer exist.
 */
import type {
  Column,
  InsertColumn,
  InsertProject,
  InsertRelationship,
  InsertTable,
  Project,
  Relationship,
  Table,
} from "@shared/schema";
import { STORE, getAllByIndex, req, tx } from "./idb";

export interface TableWithColumns extends Table {
  columns: Column[];
}

export interface FullProject {
  project: Project;
  tables: TableWithColumns[];
  relationships: Relationship[];
}

/** The portable project format used by save/open, template export and template import. */
export interface ProjectSnapshot {
  project: {
    name: string;
    description?: string | null;
    viewport?: { x: number; y: number; zoom: number } | null;
    preferences?: Record<string, unknown> | null;
    isTemplate?: boolean | null;
  };
  tables: Array<{
    nodeId: string;
    name: string;
    displayName?: string | null;
    fileName: string;
    positionX: number;
    positionY: number;
    iconColor?: string | null;
    rawData?: Record<string, unknown>[] | null;
    columns: Array<{
      columnId: string;
      name: string;
      displayName?: string | null;
      dataType: string;
      isKey: boolean | number;
      columnOrder: number;
    }>;
  }>;
  relationships: Array<{
    edgeId: string;
    sourceNodeId: string;
    targetNodeId: string;
    sourceColumnId?: string | null;
    targetColumnId?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    relationshipType: string;
    joinType?: string | null;
    cardinalityType?: string | null;
    label: string;
  }>;
}

const now = () => new Date();

// ---------------------------------------------------------------- projects

export async function createProject(data: InsertProject): Promise<Project> {
  return tx(STORE.projects, "readwrite", async (t) => {
    const record = {
      name: data.name,
      description: data.description ?? null,
      viewport: data.viewport ?? null,
      preferences: data.preferences ?? null,
      isTemplate: data.isTemplate ?? false,
      createdAt: now(),
      updatedAt: now(),
    };
    const id = (await req(t.objectStore(STORE.projects).add(record))) as number;
    return { ...record, id } as Project;
  });
}

export async function getProject(id: number): Promise<Project | undefined> {
  return tx(STORE.projects, "readonly", (t) =>
    req<Project | undefined>(t.objectStore(STORE.projects).get(id)),
  );
}

export async function getAllProjects(): Promise<Project[]> {
  const all = await tx(STORE.projects, "readonly", (t) =>
    req<Project[]>(t.objectStore(STORE.projects).getAll()),
  );
  // Most-recently-touched first — the open dialog is otherwise ordered by an
  // autoincrement id nobody can reason about.
  return all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function updateProject(
  id: number,
  patch: Partial<InsertProject>,
): Promise<Project | undefined> {
  return tx(STORE.projects, "readwrite", async (t) => {
    const store = t.objectStore(STORE.projects);
    const existing = await req<Project | undefined>(store.get(id));
    if (!existing) return undefined;
    const updated: Project = { ...existing, ...patch, id, updatedAt: now() } as Project;
    await req(store.put(updated));
    return updated;
  });
}

/** Deletes a project and every table, column and relationship beneath it. */
export async function deleteProject(id: number): Promise<void> {
  return tx(
    [STORE.projects, STORE.tables, STORE.columns, STORE.relationships],
    "readwrite",
    async (t) => {
      const tables = await getAllByIndex<Table>(t, STORE.tables, "projectId", id);
      for (const table of tables) {
        const cols = await getAllByIndex<Column>(t, STORE.columns, "tableId", table.id);
        for (const c of cols) await req(t.objectStore(STORE.columns).delete(c.id));
        await req(t.objectStore(STORE.tables).delete(table.id));
      }
      const rels = await getAllByIndex<Relationship>(t, STORE.relationships, "projectId", id);
      for (const r of rels) await req(t.objectStore(STORE.relationships).delete(r.id));
      await req(t.objectStore(STORE.projects).delete(id));
    },
  );
}

// ------------------------------------------------------------------ tables

export async function createTable(data: InsertTable): Promise<Table> {
  return tx(STORE.tables, "readwrite", async (t) => {
    const record = {
      projectId: data.projectId,
      nodeId: data.nodeId,
      name: data.name,
      displayName: data.displayName ?? null,
      fileName: data.fileName,
      positionX: data.positionX,
      positionY: data.positionY,
      iconColor: data.iconColor ?? null,
      rawData: data.rawData ?? null,
      createdAt: now(),
    };
    const id = (await req(t.objectStore(STORE.tables).add(record))) as number;
    return { ...record, id } as Table;
  });
}

export async function getTablesByProject(projectId: number): Promise<Table[]> {
  return tx(STORE.tables, "readonly", (t) =>
    getAllByIndex<Table>(t, STORE.tables, "projectId", projectId),
  );
}

export async function updateTable(
  id: number,
  patch: Partial<InsertTable>,
): Promise<Table | undefined> {
  return tx(STORE.tables, "readwrite", async (t) => {
    const store = t.objectStore(STORE.tables);
    const existing = await req<Table | undefined>(store.get(id));
    if (!existing) return undefined;
    const updated = { ...existing, ...patch, id } as Table;
    await req(store.put(updated));
    return updated;
  });
}

/** Deletes a table, its columns, and any relationship that touched it. */
export async function deleteTable(id: number): Promise<void> {
  return tx([STORE.tables, STORE.columns, STORE.relationships], "readwrite", async (t) => {
    const cols = await getAllByIndex<Column>(t, STORE.columns, "tableId", id);
    for (const c of cols) await req(t.objectStore(STORE.columns).delete(c.id));

    // Edges referencing a deleted node would otherwise render as dangling connections.
    const allRels = await req<Relationship[]>(t.objectStore(STORE.relationships).getAll());
    for (const r of allRels) {
      if (r.sourceTableId === id || r.targetTableId === id) {
        await req(t.objectStore(STORE.relationships).delete(r.id));
      }
    }
    await req(t.objectStore(STORE.tables).delete(id));
  });
}

// ----------------------------------------------------------------- columns

export async function createColumn(data: InsertColumn): Promise<Column> {
  return tx(STORE.columns, "readwrite", async (t) => {
    const record = {
      tableId: data.tableId,
      columnId: data.columnId,
      name: data.name,
      displayName: data.displayName ?? null,
      dataType: data.dataType,
      isKey: data.isKey ?? 0,
      columnOrder: data.columnOrder,
    };
    const id = (await req(t.objectStore(STORE.columns).add(record))) as number;
    return { ...record, id } as Column;
  });
}

export async function getColumnsByTable(tableId: number): Promise<Column[]> {
  const cols = await tx(STORE.columns, "readonly", (t) =>
    getAllByIndex<Column>(t, STORE.columns, "tableId", tableId),
  );
  return cols.sort((a, b) => a.columnOrder - b.columnOrder);
}

export async function updateColumn(
  id: number,
  patch: Partial<InsertColumn>,
): Promise<Column | undefined> {
  return tx(STORE.columns, "readwrite", async (t) => {
    const store = t.objectStore(STORE.columns);
    const existing = await req<Column | undefined>(store.get(id));
    if (!existing) return undefined;
    const updated = { ...existing, ...patch, id } as Column;
    await req(store.put(updated));
    return updated;
  });
}

export async function deleteColumn(id: number): Promise<void> {
  return tx(STORE.columns, "readwrite", (t) => req(t.objectStore(STORE.columns).delete(id)));
}

// ----------------------------------------------------------- relationships

export async function createRelationship(data: InsertRelationship): Promise<Relationship> {
  return tx(STORE.relationships, "readwrite", async (t) => {
    const record = {
      projectId: data.projectId,
      edgeId: data.edgeId,
      sourceTableId: data.sourceTableId,
      targetTableId: data.targetTableId,
      sourceColumnId: data.sourceColumnId ?? null,
      targetColumnId: data.targetColumnId ?? null,
      sourceHandle: data.sourceHandle ?? null,
      targetHandle: data.targetHandle ?? null,
      relationshipType: data.relationshipType,
      joinType: data.joinType ?? null,
      cardinalityType: data.cardinalityType ?? null,
      label: data.label,
      createdAt: now(),
    };
    const id = (await req(t.objectStore(STORE.relationships).add(record))) as number;
    return { ...record, id } as Relationship;
  });
}

export async function getRelationshipsByProject(projectId: number): Promise<Relationship[]> {
  return tx(STORE.relationships, "readonly", (t) =>
    getAllByIndex<Relationship>(t, STORE.relationships, "projectId", projectId),
  );
}

export async function updateRelationship(
  id: number,
  patch: Partial<InsertRelationship>,
): Promise<Relationship | undefined> {
  return tx(STORE.relationships, "readwrite", async (t) => {
    const store = t.objectStore(STORE.relationships);
    const existing = await req<Relationship | undefined>(store.get(id));
    if (!existing) return undefined;
    const updated = { ...existing, ...patch, id } as Relationship;
    await req(store.put(updated));
    return updated;
  });
}

export async function deleteRelationship(id: number): Promise<void> {
  return tx(STORE.relationships, "readwrite", (t) =>
    req(t.objectStore(STORE.relationships).delete(id)),
  );
}

// ------------------------------------------------------- whole-project ops

export async function loadFullProject(projectId: number): Promise<FullProject | undefined> {
  return tx(
    [STORE.projects, STORE.tables, STORE.columns, STORE.relationships],
    "readonly",
    async (t) => {
      const project = await req<Project | undefined>(t.objectStore(STORE.projects).get(projectId));
      if (!project) return undefined;

      const tables = await getAllByIndex<Table>(t, STORE.tables, "projectId", projectId);
      const tablesWithColumns: TableWithColumns[] = [];
      for (const table of tables) {
        const cols = await getAllByIndex<Column>(t, STORE.columns, "tableId", table.id);
        tablesWithColumns.push({ ...table, columns: cols.sort((a, b) => a.columnOrder - b.columnOrder) });
      }
      const relationships = await getAllByIndex<Relationship>(
        t,
        STORE.relationships,
        "projectId",
        projectId,
      );
      return { project, tables: tablesWithColumns, relationships };
    },
  );
}

/**
 * Writes the snapshot's tables/columns/relationships in place of whatever the project
 * currently holds. Atomic: either the whole new canvas lands or the old one survives.
 */
export async function saveSnapshot(
  projectId: number,
  snapshot: ProjectSnapshot,
): Promise<Project> {
  return tx(
    [STORE.projects, STORE.tables, STORE.columns, STORE.relationships],
    "readwrite",
    async (t) => {
      const projectStore = t.objectStore(STORE.projects);
      const existing = await req<Project | undefined>(projectStore.get(projectId));
      if (!existing) throw new Error("Project not found");

      // Clear the old canvas.
      const oldTables = await getAllByIndex<Table>(t, STORE.tables, "projectId", projectId);
      for (const table of oldTables) {
        const cols = await getAllByIndex<Column>(t, STORE.columns, "tableId", table.id);
        for (const c of cols) await req(t.objectStore(STORE.columns).delete(c.id));
        await req(t.objectStore(STORE.tables).delete(table.id));
      }
      const oldRels = await getAllByIndex<Relationship>(
        t,
        STORE.relationships,
        "projectId",
        projectId,
      );
      for (const r of oldRels) await req(t.objectStore(STORE.relationships).delete(r.id));

      // An autosave that fires before the name field is touched must not blank the name,
      // so empty strings mean "leave it alone" (matching the original server behaviour).
      const updated: Project = {
        ...existing,
        viewport: snapshot.project.viewport ?? null,
        preferences: snapshot.project.preferences ?? null,
        isTemplate: snapshot.project.isTemplate ?? false,
        updatedAt: now(),
      };
      if (snapshot.project.name?.trim()) updated.name = snapshot.project.name;
      if (snapshot.project.description?.trim()) updated.description = snapshot.project.description;
      await req(projectStore.put(updated));

      await writeSnapshotBody(t, projectId, snapshot);
      return updated;
    },
  );
}

/** Creates a brand-new project from a snapshot (used by "open template" and import). */
export async function createFromSnapshot(snapshot: ProjectSnapshot): Promise<Project> {
  return tx(
    [STORE.projects, STORE.tables, STORE.columns, STORE.relationships],
    "readwrite",
    async (t) => {
      const record = {
        name: snapshot.project.name,
        description: snapshot.project.description ?? null,
        viewport: snapshot.project.viewport ?? null,
        preferences: snapshot.project.preferences ?? null,
        isTemplate: snapshot.project.isTemplate ?? false,
        createdAt: now(),
        updatedAt: now(),
      };
      const id = (await req(t.objectStore(STORE.projects).add(record))) as number;
      await writeSnapshotBody(t, id, snapshot);
      return { ...record, id } as Project;
    },
  );
}

/** Shared body writer for saveSnapshot/createFromSnapshot — must stay inside their tx. */
async function writeSnapshotBody(
  t: IDBTransaction,
  projectId: number,
  snapshot: ProjectSnapshot,
): Promise<void> {
  const nodeIdToTableId = new Map<string, number>();

  for (const td of snapshot.tables ?? []) {
    const tableRecord = {
      projectId,
      nodeId: td.nodeId,
      name: td.name,
      displayName: td.displayName ?? null,
      fileName: td.fileName,
      positionX: td.positionX,
      positionY: td.positionY,
      iconColor: td.iconColor ?? null,
      rawData: td.rawData ?? null,
      createdAt: now(),
    };
    const tableId = (await req(t.objectStore(STORE.tables).add(tableRecord))) as number;
    nodeIdToTableId.set(td.nodeId, tableId);

    for (const cd of td.columns ?? []) {
      await req(
        t.objectStore(STORE.columns).add({
          tableId,
          columnId: cd.columnId,
          name: cd.name,
          displayName: cd.displayName ?? null,
          dataType: cd.dataType,
          isKey: cd.isKey ? 1 : 0,
          columnOrder: cd.columnOrder,
        }),
      );
    }
  }

  for (const rd of snapshot.relationships ?? []) {
    const sourceTableId = nodeIdToTableId.get(rd.sourceNodeId);
    const targetTableId = nodeIdToTableId.get(rd.targetNodeId);
    // An edge whose endpoints aren't in the snapshot is dropped rather than written
    // as a dangling reference.
    if (sourceTableId === undefined || targetTableId === undefined) continue;

    await req(
      t.objectStore(STORE.relationships).add({
        projectId,
        edgeId: rd.edgeId,
        sourceTableId,
        targetTableId,
        sourceColumnId: rd.sourceColumnId ?? null,
        targetColumnId: rd.targetColumnId ?? null,
        sourceHandle: rd.sourceHandle ?? null,
        targetHandle: rd.targetHandle ?? null,
        relationshipType: rd.relationshipType,
        joinType: rd.joinType ?? null,
        cardinalityType: rd.cardinalityType ?? null,
        label: rd.label,
      }),
    );
  }
}
