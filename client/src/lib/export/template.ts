/**
 * Project template (JSON) export.
 *
 * A template is the portable form of a project: the canvas, the columns, the
 * relationships and the data, with every server-assigned integer id swapped for the
 * stable `nodeId`/`columnId` strings. That indirection is what lets a template be
 * imported into a different browser, where the autoincrement ids will differ.
 */
import type { FullProject, ProjectSnapshot } from "../db/repository";

/** Bumped when the shape changes, so an importer can refuse a file it can't read. */
export const TEMPLATE_FORMAT_VERSION = 1;

export interface ProjectTemplate extends ProjectSnapshot {
  app: "elegant-joins";
  formatVersion: number;
  exportedAt: string;
}

export function buildTemplate(full: FullProject): ProjectTemplate {
  const nodeIdOf = new Map(full.tables.map((t) => [t.id, t.nodeId]));

  return {
    app: "elegant-joins",
    formatVersion: TEMPLATE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      name: full.project.name,
      description: full.project.description,
      viewport: full.project.viewport,
      preferences: full.project.preferences,
      isTemplate: true,
    },
    tables: full.tables.map((t) => ({
      nodeId: t.nodeId,
      name: t.name,
      displayName: t.displayName,
      fileName: t.fileName,
      positionX: t.positionX,
      positionY: t.positionY,
      iconColor: t.iconColor,
      rawData: t.rawData,
      columns: [...t.columns]
        .sort((a, b) => a.columnOrder - b.columnOrder)
        .map((c) => ({
          columnId: c.columnId,
          name: c.name,
          displayName: c.displayName,
          dataType: c.dataType,
          isKey: c.isKey === 1,
          columnOrder: c.columnOrder,
        })),
    })),
    relationships: full.relationships
      // Drop any edge whose endpoints didn't survive — writing '' would produce a
      // template that imports with silently missing connections.
      .filter((r) => nodeIdOf.has(r.sourceTableId) && nodeIdOf.has(r.targetTableId))
      .map((r) => ({
        edgeId: r.edgeId,
        sourceNodeId: nodeIdOf.get(r.sourceTableId)!,
        targetNodeId: nodeIdOf.get(r.targetTableId)!,
        sourceColumnId: r.sourceColumnId,
        targetColumnId: r.targetColumnId,
        sourceHandle: r.sourceHandle,
        targetHandle: r.targetHandle,
        relationshipType: r.relationshipType,
        joinType: r.joinType,
        cardinalityType: r.cardinalityType,
        label: r.label,
      })),
  };
}

/** Validates a parsed JSON blob before it is allowed to become a project. */
export function validateTemplate(value: unknown): { ok: true; template: ProjectTemplate } | { ok: false; reason: string } {
  if (!value || typeof value !== "object") return { ok: false, reason: "That file is not valid JSON." };
  const t = value as Partial<ProjectTemplate>;

  if (!t.project || typeof t.project !== "object" || !t.project.name) {
    return { ok: false, reason: "That file is not an Elegant Joins project — it has no project name." };
  }
  if (t.formatVersion && t.formatVersion > TEMPLATE_FORMAT_VERSION) {
    return {
      ok: false,
      reason: `That project was saved by a newer version of Elegant Joins (format ${t.formatVersion}). Update this page and try again.`,
    };
  }
  if (t.tables && !Array.isArray(t.tables)) return { ok: false, reason: "That file's table list is corrupt." };
  if (t.relationships && !Array.isArray(t.relationships)) {
    return { ok: false, reason: "That file's relationship list is corrupt." };
  }

  // Older exports predate app/formatVersion; accept them and fill the gaps.
  return {
    ok: true,
    template: {
      app: "elegant-joins",
      formatVersion: t.formatVersion ?? 0,
      exportedAt: t.exportedAt ?? "",
      project: t.project,
      tables: t.tables ?? [],
      relationships: t.relationships ?? [],
    } as ProjectTemplate,
  };
}
