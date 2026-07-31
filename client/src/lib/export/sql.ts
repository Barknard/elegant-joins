/**
 * SQL DDL export.
 *
 * Pure: takes the project graph, returns a string. The server version built this by
 * string concatenation with no quoting, which produced invalid SQL for most real
 * spreadsheets. Fixes are marked below.
 */
import type { Column, Relationship, Table } from "@shared/schema";

export interface TableWithColumns extends Table {
  columns: Column[];
}

/**
 * FIX 1 — identifier quoting.
 * The server emitted `CREATE TABLE ${table.name} (`. A file called "sales data.csv"
 * produced `CREATE TABLE sales data (` — a syntax error. So did any column named with
 * a reserved word (`order`, `group`, `from`), a leading digit, or punctuation.
 * Double quotes are the SQL standard and work in Postgres, SQLite, DuckDB and Oracle.
 */
export function quoteIdent(name: string): string {
  const cleaned = (name ?? "").trim() || "unnamed";
  return `"${cleaned.replace(/"/g, '""')}"`;
}

/** Maps the app's four logical types onto portable SQL types. */
export function sqlTypeFor(dataType: string): string {
  switch ((dataType ?? "").toLowerCase()) {
    case "number":
      return "DECIMAL(18,4)";
    case "date":
      return "DATE";
    case "boolean":
      return "BOOLEAN";
    default:
      return "VARCHAR(255)";
  }
}

/** Makes constraint names unique and legal, since two tables can share a name. */
function constraintName(used: Set<string>, base: string): string {
  const safe = base.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 55) || "fk";
  let name = safe;
  let n = 2;
  while (used.has(name)) name = `${safe}_${n++}`;
  used.add(name);
  return name;
}

export interface SqlExportOptions {
  /** Emitted as a header comment. */
  projectName?: string;
}

export function generateSql(
  tables: TableWithColumns[],
  relationships: Relationship[],
  options: SqlExportOptions = {},
): string {
  const lines: string[] = [
    "-- Elegant Joins SQL export",
    options.projectName ? `-- Project: ${options.projectName}` : null,
    "--",
    "-- Identifiers are double-quoted so names containing spaces, reserved words or",
    "-- punctuation stay valid. Works as-is in PostgreSQL, SQLite and DuckDB.",
    "",
  ].filter((l): l is string => l !== null);

  if (tables.length === 0) {
    lines.push("-- (no tables on the canvas)");
    return lines.join("\n") + "\n";
  }

  for (const table of tables) {
    const cols = [...table.columns].sort((a, b) => a.columnOrder - b.columnOrder);
    lines.push(`CREATE TABLE ${quoteIdent(table.name)} (`);

    if (cols.length === 0) {
      // A table with no columns is not valid SQL; say so rather than emitting `()`.
      lines.push("  -- no columns defined for this table");
      lines.push(");", "");
      continue;
    }

    const body = cols.map((c) => `  ${quoteIdent(c.name)} ${sqlTypeFor(c.dataType)}`);

    /**
     * FIX 2 — composite keys.
     * The server appended ` PRIMARY KEY` to every column with isKey=1. Marking two
     * columns as keys produced two PRIMARY KEY clauses, which no database accepts.
     * Emit one table-level constraint instead, which also expresses composite keys
     * correctly — the normal case for a join table.
     */
    const keyCols = cols.filter((c) => c.isKey);
    if (keyCols.length > 0) {
      body.push(`  PRIMARY KEY (${keyCols.map((c) => quoteIdent(c.name)).join(", ")})`);
    }

    lines.push(body.join(",\n"), ");", "");
  }

  const byId = new Map(tables.map((t) => [t.id, t]));
  const usedNames = new Set<string>();
  const fkLines: string[] = [];

  for (const rel of relationships) {
    const sourceTable = byId.get(rel.sourceTableId);
    const targetTable = byId.get(rel.targetTableId);
    if (!sourceTable || !targetTable || !rel.sourceColumnId || !rel.targetColumnId) continue;

    const sourceCol = sourceTable.columns.find((c) => c.columnId === rel.sourceColumnId);
    const targetCol = targetTable.columns.find((c) => c.columnId === rel.targetColumnId);
    if (!sourceCol || !targetCol) continue;

    // FIX 3 — a foreign key must reference a UNIQUE/PK column. If the referenced side
    // isn't a key, say so rather than emitting DDL the database will reject.
    const referencedIsKey = sourceTable.columns.some(
      (c) => c.columnId === sourceCol.columnId && c.isKey,
    );

    // FIX 4 — unique constraint names. The server used fk_<source>_<target>, which
    // collided whenever two relationships joined the same pair of tables.
    const name = constraintName(usedNames, `fk_${targetTable.name}_${sourceTable.name}_${targetCol.name}`);

    if (!referencedIsKey) {
      fkLines.push(
        `-- Skipped ${name}: ${quoteIdent(sourceTable.name)}.${quoteIdent(sourceCol.name)} is not marked as a key,`,
        `-- and a FOREIGN KEY must reference a PRIMARY KEY or UNIQUE column.`,
        "",
      );
      continue;
    }

    fkLines.push(
      `ALTER TABLE ${quoteIdent(targetTable.name)} ADD CONSTRAINT ${quoteIdent(name)}`,
      `  FOREIGN KEY (${quoteIdent(targetCol.name)}) REFERENCES ${quoteIdent(sourceTable.name)} (${quoteIdent(sourceCol.name)});`,
      "",
    );
  }

  if (fkLines.length) lines.push("-- Relationships", "", ...fkLines);
  return lines.join("\n");
}
