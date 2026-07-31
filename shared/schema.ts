/**
 * Data shapes for Elegant Joins.
 *
 * The desktop build defined these with Drizzle against Postgres/SQLite. The web build
 * has no server, so the ORM is gone and these are plain types plus Zod validators.
 * The field names and nullability are kept byte-identical to the Drizzle `$inferSelect`
 * types they replace, so every component and every previously-exported project file
 * keeps working untouched.
 *
 * ID contract: the server used autoincrement integers. IndexedDB autoIncrement gives us
 * the same monotonic integers, so `id` stays `number` and nothing downstream has to care.
 */
import { z } from "zod";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  viewport: Viewport | null;
  preferences: Record<string, unknown> | null;
  isTemplate: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Table {
  id: number;
  projectId: number;
  nodeId: string;
  name: string;
  displayName: string | null;
  fileName: string;
  positionX: number;
  positionY: number;
  iconColor: string | null;
  /** Parsed file contents: an array of row objects keyed by column name. */
  rawData: Record<string, unknown>[] | null;
  createdAt: Date;
}

export interface Column {
  id: number;
  tableId: number;
  columnId: string;
  name: string;
  displayName: string | null;
  dataType: string;
  /** 0/1 rather than boolean — matches the original integer column. */
  isKey: number;
  columnOrder: number;
}

export interface Relationship {
  id: number;
  projectId: number;
  edgeId: string;
  sourceTableId: number;
  targetTableId: number;
  sourceColumnId: string | null;
  targetColumnId: string | null;
  sourceHandle: string | null;
  targetHandle: string | null;
  relationshipType: string;
  joinType: string | null;
  cardinalityType: string | null;
  label: string;
  createdAt: Date;
}

/** The four join semantics the preview panel and SQL exporter understand. */
export const JOIN_TYPES = ["inner", "left", "right", "full"] as const;
export type JoinType = (typeof JOIN_TYPES)[number];

/** Column types the UI offers; drives coercion in the join engine and SQL export. */
export const DATA_TYPES = ["text", "number", "date", "boolean"] as const;
export type DataType = (typeof DATA_TYPES)[number];

const viewportSchema = z.object({ x: z.number(), y: z.number(), zoom: z.number() });

export const insertProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().nullable().optional(),
  viewport: viewportSchema.nullable().optional(),
  preferences: z.record(z.unknown()).nullable().optional(),
  isTemplate: z.boolean().nullable().optional(),
});

export const insertTableSchema = z.object({
  projectId: z.number(),
  nodeId: z.string(),
  name: z.string(),
  displayName: z.string().nullable().optional(),
  fileName: z.string(),
  positionX: z.number(),
  positionY: z.number(),
  iconColor: z.string().nullable().optional(),
  rawData: z.array(z.record(z.unknown())).nullable().optional(),
});

export const insertColumnSchema = z.object({
  tableId: z.number(),
  columnId: z.string(),
  name: z.string(),
  displayName: z.string().nullable().optional(),
  dataType: z.string(),
  isKey: z.number().default(0),
  columnOrder: z.number(),
});

export const insertRelationshipSchema = z.object({
  projectId: z.number(),
  edgeId: z.string(),
  sourceTableId: z.number(),
  targetTableId: z.number(),
  sourceColumnId: z.string().nullable().optional(),
  targetColumnId: z.string().nullable().optional(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  relationshipType: z.string(),
  joinType: z.string().nullable().optional(),
  cardinalityType: z.string().nullable().optional(),
  label: z.string(),
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertTable = z.infer<typeof insertTableSchema>;
export type InsertColumn = z.infer<typeof insertColumnSchema>;
export type InsertRelationship = z.infer<typeof insertRelationshipSchema>;
