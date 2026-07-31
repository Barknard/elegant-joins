/**
 * The join engine.
 *
 * Pure functions over plain data: no React, no DOM, no storage. Everything the app
 * claims to compute — the preview panel, the View Builder output, "Create Combined
 * Table", CSV/Excel export — runs through here, so there is exactly one definition of
 * what a join means and one place to test it.
 *
 * What this replaces:
 *   - JoinPreviewPanel's inline join, which only ever read the first TWO connected
 *     tables, treated `right` as `inner`, compared keys with raw `===` (so a CSV "42"
 *     never matched an Excel 42), and invented synthetic rows when data was missing.
 *   - ViewBuilderPanel's `generateOutputData`, which fabricated 5-12 random rows from
 *     column-name guesses and ignored both the selected fields and the real data.
 */
import type { JoinType } from "@shared/schema";
import { normalizeJoinValue } from "../parse/tabular";

export interface JoinTable {
  /** React Flow node id. */
  nodeId: string;
  /** Display name used to qualify output column names. */
  name: string;
  columns: Array<{ columnId: string; name: string }>;
  rows: Record<string, unknown>[];
}

export interface JoinEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Column NAME on the source side (resolved from columnId by the caller). */
  sourceColumn: string;
  targetColumn: string;
  joinType: JoinType;
}

export interface JoinResultColumn {
  /** Unique key within the result row objects. */
  key: string;
  /** Originating table display name. */
  table: string;
  /** Original column name. */
  column: string;
}

export interface JoinResult {
  columns: JoinResultColumn[];
  rows: Record<string, unknown>[];
  /** Rows produced before any row limit was applied. */
  totalRows: number;
  truncated: boolean;
  /** Human-readable account of what was joined, in order. Shown in the UI. */
  steps: string[];
  /** Non-fatal problems the user should see. */
  warnings: string[];
}

/** Guards against a runaway many-to-many cross product locking the tab. */
export const DEFAULT_ROW_LIMIT = 5_000;

/** Qualified output key. Two tables can both have an `id` column. */
function qualify(tableName: string, columnName: string): string {
  return `${tableName}.${columnName}`;
}

/**
 * Orders the join so each step attaches a table already reachable from the seed —
 * you cannot join C to A through B without visiting B first. Returns the visit order
 * plus any edges that couldn't be reached (disconnected components).
 */
export function planJoin(
  tables: JoinTable[],
  edges: JoinEdge[],
  seedNodeId?: string,
): { order: JoinEdge[]; visited: string[]; unreachable: JoinEdge[] } {
  if (tables.length === 0) return { order: [], visited: [], unreachable: [] };

  const byNode = new Map(tables.map((t) => [t.nodeId, t]));
  const usable = edges.filter((e) => byNode.has(e.sourceNodeId) && byNode.has(e.targetNodeId));

  const seed = seedNodeId && byNode.has(seedNodeId) ? seedNodeId : usable[0]?.sourceNodeId ?? tables[0].nodeId;

  const visited = new Set<string>([seed]);
  const order: JoinEdge[] = [];
  const remaining = [...usable];

  // Repeatedly take any edge with exactly one endpoint already visited.
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i];
      const hasSource = visited.has(e.sourceNodeId);
      const hasTarget = visited.has(e.targetNodeId);
      if (hasSource === hasTarget) continue; // both or neither — not attachable yet
      visited.add(hasSource ? e.targetNodeId : e.sourceNodeId);
      order.push(e);
      remaining.splice(i, 1);
      progress = true;
      break;
    }
  }

  // Edges whose endpoints are both already visited are cycles (redundant links);
  // edges with neither endpoint visited belong to a separate component.
  const unreachable = remaining.filter(
    (e) => !visited.has(e.sourceNodeId) || !visited.has(e.targetNodeId),
  );

  return { order, visited: [...visited], unreachable };
}

/** Indexes rows by normalized key value for O(1) probing. */
function indexBy(rows: Record<string, unknown>[], column: string): Map<string, Record<string, unknown>[]> {
  const index = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = normalizeJoinValue(row[column]);
    if (key === null) continue; // SQL semantics: NULL never matches, not even NULL
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }
  return index;
}

export interface ExecuteOptions {
  rowLimit?: number;
  /** Restricts output to these qualified keys. Empty/omitted means all columns. */
  selectedKeys?: string[];
  /** Node to start the traversal from. */
  seedNodeId?: string;
}

/**
 * Executes the join across every connected table.
 *
 * Semantics per step, matching SQL:
 *   inner — only rows that matched on both sides
 *   left  — all accumulated rows so far; unmatched get nulls for the incoming table
 *   right — all rows of the incoming table; unmatched get nulls for everything so far
 *   full  — both of the above
 */
export function executeJoin(
  tables: JoinTable[],
  edges: JoinEdge[],
  options: ExecuteOptions = {},
): JoinResult {
  const rowLimit = options.rowLimit ?? DEFAULT_ROW_LIMIT;
  const warnings: string[] = [];
  const steps: string[] = [];

  if (tables.length === 0) {
    return { columns: [], rows: [], totalRows: 0, truncated: false, steps, warnings };
  }

  const byNode = new Map(tables.map((t) => [t.nodeId, t]));
  const { order } = planJoin(tables, edges, options.seedNodeId);

  // Seed: the first table in the traversal, or the only table when there are no links.
  const seedNode = order.length > 0
    ? (byNode.get(order[0].sourceNodeId) ?? byNode.get(order[0].targetNodeId)!)
    : byNode.get(options.seedNodeId ?? tables[0].nodeId) ?? tables[0];

  const columns: JoinResultColumn[] = seedNode.columns.map((c) => ({
    key: qualify(seedNode.name, c.name),
    table: seedNode.name,
    column: c.name,
  }));

  // Accumulator rows are keyed by qualified name from the start, so later steps never
  // have to guess which table a bare column name came from.
  let acc: Record<string, unknown>[] = seedNode.rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const c of seedNode.columns) out[qualify(seedNode.name, c.name)] = row[c.name];
    return out;
  });

  const joined = new Set<string>([seedNode.nodeId]);
  steps.push(`Start with ${seedNode.name} (${seedNode.rows.length.toLocaleString()} rows)`);

  for (const edge of order) {
    // Whichever endpoint isn't joined yet is the incoming table.
    const incomingId = joined.has(edge.sourceNodeId) ? edge.targetNodeId : edge.sourceNodeId;
    const incoming = byNode.get(incomingId);
    if (!incoming) continue;

    const accKeyColumn = joined.has(edge.sourceNodeId)
      ? qualify(byNode.get(edge.sourceNodeId)!.name, edge.sourceColumn)
      : qualify(byNode.get(edge.targetNodeId)!.name, edge.targetColumn);
    const incomingKeyColumn = joined.has(edge.sourceNodeId) ? edge.targetColumn : edge.sourceColumn;

    // If the edge was drawn source->target but we're traversing target->source, the
    // join type has to flip too: a left join from A's perspective is a right join
    // from B's. Getting this wrong is how `right` silently became `inner` before.
    const traversedForward = joined.has(edge.sourceNodeId);
    const effectiveType: JoinType = traversedForward
      ? edge.joinType
      : edge.joinType === "left"
        ? "right"
        : edge.joinType === "right"
          ? "left"
          : edge.joinType;

    const incomingColumns = incoming.columns.map((c) => ({
      key: qualify(incoming.name, c.name),
      table: incoming.name,
      column: c.name,
    }));

    const index = indexBy(incoming.rows, incomingKeyColumn);
    const matchedIncoming = new Set<Record<string, unknown>>();
    const next: Record<string, unknown>[] = [];

    const nullIncoming = () => {
      const o: Record<string, unknown> = {};
      for (const c of incomingColumns) o[c.key] = null;
      return o;
    };

    for (const accRow of acc) {
      const key = normalizeJoinValue(accRow[accKeyColumn]);
      const matches = key === null ? undefined : index.get(key);

      if (matches && matches.length > 0) {
        for (const m of matches) {
          matchedIncoming.add(m);
          const o: Record<string, unknown> = { ...accRow };
          for (const c of incoming.columns) o[qualify(incoming.name, c.name)] = m[c.name];
          next.push(o);
        }
      } else if (effectiveType === "left" || effectiveType === "full") {
        next.push({ ...accRow, ...nullIncoming() });
      }
    }

    // right/full: emit incoming rows that never matched, with nulls on the accumulated side.
    if (effectiveType === "right" || effectiveType === "full") {
      const nullAcc: Record<string, unknown> = {};
      for (const c of columns) nullAcc[c.key] = null;

      for (const row of incoming.rows) {
        if (matchedIncoming.has(row)) continue;
        const o: Record<string, unknown> = { ...nullAcc };
        for (const c of incoming.columns) o[qualify(incoming.name, c.name)] = row[c.name];
        next.push(o);
      }
    }

    columns.push(...incomingColumns);
    acc = next;
    joined.add(incomingId);
    steps.push(
      `${effectiveType.toUpperCase()} JOIN ${incoming.name} on ${edge.sourceColumn} = ${edge.targetColumn} → ${acc.length.toLocaleString()} rows`,
    );

    if (acc.length > rowLimit * 4) {
      warnings.push(
        `This combination produced more than ${(rowLimit * 4).toLocaleString()} rows, which usually means a key column has many duplicate values. Later steps were stopped early.`,
      );
      break;
    }
  }

  // The user cares that a table they placed contributed nothing — not that some edge
  // was unreachable. Name the tables, so the fix (draw a link) is obvious.
  const orphaned = tables.filter((t) => !joined.has(t.nodeId));
  if (orphaned.length > 0) {
    warnings.push(
      `${orphaned.map((t) => t.name).join(", ")} ${orphaned.length === 1 ? "is" : "are"} not all connected to the other tables, so ${orphaned.length === 1 ? "it was" : "they were"} left out. Draw a link to include ${orphaned.length === 1 ? "it" : "them"}.`,
    );
  }

  const selected = options.selectedKeys?.length
    ? columns.filter((c) => options.selectedKeys!.includes(c.key))
    : columns;

  const totalRows = acc.length;
  const limited = totalRows > rowLimit ? acc.slice(0, rowLimit) : acc;

  const rows = selected.length === columns.length
    ? limited
    : limited.map((row) => {
        const o: Record<string, unknown> = {};
        for (const c of selected) o[c.key] = row[c.key];
        return o;
      });

  return { columns: selected, rows, totalRows, truncated: totalRows > rowLimit, steps, warnings };
}
