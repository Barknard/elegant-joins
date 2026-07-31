/**
 * The former Express server, reimplemented in the browser.
 *
 * WHY THIS SHAPE: the components already spoke HTTP to `/api/*`. Keeping that exact
 * contract — same paths, same JSON, same status codes, a real `Response` object —
 * meant porting off the server touched only the seven call sites' function NAME, not
 * a line of their logic or error handling. The route table below is the whole former
 * backend; nothing else in the app knows the server is gone.
 *
 * Call sites use `apiFetch` instead of `fetch`. That is deliberate over monkeypatching
 * `window.fetch`: it stays greppable, typed, and can't surprise anything else on the page.
 */
import {
  StorageQuotaError,
  StorageUnavailableError,
} from "./db/idb";
import * as repo from "./db/repository";
import type { ProjectSnapshot } from "./db/repository";
import { inferColumnTypes, parseFile } from "./parse/tabular";
import { generateSql } from "./export/sql";
import { buildTemplate } from "./export/template";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function text(body: string, status = 200, contentType = "text/plain"): Response {
  return new Response(body, { status, headers: { "Content-Type": contentType } });
}

/** Maps a thrown error onto the status code the call sites already handle. */
function errorResponse(err: unknown): Response {
  if (err instanceof StorageQuotaError || err instanceof StorageUnavailableError) {
    // 507 Insufficient Storage — distinct from a generic 500 so the UI can tell the
    // user their data is at risk rather than showing "something went wrong".
    return json({ error: err.message, code: err.name }, 507);
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  if (/not found/i.test(message)) return json({ error: message }, 404);
  console.error("[local-api]", err);
  return json({ error: message }, 500);
}

interface Route {
  method: string;
  /** Path pattern with :params, matched against the pathname. */
  pattern: string;
  handle: (params: Record<string, string>, request: Request) => Promise<Response>;
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const a = pathname.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

/** Rejects `/api/projects/abc` before it becomes a silent NaN lookup. */
function intParam(params: Record<string, string>, key: string): number {
  const n = Number.parseInt(params[key], 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${key}`);
  return n;
}

async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body was not valid JSON");
  }
}

const routes: Route[] = [
  // ------------------------------------------------------------- projects
  {
    method: "GET",
    pattern: "/api/projects",
    handle: async () => json(await repo.getAllProjects()),
  },
  {
    method: "POST",
    pattern: "/api/projects",
    handle: async (_p, request) => {
      const data = await body<{ name?: string; description?: string }>(request);
      if (!data.name?.trim()) return json({ error: "Project name is required" }, 400);
      return json(await repo.createProject({ name: data.name.trim(), description: data.description ?? null }));
    },
  },
  {
    method: "POST",
    pattern: "/api/projects/from-snapshot",
    handle: async (_p, request) => {
      const snapshot = await body<ProjectSnapshot>(request);
      return json(await repo.createFromSnapshot(snapshot));
    },
  },
  {
    method: "POST",
    pattern: "/api/projects/import-template",
    handle: async (_p, request) => {
      const template = await body<ProjectSnapshot>(request);
      if (!template?.project?.name) {
        return json({ error: "That file is not an Elegant Joins template." }, 400);
      }
      // An imported template becomes a normal editable project.
      template.project.isTemplate = false;
      return json(await repo.createFromSnapshot(template));
    },
  },
  {
    method: "GET",
    pattern: "/api/projects/:id",
    handle: async (p) => {
      const project = await repo.getProject(intParam(p, "id"));
      return project ? json(project) : json({ error: "Project not found" }, 404);
    },
  },
  {
    method: "PATCH",
    pattern: "/api/projects/:id",
    handle: async (p, request) => {
      const updated = await repo.updateProject(intParam(p, "id"), await body(request));
      return updated ? json(updated) : json({ error: "Project not found" }, 404);
    },
  },
  {
    method: "DELETE",
    pattern: "/api/projects/:id",
    handle: async (p) => {
      await repo.deleteProject(intParam(p, "id"));
      return json({ success: true });
    },
  },
  {
    method: "GET",
    pattern: "/api/projects/:id/full",
    handle: async (p) => {
      const full = await repo.loadFullProject(intParam(p, "id"));
      return full ? json(full) : json({ error: "Project not found" }, 404);
    },
  },
  {
    method: "POST",
    pattern: "/api/projects/:id/snapshot",
    handle: async (p, request) => {
      const snapshot = await body<ProjectSnapshot>(request);
      const project = await repo.saveSnapshot(intParam(p, "id"), snapshot);
      return json({ success: true, project });
    },
  },

  // -------------------------------------------------------------- exports
  {
    method: "GET",
    pattern: "/api/projects/:id/export/template",
    handle: async (p) => {
      const full = await repo.loadFullProject(intParam(p, "id"));
      if (!full) return json({ error: "Project not found" }, 404);
      return json(buildTemplate(full));
    },
  },
  {
    method: "GET",
    pattern: "/api/projects/:id/export/sql",
    handle: async (p) => {
      const full = await repo.loadFullProject(intParam(p, "id"));
      if (!full) return json({ error: "Project not found" }, 404);
      return text(generateSql(full.tables, full.relationships, { projectName: full.project.name }), 200, "text/plain");
    },
  },

  // --------------------------------------------------------------- upload
  {
    method: "POST",
    pattern: "/api/projects/:projectId/upload",
    handle: async (p, request) => {
      const projectId = intParam(p, "projectId");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "No file uploaded" }, 400);

      const nodeId = String(form.get("nodeId") ?? "");
      const positionX = Number.parseInt(String(form.get("positionX") ?? "0"), 10) || 0;
      const positionY = Number.parseInt(String(form.get("positionY") ?? "0"), 10) || 0;
      const sheetName = form.get("sheetName") ? String(form.get("sheetName")) : undefined;

      const parsed = await parseFile(file, sheetName);
      if (parsed.columns.length === 0) {
        return json({ error: `"${file.name}" has no readable columns. Check that the first row contains headers.` }, 400);
      }

      const types = inferColumnTypes(parsed.columns, parsed.rows);

      // The server stored only the first 100 rows here and told nobody. Store what we
      // parsed, and hand the truncation facts back so the UI can say so out loud.
      const table = await repo.createTable({
        projectId,
        nodeId,
        name: file.name.replace(/\.[^/.]+$/, ""),
        fileName: file.name,
        positionX,
        positionY,
        rawData: parsed.rows,
      });

      const columns = [];
      for (let i = 0; i < parsed.columns.length; i++) {
        const colName = parsed.columns[i];
        columns.push(
          await repo.createColumn({
            tableId: table.id,
            columnId: `${nodeId}-${i}`,
            name: colName,
            dataType: types[colName],
            isKey: i === 0 ? 1 : 0,
            columnOrder: i,
          }),
        );
      }

      return json({
        table,
        columns,
        meta: {
          totalRows: parsed.totalRows,
          importedRows: parsed.rows.length,
          truncated: parsed.truncated,
          ignoredSheets: parsed.ignoredSheets,
          warnings: parsed.warnings,
        },
      });
    },
  },

  // --------------------------------------------------------------- tables
  {
    method: "GET",
    pattern: "/api/projects/:projectId/tables",
    handle: async (p) => json(await repo.getTablesByProject(intParam(p, "projectId"))),
  },
  {
    method: "PATCH",
    pattern: "/api/tables/:id",
    handle: async (p, request) => {
      const updated = await repo.updateTable(intParam(p, "id"), await body(request));
      return updated ? json(updated) : json({ error: "Table not found" }, 404);
    },
  },
  {
    method: "DELETE",
    pattern: "/api/tables/:id",
    handle: async (p) => {
      await repo.deleteTable(intParam(p, "id"));
      return json({ success: true });
    },
  },

  // -------------------------------------------------------------- columns
  {
    method: "GET",
    pattern: "/api/tables/:tableId/columns",
    handle: async (p) => json(await repo.getColumnsByTable(intParam(p, "tableId"))),
  },
  {
    method: "PATCH",
    pattern: "/api/columns/:id",
    handle: async (p, request) => {
      const updated = await repo.updateColumn(intParam(p, "id"), await body(request));
      return updated ? json(updated) : json({ error: "Column not found" }, 404);
    },
  },

  // -------------------------------------------------------- relationships
  {
    method: "POST",
    pattern: "/api/projects/:projectId/relationships",
    handle: async (p, request) => {
      const data = await body<Record<string, unknown>>(request);
      return json(
        await repo.createRelationship({
          ...(data as any),
          projectId: intParam(p, "projectId"),
        }),
      );
    },
  },
  {
    method: "GET",
    pattern: "/api/projects/:projectId/relationships",
    handle: async (p) => json(await repo.getRelationshipsByProject(intParam(p, "projectId"))),
  },
  {
    method: "PATCH",
    pattern: "/api/relationships/:id",
    handle: async (p, request) => {
      const updated = await repo.updateRelationship(intParam(p, "id"), await body(request));
      return updated ? json(updated) : json({ error: "Relationship not found" }, 404);
    },
  },
  {
    method: "DELETE",
    pattern: "/api/relationships/:id",
    handle: async (p) => {
      await repo.deleteRelationship(intParam(p, "id"));
      return json({ success: true });
    },
  },
];

/**
 * Drop-in replacement for `fetch` on `/api/*` paths.
 * Returns a genuine `Response`, so `res.ok`, `res.status`, `res.json()` and `res.text()`
 * all behave exactly as they did against the Express server.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = new URL(input, window.location.origin);
  const method = (init?.method ?? "GET").toUpperCase();
  const request = new Request(url, init);

  // Longest pattern first so `/api/projects/from-snapshot` is not swallowed by
  // `/api/projects/:id`, and `/api/projects/:id/full` beats `/api/projects/:id`.
  const candidates = routes
    .filter((r) => r.method === method)
    .sort((a, b) => b.pattern.split(":")[0].length - a.pattern.split(":")[0].length);

  for (const route of candidates) {
    const params = matchPath(route.pattern, url.pathname);
    if (!params) continue;
    try {
      return await route.handle(params, request);
    } catch (err) {
      return errorResponse(err);
    }
  }

  return json({ error: `No route for ${method} ${url.pathname}` }, 404);
}
