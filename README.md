# Elegant Joins

Combine CSV and Excel files by drawing the connections between them.

**Live:** https://barknard.github.io/elegant-joins/

Everything runs in your browser. Your spreadsheets are parsed, joined and exported
locally — no upload, no account, no server. (The desktop build this grew from shipped
row data to a hosted Postgres; this one genuinely doesn't.)

## What it does

Drop in a couple of files, link a column on one table to a column on another, and the
join preview shows you the combined rows immediately — with a plain-English account of
exactly what it joined and in what order.

- **Import** — CSV, TSV and Excel (`.xlsx`/`.xls`/`.xlsm`), with type inference per
  column. Tells you the row count, which sheets it skipped, and whether anything was
  truncated.
- **Join** — inner / left / right / full, across any number of connected tables.
  Comparison is type-normalised, so a CSV's `"42"` matches a spreadsheet's `42`.
- **Build a view** — pick the columns you want, run it, export to CSV or Excel.
- **Export the schema** — SQL DDL with quoted identifiers, composite primary keys and
  foreign keys.
- **Projects** — saved in IndexedDB, or exported as a portable JSON template.

## Development

```bash
npm install
npm run fonts        # one-off: vendor the webfonts (needs Python + Pillow)
npm run dev          # http://localhost:5173
```

```bash
npm run check        # TypeScript
npm run test:unit    # 85 unit tests: join engine, parsing, storage, SQL export
npm run test:e2e     # 33 Playwright tests against a production build
npm test             # both
```

## How it's put together

The interesting logic is in pure, dependency-free modules under `client/src/lib/`, which
is why it's testable without a browser:

| Module | Responsibility |
|---|---|
| `join/engine.ts` | All join semantics. One definition, used by the preview, the view builder and every export. |
| `parse/tabular.ts` | File → columns + rows, type inference, join-key normalisation. |
| `db/idb.ts` | A small IndexedDB wrapper. Resolves only after a transaction *commits*. |
| `db/repository.ts` | Projects, tables, columns, relationships. Cascading deletes and atomic saves. |
| `export/sql.ts`, `export/template.ts` | Pure serialisers. |
| `local-api.ts` | The former Express API, reimplemented in the browser behind the same routes. |

`local-api.ts` is worth explaining: the components already spoke HTTP to `/api/*`, so
keeping that exact contract — same paths, same JSON, real `Response` objects — meant
removing the server changed only the function *name* at seven call sites, not any of
their logic or error handling. Components call `apiFetch` instead of `fetch`; nothing
else in the app knows the backend is gone.

`VITE_BASE=root` builds for the root path (dev and tests); the default is
`/elegant-joins/` for Pages.

## Deploying

Push to `main`. The workflow type-checks, runs both test suites, and only publishes if
everything passes.
