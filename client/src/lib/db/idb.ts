/**
 * Minimal promise wrapper over IndexedDB.
 *
 * Deliberately dependency-free and ~200 lines: this is the only thing standing between
 * the user's work and permanent loss, so it should be small enough to read in full.
 *
 * Why IndexedDB and not localStorage: uploaded tables carry their full row data. A
 * 50k-row CSV blows past localStorage's ~5 MB string cap, and localStorage is
 * synchronous (it would jank the canvas on every autosave). IndexedDB stores structured
 * clones, is async, and its quota is a share of disk rather than a fixed 5 MB.
 */

export const DB_NAME = "elegant-joins";
export const DB_VERSION = 1;

export const STORE = {
  projects: "projects",
  tables: "tables",
  columns: "columns",
  relationships: "relationships",
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

/** Thrown when the browser refuses to store more data. Callers must surface this. */
export class StorageQuotaError extends Error {
  constructor(message = "Not enough browser storage space to save this project.") {
    super(message);
    this.name = "StorageQuotaError";
  }
}

/** Thrown when IndexedDB is unavailable (private browsing in some browsers, or disabled). */
export class StorageUnavailableError extends Error {
  constructor(message = "Browser storage is unavailable, so projects cannot be saved.") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function upgrade(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE.projects)) {
    db.createObjectStore(STORE.projects, { keyPath: "id", autoIncrement: true });
  }
  if (!db.objectStoreNames.contains(STORE.tables)) {
    const s = db.createObjectStore(STORE.tables, { keyPath: "id", autoIncrement: true });
    s.createIndex("projectId", "projectId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE.columns)) {
    const s = db.createObjectStore(STORE.columns, { keyPath: "id", autoIncrement: true });
    s.createIndex("tableId", "tableId", { unique: false });
  }
  if (!db.objectStoreNames.contains(STORE.relationships)) {
    const s = db.createObjectStore(STORE.relationships, { keyPath: "id", autoIncrement: true });
    s.createIndex("projectId", "projectId", { unique: false });
  }
}

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new StorageUnavailableError());
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(new StorageUnavailableError((err as Error)?.message));
      return;
    }
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => {
      const db = req.result;
      // A second tab running a newer version needs this one to let go of the connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(new StorageUnavailableError(req.error?.message));
    req.onblocked = () =>
      reject(new StorageUnavailableError("Another tab is holding an older version of the database open."));
  });

  // Don't cache a rejected promise — a transient failure would otherwise be permanent
  // for the life of the page.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

function isQuotaError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  return (
    e?.name === "QuotaExceededError" ||
    e?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota/i.test(e?.message ?? "")
  );
}

/**
 * Runs `fn` inside one transaction over `stores` and resolves with its value only after
 * the transaction commits. Resolving on `request.onsuccess` alone is the classic
 * IndexedDB bug: the request succeeds, the transaction later aborts, and the caller has
 * already reported success for a write that never landed.
 */
export async function tx<T>(
  stores: StoreName | StoreName[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDB();
  const names = Array.isArray(stores) ? stores : [stores];

  return new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(names, mode);
    } catch (err) {
      reject(err);
      return;
    }

    let result: T;
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(isQuotaError(err) ? new StorageQuotaError() : err);
    };

    transaction.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    transaction.onerror = () => fail(transaction.error);
    transaction.onabort = () => fail(transaction.error ?? new Error("Transaction aborted"));

    Promise.resolve()
      .then(() => fn(transaction))
      .then((value) => {
        result = value;
      })
      .catch((err) => {
        try {
          transaction.abort();
        } catch {
          /* already finished */
        }
        fail(err);
      });
  });
}

/** Promisifies a single IDBRequest. Must be awaited within its transaction's lifetime. */
export function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getAllByIndex<T>(
  transaction: IDBTransaction,
  store: StoreName,
  index: string,
  value: IDBValidKey,
): Promise<T[]> {
  return req(transaction.objectStore(store).index(index).getAll(value) as IDBRequest<T[]>);
}

/** Best-effort storage headroom, or null when the browser doesn't expose it. */
export async function storageEstimate(): Promise<{ usage: number; quota: number; pct: number } | null> {
  try {
    if (!navigator?.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, pct: quota > 0 ? usage / quota : 0 };
  } catch {
    return null;
  }
}

/** Test hook: drops the whole database. Never wired to a UI control. */
export async function deleteDatabase(): Promise<void> {
  const db = await openDB().catch(() => null);
  db?.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
    r.onblocked = () => resolve();
  });
}
